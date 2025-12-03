import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../configs/firebaseConfig';
import { SafeAreaView } from 'react-native-safe-area-context';
import tw from 'twrnc';

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
      // [수정됨] 유저 정보 조회 및 팀 ID 체크 로직 제거
      // 로그인 성공 시 무조건 홈으로 이동 (팀이 없으면 Guest UI가 뜹니다)
      router.replace('/home');

    } catch (error: any) {
      let msg = '아이디와 비밀번호를 확인해주세요.';
      if (error.code === 'auth/invalid-email') msg = '이메일 형식이 올바르지 않아요.';
      if (error.code === 'auth/invalid-credential') msg = '가입되지 않은 이메일이거나,\n비밀번호가 달라요.';
      Alert.alert('로그인 안내', msg);
    } finally {
      setLoading(false);
    }
  };

  const isValid = email.length > 0 && password.length > 0;

  return (
    <SafeAreaView style={tw`flex-1 bg-white`}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={tw`flex-1`}
      >
        <View style={tw`flex-1 px-6 pt-10`}>
          <View style={tw`mb-10`}>
            <Text style={tw`text-2xl font-bold text-[#191F28] mb-2 leading-8`}>
              안녕하세요! 👋{'\n'}어떤 계정으로 시작할까요?
            </Text>
          </View>

          <View style={tw`gap-4`}>
            <TextInput
              style={tw`w-full bg-[#F2F4F6] p-4 rounded-xl text-lg text-[#333D4B]`}
              placeholder="이메일 (example@email.com)"
              placeholderTextColor="#8B95A1"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              autoFocus={true}
            />

            <TextInput
              style={tw`w-full bg-[#F2F4F6] p-4 rounded-xl text-lg text-[#333D4B]`}
              placeholder="비밀번호"
              placeholderTextColor="#8B95A1"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity onPress={() => router.push('/auth/signup')} style={tw`mt-6`}>
            <Text style={tw`text-[#8B95A1] text-sm text-center underline`}>아직 계정이 없으신가요?</Text>
          </TouchableOpacity>
        </View>

        <View style={tw`p-4 border-t border-[#F2F4F6]`}>
            <TouchableOpacity
              onPress={handleLogin}
              disabled={!isValid || loading}
              style={tw`w-full py-4 rounded-xl items-center ${isValid ? 'bg-[#3182F6]' : 'bg-[#E5E8EB]'}`}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={tw`text-white font-bold text-lg ${isValid ? '' : 'text-[#8B95A1]'}`}>
                  시작하기
                </Text>
              )}
            </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}