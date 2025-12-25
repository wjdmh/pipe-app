import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  TextInput, 
  ScrollView, 
  Alert, 
  ActivityIndicator, 
  Modal, 
  KeyboardAvoidingView, 
  Platform 
} from 'react-native';
import { signOut, deleteUser } from 'firebase/auth'; 
import { doc, getDoc, collection, addDoc, updateDoc, runTransaction } from 'firebase/firestore'; 
// 👇 [Path Check] 경로 확인 완료
import { auth, db } from '../../configs/firebaseConfig';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
// 👇 [New] 전역 상태 관리를 위한 Hook
import { useUser } from '../context/UserContext';

// 관리자 이메일 상수 (보안 및 유지보수용)
const ADMIN_EMAIL = 'wjdangus6984@gmail.com';

export default function MyPageScreen() {
  const router = useRouter();
  const { user, refreshUser } = useUser(); // 전역 유저 상태 사용
  
  const [isAdmin, setIsAdmin] = useState(false);
  const [myTeam, setMyTeam] = useState<any>(null);
  const [loadingTeam, setLoadingTeam] = useState(false);

  // 모달 상태
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [inquiryModalVisible, setInquiryModalVisible] = useState(false);
  
  // 수정 폼 상태
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [updating, setUpdating] = useState(false);

  // 문의 폼 상태
  const [inquiryText, setInquiryText] = useState('');
  const [sendingInquiry, setSendingInquiry] = useState(false);

  // 1. 초기 데이터 세팅 (관리자 여부 및 팀 정보)
  useEffect(() => {
    if (user) {
      // 관리자 체크
      if (user.email === ADMIN_EMAIL) {
        setIsAdmin(true);
      }
      // 초기 수정 폼 데이터 세팅
      setNewName(user.name || '');
      // user 타입에 phoneNumber가 없을 경우를 대비해 any 처리 혹은 조건부 접근
      setNewPhone((user as any).phoneNumber || (user as any).phone || '');

      // 팀 정보 가져오기 (소속된 경우만)
      if (user.teamId) {
        fetchMyTeam(user.teamId);
      }
    }
  }, [user]);

  const fetchMyTeam = async (teamId: string) => {
    setLoadingTeam(true);
    try {
      const teamSnap = await getDoc(doc(db, "teams", teamId));
      if (teamSnap.exists()) {
        setMyTeam({ id: teamSnap.id, ...teamSnap.data() });
      }
    } catch (e) {
      console.error("Team Fetch Error", e);
    } finally {
      setLoadingTeam(false);
    }
  };

  // 2. 로그아웃 로직 (웹/앱 호환)
  const handleLogout = async () => {
    const execute = async () => {
        try {
            await signOut(auth);
            router.replace('/');
        } catch (e) { Alert.alert('오류', '로그아웃 실패'); }
    };

    if (Platform.OS === 'web') {
        if (window.confirm('정말 로그아웃 하시겠습니까?')) execute();
    } else {
        Alert.alert('로그아웃', '정말 로그아웃 하시겠습니까?', [
            { text: '취소', style: 'cancel' },
            { text: '로그아웃', style: 'destructive', onPress: execute }
        ]);
    }
  };

  // 3. 회원 탈퇴 로직 (Transaction 유지 - 중요!)
  const handleWithdrawal = () => {
    const execute = async () => {
        if (!auth.currentUser) return;
        try {
            await runTransaction(db, async (transaction) => {
                const userRef = doc(db, "users", auth.currentUser!.uid);
                const userSnap = await transaction.get(userRef);
                if (!userSnap.exists()) return;

                const uData = userSnap.data();

                // 팀 처리 로직
                if (uData.teamId) {
                    const teamRef = doc(db, "teams", uData.teamId);
                    const teamSnap = await transaction.get(teamRef);

                    if (teamSnap.exists()) {
                        const teamData = teamSnap.data();
                        
                        // 대표자인 경우 -> 팀 해체 및 팀원 해방
                        if (uData.role === 'leader') {
                            const memberIds = teamData.members || [];
                            for (const memberUid of memberIds) {
                                if (memberUid === auth.currentUser!.uid) continue;
                                const memberRef = doc(db, "users", memberUid);
                                transaction.update(memberRef, { teamId: null, role: 'guest', updatedAt: new Date().toISOString() });
                            }
                            transaction.delete(teamRef); // 팀 삭제
                        } 
                        // 일반 팀원인 경우 -> 명단에서 제거
                        else {
                            const newMembers = (teamData.members || []).filter((uid: string) => uid !== auth.currentUser!.uid);
                            const newRoster = (teamData.roster || []).filter((p: any) => p.uid !== auth.currentUser!.uid);
                            transaction.update(teamRef, { members: newMembers, roster: newRoster });
                        }
                    }
                }
                transaction.delete(userRef); // 유저 DB 삭제
            });

            await deleteUser(auth.currentUser); // Auth 계정 삭제
            
            const msg = '회원 탈퇴가 완료되었습니다.';
            if (Platform.OS === 'web') window.alert(msg);
            else Alert.alert('완료', msg);
            
            router.replace('/');

        } catch (e: any) {
            console.error("Withdrawal Error:", e);
            if (e.code === 'auth/requires-recent-login') {
                const msg = '보안을 위해 다시 로그인 후 시도해주세요.';
                if(Platform.OS === 'web') window.alert(msg);
                else Alert.alert('인증 필요', msg);
                await signOut(auth);
            } else {
                Alert.alert('오류', '탈퇴 처리 중 문제가 발생했습니다.');
            }
        }
    };

    const warning = '정말 탈퇴하시겠습니까?\n대표자인 경우 팀이 해체됩니다.';
    if (Platform.OS === 'web') {
        if (window.confirm(warning)) execute();
    } else {
        Alert.alert('회원 탈퇴', warning, [{ text: '취소', style: 'cancel' }, { text: '탈퇴', style: 'destructive', onPress: execute }]);
    }
  };

  // 4. 정보 수정 로직 (refreshUser 연동)
  const handleUpdateProfile = async () => {
    if (!newName.trim() || !newPhone.trim()) return Alert.alert('알림', '이름과 전화번호를 입력해주세요.');
    setUpdating(true);
    try {
        if (auth.currentUser) {
            await updateDoc(doc(db, "users", auth.currentUser.uid), {
                name: newName,
                nickname: newName, 
                phoneNumber: newPhone,
                phone: newPhone
            });
            await refreshUser(); // 🔥 핵심: 앱 전역 상태 갱신
            Alert.alert('완료', '정보가 수정되었습니다.');
            setEditModalVisible(false);
        }
    } catch (e) {
        Alert.alert('오류', '수정 실패');
    } finally {
        setUpdating(false);
    }
  };

  // 5. 문의하기 로직
  const handleSendInquiry = async () => {
    if(!inquiryText.trim()) return Alert.alert('알림', '내용을 입력해주세요.');
    setSendingInquiry(true);
    try {
        await addDoc(collection(db, "inquiries"), {
            uid: auth.currentUser?.uid,
            email: auth.currentUser?.email,
            text: inquiryText,
            createdAt: new Date().toISOString(),
            status: 'pending'
        });
        Alert.alert('접수 완료', '문의가 전송되었습니다.');
        setInquiryText('');
        setInquiryModalVisible(false);
    } catch(e) {
        Alert.alert('오류', '전송 실패');
    } finally {
        setSendingInquiry(false);
    }
  };

  return (
    <SafeAreaView 
        className="flex-1 bg-white" 
        edges={['top']}
        style={{ paddingTop: Platform.OS === 'web' ? 20 : 0 }}
    >
      {/* 헤더 */}
      <View className="px-6 py-4 border-b border-gray-50 flex-row items-center justify-between">
         <Text className="text-2xl font-extrabold text-[#191F28]">마이페이지</Text>
         {isAdmin && <View className="bg-red-100 px-2 py-1 rounded"><Text className="text-red-600 text-[10px] font-bold">ADMIN</Text></View>}
      </View>

      <ScrollView contentContainerClassName="pb-20">
        
        {/* A. 관리자 대시보드 (Admin Only) */}
        {isAdmin && (
            <View className="mx-5 mt-5 bg-[#191F28] rounded-2xl p-5 shadow-lg">
                <View className="flex-row items-center mb-4">
                    <FontAwesome5 name="user-shield" size={18} color="white" />
                    <Text className="text-white font-bold text-lg ml-2">관리자 대시보드</Text>
                </View>
                <View className="flex-row gap-3">
                    <TouchableOpacity onPress={() => router.push('/admin/manager')} className="flex-1 bg-gray-700 py-4 rounded-xl items-center active:bg-gray-600">
                        <FontAwesome5 name="tasks" size={20} color="#60A5FA" style={{marginBottom:6}}/>
                        <Text className="text-blue-300 font-bold text-xs">팀/분쟁 관리</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => router.push('/admin/inquiries')} className="flex-1 bg-gray-700 py-4 rounded-xl items-center active:bg-gray-600">
                        <FontAwesome5 name="envelope-open-text" size={20} color="#34D399" style={{marginBottom:6}}/>
                        <Text className="text-green-300 font-bold text-xs">Q&A 확인</Text>
                    </TouchableOpacity>
                </View>
            </View>
        )}

        {/* B. 프로필 섹션 (Hero) */}
        <View className="items-center py-8 bg-indigo-50/30 mb-2">
            <View className="w-20 h-20 bg-white rounded-full items-center justify-center shadow-sm border border-indigo-100 mb-3">
                <FontAwesome5 name="user" size={32} color="#4F46E5" />
            </View>
            <Text className="text-xl font-bold text-gray-900">{user?.name || '사용자'}</Text>
            <Text className="text-gray-500 text-sm mt-1">{user?.email}</Text>
            <Text className="text-indigo-500 text-xs font-bold mt-2 bg-indigo-50 px-3 py-1 rounded-full">
                {isAdmin ? '관리자' : user?.role === 'leader' ? '팀 대표자' : '일반 회원'}
            </Text>
        </View>

        {/* C. 소속 팀 위젯 */}
        <View className="px-5 -mt-4 mb-6">
            {loadingTeam ? (
                <ActivityIndicator color="#4F46E5" />
            ) : user?.teamId && myTeam ? (
                // 팀이 있을 때: 팀 카드
                <TouchableOpacity 
                    onPress={() => router.push(`/team/${myTeam.id}` as any)}
                    className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex-row justify-between items-center active:bg-gray-50"
                >
                    <View className="flex-row items-center">
                        <View className="w-12 h-12 bg-blue-50 rounded-xl items-center justify-center mr-4">
                            <FontAwesome5 name="users" size={20} color="#2563EB" />
                        </View>
                        <View>
                            <Text className="text-gray-400 text-xs font-bold mb-0.5">소속 팀</Text>
                            <Text className="text-gray-900 font-bold text-lg">{myTeam.name}</Text>
                            <Text className="text-gray-500 text-xs">{myTeam.affiliation} · 승률 {myTeam.stats?.total > 0 ? Math.round((myTeam.stats.wins/myTeam.stats.total)*100) : 0}%</Text>
                        </View>
                    </View>
                    <FontAwesome5 name="chevron-right" size={14} color="#CBD5E1" />
                </TouchableOpacity>
            ) : (
                // 팀이 없을 때: 팀 찾기 배너
                <TouchableOpacity 
                    onPress={() => router.push('/team/register')}
                    className="bg-gray-900 p-5 rounded-2xl shadow-md flex-row justify-between items-center active:scale-[0.98]"
                >
                    <View>
                        <Text className="text-white font-bold text-lg mb-1">아직 소속 팀이 없나요?</Text>
                        <Text className="text-gray-400 text-xs">나에게 맞는 팀을 찾거나 만들어보세요!</Text>
                    </View>
                    <View className="w-10 h-10 bg-gray-700 rounded-full items-center justify-center">
                        <FontAwesome5 name="plus" size={16} color="white" />
                    </View>
                </TouchableOpacity>
            )}
        </View>

        {/* D. 메뉴 리스트 */}
        <View className="px-5 gap-3">
            <TouchableOpacity onPress={() => setEditModalVisible(true)} className="flex-row items-center justify-between p-4 bg-gray-50 rounded-xl active:bg-gray-100">
                <View className="flex-row items-center">
                    <FontAwesome5 name="user-edit" size={16} color="#4B5563" style={{width: 24}} />
                    <Text className="text-gray-700 font-bold ml-2">내 정보 수정</Text>
                </View>
                <FontAwesome5 name="chevron-right" size={12} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setInquiryModalVisible(true)} className="flex-row items-center justify-between p-4 bg-gray-50 rounded-xl active:bg-gray-100">
                <View className="flex-row items-center">
                    <FontAwesome5 name="envelope" size={16} color="#4B5563" style={{width: 24}} />
                    <Text className="text-gray-700 font-bold ml-2">1:1 문의하기</Text>
                </View>
                <FontAwesome5 name="chevron-right" size={12} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleLogout} className="flex-row items-center justify-between p-4 bg-gray-50 rounded-xl mt-4 active:bg-red-50">
                <View className="flex-row items-center">
                    <FontAwesome5 name="sign-out-alt" size={16} color="#EF4444" style={{width: 24}} />
                    <Text className="text-red-500 font-bold ml-2">로그아웃</Text>
                </View>
            </TouchableOpacity>
        </View>

        {/* E. 하단 링크 */}
        <View className="mt-10 items-center">
            <TouchableOpacity onPress={handleWithdrawal} className="p-2">
                <Text className="text-gray-300 text-xs underline">회원 탈퇴</Text>
            </TouchableOpacity>
            <Text className="text-gray-300 text-[10px] mt-2">Version 1.23.0</Text>
        </View>
      </ScrollView>

      {/* --- Modals --- */}
      
      {/* 1. 내 정보 수정 모달 */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 justify-end bg-black/50">
              <View className="bg-white rounded-t-3xl p-6 pb-10">
                  <View className="items-center mb-6">
                      <View className="w-12 h-1 bg-gray-300 rounded-full mb-4" />
                      <Text className="text-xl font-bold text-gray-900">내 정보 수정</Text>
                  </View>
                  
                  <Text className="text-xs font-bold text-gray-500 mb-1 ml-1">이름</Text>
                  <TextInput className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-4" value={newName} onChangeText={setNewName} placeholder="이름 입력" />
                  
                  <Text className="text-xs font-bold text-gray-500 mb-1 ml-1">전화번호</Text>
                  <TextInput className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" placeholder="010-0000-0000" />
                  
                  <TouchableOpacity onPress={handleUpdateProfile} className="bg-indigo-600 p-4 rounded-xl items-center mb-2">
                      {updating ? <ActivityIndicator color="white"/> : <Text className="text-white font-bold">저장하기</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditModalVisible(false)} className="p-3 items-center">
                      <Text className="text-gray-500 font-bold">취소</Text>
                  </TouchableOpacity>
              </View>
          </KeyboardAvoidingView>
      </Modal>

      {/* 2. 문의하기 모달 */}
      <Modal visible={inquiryModalVisible} animationType="fade" transparent>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1 justify-center bg-black/50 px-6">
              <View className="bg-white rounded-2xl p-6">
                  <Text className="text-xl font-bold text-gray-900 mb-2">1:1 문의하기</Text>
                  <Text className="text-gray-500 text-xs mb-4">건의사항이나 불편한 점을 남겨주세요.</Text>
                  
                  <TextInput 
                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 h-32 mb-4" 
                    multiline 
                    textAlignVertical="top"
                    placeholder="내용을 입력하세요..."
                    value={inquiryText}
                    onChangeText={setInquiryText}
                  />
                  
                  <View className="flex-row gap-3">
                      <TouchableOpacity onPress={() => setInquiryModalVisible(false)} className="flex-1 bg-gray-200 p-3 rounded-xl items-center">
                          <Text className="text-gray-600 font-bold">취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleSendInquiry} className="flex-1 bg-indigo-600 p-3 rounded-xl items-center">
                          {sendingInquiry ? <ActivityIndicator color="white"/> : <Text className="text-white font-bold">보내기</Text>}
                      </TouchableOpacity>
                  </View>
              </View>
          </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}