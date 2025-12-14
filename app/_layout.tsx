import "../shim";
import "../global.css"; // 스타일 파일 연결
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getResponsiveContainer, getWebBackground } from "../utils/platformHelper";

export default function RootLayout() {
  // 기본 화면 옵션 설정
  const screenOptions = { headerShown: false };

  return (
    // 배경 컨테이너 (웹에서는 회색, 앱에서는 흰색)
    <View className={getWebBackground()}>
      <StatusBar style="auto" />
      
      {/* 반응형 컨테이너 (웹에서는 중앙 정렬 & 최대 너비 500px) */}
      <View className={getResponsiveContainer()}>
        
        {/* [수정됨] Stack 컴포넌트는 style 속성을 받지 못하므로,
            flex: 1을 가진 View로 감싸서 내부가 꽉 차게 만듭니다. */}
        <View style={{ flex: 1, width: '100%', height: '100%' }}>
          <Stack screenOptions={screenOptions}>
            {/* 하단 탭이 있는 홈 화면 */}
            <Stack.Screen name="home" options={{ headerShown: false }} />
            
            {/* 리다이렉트 용 인덱스 */}
            <Stack.Screen name="index" options={{ headerShown: false }} />
            
            {/* 인증 관련 */}
            <Stack.Screen name="auth/login" options={{ headerShown: false }} />
            <Stack.Screen name="auth/signup" options={{ title: '회원가입', headerBackTitle: '뒤로' }} />

            {/* 매치 관련 */}
            <Stack.Screen name="match/write" options={{ title: '매치 개설', headerBackTitle: '취소' }} />
            <Stack.Screen name="match/[id]" options={{ title: '매치 상세', headerBackTitle: '목록' }} />
            <Stack.Screen name="match/applicants" options={{ title: '신청자 관리' }} />
            <Stack.Screen name="match/edit" options={{ title: '매치 수정' }} />

            {/* 게스트 관련 */}
            <Stack.Screen name="guest/list" options={{ title: '게스트 모집' }} />
            <Stack.Screen name="guest/write" options={{ title: '게스트 등록' }} />
            <Stack.Screen name="guest/[id]" options={{ title: '게스트 상세' }} />
            
            {/* 관리자 */}
            <Stack.Screen name="admin/manager" options={{ title: '관리자 페이지' }} />
          </Stack>
        </View>
      </View>
    </View>
  );
}