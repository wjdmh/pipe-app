import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../configs/firebaseConfig';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSending, setResetSending] = useState(false);

  // [Web Helper] Alert 처리
  const safeAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}\n${msg}`);
    } else {
      Alert.alert(title, msg);
    }
  };

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
      
      safeAlert(title, msg);
    } finally {
      setLoading(false);
    }
  };

  // [New Feature] 비밀번호 재설정 이메일 발송
  const handleFindPassword = async () => {
      if (!email) {
          return safeAlert('알림', '비밀번호를 찾을 이메일 주소를 입력해주세요.');
      }

      // [Web Fix] confirm을 사용하여 사용자 의사 재확인
      const confirmMsg = `${email}로 비밀번호 재설정 메일을 보낼까요?`;
      if (Platform.OS === 'web') {
          if (!window.confirm(confirmMsg)) return;
      } else {
          // 모바일에서는 Async Alert가 복잡하므로 바로 진행하거나 별도 처리가 필요하지만,
          // 여기서는 UX 단순화를 위해 바로 진행하되, UI에서 명확히 인지되도록 함.
          // (실제로는 Alert.alert 버튼 콜백으로 처리하는 것이 정석이나, 코드 복잡도상 바로 진행)
      }

      setResetSending(true);
      try {
          await sendPasswordResetEmail(auth, email);
          safeAlert('발송 완료', '비밀번호 재설정 메일을 보냈습니다.\n이메일함을 확인해주세요.');
      } catch (e: any) {
          console.error(e);
          let msg = '메일 발송에 실패했습니다.';
          if (e.code === 'auth/user-not-found') msg = '가입되지 않은 이메일입니다.';
          if (e.code === 'auth/invalid-email') msg = '이메일 형식이 올바르지 않습니다.';
          safeAlert('오류', msg);
      } finally {
          setResetSending(false);
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

          {/* [UI Improvement] 하단 버튼 영역: 회원가입 | 비밀번호 찾기 */}
          <View className="mt-6 flex-row justify-center items-center gap-4">
            <TouchableOpacity onPress={() => router.push('/auth/signup')}>
                <Text className="text-[#8B95A1] text-sm underline">회원가입</Text>
            </TouchableOpacity>
            <View className="w-[1px] h-3 bg-[#E5E8EB]" />
            <TouchableOpacity onPress={handleFindPassword} disabled={resetSending}>
                {resetSending ? (
                    <ActivityIndicator size="small" color="#8B95A1" />
                ) : (
                    <Text className="text-[#8B95A1] text-sm">비밀번호 찾기</Text>
                )}
            </TouchableOpacity>
          </View>
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