import "../global.css";
import "../shim";
import { Stack } from 'expo-router';
import { View, Platform, LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getResponsiveContainer, getWebBackground } from "../utils/platformHelper";
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

// [Architect's Fix] 콘솔 노이즈 제거
LogBox.ignoreLogs([
  'Blocked aria-hidden on an element',
  'props.pointerEvents is deprecated',
  'shadow* style props are deprecated',
  'TouchableWithoutFeedback is deprecated',
]);

// [Architect's Fix] 스플래시 스크린 방어 로직
try {
  SplashScreen.preventAutoHideAsync().catch(() => {
    console.warn("[Layout] Splash Screen preventAutoHide failed - continuing anyway.");
  });
} catch (e) {
  // ignore errors
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    "FontAwesome": require("../assets/fonts/FontAwesome.ttf"),
    "FontAwesome5Free-Solid": require("../assets/fonts/FontAwesome5_Solid.ttf"),
    "FontAwesome5Free-Regular": require("../assets/fonts/FontAwesome5_Regular.ttf"),
    "FontAwesome5Brands-Regular": require("../assets/fonts/FontAwesome5_Brands.ttf"),
  });

  useEffect(() => {
    if (error) console.error("[Layout] Font loading error:", error);
  }, [error]);

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync().catch((e) => {
        console.warn("[Layout] Failed to hide splash screen:", e);
      });
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }

  // [Architect's Fix] 웹 UX 최적화 (애니메이션 제거)
  const screenOptions = {
    headerShown: false,
    animation: Platform.OS === 'web' ? 'none' : 'default', 
  } as const;

  return (
    // 1. [Fix] 전체 배경: flex: 1을 명시하여 브라우저 전체 높이를 사용
    <View style={{ flex: 1 }} className={getWebBackground()}>
      <StatusBar style="auto" />
      
      {/* 2. [Fix] 앱 컨테이너: 높이 100% 강제 지정 및 PC 화면 중앙 정렬 */}
      <View 
        className={getResponsiveContainer()} 
        style={{ 
          flex: 1, 
          width: '100%', 
          maxWidth: 480,        /* PC에서 모바일 너비 유지 */
          marginHorizontal: 'auto', /* 화면 중앙 정렬 */
          height: '100%',       /* ⭐ 핵심: 이게 없으면 내용물이 잘림 */
          overflow: 'hidden',    /* 둥근 모서리 등 스타일 유지 */
          display: 'flex',       /* Flexbox 동작 보장 */
          flexDirection: 'column' 
        }}
      >
        <View style={{ flex: 1, width: '100%', height: '100%' }}>
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
    </View>
  );
}