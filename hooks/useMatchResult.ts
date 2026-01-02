import { useState } from 'react';
import { Alert, Platform } from 'react-native';
import { doc, updateDoc, collection, addDoc, getDoc, runTransaction } from 'firebase/firestore';
import { db } from '../configs/firebaseConfig';
import { sendPushNotification } from '../utils/notificationHelper';

export const useMatchResult = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  // Web compatibility wrapper
  const safeAlert = (title: string, msg: string) => {
    if (Platform.OS === 'web') {
        window.alert(`${title}\n${msg}`);
    } else {
        Alert.alert(title, msg);
    }
  };

  /**
   * 1. 결과 제출 (Submit)
   * - 호스트가 점수(또는 승패)를 입력하여 제출합니다.
   * - 매치 상태를 'waiting'으로 변경하여 승인 대기 목록에 노출되게 합니다.
   */
  const submitResult = async (matchId: string, myScore: number, opScore: number, myTeamId: string, matchData: any) => {
    if (isProcessing) return false;
    
    if (isNaN(myScore) || isNaN(opScore)) {
      safeAlert('점수 입력', '숫자만 입력할 수 있어요.');
      return false;
    }
    if (myScore < 0 || opScore < 0) {
      safeAlert('점수 입력', '0점 이상으로 입력해주세요.');
      return false;
    }
    // Note: Locker ensures 3:0 or 0:3, so ties are handled there, but keep check for safety
    if (myScore === opScore) {
        safeAlert('점수 확인', '점수가 동점이에요. 승패를 가려주세요.');
        return false;
    }

    setIsProcessing(true);
    try {
      // Determine Host/Guest scores based on submitter
      // Locker ensures submitter is Host, but logic handles both just in case
      const amIHost = matchData.hostId === myTeamId;
      
      const finalHostScore = amIHost ? myScore : opScore;
      const finalGuestScore = amIHost ? opScore : myScore;
      
      const targetTeamId = amIHost ? matchData.guestId : matchData.hostId;

      if (!targetTeamId) throw new Error("상대 팀 정보를 찾을 수 없습니다.");

      // ✅ [Fix] Update root 'status' to 'waiting' for easier filtering
      await updateDoc(doc(db, "matches", matchId), {
        status: 'waiting', 
        result: {
          hostScore: finalHostScore,
          guestScore: finalGuestScore,
          status: 'waiting',
          submitterId: myTeamId,
          submittedAt: new Date().toISOString()
        }
      });

      // Send Notification
      const tSnap = await getDoc(doc(db, "teams", targetTeamId));
      if (tSnap.exists()) {
        const captainId = tSnap.data().captainId;
        if (captainId) {
          await addDoc(collection(db, "notifications"), {
            userId: captainId,
            type: 'result_req',
            title: '경기 결과 확인',
            message: `상대 팀이 결과를 입력했어요 (${finalHostScore}:${finalGuestScore}).\n승인하면 전적에 반영됩니다.`,
            link: '/home/locker?initialTab=matches', 
            createdAt: new Date().toISOString(),
            isRead: false
          });

          const capSnap = await getDoc(doc(db, "users", captainId));
          if (capSnap.exists() && capSnap.data().pushToken) {
             await sendPushNotification(
                 capSnap.data().pushToken, 
                 '경기 결과 확인', 
                 '상대 팀이 결과를 입력했어요. 접속해서 확인해주세요.', 
                 { link: '/home/locker?initialTab=matches' }
             );
          }
        }
      }
      
      safeAlert('입력 완료', '상대 팀에게 승인 요청을 보냈어요.');
      return true;
    } catch (e: any) {
      console.error("Submit Result Error:", e);
      safeAlert('전송 실패', e.message || '결과 전송에 실패했어요. 다시 시도해주세요.');
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * 2. 결과 승인 (Approve)
   * - 상대방(게스트)이 결과를 승인하면 점수와 승패를 확정합니다.
   * - Transaction을 사용하여 승점, 전적, 매치 상태를 동시에 업데이트합니다.
   */
  const approveResult = async (matchData: any, myTeamId: string) => {
    if (isProcessing) return;
    
    if (matchData.result.submitterId === myTeamId) {
      safeAlert('승인 대기', '상대 팀의 확인을 기다리고 있어요.');
      return;
    }

    setIsProcessing(true);
    try {
      await runTransaction(db, async (transaction) => {
        const matchRef = doc(db, "matches", matchData.id);
        const matchDoc = await transaction.get(matchRef);
        
        if (!matchDoc.exists()) throw "경기를 찾을 수 없어요.";
        const currentMatch = matchDoc.data();

        if (currentMatch.status === 'finished') throw "이미 종료된 경기예요.";
        
        // Host/Guest ID resolution (Backward compatibility)
        const hostId = currentMatch.hostId || currentMatch.teamId;
        const guestId = currentMatch.guestId || currentMatch.opponentId;

        if (!hostId || !guestId) throw "팀 정보를 찾을 수 없어요.";

        const hostRef = doc(db, "teams", hostId);
        const guestRef = doc(db, "teams", guestId);
        
        const hostDoc = await transaction.get(hostRef);
        const guestDoc = await transaction.get(guestRef);

        const hScore = currentMatch.result.hostScore;
        const gScore = currentMatch.result.guestScore;
        
        const isHostWin = hScore > gScore;
        const finalWinnerId = isHostWin ? hostId : guestId;
        
        // Point calculation (Win: 3, Loss: 1)
        const hostPointsToAdd = isHostWin ? 3 : 1;
        const guestPointsToAdd = !isHostWin ? 3 : 1;

        // Update Host Stats
        if (hostDoc.exists()) {
            const hStats = hostDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };
            transaction.update(hostRef, {
              "stats.total": (hStats.total || 0) + 1,
              "stats.wins": (hStats.wins || 0) + (isHostWin ? 1 : 0),
              "stats.losses": (hStats.losses || 0) + (isHostWin ? 0 : 1),
              "stats.points": (hStats.points || 0) + hostPointsToAdd
            });
        }

        // Update Guest Stats
        if (guestDoc.exists()) {
            const gStats = guestDoc.data().stats || { wins: 0, losses: 0, points: 0, total: 0 };
            transaction.update(guestRef, {
              "stats.total": (gStats.total || 0) + 1,
              "stats.wins": (gStats.wins || 0) + (!isHostWin ? 1 : 0),
              "stats.losses": (gStats.losses || 0) + (!isHostWin ? 0 : 1),
              "stats.points": (gStats.points || 0) + guestPointsToAdd
            });
        }

        // Finalize Match Status
        transaction.update(matchRef, {
          status: 'finished',
          winnerId: finalWinnerId,
          "result.status": 'verified',
          finishedAt: new Date().toISOString()
        });
      });

      // Notification to submitter
      try {
        const targetTeamId = matchData.result.submitterId;
        const targetTeamDoc = await getDoc(doc(db, "teams", targetTeamId));
        if (targetTeamDoc.exists()) {
           const captainId = targetTeamDoc.data().captainId;
           if(captainId) {
             await addDoc(collection(db, "notifications"), {
               userId: captainId,
               type: 'normal',
               title: '경기 결과 확정',
               message: '상대 팀이 결과를 승인했어요. 전적이 반영되었습니다.',
               link: '/home/locker',
               createdAt: new Date().toISOString(),
               isRead: false
             });
             
             const capSnap = await getDoc(doc(db, "users", captainId));
             if (capSnap.exists() && capSnap.data().pushToken) {
                await sendPushNotification(capSnap.data().pushToken, '경기 결과 확정', '전적이 반영되었습니다.', { link: '/home/locker' });
             }
           }
        }
      } catch (notiErr) { console.warn("Noti failed", notiErr); }

      safeAlert('확정 완료', '경기 결과가 확정됐어요.');
      return true;

    } catch (e: any) {
      console.error("Approve Result Error:", e);
      safeAlert('승인 실패', typeof e === 'string' ? e : '처리에 실패했어요. 잠시 후 다시 시도해주세요.');
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * 3. 이의 제기 (Dispute)
   */
  const disputeResult = async (matchId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await updateDoc(doc(db, "matches", matchId), {
        status: 'dispute',
        "result.status": 'dispute',
        disputedAt: new Date().toISOString()
      });
      safeAlert('접수 완료', '이의 제기가 접수됐어요. 관리자가 확인 후 연락드릴게요.');
      return true;
    } catch (e: any) {
      safeAlert('요청 실패', '잠시 후 다시 시도해주세요.');
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  return { isProcessing, submitResult, approveResult, disputeResult };
};