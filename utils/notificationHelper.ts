// utils/notificationHelper.ts
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

// [Architect's Fix] 타입 호환성 문제 해결
// 웹 환경이 아닐 때만 핸들러를 설정하며, 최신 타입 정의에 맞춰 필수 속성을 모두 추가했습니다.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      // [Fix] 누락된 속성 추가 (Type Compatibility)
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// 푸시 알림 권한 요청 및 토큰 가져오기
export async function registerForPushNotificationsAsync() {
  // [Web Guard] 웹 환경 차단
  if (Platform.OS === 'web') {
    console.log('🌐 [Web] 푸시 알림 기능이 비활성화되었습니다.');
    return null;
  }

  // [Emulator Guard]
  if (!Device.isDevice) {
    console.log('📱 [Emulator] 실기기에서만 푸시 알림이 작동합니다.');
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

  // 권한 확인
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.log('🚫 [Permission] 푸시 알림 권한이 거부되었습니다.');
    return null;
  }

  // Project ID 및 토큰 발급
  try {
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) {
        console.error('❌ [Config] Project ID를 찾을 수 없습니다.');
        return null;
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    console.log('✅ [Token] Expo Push Token:', token);
    return token;
  } catch (e) {
    console.error("❌ [Error] Push Token Error:", e);
    return null;
  }
}

// 푸시 알림 발송 함수
export async function sendPushNotification(expoPushToken: string, title: string, body: string, data: any = {}) {
  // [Web Guard] 웹 차단
  if (Platform.OS === 'web') {
    console.log(`📨 [Web Simulation] Push to ${expoPushToken}: ${title} - ${body}`);
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
    console.error('❌ [Send Error] Push Sending Failed:', error);
  }
}

// [Architect's Fix] 리스너 관리 로직 수정
// removeNotificationSubscription 대신 Subscription 객체의 .remove()를 사용합니다.
export function setupNotificationListeners(
  onReceive?: (notification: Notifications.Notification) => void,
  onResponse?: (response: Notifications.NotificationResponse) => void
) {
  // 웹이면 빈 정리 함수 반환
  if (Platform.OS === 'web') return () => {};

  // 리스너 등록
  const notiSubscription = onReceive 
    ? Notifications.addNotificationReceivedListener(onReceive) 
    : null;
    
  const respSubscription = onResponse 
    ? Notifications.addNotificationResponseReceivedListener(onResponse) 
    : null;

  // 클린업 함수 (useEffect의 return 값으로 사용 가능)
  return () => {
    notiSubscription?.remove();
    respSubscription?.remove();
  };
}