import { Tabs } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import tw from 'twrnc';

export default function HomeLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4f46e5', // Indigo-600
        tabBarInactiveTintColor: '#94a3b8', // Slate-400
        tabBarStyle: tw`border-t border-slate-100 h-24 pb-8 pt-2`,
        tabBarLabelStyle: tw`font-bold text-xs`,
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
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}