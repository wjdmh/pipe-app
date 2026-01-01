import "../global.css"; // ✅ [복구] 스타일 파일 (이게 없어서 UI가 깨졌습니다)
import "../shim";       // ✅ [복구] Firebase 호환 패치
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { UserProvider, useUser } from '../context/UserContext';
import LoginBottomSheet from '../components/LoginBottomSheet';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { View, Platform, LogBox, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// 콘솔 경고 무시
LogBox.ignoreLogs([
  'Blocked aria-hidden on an element',
  'props.pointerEvents is deprecated',
  'shadow* style props are deprecated',
  'TouchableWithoutFeedback is deprecated',
]);

// 1. 스플래시 스크린 자동 숨김 방지
SplashScreen.preventAutoHideAsync().catch(() => {});

// 인증 및 라우팅을 관리하는 내부 컴포넌트
function InitialLayout() {
  const { user, authInitialized } = useUser();
  const segments = useSegments();
  const router = useRouter();
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    // 2. 인증 체크가 아직 안 끝났으면 대기
    if (!authInitialized) return;

    // 3. 인증 체크 완료 후 스플래시 숨김
    SplashScreen.hideAsync().catch(() => {});

    const inAuthGroup = segments[0] === 'auth';
    const inHomeGroup = segments[0] === 'home';
    
    // [수정] 비로그인 유저도 홈 접근 허용 (가드 제거)
    // if (!user) {
    //   if (inHomeGroup) {
    //     router.replace('/auth/login');
    //   }
    // } 

    // [시나리오 B] 로그인 유저 -> 로그인 페이지 접근 시 홈으로
    if (user) {
      if (inAuthGroup) {
        router.replace('/home');
      }
    }
  }, [user, authInitialized, segments]);

  // 인증 초기화 중에는 로딩 표시
  if (!authInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  // ✅ [복구] 웹 레이아웃 컨테이너 적용
  return (
    <View 
      style={isWeb ? {
        flex: 1,
        backgroundColor: '#f3f4f6', 
        alignItems: 'center',       
        justifyContent: 'center',
      } : { flex: 1, backgroundColor: 'white' }}
    >
      <StatusBar style="auto" />
      
      {/* 앱 컨테이너 (웹에서 430px 고정) */}
      <View 
        style={isWeb ? { 
          width: '100%', 
          maxWidth: 430,
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
        {/* 네비게이션 Stack (기존 라우트 설정 유지) */}
        <Stack screenOptions={{ headerShown: false, animation: isWeb ? 'none' : 'default' }}>
            <Stack.Screen name="home" options={{ headerShown: false }} />
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="auth/login" options={{ headerShown: false }} />
            <Stack.Screen name="auth/signup" options={{ title: '회원가입', headerBackTitle: '뒤로', headerShown: true }} />
            <Stack.Screen name="match/write" options={{ title: '매치 개설', headerBackTitle: '취소', headerShown: true }} />
            <Stack.Screen name="match/[id]" options={{ title: '매치 상세', headerBackTitle: '목록', headerShown: true }} />
            <Stack.Screen name="match/applicants" options={{ title: '신청자 관리', headerShown: true }} />
            <Stack.Screen name="match/edit" options={{ title: '매치 수정', headerShown: true }} />
            <Stack.Screen name="guest/list" options={{ title: '게스트 모집', headerShown: true }} />
            <Stack.Screen name="guest/write" options={{ title: '게스트 등록', headerShown: true }} />
            <Stack.Screen name="guest/[id]" options={{ title: '게스트 상세', headerShown: true }} />
            <Stack.Screen name="admin/manager" options={{ title: '관리자 페이지', headerShown: true }} />
        </Stack>

        {/* 전역 로그인 유도 모달 */}
        <LoginBottomSheet />
      </View>
    </View>
  );
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

  if (!loaded && !error) return null;

  return (
    <UserProvider>
      <InitialLayout />
    </UserProvider>
  );
}
