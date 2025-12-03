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

// [New] 배구 포지션 데이터
const POSITIONS = [
  { id: 'L', label: '레프트(OH)' },
  { id: 'R', label: '라이트(OP)' },
  { id: 'C', label: '미들블로커(MB)' },
  { id: 'S', label: '세터(S)' },
  { id: 'Li', label: '리베로(L)' },
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
  const [position, setPosition] = useState<string | null>(null); // [New]
  const [role, setRole] = useState<UserRole | null>(null);

  const handleSignup = async () => {
    if (!email || !password || !name) return Alert.alert('오류', '필수 정보를 모두 입력해주세요.');
    if (!phone) return Alert.alert('오류', '전화번호는 필수입니다.');
    if (!gender) return Alert.alert('오류', '성별을 선택해주세요.');
    if (!position) return Alert.alert('오류', '주 포지션을 선택해주세요.');
    if (!role) return Alert.alert('오류', '팀 내 역할을 선택해주세요.');

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
          position, // 포지션 저장
          role,
          roleLabel: role === 'leader' ? '대표(주장)' : role === 'member' ? '팀원' : '기타',
          createdAt: new Date().toISOString(),
        });

        Alert.alert('환영합니다', '회원가입이 완료되었습니다.', [
            { text: '시작하기', onPress: () => router.replace('/home') }
        ]);

      } catch (dbError: any) {
        console.error("DB Save Failed", dbError);
        // DB 저장 실패시 계정 삭제 (롤백)
        if (createdUser) await deleteUser(createdUser);
        throw new Error('회원 정보 저장 실패. 다시 시도해주세요.');
      }

    } catch (error: any) {
      if (!isMounted.current) return;
      let msg = '오류가 발생했습니다.';
      if (error.code === 'auth/email-already-in-use') msg = '이미 사용 중인 이메일입니다.';
      else if (error.code === 'auth/weak-password') msg = '비밀번호는 6자 이상이어야 합니다.';
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
        <Text style={tw`text-2xl font-bold text-[#191F28] mb-8`}>
          파이프에서{'\n'}새로운 배구를 시작해보세요
        </Text>

        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>이메일</Text>
        <TextInput style={tw`bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 text-base`} placeholder="example@email.com" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />

        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>비밀번호</Text>
        <TextInput style={tw`bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 text-base`} placeholder="6자 이상" secureTextEntry value={password} onChangeText={setPassword} />

        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>전화번호 <Text style={tw`text-red-500`}>*</Text></Text>
        <TextInput style={tw`bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 text-base`} placeholder="010-0000-0000" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>이름 (실명)</Text>
        <TextInput style={tw`bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 text-base`} placeholder="실명 입력" value={name} onChangeText={setName} />

        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>성별 <Text style={tw`text-red-500`}>*</Text></Text>
        <View style={tw`flex-row mb-4`}>
          <TouchableOpacity onPress={() => setGender('male')} style={tw`flex-1 py-3 border rounded-l-xl items-center justify-center ${gender === 'male' ? 'bg-[#3182F6] border-[#3182F6]' : 'bg-gray-50 border-gray-200'}`}><Text style={tw`font-bold ${gender === 'male' ? 'text-white' : 'text-gray-500'}`}>남자</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setGender('female')} style={tw`flex-1 py-3 border border-l-0 rounded-r-xl items-center justify-center ${gender === 'female' ? 'bg-[#FF6B6B] border-[#FF6B6B]' : 'bg-gray-50 border-gray-200'}`}><Text style={tw`font-bold ${gender === 'female' ? 'text-white' : 'text-gray-500'}`}>여자</Text></TouchableOpacity>
        </View>

        {/* [New] 포지션 선택 UI */}
        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>주 포지션 <Text style={tw`text-red-500`}>*</Text></Text>
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

        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>팀 내 역할 <Text style={tw`text-red-500`}>*</Text></Text>
        <View style={tw`flex-row mb-8`}>
          <TouchableOpacity onPress={() => setRole('leader')} style={tw`flex-1 py-3 border rounded-l-xl items-center justify-center ${role === 'leader' ? 'bg-[#191F28] border-[#191F28]' : 'bg-gray-50 border-gray-200'}`}><Text style={tw`font-bold ${role === 'leader' ? 'text-white' : 'text-gray-500'}`}>대표(주장)</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setRole('member')} style={tw`flex-1 py-3 border-t border-b border-r items-center justify-center ${role === 'member' ? 'bg-[#191F28] border-[#191F28]' : 'bg-gray-50 border-gray-200'}`}><Text style={tw`font-bold ${role === 'member' ? 'text-white' : 'text-gray-500'}`}>팀원</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setRole('guest')} style={tw`flex-1 py-3 border rounded-r-xl border-l-0 items-center justify-center ${role === 'guest' ? 'bg-[#191F28] border-[#191F28]' : 'bg-gray-50 border-gray-200'}`}><Text style={tw`font-bold ${role === 'guest' ? 'text-white' : 'text-gray-500'}`}>기타</Text></TouchableOpacity>
        </View>

        <TouchableOpacity onPress={handleSignup} disabled={loading} style={tw`bg-[#3182F6] p-4 rounded-xl items-center shadow-sm`}>
          {loading ? <ActivityIndicator color="white" /> : <Text style={tw`text-white font-bold text-lg`}>가입 완료</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}