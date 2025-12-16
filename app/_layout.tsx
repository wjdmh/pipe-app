import "../global.css"; 
import "../shim";       
import { Stack } from 'expo-router';
import { View, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getResponsiveContainer, getWebBackground } from "../utils/platformHelper";
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

// 스플래시 유지 (앱 로딩 전 깜빡임 방지)
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // 👇 [최종 해결책: 이원화 전략]
  // 웹(Web): 빈 객체({})를 전달하여 JS가 로컬 파일을 찾는 것을 막습니다. (404 에러 원천 차단)
  // 앱(Native): 기존처럼 로컬 에셋(require)을 사용하여 정상 로딩합니다.
  const [loaded, error] = useFonts(
    Platform.OS === 'web' 
      ? {} 
      : {
          "FontAwesome": require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome.ttf"),
          "FontAwesome5Free-Solid": require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome5_Solid.ttf"),
          "FontAwesome5Free-Regular": require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome5_Regular.ttf"),
          "FontAwesome5Brands-Regular": require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome5_Brands.ttf"),
        }
  );

  useEffect(() => {
    if (error) console.error("Font loading error:", error);
  }, [error]);

  // 로드 완료 시점 처리
  useEffect(() => {
    // 웹 환경이거나, 네이티브 폰트 로드가 끝나면 스플래시 화면을 숨깁니다.
    if (Platform.OS === 'web' || loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  // 앱(Native)에서는 로딩될 때까지 기다리지만, 웹은 즉시 통과시킵니다.
  if (Platform.OS !== 'web' && !loaded) {
    return null;
  }

  const screenOptions = { headerShown: false };

  return (
    <View className={getWebBackground()}>
      <StatusBar style="auto" />
      
      <View className={getResponsiveContainer()}>
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