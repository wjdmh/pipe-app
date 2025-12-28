import { useState, useEffect } from 'react';
import { 
  collection, query, where, orderBy, onSnapshot, 
  addDoc, updateDoc, doc, arrayUnion, 
  getDoc, runTransaction, deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from '../configs/firebaseConfig';
import { Alert, Platform } from 'react-native';
import { sendPushNotification } from '../utils/notificationHelper';

// ✅ [Type Fix] matchDate의 물음표(?)를 제거하여 필수 속성으로 변경
export type GuestPost = {
  id: string;
  hostTeamId: string;
  hostTeamName: string;
  hostCaptainId: string;
  
  time: string;       // 경기 일시 (ISO String)
  matchDate: string;  // ✅ [Fix] 하위 호환용 (필수로 지정하여 TS 오류 해결)
  
  location: string;   // loc 필드와 매핑됨
  loc?: string;       // DB 원본 필드

  positions: string[]; 
  gender: 'male' | 'female' | 'mixed';
  targetLevel: string; // 상/중/하
  fee: string; 
  
  note?: string;       // 상세 내용
  description?: string; // (Legacy)

  status: 'recruiting' | 'closed';
  
  recruitmentCount?: number; // 모집 인원
  applicantIds?: string[];   // 검색용
  applicants?: any[];        // 상세 정보
  
  createdAt: string;
};

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
    // time 기준 정렬 (인덱스 필요 시 콘솔 링크 확인)
    const q = query(
      collection(db, "guest_posts"),
      where("status", "==", "recruiting"),
      orderBy("time", "asc") 
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: GuestPost[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        
        // 🛡️ [Data Guard] 데이터가 비어있을 경우 기본값 주입
        const standardizedTime = data.time || data.matchDate || new Date().toISOString();
        const standardizedLoc = data.loc || data.location || '';

        list.push({ 
            id: doc.id, 
            ...data,
            // 표준화된 필드 주입 (항상 값이 존재함을 보장)
            time: standardizedTime,
            matchDate: standardizedTime, 
            location: standardizedLoc,
            
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

        // [Migration]
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

  // 5. 게시글 삭제
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