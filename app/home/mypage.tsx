import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { signOut, deleteUser } from 'firebase/auth'; 
import { doc, getDoc, collection, addDoc, updateDoc, runTransaction } from 'firebase/firestore'; 
import { auth, db } from '../../configs/firebaseConfig';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';

export default function MyPageScreen() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  
  const [inquiryText, setInquiryText] = useState('');
  const [sending, setSending] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (auth.currentUser?.email === 'wjdangus6984@gmail.com') {
      setIsAdmin(true);
    }
    fetchUser();
  }, []);

  const fetchUser = async () => {
    if(auth.currentUser) {
        try {
            const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
            if(snap.exists()) {
                setUserData(snap.data());
                setNewName(snap.data().nickname || snap.data().name || '');
                setNewPhone(snap.data().phoneNumber || snap.data().phone || '');
            }
        } catch (e) { console.error(e); }
        finally { setLoadingUser(false); }
    }
  }

  // --- [Logic Refactoring] 실제 로그아웃 동작 함수 ---
  const executeLogout = async () => {
    try {
        await signOut(auth);
        router.replace('/');
    } catch (e) { 
        Alert.alert('오류', '로그아웃 실패'); 
    }
  };

  // ✅ [수정됨] 웹/앱 호환성을 갖춘 로그아웃 핸들러
  const handleLogout = () => {
    if (Platform.OS === 'web') {
        // 웹: 브라우저 기본 confirm 사용
        if (window.confirm('정말 로그아웃 하시겠습니까?')) {
            executeLogout();
        }
    } else {
        // 앱: React Native Alert 사용
        Alert.alert('로그아웃', '정말 로그아웃 하시겠습니까?', [
            { text: '취소', style: 'cancel' },
            { text: '로그아웃', style: 'destructive', onPress: executeLogout }
        ]);
    }
  };

  // --- [Logic Refactoring] 실제 탈퇴 동작 함수 (핵심 로직) ---
  const executeWithdrawal = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
        // 1. Firestore 데이터 정리 (트랜잭션)
        await runTransaction(db, async (transaction) => {
            // 유저 데이터 확인
            const userRef = doc(db, "users", user.uid);
            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists()) return; // 이미 삭제됨

            const uData = userSnap.data();

            // 소속 팀이 있는 경우 처리
            if (uData.teamId) {
                const teamRef = doc(db, "teams", uData.teamId);
                const teamSnap = await transaction.get(teamRef);

                if (teamSnap.exists()) {
                    const teamData = teamSnap.data();

                    // Case A: 팀 대표가 탈퇴하는 경우 -> 팀 해체 & 팀원 구조
                    if (uData.role === 'leader') {
                        const memberIds = teamData.members || [];
                        
                        // 다른 팀원들의 teamId를 null로 초기화 (유령 팀 방지)
                        for (const memberUid of memberIds) {
                            if (memberUid === user.uid) continue;
                            const memberRef = doc(db, "users", memberUid);
                            transaction.update(memberRef, { 
                                teamId: null, 
                                role: 'guest',
                                updatedAt: new Date().toISOString()
                            });
                        }
                        // 팀 삭제
                        transaction.delete(teamRef);
                    } 
                    // Case B: 일반 팀원이 탈퇴하는 경우 -> 명단에서 본인 제거
                    else {
                        const newMembers = (teamData.members || []).filter((uid: string) => uid !== user.uid);
                        const newRoster = (teamData.roster || []).filter((p: any) => p.uid !== user.uid);
                        
                        transaction.update(teamRef, { 
                            members: newMembers,
                            roster: newRoster
                        });
                    }
                }
            }

            // 유저 데이터 최종 삭제
            transaction.delete(userRef);
        });

        console.log("Firestore Cleanup Success");

        // 2. Firebase Auth 계정 영구 삭제
        await deleteUser(user);
        
        // [Alert 처리] 웹/앱 분기 없이 완료 메시지는 띄움
        if (Platform.OS === 'web') {
            window.alert('회원 탈퇴가 안전하게 처리되었습니다.');
        } else {
            Alert.alert('탈퇴 완료', '회원 탈퇴가 안전하게 처리되었습니다.');
        }
        router.replace('/');

    } catch (e: any) {
        console.error("Withdrawal Error:", e);
        
        // 재로그인 필요 에러 처리
        if (e.code === 'auth/requires-recent-login') {
            const msg = '안전한 탈퇴를 위해 본인 확인이 필요합니다.\n로그아웃 후 다시 로그인하여 시도해주세요.';
            if (Platform.OS === 'web') {
                window.alert(msg);
                await executeLogout();
            } else {
                Alert.alert('보안 인증 필요', msg, [{ text: '확인', onPress: executeLogout }]);
            }
        } else {
            const errorMsg = '탈퇴 처리 중 문제가 발생했습니다.\n관리자에게 문의해주세요.';
            if (Platform.OS === 'web') window.alert(errorMsg);
            else Alert.alert('오류', errorMsg);
        }
    }
  };

  // ✅ [수정됨] 웹/앱 호환성을 갖춘 탈퇴 핸들러
  const handleWithdrawal = () => {
    const title = '회원 탈퇴';
    const message = '정말 탈퇴하시겠습니까?\n\n팀 대표인 경우 팀이 해체되며, 모든 팀원은 자동으로 소속이 해제됩니다.';

    if (Platform.OS === 'web') {
        if (window.confirm(`${title}\n${message}`)) {
            executeWithdrawal();
        }
    } else {
        Alert.alert(title, message, [
            { text: '취소', style: 'cancel' },
            { text: '탈퇴하기', style: 'destructive', onPress: executeWithdrawal }
        ]);
    }
  };

  const handleSendInquiry = async () => {
    if(!inquiryText.trim()) return Alert.alert('알림', '문의 내용을 입력해주세요.');
    setSending(true);
    try {
        await addDoc(collection(db, "inquiries"), {
            uid: auth.currentUser?.uid,
            email: auth.currentUser?.email,
            text: inquiryText,
            createdAt: new Date().toISOString(),
            status: 'pending'
        });
        Alert.alert('접수 완료', '관리자에게 문의가 전송되었습니다.');
        setInquiryText('');
    } catch(e) {
        Alert.alert('오류', '전송 실패');
    } finally {
        setSending(false);
    }
  };

  const handleUpdateProfile = async () => {
      if (!newName.trim() || !newPhone.trim()) return Alert.alert('알림', '이름과 전화번호를 모두 입력해주세요.');
      setUpdating(true);
      try {
          if (auth.currentUser) {
              await updateDoc(doc(db, "users", auth.currentUser.uid), {
                  name: newName,
                  nickname: newName, // 동기화
                  phone: newPhone,
                  phoneNumber: newPhone // 동기화
              });
              setUserData({ ...userData, name: newName, nickname: newName, phone: newPhone, phoneNumber: newPhone });
              Alert.alert('완료', '정보가 수정되었습니다.');
              setEditModalVisible(false);
          }
      } catch (e) {
          Alert.alert('오류', '수정 중 문제가 발생했습니다.');
      } finally {
          setUpdating(false);
      }
  };

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="pt-12 px-6 pb-20">
      <Text className="text-2xl font-extrabold text-[#191F28] mb-8">마이페이지</Text>
      
      {/* 프로필 카드 */}
      <View className="bg-[#F9FAFB] p-6 rounded-[24px] border border-gray-100 mb-6">
         {loadingUser ? <ActivityIndicator color="#4f46e5" /> : (
             <View className="flex-row items-center mb-4">
                 <View className="w-14 h-14 bg-blue-50 rounded-full items-center justify-center mr-4">
                     <FontAwesome5 name="user" size={24} color="#3182F6" />
                 </View>
                 <View>
                     <Text className="font-bold text-xl text-[#191F28]">{userData?.name || '이름 없음'}</Text>
                     <Text className="text-[#8B95A1] text-sm mt-0.5">{userData?.email}</Text>
                     <Text className="text-[#8B95A1] text-sm">{userData?.phoneNumber || userData?.phone || '전화번호 없음'}</Text>
                     <Text className="text-[#3182F6] text-xs font-bold mt-2">
                        {isAdmin ? '관리자(Admin)' : userData?.role === 'leader' ? '팀 대표자' : '일반 회원'}
                     </Text>
                 </View>
             </View>
         )}
         <TouchableOpacity 
            onPress={() => {
                setNewName(userData?.name || '');
                setNewPhone(userData?.phoneNumber || userData?.phone || '');
                setEditModalVisible(true);
            }}
            className="bg-white py-3 rounded-xl border border-gray-200 items-center shadow-sm"
         >
             <Text className="text-[#4E5968] font-bold text-sm">내 정보 수정</Text>
         </TouchableOpacity>
      </View>

      {/* 관리자 메뉴 */}
      {isAdmin && (
        <View className="mb-8 border-t border-gray-100 pt-6">
            <Text className="font-bold text-[#8B95A1] mb-3 text-xs uppercase ml-1">ADMIN MENU</Text>
            <View className="flex-row gap-3">
                <TouchableOpacity onPress={() => router.push('/admin/manager')} className="flex-1 bg-[#333D4B] py-4 rounded-2xl items-center">
                    <FontAwesome5 name="shield-alt" size={20} color="white" style={{ marginBottom: 8 }} />
                    <Text className="text-white font-bold text-xs">팀/분쟁 관리</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push('/admin/inquiries')} className="flex-1 bg-[#3182F6] py-4 rounded-2xl items-center">
                    <FontAwesome5 name="envelope" size={20} color="white" style={{ marginBottom: 8 }} />
                    <Text className="text-white font-bold text-xs">Q&A 확인</Text>
                </TouchableOpacity>
            </View>
        </View>
      )}

      {/* 문의하기 */}
      <View className="mb-8">
        <Text className="font-bold text-[#191F28] mb-3 ml-1">1:1 문의하기</Text>
        <TextInput 
            className="bg-[#F9FAFB] p-4 rounded-2xl border border-gray-100 text-base h-32 mb-3"
            placeholder="이용 중 불편한 점이나 건의사항을 남겨주세요."
            multiline
            textAlignVertical="top"
            value={inquiryText}
            onChangeText={setInquiryText}
        />
        <TouchableOpacity 
            onPress={handleSendInquiry}
            disabled={sending}
            className="bg-[#3182F6] py-4 rounded-xl items-center shadow-lg shadow-blue-200"
        >
            {sending ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold">문의 보내기</Text>}
        </TouchableOpacity>
      </View>

      {/* 하단 링크 및 탈퇴 */}
      <View className="gap-3">
        <View className="flex-row gap-2 mt-4">
            <TouchableOpacity onPress={handleLogout} className="flex-1 flex-row justify-center items-center p-4 bg-gray-100 rounded-2xl">
                <Text className="text-gray-600 font-bold mr-2">로그아웃</Text>
                <FontAwesome5 name="sign-out-alt" size={16} color="#4b5563" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleWithdrawal} className="flex-1 flex-row justify-center items-center p-4 bg-red-50 rounded-2xl">
                <Text className="text-red-500 font-bold mr-2">회원 탈퇴</Text>
                <FontAwesome5 name="user-times" size={16} color="#ef4444" />
            </TouchableOpacity>
        </View>
      </View>

      {/* 정보 수정 모달 */}
      <Modal visible={editModalVisible} animationType="fade" transparent={true}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            className="flex-1 justify-center items-center bg-black/60 px-6"
          >
              <View className="bg-white w-full rounded-3xl p-6">
                  <Text className="text-xl font-bold mb-6 text-center text-[#191F28]">내 정보 수정</Text>
                  
                  <View className="mb-4">
                      <Text className="text-xs font-bold text-[#8B95A1] mb-1 ml-1">이름 (대표자명)</Text>
                      <TextInput 
                        className="bg-white border border-[#3182F6] p-4 rounded-xl text-[#191F28]" 
                        value={newName} 
                        onChangeText={setNewName}
                        placeholder="이름을 입력하세요"
                      />
                  </View>

                  <View className="mb-6">
                      <Text className="text-xs font-bold text-[#8B95A1] mb-1 ml-1">전화번호</Text>
                      <TextInput 
                        className="bg-white border border-[#3182F6] p-4 rounded-xl text-[#191F28]" 
                        value={newPhone} 
                        onChangeText={setNewPhone} 
                        keyboardType="phone-pad" 
                        placeholder="010-0000-0000"
                      />
                  </View>

                  <View className="flex-row gap-3">
                      <TouchableOpacity onPress={() => setEditModalVisible(false)} className="flex-1 bg-gray-100 py-4 rounded-xl items-center">
                          <Text className="text-[#4E5968] font-bold">취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleUpdateProfile} className="flex-1 bg-[#3182F6] py-4 rounded-xl items-center">
                          {updating ? <ActivityIndicator color="white"/> : <Text className="text-white font-bold">저장</Text>}
                      </TouchableOpacity>
                  </View>
              </View>
          </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}