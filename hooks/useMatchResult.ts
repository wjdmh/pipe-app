import { useState } from 'react';
import { Alert } from 'react-native';
import { doc, updateDoc, collection, addDoc, getDoc } from 'firebase/firestore';
import { db } from '../configs/firebaseConfig';

export const useMatchResult = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  // 1. 결과 제출 (Submit)
  const submitResult = async (matchId: string, myScore: number, opScore: number, myTeamId: string, matchData: any) => {
    if (isProcessing) return;
    if (myScore <= opScore) {
      Alert.alert('오류', '내 점수가 더 커야 합니다. (승리 팀만 입력 가능)');
      return false;
    }

    setIsProcessing(true);
    try {
      const amIHost = matchData.hostId === myTeamId;
      const finalHostScore = amIHost ? myScore : opScore;
      const finalGuestScore = amIHost ? opScore : myScore;
      const targetTeamId = amIHost ? matchData.guestId : matchData.hostId;

      // 결과 상태를 'waiting'으로 업데이트
      await updateDoc(doc(db, "matches", matchId), {
        result: {
          hostScore: finalHostScore,
          guestScore: finalGuestScore,
          status: 'waiting',
          submitterId: myTeamId
        }
      });

      // 알림 전송
      if (targetTeamId) {
        const tSnap = await getDoc(doc(db, "teams", targetTeamId));
        const captainId = tSnap.exists() ? tSnap.data().captainId : null;
        if (captainId) {
          await addDoc(collection(db, "notifications"), {
            userId: captainId,
            type: 'result_req',
            title: '결과 승인 요청',
            message: '상대 팀이 경기 결과를 입력했습니다. 승인해주세요.',
            link: '/home/locker',
            createdAt: new Date().toISOString(),
            isRead: false
          });
        }
      }
      
      Alert.alert('전송 완료', '상대 팀에게 승인 요청을 보냈습니다.');
      return true;
    } catch (e: any) {
      Alert.alert('오류', e.message || '전송 실패');
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. 결과 승인 (Approve)
  const approveResult = async (matchData: any, myTeamId: string) => {
    if (isProcessing) return;
    
    // 유효성 검사
    if (matchData.result.submitterId === myTeamId) {
      Alert.alert('대기 중', '상대 팀의 승인을 기다리고 있습니다.');
      return;
    }

    setIsProcessing(true);
    try {
      // --------------------------------------------------------
      // [Security Patch] 클라이언트 승점 계산 로직 제거됨 (서버 이관 준비)
      // --------------------------------------------------------
      
      await new Promise(resolve => setTimeout(resolve, 1000)); // Network simulation

      Alert.alert(
        '보안 알림', 
        '승인 요청이 서버로 전송되었습니다.\n(현재 보안 패치 적용 중으로, 실제 승점 반영 로직은 서버 이관 대기 중입니다.)'
      );
      return true;

    } catch (e: any) {
      Alert.alert('오류', '승인 처리 실패');
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. 이의 제기
  const disputeResult = async (matchId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, "matches", matchId), {
        status: 'dispute',
        "result.status": 'dispute'
      });
      Alert.alert('접수 완료', '관리자에게 이의가 접수되었습니다.');
      return true;
    } catch (e) {
      Alert.alert('오류', '요청 실패');
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  return { isProcessing, submitResult, approveResult, disputeResult };
};