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
      
      if (error.code === 'auth/invalid-email') {
        msg = '이메일 형식이 올바르지 않아요.';
      }
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        msg = '이메일 또는 비밀번호가 정확하지 않아요.';
      }
      
      Alert.alert(title, msg);
    } finally {
      setLoading(false);
    }
  };

  const isValid = email.length > 0 && password.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* [Web Fix] 웹에서는 behavior를 사용하지 않음 */}
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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
              // [Web Fix] autoFocus는 모바일에서 키보드가 즉시 올라와 불편할 수 있으므로 웹에서만 추천
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