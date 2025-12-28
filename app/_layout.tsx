import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { UserProvider, useUser } from './context/UserContext';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { View, ActivityIndicator } from 'react-native';

// 1. 스플래시 스크린 자동 숨김 방지 (인증 체크가 끝날 때까지 유지)
SplashScreen.preventAutoHideAsync();

function InitialLayout() {
  const { user, authInitialized } = useUser();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // 2. 인증 체크가 아직 안 끝났으면 아무것도 하지 않음 (스플래시 유지)
    if (!authInitialized) return;

    // 3. 인증 체크 완료 후 스플래시 숨김
    SplashScreen.hideAsync();

    // 현재 경로 그룹 확인
    const inAuthGroup = segments[0] === 'auth';
    const inHomeGroup = segments[0] === 'home';
    
    // [시나리오 A] 비로그인 유저
    if (!user) {
      // 로그인이 필요한 페이지(home)로 접근 시 로그인 페이지로 보냄
      if (inHomeGroup) {
        router.replace('/auth/login');
      }
    } 
    // [시나리오 B] 로그인 유저
    else if (user) {
      // 이미 로그인했는데 로그인/회원가입 페이지에 있다면 홈으로 보냄
      if (inAuthGroup) {
        router.replace('/home');
      }
      // ⚠️ 중요: 공유 링크(예: /match/123)로 들어온 경우는 
      // 여기서 간섭하지 않으므로(else), 자연스럽게 해당 페이지가 열립니다.
    }
  }, [user, authInitialized, segments]);

  // 인증 초기화 중에는 빈 화면(스플래시가 덮고 있어서 실제로는 안 보임) 렌더링
  if (!authInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  // 실제 페이지 렌더링 (Slot은 현재 라우트에 맞는 화면을 끼워넣음)
  return <Slot />;
}

export default function RootLayout() {
  // 4. 폰트 로드 (앱 전반에서 사용)
  const [loaded] = useFonts({
    'FontAwesome5_Regular': require('../assets/fonts/FontAwesome5_Regular.ttf'),
    'FontAwesome5_Solid': require('../assets/fonts/FontAwesome5_Solid.ttf'),
    'FontAwesome5_Brands': require('../assets/fonts/FontAwesome5_Brands.ttf'),
  });

  if (!loaded) {
    return null;
  }

  // UserProvider로 앱 전체를 감싸서 어디서든 로그인 정보를 쓸 수 있게 함
  return (
    <UserProvider>
      <InitialLayout />
    </UserProvider>
  );
}