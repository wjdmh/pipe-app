import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createUserWithEmailAndPassword, updateProfile, deleteUser, User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import tw from 'twrnc';
import { FontAwesome5 } from '@expo/vector-icons';

type UserRole = 'leader' | 'member' | 'guest';

// [Update] 포지션 명칭 국제 표준화 (약어 및 구 명칭 병기)
const POSITIONS = [
  { id: 'OH', label: '아웃사이드(레프트)' },
  { id: 'OP', label: '아포짓(라이트)' },
  { id: 'MB', label: '미들블로커(센터)' },
  { id: 'S', label: '세터' },
  { id: 'L', label: '리베로' },
];

export default function SignupScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);

  const handleSignup = async () => {
    if (!email || !password || !name) return Alert.alert('정보 입력', '이메일, 비밀번호, 이름을 모두 입력해주세요.');
    if (!phone) return Alert.alert('정보 입력', '휴대폰 번호를 입력해주세요.');
    if (!gender) return Alert.alert('정보 입력', '성별을 선택해주세요.');
    if (!position) return Alert.alert('정보 입력', '주 포지션을 선택해주세요.');
    if (!role) return Alert.alert('정보 입력', '역할을 선택해주세요.');

    setLoading(true);
    let createdUser: User | null = null;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      createdUser = userCredential.user;

      try {
        await updateProfile(createdUser, { displayName: name });

        await setDoc(doc(db, 'users', createdUser.uid), {
          uid: createdUser.uid,
          email,
          name,
          phone,
          gender,
          position,
          role,
          roleLabel: role === 'leader' ? '대표(주장)' : role === 'member' ? '팀원' : '기타',
          createdAt: new Date().toISOString(),
        });

        Alert.alert('가입 완료', '회원가입이 완료되었습니다.', [
            { text: '홈으로 이동', onPress: () => router.replace('/home') }
        ]);

      } catch (dbError: any) {
        console.error("DB Save Failed", dbError);
        if (createdUser) await deleteUser(createdUser);
        throw new Error('정보 저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }

    } catch (error: any) {
      if (!isMounted.current) return;
      let msg = '가입 중 문제가 발생했습니다.';
      if (error.code === 'auth/email-already-in-use') msg = '이미 가입된 이메일입니다.';
      else if (error.code === 'auth/weak-password') msg = '비밀번호는 6자 이상 입력해주세요.';
      Alert.alert('가입 실패', msg);
    } finally {
      if (isMounted.current) setLoading(false);
    }
  };

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <View style={tw`px-6 py-4 border-b border-gray-100 flex-row items-center`}>
         <TouchableOpacity onPress={() => router.back()} style={tw`p-2 -ml-2`}>
            <FontAwesome5 name="arrow-left" size={20} color="#191F28" />
         </TouchableOpacity>
         <Text style={tw`text-xl font-bold ml-2 text-[#191F28]`}>회원가입</Text>
      </View>

      <ScrollView contentContainerStyle={tw`p-6 pb-20`} showsVerticalScrollIndicator={false}>
        <View style={tw`mb-8`}>
            <Text style={tw`text-2xl font-bold text-[#191F28]`}>기본 정보</Text>
        </View>

        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>이메일</Text>
        <TextInput style={tw`bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 text-base`} placeholder="이메일 주소" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />

        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>비밀번호</Text>
        <TextInput style={tw`bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 text-base`} placeholder="비밀번호 (6자 이상)" secureTextEntry value={password} onChangeText={setPassword} />

        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>휴대폰 번호</Text>
        <TextInput style={tw`bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 text-base`} placeholder="숫자만 입력" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>이름</Text>
        <TextInput style={tw`bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 text-base`} placeholder="실명" value={name} onChangeText={setName} />

        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>성별</Text>
        <View style={tw`flex-row mb-4`}>
          <TouchableOpacity onPress={() => setGender('male')} style={tw`flex-1 py-3 border rounded-l-xl items-center justify-center ${gender === 'male' ? 'bg-[#3182F6] border-[#3182F6]' : 'bg-gray-50 border-gray-200'}`}><Text style={tw`font-bold ${gender === 'male' ? 'text-white' : 'text-gray-500'}`}>남자</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setGender('female')} style={tw`flex-1 py-3 border border-l-0 rounded-r-xl items-center justify-center ${gender === 'female' ? 'bg-[#FF6B6B] border-[#FF6B6B]' : 'bg-gray-50 border-gray-200'}`}><Text style={tw`font-bold ${gender === 'female' ? 'text-white' : 'text-gray-500'}`}>여자</Text></TouchableOpacity>
        </View>

        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>주 포지션</Text>
        <View style={tw`flex-row flex-wrap gap-2 mb-4`}>
            {POSITIONS.map((pos) => (
                <TouchableOpacity 
                    key={pos.id} 
                    onPress={() => setPosition(pos.id)}
                    style={tw`px-3 py-2 rounded-lg border ${position === pos.id ? 'bg-[#3182F6] border-[#3182F6]' : 'bg-white border-gray-200'}`}
                >
                    <Text style={tw`text-xs font-bold ${position === pos.id ? 'text-white' : 'text-gray-500'}`}>{pos.label}</Text>
                </TouchableOpacity>
            ))}
        </View>

        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>팀 내 역할</Text>
        <View style={tw`flex-row mb-8`}>
          <TouchableOpacity onPress={() => setRole('leader')} style={tw`flex-1 py-3 border rounded-l-xl items-center justify-center ${role === 'leader' ? 'bg-[#191F28] border-[#191F28]' : 'bg-gray-50 border-gray-200'}`}><Text style={tw`font-bold ${role === 'leader' ? 'text-white' : 'text-gray-500'}`}>대표(주장)</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setRole('member')} style={tw`flex-1 py-3 border-t border-b border-r items-center justify-center ${role === 'member' ? 'bg-[#191F28] border-[#191F28]' : 'bg-gray-50 border-gray-200'}`}><Text style={tw`font-bold ${role === 'member' ? 'text-white' : 'text-gray-500'}`}>팀원</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setRole('guest')} style={tw`flex-1 py-3 border rounded-r-xl border-l-0 items-center justify-center ${role === 'guest' ? 'bg-[#191F28] border-[#191F28]' : 'bg-gray-50 border-gray-200'}`}><Text style={tw`font-bold ${role === 'guest' ? 'text-white' : 'text-gray-500'}`}>기타</Text></TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleSignup} disabled={loading} style={tw`bg-[#3182F6] p-4 rounded-xl items-center shadow-sm`}>
          {loading ? <ActivityIndicator color="white" /> : <Text style={tw`text-white font-bold text-lg`}>가입하기</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}