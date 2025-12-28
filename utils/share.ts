import { Share, Platform, Alert } from 'react-native';

interface ShareParams {
  title: string;   // 공유 제목 (Android 다이얼로그 타이틀 등)
  message: string; // 공유할 본문 내용 (링크 제외)
  url: string;     // 공유할 링크 (https://...)
}

/**
 * 🔗 PIPE 통합 공유 유틸리티 (v1.34)
 * - Native App: OS 기본 공유 시트 호출 (Share.share)
 * - Mobile Web: Web Share API 사용 (카카오톡, 문자 등 앱 선택 가능)
 * - PC Web / 미지원 브라우저: 클립보드 복사 후 알림 제공
 * * [v1.34 개선사항]
 * - 클립보드 복사 시 성공/실패 안내 메시지 강화 (window.alert 활용)
 * - 공유 텍스트와 URL 사이의 줄바꿈 포맷 통일
 * - 에러 핸들링 보강
 */
export const shareLink = async ({ title, message, url }: ShareParams) => {
  try {
    // ---------------------------------------------------------
    // 1. [Mobile App] 네이티브 앱 환경
    // ---------------------------------------------------------
    if (Platform.OS !== 'web') {
      // 앱에서는 텍스트에 URL을 포함해서 보냅니다.
      const fullMessage = `${message}\n\n👇 바로가기\n${url}`;
      
      await Share.share({
        title, 
        message: fullMessage,
        url: Platform.OS === 'ios' ? url : undefined, // iOS는 url 파라미터를 별도로 처리하면 썸네일 표시에 유리함
      });
      return;
    }

    // ---------------------------------------------------------
    // 2. [Web] 브라우저 환경
    // ---------------------------------------------------------
    
    // 2-1. Web Share API 지원 확인 (주로 모바일 브라우저 - Chrome, Safari 등)
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: message, 
          url: url, // Web Share API는 url 필드를 별도로 지원
        });
        return; // 공유 성공
      } catch (err: any) {
        // 사용자가 공유 창을 닫거나 취소한 경우(AbortError)는 에러 아님
        if (err.name === 'AbortError') return;
        
        // 그 외 에러 발생 시 Fallback(클립보드)으로 진행
        console.warn('Web Share API failed, falling back to clipboard', err);
      }
    }

    // 2-2. [Web Fallback] 클립보드 복사 (PC 웹 또는 API 미지원 브라우저)
    const clipboardMessage = `${message}\n\n👇 바로가기\n${url}`;
    
    try {
        await navigator.clipboard.writeText(clipboardMessage);
        
        // 웹 브라우저용 알림 (성공 메시지)
        if (typeof window !== 'undefined') {
            window.alert(
                "✅ 링크와 내용이 복사되었습니다!\n\n" +
                "카카오톡, 문자, SNS 채팅방에\n" +
                "붙여넣기(Ctrl+V) 하여 공유해주세요."
            );
        }
    } catch (clipboardErr) {
        console.error("Clipboard Error:", clipboardErr);
        window.alert("❌ 복사 기능이 차단되었습니다. URL을 직접 복사해서 공유해주세요.");
    }

  } catch (e) {
    console.error("Share Error:", e);
    const errorMsg = "공유 기능을 실행할 수 없습니다.";
    
    // 환경에 따른 에러 메시지 표시
    if (Platform.OS !== 'web') {
        Alert.alert("알림", errorMsg);
    } else {
        window.alert(errorMsg);
    }
  }
};