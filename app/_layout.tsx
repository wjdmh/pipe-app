// app/_layout.tsx
import "../global.css";
import "../shim";
import { Stack } from 'expo-router';
import { View, Platform, LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

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
    // 이제 이 View가 #root(전체화면) 내부를 꽉 채웁니다.
    <View 
      style={{
        flex: 1,
        backgroundColor: '#f3f4f6', // 바깥쪽 회색 배경
        alignItems: 'center',       // 가로 중앙 정렬
        justifyContent: 'center',   // 세로 중앙 정렬 (필요 시)
      }}
    >
      <StatusBar style="auto" />
      
      {/* [2. 앱 컨테이너] */}
      {/* 실제 앱 화면이 들어갈 하얀 박스 */}
      <View 
        style={isWeb ? { 
          width: '100%',
          maxWidth: 480,          // 모바일 너비 제한
          height: '100%',         // 높이는 꽉 채움
          backgroundColor: 'white',
          // 그림자 효과
          shadowColor: "#000",
          shadowOffset: {
            width: 0,
            height: 0,
          },
          shadowOpacity: 0.1,
          shadowRadius: 20,
          // 웹 전용 box-shadow (NativeWind나 style prop으로 호환)
          // @ts-ignore
          boxShadow: '0 0 20px rgba(0,0,0,0.1)', 
          overflow: 'hidden',     // 둥근 모서리 등이 삐져나가지 않게
        } : { flex: 1, width: '100%' }}
      >
        {/* 네비게이션 스택 */}
        <View style={{ flex: 1 }}>
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