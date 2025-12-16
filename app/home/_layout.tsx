import { Tabs } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

export default function HomeLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4f46e5', // Indigo-600
        tabBarInactiveTintColor: '#94a3b8', // Slate-400
        // [수정됨] tw 대신 표준 스타일 객체 사용 (가장 안전한 방법)
        // 기존: border-t border-slate-100 h-24 pb-8 pt-2
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#f1f5f9', // slate-100 색상코드
          height: 96, // h-24 (24 * 4px)
          paddingBottom: 32, // pb-8
          paddingTop: 8, // pt-2
          backgroundColor: 'white', // 배경색 명시 (안전책)
        },
        // [수정됨] tw 대신 표준 스타일 사용
        // 기존: font-bold text-xs
        tabBarLabelStyle: {
          fontWeight: 'bold',
          fontSize: 12, // text-xs
        },
      }}
    >
      {/* 1. 홈 */}
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color }) => <FontAwesome name="home" size={24} color={color} />,
        }}
      />

      {/* 2. 라커룸 */}
      <Tabs.Screen
        name="locker"
        options={{
          title: '라커룸',
          tabBarIcon: ({ color }) => <FontAwesome name="users" size={20} color={color} />,
        }}
      />

      {/* 3. 마이페이지 */}
      <Tabs.Screen
        name="mypage"
        options={{
          title: '마이페이지',
          tabBarIcon: ({ color }) => <FontAwesome name="user" size={22} color={color} />,
        }}
      />

      {/* 숨김 페이지들 */}
      <Tabs.Screen name="ranking" options={{ href: null }} />
      <Tabs.Screen name="notification" options={{ href: null }} /> 
    </Tabs>
  );
}