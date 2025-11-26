import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator, Modal } from 'react-native';
import { signOut } from 'firebase/auth';
import { doc, getDoc, collection, addDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import tw from 'twrnc';

export default function MyPageScreen() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  
  // 문의 관련 상태
  const [inquiryText, setInquiryText] = useState('');
  const [sending, setSending] = useState(false);

  // [New] 개인정보 수정 모달 상태
  const [editModalVisible, setEditModalVisible] = useState(false);
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
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
        if(snap.exists()) {
            setUserData(snap.data());
            setNewPhone(snap.data().phoneNumber || '');
        }
    }
  }

  const handleLogout = async () => {
    Alert.alert('로그아웃', '정말 로그아웃 하시겠습니까?', [
        { text: '취소' },
        { text: '로그아웃', style: 'destructive', onPress: async () => {
            await signOut(auth);
            router.replace('/');
        }}
    ]);
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

  // [New] 정보 수정 핸들러
  const handleUpdateProfile = async () => {
      if (!newPhone.trim()) return Alert.alert('알림', '전화번호를 입력해주세요.');
      setUpdating(true);
      try {
          if (auth.currentUser) {
              await updateDoc(doc(db, "users", auth.currentUser.uid), {
                  phoneNumber: newPhone
              });
              setUserData({ ...userData, phoneNumber: newPhone }); // 화면 갱신
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
    <ScrollView style={tw`flex-1 bg-white`} contentContainerStyle={tw`pt-12 px-6 pb-20`}>
      <Text style={tw`text-2xl font-extrabold text-slate-800 mb-8`}>마이페이지</Text>
      
      {/* 1. 프로필 카드 */}
      <View style={tw`bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-6`}>
         <View style={tw`flex-row items-center mb-4`}>
             <View style={tw`w-14 h-14 bg-indigo-100 rounded-full items-center justify-center mr-4`}>
                 <FontAwesome name="user" size={24} color="#4f46e5" />
             </View>
             <View>
                 <Text style={tw`font-bold text-lg text-slate-800`}>{userData?.email}</Text>
                 <Text style={tw`text-slate-500`}>{userData?.phoneNumber || '전화번호 없음'}</Text>
                 <Text style={tw`text-indigo-500 text-xs font-bold mt-1`}>{isAdmin ? '관리자(Admin)' : '일반 회원'}</Text>
             </View>
         </View>
         <TouchableOpacity 
            onPress={() => {
                setNewPhone(userData?.phoneNumber || '');
                setEditModalVisible(true);
            }}
            style={tw`bg-white py-3 rounded-xl border border-slate-200 items-center`}
         >
             <Text style={tw`text-slate-600 font-bold text-sm`}>개인정보 수정</Text>
         </TouchableOpacity>
      </View>

      {/* 2. 관리자 메뉴 */}
      {isAdmin && (
        <View style={tw`mb-8 border-t border-slate-100 pt-6`}>
            <Text style={tw`font-bold text-slate-400 mb-3 text-xs uppercase ml-1`}>ADMIN MENU</Text>
            <View style={tw`flex-row gap-3`}>
                <TouchableOpacity 
                    onPress={() => router.push('/admin/manager')} 
                    style={tw`flex-1 bg-slate-800 py-4 rounded-2xl items-center`}
                >
                    <FontAwesome name="shield" size={20} color="white" style={tw`mb-2`} />
                    <Text style={tw`text-white font-bold text-xs`}>팀/분쟁 관리</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                    onPress={() => router.push('/admin/inquiries')} 
                    style={tw`flex-1 bg-indigo-900 py-4 rounded-2xl items-center`}
                >
                    <FontAwesome name="envelope" size={20} color="white" style={tw`mb-2`} />
                    <Text style={tw`text-white font-bold text-xs`}>Q&A 확인</Text>
                </TouchableOpacity>
            </View>
        </View>
      )}

      {/* 3. Q&A 문의하기 */}
      <View style={tw`mb-8`}>
        <Text style={tw`font-bold text-slate-800 mb-3 ml-1`}>1:1 문의하기</Text>
        <TextInput 
            style={tw`bg-slate-50 p-4 rounded-2xl border border-slate-100 text-base h-32 mb-3`}
            placeholder="이용 중 불편한 점이나 건의사항을 남겨주세요."
            multiline
            textAlignVertical="top"
            value={inquiryText}
            onChangeText={setInquiryText}
        />
        <TouchableOpacity 
            onPress={handleSendInquiry}
            disabled={sending}
            style={tw`bg-indigo-600 py-4 rounded-xl items-center shadow-lg shadow-indigo-500/30`}
        >
            {sending ? <ActivityIndicator color="white" /> : <Text style={tw`text-white font-bold`}>문의 보내기</Text>}
        </TouchableOpacity>
      </View>

      {/* 4. 기타 메뉴 */}
      <View style={tw`gap-3`}>
        <TouchableOpacity style={tw`flex-row justify-between items-center p-4 bg-white border-b border-slate-50`}>
            <Text style={tw`text-slate-600 font-medium`}>서비스 이용약관</Text>
            <FontAwesome name="chevron-right" size={12} color="#cbd5e1" />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleLogout} style={tw`flex-row justify-between items-center p-4 bg-red-50 rounded-2xl mt-4`}>
            <Text style={tw`text-red-500 font-bold`}>로그아웃</Text>
            <FontAwesome name="sign-out" size={16} color="#ef4444" />
        </TouchableOpacity>
      </View>

      {/* [New] 수정 모달 */}
      <Modal visible={editModalVisible} animationType="fade" transparent={true}>
          <View style={tw`flex-1 justify-center items-center bg-black/50 px-6`}>
              <View style={tw`bg-white w-full rounded-3xl p-6`}>
                  <Text style={tw`text-xl font-bold mb-6 text-center`}>개인정보 수정</Text>
                  
                  <View style={tw`mb-4`}>
                      <Text style={tw`text-xs font-bold text-slate-400 mb-1 ml-1`}>이메일 (수정불가)</Text>
                      <TextInput 
                          style={tw`bg-slate-100 p-4 rounded-xl text-slate-500`} 
                          value={userData?.email} 
                          editable={false}
                      />
                  </View>

                  <View style={tw`mb-6`}>
                      <Text style={tw`text-xs font-bold text-slate-400 mb-1 ml-1`}>전화번호</Text>
                      <TextInput 
                          style={tw`bg-white border border-indigo-500 p-4 rounded-xl text-slate-800`} 
                          value={newPhone} 
                          onChangeText={setNewPhone}
                          keyboardType="phone-pad"
                          placeholder="010-0000-0000"
                      />
                  </View>

                  <View style={tw`flex-row gap-3`}>
                      <TouchableOpacity onPress={() => setEditModalVisible(false)} style={tw`flex-1 bg-slate-200 py-4 rounded-xl items-center`}>
                          <Text style={tw`text-slate-600 font-bold`}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleUpdateProfile} style={tw`flex-1 bg-indigo-600 py-4 rounded-xl items-center`}>
                          {updating ? <ActivityIndicator color="white"/> : <Text style={tw`text-white font-bold`}>저장</Text>}
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>

    </ScrollView>
  );
}