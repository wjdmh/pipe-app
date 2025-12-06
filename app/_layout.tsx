import { useEffect, useRef } from 'react';
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from 'expo-notifications';
import { doc, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../configs/firebaseConfig';
import { registerForPushNotificationsAsync } from '../utils/notificationHelper';

export default function Layout() {
  // [Fix 1] useRef 초기값을 undefined로 명시하여 TypeScript 초기화 에러 해결
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

  useEffect(() => {
    // 1. 유저 인증 상태 확인 후 토큰 저장 (기존 로직 유지)
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await registerForPushNotificationsAsync();
          if (token) {
            // Firestore Users 컬렉션에 pushToken 업데이트
            await updateDoc(doc(db, "users", user.uid), { pushToken: token });
            console.log("Push Token Updated for user:", user.uid);
          }
        } catch (e) {
          console.log("Token Registration Failed:", e);
        }
      }
    });

    // 2. 알림 리스너 (앱 실행 중 알림 수신)
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('알림 수신:', notification);
    });

    // 3. 알림 반응 리스너 (사용자가 알림을 탭했을 때)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('알림 탭:', response);
      // 향후 여기서 router.push 등을 이용해 특정 화면으로 이동 가능
    });

    // 4. 클린업 (Cleanup)
    return () => {
      // Auth 리스너 해제
      unsubscribeAuth();
      
      // [Fix 2] removeNotificationSubscription 대신 객체의 remove() 메서드 사용 (최신 Expo 표준)
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen 
          name="home" 
          options={{ 
            gestureEnabled: false, 
            headerLeft: () => null, 
          }} 
        />
      </Stack>
    </>
  );
}