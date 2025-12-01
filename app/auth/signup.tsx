import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';
import tw from 'twrnc';
import { FontAwesome5 } from '@expo/vector-icons';

type UserRole = 'leader' | 'member' | 'guest';

export default function SignupScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isMounted = useRef(true);

  // 컴포넌트 마운트 상태 관리 (비동기 처리 중 언마운트 방지)
  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);
  
  // 입력 정보
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);

  // 회원가입 처리
  const handleSignup = async () => {
    // 유효성 검사
    if (!email || !password || !name) {
      Alert.alert('오류', '이메일, 비밀번호, 이름을 모두 입력해주세요.');
      return;
    }
    if (!phone) {
      Alert.alert('오류', '전화번호는 필수 입력 사항입니다.');
      return;
    }
    if (!gender) {
      Alert.alert('오류', '성별을 선택해주세요.');
      return;
    }
    if (!role) {
      Alert.alert('오류', '팀 내 역할을 선택해주세요.');
      return;
    }

    try {
      setLoading(true);
      
      // 1. Firebase Auth 생성 (이 시점에 전역 Auth Listener가 동작하여 자동 이동될 수 있음)
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. 프로필 업데이트 (이름)
      await updateProfile(user, { displayName: name });

      // 3. Firestore에 사용자 추가 정보 저장
      // (자동 이동과 데이터 저장 간의 경합을 최소화하기 위해 신속히 처리)
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email,
        name,
        phone,
        gender,
        role,
        roleLabel: role === 'leader' ? '대표(주장)' : role === 'member' ? '팀원' : '기타',
        createdAt: new Date(),
      });

      // 4. 완료 처리
      // 이미 앱의 Auth Listener가 페이지를 이동시켰을 가능성이 높으므로
      // 별도의 Alert나 router.replace를 호출하지 않고 로딩만 종료합니다.
      // 필요하다면 가벼운 Toast 메시지 정도만 띄울 수 있으나, 
      // 현재는 "두 번 이동" 오류 방지를 위해 아무것도 하지 않고 흐름을 맡깁니다.

    } catch (error: any) {
      // 에러가 발생했을 때만 Alert 표시
      if (!isMounted.current) return; // 이미 화면이 넘어갔다면 무시

      let msg = '회원가입 중 오류가 발생했습니다.';
      if (error.code === 'auth/email-already-in-use') msg = '이미 사용 중인 이메일입니다.';
      if (error.code === 'auth/invalid-email') msg = '이메일 형식이 올바르지 않습니다.';
      if (error.code === 'auth/weak-password') msg = '비밀번호는 6자 이상이어야 합니다.';
      Alert.alert('오류', msg);
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
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

      <ScrollView contentContainerStyle={tw`p-6 pb-10`}>
        {/* 상단 경고/안내 문구 */}
        <View style={tw`bg-red-50 p-4 rounded-xl mb-6 border border-red-100`}>
          <View style={tw`flex-row items-center mb-1`}>
            <FontAwesome5 name="exclamation-circle" size={16} color="#E53E3E" />
            <Text style={tw`text-[#E53E3E] font-bold ml-2 text-base`}>잠깐! 확인해주세요</Text>
          </View>
          <Text style={tw`text-gray-700 leading-5`}>
            원활한 팀 매칭과 관리를 위해{'\n'}
            <Text style={tw`font-bold text-red-500`}>팀의 대표자(주장) 1명만 가입</Text>해주세요.{'\n'}
            팀원은 추후 초대 기능을 통해 합류할 수 있습니다.
          </Text>
        </View>

        <Text style={tw`text-2xl font-bold text-[#191F28] mb-8`}>
          파이프에서{'\n'}새로운 배구를 시작해보세요
        </Text>

        {/* 1. 이메일 (ID) */}
        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>이메일</Text>
        <TextInput
          style={tw`bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 text-base`}
          placeholder="example@email.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        {/* 2. 비밀번호 */}
        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>비밀번호</Text>
        <TextInput
          style={tw`bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 text-base`}
          placeholder="6자 이상 입력해주세요"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {/* 3. 전화번호 (먼저 입력) */}
        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>전화번호 <Text style={tw`text-red-500`}>*</Text></Text>
        <TextInput
          style={tw`bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 text-base`}
          placeholder="010-0000-0000"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />

        {/* 4. 이름 (전화번호 다음) */}
        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>이름 (실명)</Text>
        <TextInput
          style={tw`bg-gray-50 p-4 rounded-xl mb-4 border border-gray-200 text-base`}
          placeholder="실명을 입력해주세요"
          value={name}
          onChangeText={setName}
        />

        {/* 5. 성별 */}
        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>성별 <Text style={tw`text-red-500`}>*</Text></Text>
        <View style={tw`flex-row mb-4`}>
          <TouchableOpacity 
            onPress={() => setGender('male')}
            style={tw`flex-1 py-3 border rounded-l-xl items-center justify-center ${gender === 'male' ? 'bg-[#3182F6] border-[#3182F6]' : 'bg-gray-50 border-gray-200'}`}
          >
            <Text style={tw`font-bold ${gender === 'male' ? 'text-white' : 'text-gray-500'}`}>남자</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setGender('female')}
            style={tw`flex-1 py-3 border border-l-0 rounded-r-xl items-center justify-center ${gender === 'female' ? 'bg-[#FF6B6B] border-[#FF6B6B]' : 'bg-gray-50 border-gray-200'}`}
          >
            <Text style={tw`font-bold ${gender === 'female' ? 'text-white' : 'text-gray-500'}`}>여자</Text>
          </TouchableOpacity>
        </View>

        {/* 6. 역할 선택 */}
        <Text style={tw`text-sm font-bold text-gray-500 mb-1 ml-1`}>팀 내 역할 <Text style={tw`text-red-500`}>*</Text></Text>
        <View style={tw`flex-row mb-2`}>
          <TouchableOpacity 
            onPress={() => setRole('leader')}
            style={tw`flex-1 py-3 border rounded-l-xl items-center justify-center ${role === 'leader' ? 'bg-[#191F28] border-[#191F28]' : 'bg-gray-50 border-gray-200'}`}
          >
            <Text style={tw`font-bold ${role === 'leader' ? 'text-white' : 'text-gray-500'}`}>대표(주장)</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setRole('member')}
            style={tw`flex-1 py-3 border-t border-b border-r items-center justify-center ${role === 'member' ? 'bg-[#191F28] border-[#191F28]' : 'bg-gray-50 border-gray-200'}`}
          >
            <Text style={tw`font-bold ${role === 'member' ? 'text-white' : 'text-gray-500'}`}>팀원</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setRole('guest')}
            style={tw`flex-1 py-3 border rounded-r-xl border-l-0 items-center justify-center ${role === 'guest' ? 'bg-[#191F28] border-[#191F28]' : 'bg-gray-50 border-gray-200'}`}
          >
            <Text style={tw`font-bold ${role === 'guest' ? 'text-white' : 'text-gray-500'}`}>기타</Text>
          </TouchableOpacity>
        </View>
        <Text style={tw`text-xs text-gray-400 mb-8 ml-1`}>
           * 팀 등록 및 매칭 신청은 '대표(주장)' 계정으로만 가능합니다.
        </Text>

        <TouchableOpacity
          onPress={handleSignup}
          disabled={loading}
          style={tw`bg-[#3182F6] p-4 rounded-xl items-center shadow-sm shadow-blue-200`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={tw`text-white font-bold text-lg`}>가입 완료</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}