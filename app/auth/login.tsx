import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../configs/firebaseConfig';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return;

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // 로그인 성공 시 무조건 홈으로 이동
      router.replace('/home');

    } catch (error: any) {
      let title = '로그인 실패';
      let msg = '이메일 또는 비밀번호를 확인해주세요.';
      
      // [Web Fix] 웹에서는 Alert 대신 window.alert를 사용하는 것이 안전하지만, 
      // 로직 흐름상 여기서는 일단 기본 Alert를 사용하되, 
      // 이전 단계에서 제공한 safeAlert 패턴을 적용해도 좋습니다. 
      // (현재는 React Native Web이 Alert를 window.alert로 폴리필해주므로 
      // 단순 텍스트 알림은 크리티컬하지 않으나, 버튼 커스텀이 없으므로 안전합니다.)
      
      if (error.code === 'auth/invalid-email') {
        msg = '이메일 형식이 올바르지 않아요.';
      }
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        msg = '이메일 또는 비밀번호가 정확하지 않아요.';
      }
      
      if (Platform.OS === 'web') {
        window.alert(`${title}\n${msg}`);
      } else {
        Alert.alert(title, msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const isValid = email.length > 0 && password.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* [Web Fix] 
        웹 브라우저(특히 모바일 사파리/크롬)는 키보드 등장 시 
        자체적으로 뷰포트를 리사이징하므로 KeyboardAvoidingView가 불필요하거나 
        오동작(이중 밀림)을 유발합니다. 따라서 웹에서는 비활성화합니다.
      */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled={Platform.OS !== 'web'}
        className="flex-1"
      >
        <ScrollView contentContainerClassName="flex-grow px-6 pt-10" keyboardShouldPersistTaps="handled">
          <View className="mb-10">
            <Text className="text-2xl font-bold text-[#191F28] mb-2 leading-8">
              이메일로 로그인
            </Text>
          </View>

          <View className="gap-4">
            <TextInput
              className="w-full bg-[#F2F4F6] p-4 rounded-xl text-lg text-[#333D4B]"
              placeholder="이메일"
              placeholderTextColor="#8B95A1"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              // [Web Fix] autoFocus는 모바일 앱에서는 키보드가 갑자기 튀어나와 UX를 해칠 수 있지만
              // 웹에서는 로그인 페이지 진입 시 바로 입력하는 것이 표준 UX입니다.
              autoFocus={Platform.OS === 'web'}
            />

            <TextInput
              className="w-full bg-[#F2F4F6] p-4 rounded-xl text-lg text-[#333D4B]"
              placeholder="비밀번호"
              placeholderTextColor="#8B95A1"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity onPress={() => router.push('/auth/signup')} className="mt-6">
            <Text className="text-[#8B95A1] text-sm text-center underline">회원가입</Text>
          </TouchableOpacity>
        </ScrollView>

        <View className="p-4 border-t border-[#F2F4F6]">
            <TouchableOpacity
              onPress={handleLogin}
              disabled={!isValid || loading}
              // 조건부 스타일: 버튼 활성화/비활성화 색상 변경
              className={`w-full py-4 rounded-xl items-center ${isValid ? 'bg-[#3182F6]' : 'bg-[#E5E8EB]'}`}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className={`text-white font-bold text-lg ${isValid ? '' : 'text-[#8B95A1]'}`}>
                  로그인
                </Text>
              )}
            </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}