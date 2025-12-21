import "../global.css";
import "../shim";
import { Stack } from 'expo-router';
import { View, Platform, LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
// 👇 [Fix] 새로 만든 UserContext 불러오기
import { UserProvider } from './context/UserContext';

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
    <View 
      style={isWeb ? {
        flex: 1,
        backgroundColor: '#f3f4f6', 
        alignItems: 'center',       
        justifyContent: 'center',   // 세로 중앙 정렬 추가
      } : { flex: 1, backgroundColor: 'white' }}
    >
      <StatusBar style="auto" />
      
      {/* [2. 앱 컨테이너] */}
      <View 
        style={isWeb ? { 
          width: '100%', 
          maxWidth: 430,             // 430px로 유지
          height: '100%',
          backgroundColor: 'white',
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.1,
          shadowRadius: 20,
          // @ts-ignore
          boxShadow: '0 0 20px rgba(0,0,0,0.1)', 
          overflow: 'hidden',        
        } : { flex: 1, width: '100%' }}
      >
        {/* 👇 [핵심 Fix] 여기서 UserProvider로 앱 전체를 감싸줍니다. */}
        {/* 이제 모든 페이지에서 useUser()를 통해 팀 정보를 가져올 수 있습니다. */}
        <UserProvider>
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
              {/* 추가적으로 필요한 라우트들... */}
            </Stack>
          </View>
        </UserProvider>

      </View>
    </View>
  );
}