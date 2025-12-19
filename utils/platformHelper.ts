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
    // [수정] mx-auto 추가 (이게 있어야 가로 중앙으로 옵니다!)
    return 'w-full max-w-[500px] mx-auto h-full shadow-xl bg-white'; 
  }
  return 'flex-1'; // 모바일은 기본값
};

/**
 * 웹 배경색 (회색 처리하여 앱이 돋보이게 함)
 */
export const getWebBackground = () => {
  // [수정] items-center 추가 (자식 요소를 가로축 가운데로 정렬)
  return isWeb ? 'flex-1 bg-gray-100 justify-center items-center' : 'flex-1 bg-white';
};