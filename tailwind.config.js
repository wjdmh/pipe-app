/** @type {import('tailwindcss').Config} */
module.exports = {
  // 1. 스타일을 적용할 파일 경로 지정 (app 및 components 폴더 전체)
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // 2. 색상 팔레트 정의 (말씀하신 7가지 색상)
      colors: {
        primary: '#2962FF',    // 핵심 색상
        secondary: '#F5F5F5',  // 회색 박스
        black: '#000000',      // 완전 검정
        darkGray: '#333333',   // 짙은 회색 (텍스트 등)
        mediumGray: '#666666', // 중간 회색
        lightGray: '#999999',  // 옅은 회색
        white: '#FFFFFF',      // 흰색
      },
      // 3. 폰트 정의 (파일명을 정확히 매핑)
      // 사용법: className="font-pretendard-bold" 처럼 사용
      fontFamily: {
        pretendard: ['Pretendard-Regular'],
        'pretendard-medium': ['Pretendard-Medium'],
        'pretendard-bold': ['Pretendard-Bold'],
        'pretendard-extrabold': ['Pretendard-ExtraBold'],
      },
      // 4. 모서리 둥글기 (기본 20, 강조 40)
      borderRadius: {
        base: '20px',  // 기본 박스들
        pill: '40px',  // 주차 선택바 등
      },
      // 5. 간격 (좌우 여백 40px을 위한 커스텀 설정)
      // 사용법: className="px-container" 라고 쓰면 좌우 40px이 적용됨
      spacing: {
        'container': '40px', 
      }
    },
  },
  plugins: [],
}