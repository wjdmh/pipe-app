import { useState, useEffect } from 'react';
import { 
  collection, query, where, orderBy, onSnapshot, 
  addDoc, doc, runTransaction, deleteDoc,
  serverTimestamp, getDoc 
} from 'firebase/firestore';
import { db, auth } from '../configs/firebaseConfig';
import { Alert, Platform } from 'react-native';
import { sendPushNotification } from '../utils/notificationHelper';

// ✅ [Type Definition] 모든 케이스를 커버하는 타입 정의
export type GuestPost = {
  id: string;
  hostTeamId: string;
  hostTeamName: string; // UI 표준
  hostCaptainId: string;
  
  // 날짜 관련 필드 (호환성 유지)
  time: string;       
  matchDate: string;  
  
  location: string;   
  loc?: string;       

  positions: string[]; // 무조건 배열로 변환됨
  gender: 'male' | 'female' | 'mixed';
  targetLevel: string; 
  fee: string; 
  
  note?: string;       
  description?: string; 

  status: 'recruiting' | 'closed';
  
  recruitmentCount?: number; 
  applicantIds?: string[];   
  applicants?: any[];        
  
  createdAt: string;
};

// 웹/앱 호환 알림 함수
const safeAlert = (title: string, message?: string) => {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message || ''}`);
  } else {
    Alert.alert(title, message);
  }
};

export const useGuest = () => {
  const [posts, setPosts] = useState<GuestPost[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. 모집글 목록 조회
  useEffect(() => {
    // 🚨 [Fix 1] 쿼리 기준을 'matchDate'로 복구 (예전 글들이 보이도록)
    // 주의: 만약 콘솔에 'index required' 에러가 뜨면 matchDate 기준 인덱스를 생성해주세요.
    const q = query(
      collection(db, "guest_posts"),
      where("status", "==", "recruiting"),
      orderBy("matchDate", "asc") 
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: GuestPost[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        
        // 🚨 [Fix 2] 데이터 표준화 (Normalization)
        // 예전 데이터와 새 데이터의 필드명 차이를 여기서 통합합니다.
        const standardizedTime = data.matchDate || data.time || new Date().toISOString();
        const standardizedLoc = data.location || data.loc || '';
        const standardizedTeamName = data.hostTeamName || data.teamName || '팀명 미정';

        // 🚨 [Fix 3] 포지션 데이터 타입 안전 변환 (String -> Array)
        let safePositions: string[] = [];
        if (Array.isArray(data.positions)) {
            safePositions = data.positions;
        } else if (typeof data.positions === 'string') {
            safePositions = data.positions.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
        }

        list.push({ 
            id: doc.id, 
            ...data,
            // UI 컴포넌트가 사용할 표준 필드에 값 주입
            time: standardizedTime,
            matchDate: standardizedTime, 
            location: standardizedLoc,
            hostTeamName: standardizedTeamName, // 팀명 복구
            positions: safePositions, 
            applicants: data.applicants || [] 
        } as GuestPost);
      });
      setPosts(list);
      setLoading(false);
    }, (error) => {
      console.error("Guest Fetch Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. 모집글 작성
  const createPost = async (data: Omit<GuestPost, 'id' | 'createdAt' | 'applicants' | 'status'>) => {
    if (!auth.currentUser) return false;
    try {
      await addDoc(collection(db, "guest_posts"), {
        ...data,
        hostCaptainId: auth.currentUser.uid,
        status: 'recruiting',
        applicants: [],
        applicantIds: [],
        createdAt: serverTimestamp(),
        isDeleted: false
      });
      return true;
    } catch (e: any) {
      safeAlert('오류', e.message);
      return false;
    }
  };

  // 3. 용병 신청
  const applyForGuest = async (post: GuestPost, message: string, contact: string) => {
    if (!auth.currentUser) return;
    const user = auth.currentUser;

    if (post.hostCaptainId === user.uid) {
      safeAlert('오류', '본인이 작성한 글입니다.');
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const postRef = doc(db, "guest_posts", post.id);
        const postDoc = await transaction.get(postRef);
        if (!postDoc.exists()) throw "존재하지 않는 게시글입니다.";
        
        const data = postDoc.data();
        if (data.status !== 'recruiting') throw "이미 마감된 모집입니다.";

        // 신청자 목록 마이그레이션 (String[] -> Object[])
        let currentApplicants = data.applicants || [];
        let currentIds = data.applicantIds || [];

        if (currentApplicants.length > 0 && typeof currentApplicants[0] === 'string') {
            currentIds = [...currentApplicants];
            currentApplicants = currentApplicants.map((uid: string) => ({
                uid,
                name: '익명(구버전)',
                status: 'pending',
                appliedAt: new Date().toISOString()
            }));
        }

        if (currentIds.includes(user.uid)) {
            throw "이미 신청한 내역이 있습니다.";
        }

        const newApplicant = {
            uid: user.uid,
            name: user.displayName || '익명',
            contact: contact,
            message: message,
            status: 'pending',
            appliedAt: new Date().toISOString()
        };

        const updatedApplicants = [...currentApplicants, newApplicant];
        const updatedIds = [...currentIds, user.uid];

        transaction.update(postRef, { 
            applicants: updatedApplicants,
            applicantIds: updatedIds
        });
      });
      
      // 알림 발송
      try {
        await addDoc(collection(db, "notifications"), {
            userId: post.hostCaptainId,
            type: 'guest_apply',
            title: '용병 신청 도착! 🙋‍♂️',
            message: `${message ? `"${message}"` : '새로운 용병 신청이 왔습니다.'}`,
            link: `/guest/applicants?id=${post.id}`,
            createdAt: new Date().toISOString(),
            isRead: false
        });

        const hostSnap = await getDoc(doc(db, "users", post.hostCaptainId));
        if (hostSnap.exists()) {
            const hostData = hostSnap.data();
            if (hostData.pushToken) {
                await sendPushNotification(
                    hostData.pushToken,
                    '용병 신청 도착!',
                    '새로운 신청자를 확인해보세요.',
                    { link: `/guest/applicants?id=${post.id}` }
                );
            }
        }
      } catch (notiErr) { console.log("Notification send failed:", notiErr); }

      safeAlert('완료', '신청이 완료되었습니다! 호스트의 연락을 기다려주세요.');
    } catch (e: any) {
      console.error(e);
      safeAlert('신청 실패', typeof e === 'string' ? e : '알 수 없는 오류가 발생했습니다.');
    }
  };

  // 4. 신청 취소
  const cancelApplication = async (postId: string) => {
    if (!auth.currentUser) return;
    const myUid = auth.currentUser.uid;

    try {
      await runTransaction(db, async (transaction) => {
          const postRef = doc(db, "guest_posts", postId);
          const postDoc = await transaction.get(postRef);
          if (!postDoc.exists()) throw "게시글이 존재하지 않습니다.";

          const data = postDoc.data();
          const oldApplicants = data.applicants || [];
          const oldIds = data.applicantIds || [];

          const newApplicants = oldApplicants.filter((a: any) => {
              const uid = typeof a === 'string' ? a : a.uid;
              return uid !== myUid;
          });

          const newIds = oldIds.filter((id: string) => id !== myUid);

          transaction.update(postRef, {
              applicants: newApplicants,
              applicantIds: newIds
          });
      });

      safeAlert('취소됨', '신청이 취소되었습니다.');
    } catch (e) {
      console.error(e);
      safeAlert('오류', '취소 처리에 실패했습니다.');
    }
  };

  const deletePost = async (postId: string) => {
      try {
          await deleteDoc(doc(db, "guest_posts", postId));
          return true;
      } catch (e) {
          safeAlert('오류', '삭제 처리에 실패했습니다.');
          return false;
      }
  };
  
  const acceptGuest = async () => { return false; }

  return { posts, loading, createPost, applyForGuest, cancelApplication, deletePost, acceptGuest };
};