import { useState } from 'react';
import { Alert } from 'react-native';
import { doc, updateDoc, collection, addDoc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
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
    if (myScore <= opScore) {
      Alert.alert('오류', '내 점수가 더 커야 합니다. (승리 팀만 결과 입력 가능)');
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

      // 상대 팀에게 알림 전송 (DB 저장 + 푸시)
      const tSnap = await getDoc(doc(db, "teams", targetTeamId));
      if (tSnap.exists()) {
        const captainId = tSnap.data().captainId;
        if (captainId) {
          // DB 알림
          await addDoc(collection(db, "notifications"), {
            userId: captainId,
            type: 'result_req',
            title: '경기 결과 승인 요청',
            message: '상대 팀이 경기 결과를 입력했습니다. 내용을 확인하고 승인해주세요.',
            link: '/home/locker?initialTab=matches', 
            createdAt: new Date().toISOString(),
            isRead: false
          });

          // 푸시 알림 (New)
          const capSnap = await getDoc(doc(db, "users", captainId));
          if (capSnap.exists() && capSnap.data().pushToken) {
             await sendPushNotification(
                 capSnap.data().pushToken, 
                 '경기 결과 승인 요청', 
                 '상대 팀이 결과를 입력했습니다. 승인해주세요.', 
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

  // 2. 결과 승인 (Approve)
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
        if (currentMatch.result?.status !== 'waiting') throw "승인 대기 상태가 아닙니다.";

        const hostRef = doc(db, "teams", currentMatch.hostId);
        const guestRef = doc(db, "teams", currentMatch.guestId);
        
        const hostDoc = await transaction.get(hostRef);
        const guestDoc = await transaction.get(guestRef);

        if (!hostDoc.exists() || !guestDoc.exists()) throw "팀 데이터가 존재하지 않습니다.";

        const hScore = currentMatch.result.hostScore;
        const gScore = currentMatch.result.guestScore;
        const isHostWin = hScore > gScore;
        const isDraw = hScore === gScore;

        const hostPointsToAdd = isHostWin ? 3 : (isDraw ? 1 : 1);
        const guestPointsToAdd = !isHostWin && !isDraw ? 3 : 1;

        const hStats = hostDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };
        transaction.update(hostRef, {
          "stats.total": (hStats.total || 0) + 1,
          "stats.wins": (hStats.wins || 0) + (isHostWin ? 1 : 0),
          "stats.losses": (hStats.losses || 0) + (isHostWin ? 0 : 1),
          "stats.points": (hStats.points || 0) + hostPointsToAdd
        });

        const gStats = guestDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };
        transaction.update(guestRef, {
          "stats.total": (gStats.total || 0) + 1,
          "stats.wins": (gStats.wins || 0) + (!isHostWin ? 1 : 0),
          "stats.losses": (gStats.losses || 0) + (!isHostWin ? 0 : 1),
          "stats.points": (gStats.points || 0) + guestPointsToAdd
        });

        transaction.update(matchRef, {
          status: 'finished',
          "result.status": 'verified',
          finishedAt: new Date().toISOString()
        });
      });

      // 결과 제출자에게 알림 발송
      try {
        const targetTeamId = matchData.result.submitterId;
        const targetTeamDoc = await getDoc(doc(db, "teams", targetTeamId));
        if (targetTeamDoc.exists()) {
           const captainId = targetTeamDoc.data().captainId;
           if(captainId) {
             // DB 알림
             await addDoc(collection(db, "notifications"), {
               userId: captainId,
               type: 'normal',
               title: '경기 결과 확정 🎉',
               message: '상대 팀이 결과를 승인하여 전적이 반영되었습니다.',
               link: '/home/locker',
               createdAt: new Date().toISOString(),
               isRead: false
             });

             // 푸시 알림 (New)
             const capSnap = await getDoc(doc(db, "users", captainId));
             if (capSnap.exists() && capSnap.data().pushToken) {
                await sendPushNotification(
                    capSnap.data().pushToken,
                    '경기 결과 확정 🎉',
                    '상대 팀이 결과를 승인하여 전적이 반영되었습니다.',
                    { link: '/home/locker' }
                );
             }
           }
        }
      } catch (notiErr) { console.warn("Noti failed", notiErr); }

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