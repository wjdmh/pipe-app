// hooks/useGuest.ts
import { useState, useEffect } from 'react';
import { 
  collection, query, where, orderBy, onSnapshot, 
  addDoc, updateDoc, doc, arrayUnion, 
  getDoc, runTransaction, deleteDoc 
} from 'firebase/firestore';
import { db, auth } from '../configs/firebaseConfig';
import { Alert, Platform } from 'react-native';
import { sendPushNotification } from '../utils/notificationHelper';

export type GuestPost = {
  id: string;
  hostTeamId: string;
  hostTeamName: string;
  hostCaptainId: string;
  matchDate: string; 
  location: string;
  positions: string[]; 
  gender: 'male' | 'female' | 'mixed';
  fee: string; 
  description: string; // note 필드 대응 (write 스크린에서는 note로 쓰지만 DB 필드명 확인 필요, 여기선 기존 유지)
  note?: string;       // write.tsx에서 note로 저장하므로 추가
  status: 'recruiting' | 'closed';
  
  // ✅ [수정] 데이터 구조 개선
  recruitmentCount?: number; // 모집 인원
  applicantIds?: string[];   // 검색용 (UID 목록)
  applicants?: any[];        // 상세 정보 (객체 배열) [{ uid, name, contact, message, status, appliedAt }]
  
  acceptedApplicantId?: string; // (Legacy) 단일 수락용 - 하위 호환 유지
  createdAt: string;
};

// 웹 호환 알림 헬퍼
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
    const q = query(
      collection(db, "guest_posts"),
      where("status", "==", "recruiting"),
      orderBy("matchDate", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: GuestPost[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({ id: doc.id, ...data, applicants: data.applicants || [] } as GuestPost);
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
        applicantIds: [], // 초기화
        createdAt: new Date().toISOString(),
        isDeleted: false
      });
      return true;
    } catch (e: any) {
      safeAlert('오류', e.message);
      return false;
    }
  };

  // 3. 용병 신청 (Logic Upgraded)
  const applyForGuest = async (post: GuestPost, message: string, contact: string) => {
    if (!auth.currentUser) return;
    const user = auth.currentUser; // currentUser 객체 전체 활용 (이름 등 필요 시)

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

        // [Smart Migration] 기존 문자열 배열 -> 객체 배열 호환 처리
        let currentApplicants = data.applicants || [];
        let currentIds = data.applicantIds || [];

        // 만약 applicants가 옛날 방식(문자열 배열)이라면 변환
        if (currentApplicants.length > 0 && typeof currentApplicants[0] === 'string') {
            currentIds = [...currentApplicants]; // 기존 UID들을 ID 목록으로 이동
            currentApplicants = currentApplicants.map((uid: string) => ({
                uid,
                name: '익명(구버전)',
                status: 'pending',
                appliedAt: new Date().toISOString()
            }));
        }

        // 중복 신청 체크
        if (currentIds.includes(user.uid)) {
            throw "이미 신청한 내역이 있습니다.";
        }

        // 새 신청자 객체 생성
        const newApplicant = {
            uid: user.uid,
            name: user.displayName || '익명', // UserContext가 없으므로 Auth 프로필 사용
            contact: contact,
            message: message,
            status: 'pending',
            appliedAt: new Date().toISOString()
        };

        // 배열 업데이트
        const updatedApplicants = [...currentApplicants, newApplicant];
        const updatedIds = [...currentIds, user.uid];

        transaction.update(postRef, { 
            applicants: updatedApplicants,
            applicantIds: updatedIds
        });
      });
      
      // 호스트에게 알림 발송
      try {
        await addDoc(collection(db, "notifications"), {
            userId: post.hostCaptainId,
            type: 'guest_apply', // 혹은 'applicant' (일관성 유지 필요, 여기선 기존 코드 존중)
            title: '용병 신청 도착! 🙋‍♂️',
            message: `${message ? `"${message}"` : '새로운 용병 신청이 왔습니다.'}`,
            link: `/guest/applicants?id=${post.id}`, // 클릭 시 관리 페이지로
            createdAt: new Date().toISOString(),
            isRead: false
        });

        // 푸시 알림 (토큰이 있는 경우)
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

  // 4. 신청 취소 (Logic Upgraded)
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

          // 내 정보 제거 (객체 배열 필터링)
          const newApplicants = oldApplicants.filter((a: any) => {
              // 문자열인 경우(구버전)와 객체인 경우 모두 대응
              const uid = typeof a === 'string' ? a : a.uid;
              return uid !== myUid;
          });

          // ID 목록 제거
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

  // 5. 용병 수락 (기존 로직 유지, applicants 페이지에서 상세 로직 처리 예정)
  // 단, applicants 페이지에서 직접 DB를 수정하므로 여기서는 Legacy 지원용으로 남겨둠
  const acceptGuest = async (post: GuestPost, applicantUid: string) => {
      try {
          // ... (기존과 동일하거나 필요 시 업데이트, Phase 2에서 applicants.tsx가 메인이 됨)
          // 여기서는 호환성을 위해 놔두되, 실제 수락 로직은 applicants.tsx에서 수행하는 것이 더 정확함 (다중 수락 때문)
          return true;
      } catch (e: any) {
          safeAlert('수락 실패', typeof e === 'string' ? e : '오류가 발생했습니다.');
          return false;
      }
  };

  // 6. 게시글 삭제
  const deletePost = async (postId: string) => {
      try {
          await deleteDoc(doc(db, "guest_posts", postId));
          return true;
      } catch (e) {
          safeAlert('오류', '삭제 처리에 실패했습니다.');
          return false;
      }
  };

  return { posts, loading, createPost, applyForGuest, cancelApplication, acceptGuest, deletePost };
};