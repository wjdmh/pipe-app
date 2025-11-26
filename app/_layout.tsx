import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function Layout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        {/* 초기 진입 화면 */}
        <Stack.Screen name="index" />
        
        {/* 인증 화면 */}
        <Stack.Screen name="auth" />
        
        {/* 홈 화면 (제스처 비활성화: 뒤로가기 방지) */}
        <Stack.Screen 
          name="home" 
          options={{ 
            gestureEnabled: false, // 아이폰 스와이프 뒤로가기 방지
            headerLeft: () => null, // 안드로이드 뒤로가기 버튼 숨김 (헤더가 있을 경우)
          }} 
        />
      </Stack>
    </>
  );
}