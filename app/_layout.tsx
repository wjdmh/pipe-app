import "../global.css";
import "../shim";
import { Stack } from 'expo-router';
import { View, Platform, LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
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

try {
  SplashScreen.preventAutoHideAsync().catch(() => {});
} catch (e) {}

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
      SplashScreen.hideAsync().catch((e) => {});
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  const screenOptions = {
    headerShown: false,
    animation: Platform.OS === 'web' ? 'none' : 'default', 
  } as const;

  // [Web Helper] 웹 환경 여부 확인
  const isWeb = Platform.OS === 'web';

  return (
    // 1. [Outer] 배경 및 정렬 컨테이너
    // items-center: 자식 요소(앱 화면)를 가로축 가운데로 강제 정렬 (핵심!)
    <View 
      style={{ flex: 1 }} 
      className={isWeb ? "flex-1 bg-gray-100 items-center" : "flex-1 bg-white"}
    >
      <StatusBar style="auto" />
      
      {/* 2. [Inner] 앱 실제 화면 컨테이너 */}
      {/* maxWidth: 480 (PC에서 모바일 비율 유지) */}
      <View 
        style={isWeb ? { 
          width: '100%', 
          maxWidth: 480, 
          height: '100%',
          // 그림자 효과를 스타일에 직접 주입 (Tailwind 무시 방지)
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' 
        } : { flex: 1, width: '100%' }}
        className="bg-white w-full h-full"
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