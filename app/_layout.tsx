// app/_layout.tsx
import '../shim'; // 👈 [핵심] 무조건 가장 윗줄에 있어야 합니다! (경로 주의
// app/_layout.tsx
import { Platform } from 'react-native';

// [Web Polyfill] Firebase 및 브라우저 호환성 패치
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  // @ts-ignore
  window._frameTimestamp = null;
}

import { Stack } from "expo-router";
import { View } from "react-native";
import { getResponsiveContainer, getWebBackground } from "../utils/platformHelper";
import tw from 'twrnc';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  
  const screenOptions = {
    headerStyle: { backgroundColor: 'white' },
    headerTitleStyle: { fontWeight: 'bold' as const },
    headerShadowVisible: false,
    contentStyle: { backgroundColor: 'white' }
  };

  return (
    <View style={tw`${getWebBackground()}`}>
      <StatusBar style="auto" />
      <View style={tw`${getResponsiveContainer()}`}>
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