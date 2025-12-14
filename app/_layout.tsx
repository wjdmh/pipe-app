import "../shim"
import "../global.css"; // 스타일 파일 연결
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
// 아래 두 함수는 사용자님이 만드신 파일에서 가져옵니다. 경로가 맞는지 확인해주세요.
import { getResponsiveContainer, getWebBackground } from "../utils/platformHelper";

export default function RootLayout() {
  // 기본 화면 옵션 설정
  const screenOptions = { headerShown: false };

  return (
    // 기존의 tw 문법을 제거하고 함수 결과를 바로 className이나 style로 받도록 처리
    <View className={getWebBackground()}>
      <StatusBar style="auto" />
      <View className={getResponsiveContainer()}>
        <Stack screenOptions={screenOptions}>
          <Stack.Screen name="home" options={{ headerShown: false }} />
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="auth/login" options={{ headerShown: false }} />
          <Stack.Screen name="auth/signup" options={{ title: '회원가입', headerBackTitle: '뒤로' }} />

          <Stack.Screen name="match/write" options={{ title: '매치 개설', headerBackTitle: '취소' }} />
          <Stack.Screen name="match/[id]" options={{ title: '매치 상세', headerBackTitle: '목록' }} />
          <Stack.Screen name="match/applicants" options={{ title: '신청자 관리' }} />
          <Stack.Screen name="match/edit" options={{ title: '매치 수정' }} />

          <Stack.Screen name="guest/list" options={{ title: '게스트 모집' }} />
          <Stack.Screen name="guest/write" options={{ title: '게스트 등록' }} />
          <Stack.Screen name="guest/[id]" options={{ title: '게스트 상세' }} />
          
          <Stack.Screen name="admin/manager" options={{ title: '관리자 페이지' }} />
        </Stack>
      </View>
    </View>
  );
}