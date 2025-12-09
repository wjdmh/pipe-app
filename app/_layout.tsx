// app/_layout.tsx 최상단에 추가
import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  if (typeof window !== 'undefined') {
    // Firebase 웹 호환성 Polyfill
    // @ts-ignore
    window._frameTimestamp = null;
  }
}
// app/_layout.tsx
import { Stack } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import { getResponsiveContainer, getWebBackground } from "../utils/platformHelper";
import tw from 'twrnc';

export default function RootLayout() {
  
  // 기본 헤더 옵션 설정
  const screenOptions = {
    headerStyle: { backgroundColor: 'white' },
    headerTitleStyle: { fontWeight: 'bold' as const },
    headerShadowVisible: false, // iOS 스타일 헤더 라인 제거
    contentStyle: { backgroundColor: 'white' }
  };

  return (
    // [Web Layout] PC 브라우저 배경색 (회색)
    <View style={tw`${getWebBackground()}`}>
      
      {/* [Web Layout] 실제 앱 컨텐츠 컨테이너 (최대 500px 중앙 정렬) */}
      <View style={tw`${getResponsiveContainer()}`}>
        
        <Stack screenOptions={screenOptions}>
          {/* 메인 탭 화면 (헤더 숨김) */}
          <Stack.Screen name="home" options={{ headerShown: false }} />
          
          {/* 로그인/회원가입 (헤더 숨김) */}
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="auth/login" options={{ headerShown: false }} />
          <Stack.Screen name="auth/signup" options={{ title: '회원가입', headerBackTitle: '뒤로' }} />

          {/* 매치 관련 화면 */}
          <Stack.Screen name="match/write" options={{ title: '매치 개설', headerBackTitle: '취소' }} />
          <Stack.Screen name="match/[id]" options={{ title: '매치 상세', headerBackTitle: '목록' }} />
          <Stack.Screen name="match/applicants" options={{ title: '신청자 관리' }} />
          <Stack.Screen name="match/edit" options={{ title: '매치 수정' }} />

          {/* 게스트(용병) 관련 화면 */}
          <Stack.Screen name="guest/list" options={{ title: '게스트 모집' }} />
          <Stack.Screen name="guest/write" options={{ title: '게스트 등록' }} />
          <Stack.Screen name="guest/[id]" options={{ title: '게스트 상세' }} />
          
          {/* 관리자 화면 */}
          <Stack.Screen name="admin/manager" options={{ title: '관리자 페이지' }} />
        </Stack>

      </View>
    </View>
  );
}