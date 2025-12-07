import { useState } from 'react';
import { Alert } from 'react-native';
import { doc, updateDoc, collection, addDoc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../configs/firebaseConfig';
import { sendPushNotification } from '../utils/notificationHelper';

export const useMatchResult = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  // 1. 결과 제출 (Submit)
  const submitResult = async (matchId: string, myScore: number, opScore: number, myTeamId: string, matchData: any) => {
    if (isProcessing) return false;
    
    if (isNaN(myScore) || isNaN(opScore)) {
      Alert.alert('오류', '점수는 숫자여야 합니다.');
      return false;
    }
    if (myScore < 0 || opScore < 0) {
      Alert.alert('오류', '점수는 0점 이상이어야 합니다.');
      return false;
    }
    
    // [Domain Rule] 배구는 무승부가 없음
    if (myScore === opScore) {
        Alert.alert('규칙 오류', '배구는 무승부가 없습니다. 듀스 상황 등을 고려해 승부를 가려주세요.');
        return false;
    }
    if (myScore < opScore) {
      Alert.alert('권한 제한', '승리한 팀만 결과를 입력할 수 있습니다.\n(패배한 팀은 상대의 입력을 기다려주세요)');
      return false;
    }

    setIsProcessing(true);
    try {
      const amIHost = matchData.hostId === myTeamId;
      const finalHostScore = amIHost ? myScore : opScore;
      const finalGuestScore = amIHost ? opScore : myScore;
      const targetTeamId = amIHost ? matchData.guestId : matchData.hostId;

      if (!targetTeamId) throw new Error("상대 팀 정보가 없습니다.");

      // 결과 상태 업데이트
      await updateDoc(doc(db, "matches", matchId), {
        result: {
          hostScore: finalHostScore,
          guestScore: finalGuestScore,
          status: 'waiting',
          submitterId: myTeamId,
          submittedAt: new Date().toISOString()
        }
      });

      // 상대 팀에게 알림 전송 (팀이 존재할 경우만)
      const tSnap = await getDoc(doc(db, "teams", targetTeamId));
      if (tSnap.exists()) {
        const captainId = tSnap.data().captainId;
        if (captainId) {
          // DB 알림
          await addDoc(collection(db, "notifications"), {
            userId: captainId,
            type: 'result_req',
            title: '경기 결과 승인 요청',
            message: `상대 팀이 입력한 결과: ${myScore} : ${opScore}\n맞다면 승인해주세요.`,
            link: '/home/locker?initialTab=matches', 
            createdAt: new Date().toISOString(),
            isRead: false
          });

          // 푸시 알림
          const capSnap = await getDoc(doc(db, "users", captainId));
          if (capSnap.exists() && capSnap.data().pushToken) {
             await sendPushNotification(
                 capSnap.data().pushToken, 
                 '경기 결과 승인 요청', 
                 '상대 팀이 결과를 입력했습니다. 내용을 확인하고 승인해주세요.', 
                 { link: '/home/locker?initialTab=matches' }
             );
          }
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

  // 2. 결과 승인 (Approve) - [Critical Fix: 상대 팀 삭제 시에도 처리 가능하도록 개선]
  const approveResult = async (matchData: any, myTeamId: string) => {
    if (isProcessing) return;
    
    if (matchData.result.submitterId === myTeamId) {
      Alert.alert('대기 중', '상대 팀의 승인을 기다리고 있습니다.');
      return;
    }

    setIsProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        const matchRef = doc(db, "matches", matchData.id);
        const matchDoc = await transaction.get(matchRef);
        
        if (!matchDoc.exists()) throw "존재하지 않는 경기입니다.";
        const currentMatch = matchDoc.data();

        if (currentMatch.status === 'finished') throw "이미 종료된 경기입니다.";
        
        const hostId = currentMatch.hostId;
        const guestId = currentMatch.guestId;
        const hostRef = doc(db, "teams", hostId);
        const guestRef = doc(db, "teams", guestId);
        
        const hostDoc = await transaction.get(hostRef);
        const guestDoc = await transaction.get(guestRef);

        // [Fix] 두 팀 중 하나라도 존재하면 경기를 종료 처리함
        if (!hostDoc.exists() && !guestDoc.exists()) throw "양 팀 데이터가 모두 존재하지 않습니다.";

        const hScore = currentMatch.result.hostScore;
        const gScore = currentMatch.result.guestScore;
        
        if (hScore === gScore) throw "데이터 오류: 동점은 허용되지 않습니다.";

        const isHostWin = hScore > gScore;
        const isGuestWin = gScore > hScore;
        
        // 승점 규칙: 승리 3점, 패배 1점 (참여 점수)
        const hostPointsToAdd = isHostWin ? 3 : 1;
        const guestPointsToAdd = isGuestWin ? 3 : 1;

        // 호스트 팀 업데이트 (존재 시)
        if (hostDoc.exists()) {
            const hStats = hostDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };
            transaction.update(hostRef, {
              "stats.total": (hStats.total || 0) + 1,
              "stats.wins": (hStats.wins || 0) + (isHostWin ? 1 : 0),
              "stats.losses": (hStats.losses || 0) + (isHostWin ? 0 : 1),
              "stats.points": (hStats.points || 0) + hostPointsToAdd
            });
        }

        // 게스트 팀 업데이트 (존재 시)
        if (guestDoc.exists()) {
            const gStats = guestDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };
            transaction.update(guestRef, {
              "stats.total": (gStats.total || 0) + 1,
              "stats.wins": (gStats.wins || 0) + (isGuestWin ? 1 : 0),
              "stats.losses": (gStats.losses || 0) + (isGuestWin ? 0 : 1),
              "stats.points": (gStats.points || 0) + guestPointsToAdd
            });
        }

        // 매치 상태 최종 완료 처리
        transaction.update(matchRef, {
          status: 'finished',
          "result.status": 'verified',
          finishedAt: new Date().toISOString()
        });
      });

      // 결과 제출자에게 알림 발송 (팀 존재 시)
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
               message: '경기가 최종 승인되어 전적이 반영되었습니다.',
               link: '/home/locker',
               createdAt: new Date().toISOString(),
               isRead: false
             });
             
             const capSnap = await getDoc(doc(db, "users", captainId));
             if (capSnap.exists() && capSnap.data().pushToken) {
                await sendPushNotification(capSnap.data().pushToken, '경기 결과 확정 🎉', '전적이 반영되었습니다.', { link: '/home/locker' });
             }
           }
        }
      } catch (notiErr) { console.warn("Noti failed", notiErr); }

      Alert.alert('처리 완료', '경기 결과가 확정되었습니다.\n(삭제된 팀의 경우 전적 반영이 생략되었을 수 있습니다)');
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
      await updateDoc(doc(db, "matches", matchId), {
        status: 'dispute',
        "result.status": 'dispute',
        disputedAt: new Date().toISOString()
      });
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