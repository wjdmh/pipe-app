import { Tabs } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { Platform } from 'react-native';

export default function HomeLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#111827', // Active: Gray-900 (검정)
        tabBarInactiveTintColor: '#9CA3AF', // Inactive: Gray-400
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#F3F4F6', // Gray-100
          height: Platform.OS === 'ios' ? 88 : 60,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
          backgroundColor: 'white',
          elevation: 0, // 안드로이드 그림자 제거
          shadowOpacity: 0, // iOS 그림자 제거
        },
        tabBarLabelStyle: {
          fontWeight: '600',
          fontSize: 10,
          marginTop: 4,
        },
      }}
    >
      {/* 1. 홈 */}
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color }) => <FontAwesome5 name="volleyball-ball" size={20} color={color} />,
        }}
      />

      {/* 2. 라커룸 (팀/용병 관리) */}
      <Tabs.Screen
        name="locker"
        options={{
          title: '라커룸',
          tabBarIcon: ({ color }) => <FontAwesome5 name="users" size={20} color={color} />,
        }}
      />

      {/* 3. 마이페이지 */}
      <Tabs.Screen
        name="mypage"
        options={{
          title: '마이페이지',
          tabBarIcon: ({ color }) => <FontAwesome5 name="user" size={20} color={color} />,
        }}
      />

      {/* 숨김 페이지들 (탭바에 노출되지 않음) */}
      <Tabs.Screen name="ranking" options={{ href: null }} />
      <Tabs.Screen name="notification" options={{ href: null }} />
      <Tabs.Screen name="liked" options={{ href: null }} /> 
    </Tabs>
  );
}