import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * 이 파일은 웹(Web) 환경에서만 로드되는 최상위 HTML 구조입니다.
 * <head> 태그 설정, SEO 메타 태그, 전역 CSS, 그리고 폰트 CDN을 정의합니다.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        
        {/* [Web Fix] SEO 및 소셜 공유 미리보기 설정 (Open Graph) */}
        <title>PIPE - 대학 배구 교류 플랫폼</title>
        <meta name="description" content="대학 배구 팀 매칭 및 리그 관리 서비스를 웹에서 경험하세요." />
        
        {/* Open Graph: 카카오톡, 슬랙 공유 시 보여질 미리보기 */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="PIPE - 대학 배구 리그" />
        <meta property="og:description" content="우리 팀의 매치를 찾고, 전적을 관리해보세요." />
        {/* 실제 배포 후 유효한 이미지 URL로 교체 권장 */}
        <meta property="og:image" content="https://wjdmh.github.io/pipe-app/assets/icon.png" />

        {/* 👇 [핵심 Fix] FontAwesome5 아이콘 엑박 방지를 위한 CDN 강제 주입 */}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css" />
        
        {/* Expo Router의 기본 스크롤 스타일 초기화 */}
        <ScrollViewStyleReset />

        {/* 전역 CSS 리셋: 배경색 고정, 스크롤바 숨김 등 */}
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
  margin: 0;
  padding: 0;
}
/* html, body, #root가 화면 전체를 꽉 채우도록 설정 */
html, body, #root {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
}
/* 웹에서 스크롤바 숨기기 (선택 사항) */
::-webkit-scrollbar {
  width: 0px;
  background: transparent;
}
`;