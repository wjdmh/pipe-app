// app/+html.tsx
import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * 이 파일은 웹(Web) 환경에서만 로드되는 최상위 HTML 구조입니다.
 * <head> 태그 설정과 전역 CSS 스타일(body, root)을 정의합니다.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        
        {/* Expo Router의 기본 스크롤 스타일 초기화 */}
        <ScrollViewStyleReset />

        {/* 👇 [핵심] 전역 CSS 리셋: 배경색 고정, 스크롤바 숨김 등 */}
        <style dangerouslySetInnerHTML={{ __html: responsiveWebStyle }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}

const responsiveWebStyle = `
body {
  background-color: #f3f4f6; /* 회색 배경 (앱 외부) */
  display: flex;
  justify-content: center;
  margin: 0;
  padding: 0;
  min-height: 100vh; /* 화면 전체 높이 사용 */
}
#root {
  width: 100%;
  max-width: 500px; /* 모바일 뷰 최대 너비 제한 */
  background-color: #ffffff; /* 앱 내부 흰색 배경 */
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 20px rgba(0,0,0,0.1); /* 그림자 효과로 앱 강조 */
}
/* 웹에서 스크롤바 숨기기 (선택 사항) */
::-webkit-scrollbar {
  width: 0px;
  background: transparent;
}
`;