import { useState } from 'react';
import { Alert } from 'react-native';
import { doc, updateDoc, collection, addDoc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../configs/firebaseConfig';

export const useMatchResult = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  // 1. 결과 제출 (Submit)
  // - 승리한 팀이 점수를 입력하고 상대에게 승인을 요청합니다.
  const submitResult = async (matchId: string, myScore: number, opScore: number, myTeamId: string, matchData: any) => {
    if (isProcessing) return false;
    
    // 기본 유효성 검사
    if (isNaN(myScore) || isNaN(opScore)) {
      Alert.alert('오류', '점수는 숫자여야 합니다.');
      return false;
    }
    if (myScore < 0 || opScore < 0) {
      Alert.alert('오류', '점수는 0점 이상이어야 합니다.');
      return false;
    }
    if (myScore <= opScore) {
      Alert.alert('오류', '내 점수가 더 커야 합니다. (승리 팀만 결과 입력 가능)');
      return false;
    }

    setIsProcessing(true);
    try {
      const amIHost = matchData.hostId === myTeamId;
      // DB에는 항상 hostScore, guestScore 기준으로 저장
      const finalHostScore = amIHost ? myScore : opScore;
      const finalGuestScore = amIHost ? opScore : myScore;
      const targetTeamId = amIHost ? matchData.guestId : matchData.hostId;

      if (!targetTeamId) {
        throw new Error("상대 팀 정보가 없습니다.");
      }

      // 결과 상태를 'waiting'으로 업데이트
      await updateDoc(doc(db, "matches", matchId), {
        result: {
          hostScore: finalHostScore,
          guestScore: finalGuestScore,
          status: 'waiting',
          submitterId: myTeamId,
          submittedAt: new Date().toISOString()
        }
      });

      // 상대 팀에게 알림 전송
      const tSnap = await getDoc(doc(db, "teams", targetTeamId));
      if (tSnap.exists()) {
        const captainId = tSnap.data().captainId;
        if (captainId) {
          await addDoc(collection(db, "notifications"), {
            userId: captainId,
            type: 'result_req',
            title: '경기 결과 승인 요청',
            message: '상대 팀이 경기 결과를 입력했습니다. 내용을 확인하고 승인해주세요.',
            link: '/home/locker?initialTab=matches', // 라커룸으로 이동 유도
            createdAt: new Date().toISOString(),
            isRead: false
          });
        }
      }
      
      Alert.alert('전송 완료', '상대 팀에게 승인 요청을 보냈습니다.');
      return true;
    } catch (e: any) {
      console.error("Submit Result Error:", e);
      Alert.alert('오류', e.message || '결과 전송에 실패했습니다.');
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. 결과 승인 (Approve) - [Critical Fix] 트랜잭션 적용
  // - 상대방이 입력한 결과를 승인하면, 양 팀의 승점/전적을 업데이트하고 경기를 종료합니다.
  const approveResult = async (matchData: any, myTeamId: string) => {
    if (isProcessing) return;
    
    // 유효성 검사: 본인이 제출한 건을 본인이 승인할 수 없음
    if (matchData.result.submitterId === myTeamId) {
      Alert.alert('대기 중', '상대 팀의 승인을 기다리고 있습니다.');
      return;
    }

    setIsProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        // 1. 최신 매치 데이터 조회 (동시성 방어)
        const matchRef = doc(db, "matches", matchData.id);
        const matchDoc = await transaction.get(matchRef);
        
        if (!matchDoc.exists()) throw "존재하지 않는 경기입니다.";
        const currentMatch = matchDoc.data();

        if (currentMatch.status === 'finished') {
          throw "이미 종료된 경기입니다.";
        }
        if (currentMatch.result?.status !== 'waiting') {
          throw "승인 대기 상태가 아닙니다.";
        }

        // 2. 팀 정보 조회
        const hostRef = doc(db, "teams", currentMatch.hostId);
        const guestRef = doc(db, "teams", currentMatch.guestId);
        
        const hostDoc = await transaction.get(hostRef);
        const guestDoc = await transaction.get(guestRef);

        if (!hostDoc.exists() || !guestDoc.exists()) {
          throw "팀 데이터가 존재하지 않아 전적을 반영할 수 없습니다.";
        }

        // 3. 승점 계산 (승리 3점, 패배 1점 - 참가점수)
        const hScore = currentMatch.result.hostScore;
        const gScore = currentMatch.result.guestScore;
        
        const isHostWin = hScore > gScore;
        // 배구는 무승부가 거의 없으나, 로직상 방어
        const isDraw = hScore === gScore;

        const hostPointsToAdd = isHostWin ? 3 : (isDraw ? 1 : 1);
        const guestPointsToAdd = !isHostWin && !isDraw ? 3 : 1;

        // 4. Host 팀 스탯 업데이트
        const hStats = hostDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };
        transaction.update(hostRef, {
          "stats.total": (hStats.total || 0) + 1,
          "stats.wins": (hStats.wins || 0) + (isHostWin ? 1 : 0),
          "stats.losses": (hStats.losses || 0) + (isHostWin ? 0 : 1), // 무승부시 패배처리? 일반적으로 승/패만 나눔
          "stats.points": (hStats.points || 0) + hostPointsToAdd
        });

        // 5. Guest 팀 스탯 업데이트
        const gStats = guestDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };
        transaction.update(guestRef, {
          "stats.total": (gStats.total || 0) + 1,
          "stats.wins": (gStats.wins || 0) + (!isHostWin ? 1 : 0),
          "stats.losses": (gStats.losses || 0) + (!isHostWin ? 0 : 1),
          "stats.points": (gStats.points || 0) + guestPointsToAdd
        });

        // 6. 매치 상태 'finished'로 변경
        transaction.update(matchRef, {
          status: 'finished',
          "result.status": 'verified',
          finishedAt: new Date().toISOString()
        });
      });

      // 7. 결과 제출자에게 알림 발송 (트랜잭션 밖에서 실행)
      try {
        const targetTeamId = matchData.result.submitterId;
        const targetTeamDoc = await getDoc(doc(db, "teams", targetTeamId));
        if (targetTeamDoc.exists()) {
           const captainId = targetTeamDoc.data().captainId;
           if(captainId) {
             await addDoc(collection(db, "notifications"), {
               userId: captainId,
               type: 'normal',
               title: '경기 결과 확정 🎉',
               message: '상대 팀이 결과를 승인하여 전적이 반영되었습니다.',
               link: '/home/locker',
               createdAt: new Date().toISOString(),
               isRead: false
             });
           }
        }
      } catch (notiErr) {
        console.warn("Notification failed but transaction succeeded", notiErr);
      }

      Alert.alert('처리 완료', '경기 결과가 확정되고 전적이 반영되었습니다.');
      return true;

    } catch (e: any) {
      console.error("Approve Result Error:", e);
      Alert.alert('오류', typeof e === 'string' ? e : '승인 처리에 실패했습니다. 다시 시도해주세요.');
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. 이의 제기 (Dispute)
  const disputeResult = async (matchId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      // 단순히 상태만 바꾸는 것이므로 updateDoc 사용
      await updateDoc(doc(db, "matches", matchId), {
        status: 'dispute',
        "result.status": 'dispute',
        disputedAt: new Date().toISOString()
      });
      
      // 관리자 알림 등이 필요하다면 여기서 추가 (현재는 생략)
      
      Alert.alert('접수 완료', '이의가 접수되었습니다. 관리자가 확인 후 연락드립니다.');
      return true;
    } catch (e: any) {
      Alert.alert('오류', '요청 실패: ' + e.message);
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  return { isProcessing, submitResult, approveResult, disputeResult };
};