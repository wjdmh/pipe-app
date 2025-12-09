// utils/platformHelper.ts
import { Platform, Dimensions } from 'react-native';

// 현재 환경이 웹인지 확인
export const isWeb = Platform.OS === 'web';
export const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * 웹 환경에서 PC 브라우저로 볼 때,
 * 화면이 너무 넓어지지 않도록 모바일 뷰(최대 500px) 중앙 정렬 스타일을 반환합니다.
 * Tailwind CSS 클래스 문자열을 반환합니다.
 */
export const getResponsiveContainer = () => {
  if (isWeb) {
    return 'w-full max-w-[500px] self-center h-full shadow-xl bg-white'; 
    // 설명: 너비 100%지만 최대 500px 제한, 중앙 정렬, 높이 꽉 채움, 그림자 효과, 배경 흰색
  }
  return 'flex-1'; // 모바일은 기본값
};

/**
 * 웹 배경색 (회색 처리하여 앱이 돋보이게 함)
 */
export const getWebBackground = () => {
  return isWeb ? 'flex-1 bg-gray-100 justify-center' : 'flex-1 bg-white';
};