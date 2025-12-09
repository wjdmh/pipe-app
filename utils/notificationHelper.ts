// utils/notificationHelper.ts
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// 알림 핸들러 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  } as Notifications.NotificationBehavior),
});

// 푸시 알림 권한 요청 및 토큰 가져오기
export async function registerForPushNotificationsAsync() {
  // [Web Guard] 웹 환경이면 즉시 종료 (에러 방지)
  if (Platform.OS === 'web') {
    console.log('[Web] 푸시 알림 로직을 건너뜁니다.');
    return null;
  }

  // 안드로이드 채널 설정
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  // 에뮬레이터 체크
  if (!Device.isDevice) {
    console.log('에뮬레이터에서는 푸시 알림이 작동하지 않습니다.');
    return null;
  }

  // 권한 확인
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.log('푸시 알림 권한이 거부되었습니다.');
    return null;
  }

  // Project ID 가져오기
  const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
  
  if (!projectId) {
      console.log('Project ID not found');
      return null;
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    console.log('Expo Push Token:', token);
    return token;
  } catch (e) {
    console.error("Push Token Error:", e);
    return null;
  }
}

// 푸시 알림 발송 함수
export async function sendPushNotification(expoPushToken: string, title: string, body: string, data: any = {}) {
  // [Web Guard] 웹에서는 발송 로직 실행 안 함
  if (Platform.OS === 'web') {
    console.log('[Web] 푸시 발송 시뮬레이션:', { title, body });
    return;
  }

  const message = {
    to: expoPushToken,
    sound: 'default',
    title: title,
    body: body,
    data: data,
  };

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
  } catch (error) {
    console.error('Push Sending Error:', error);
  }
}