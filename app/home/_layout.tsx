import React from 'react';
import { Tabs, useRouter, Href } from 'expo-router'; // [Fix] Href 타입 추가
import { FontAwesome5 } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { useUser } from '../context/UserContext';

export default function HomeLayout() {
  const router = useRouter();
  const { user } = useUser();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#111827',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#F3F4F6',
          height: Platform.OS === 'ios' ? 88 : 60,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
          backgroundColor: 'white',
          elevation: 0,
          shadowOpacity: 0,
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

      {/* 2. 팀 (기존 라커룸 -> 팀 관리로 변경) */}
      <Tabs.Screen
        name="locker"
        listeners={{
          tabPress: (e) => {
            // [Logic] 탭 이동 기본 동작 막고, 팀 상태에 따라 리다이렉트
            e.preventDefault();
            if (user?.teamId) {
              // [Fix] 동적 경로 타입 오류 해결을 위해 'as Href' 사용
              router.push(`/team/${user.teamId}` as Href);
            } else {
              router.push('/team/register' as Href);
            }
          },
        }}
        options={{
          title: '팀', 
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

      {/* 숨김 페이지들 */}
      <Tabs.Screen name="ranking" options={{ href: null }} />
      <Tabs.Screen name="notification" options={{ href: null }} />
      <Tabs.Screen name="liked" options={{ href: null }} /> 
    </Tabs>
  );
}