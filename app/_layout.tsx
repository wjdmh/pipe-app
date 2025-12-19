import "../global.css";
import "../shim";
import { Stack } from 'expo-router';
import { View, Platform, LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

// 콘솔 경고 무시
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

  const isWeb = Platform.OS === 'web';

  return (
    // [1. 바깥 배경]
    // alignItems: 'center' -> 자식 요소를 가로축 중앙으로 정렬
    <View 
      style={isWeb ? {
        flex: 1,
        backgroundColor: '#f3f4f6', // 회색 배경
        alignItems: 'center',       // ⭐ 핵심 1: 플렉스 박스 중앙 정렬
        width: '100%',
      } : { flex: 1, backgroundColor: 'white' }}
    >
      <StatusBar style="auto" />
      
      {/* [2. 앱 컨테이너] */}
      {/* marginHorizontal: 'auto' -> 브라우저에서 좌우 여백 자동 계산 (강제 중앙 정렬) */}
      <View 
        style={isWeb ? { 
          width: '100%', 
          maxWidth: 480, 
          height: '100%',
          marginHorizontal: 'auto',  // ⭐ 핵심 2: 마진 오토 (치트키)
          backgroundColor: 'white',
          boxShadow: '0 0 10px rgba(0,0,0,0.1)' // 그림자 조금 진하게 변경
        } : { flex: 1, width: '100%' }}
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