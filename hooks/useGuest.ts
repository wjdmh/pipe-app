import { useState, useEffect } from 'react';
import { 
  collection, query, where, orderBy, onSnapshot, 
  addDoc, updateDoc, doc, arrayUnion, arrayRemove, 
  getDoc, runTransaction, deleteDoc 
} from 'firebase/firestore';
import { db, auth } from '../configs/firebaseConfig';
import { Alert } from 'react-native';
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
  description: string;
  status: 'recruiting' | 'closed';
  applicants?: string[]; 
  acceptedApplicantId?: string;
  createdAt: string;
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
        createdAt: new Date().toISOString(),
        isDeleted: false
      });
      return true;
    } catch (e: any) {
      Alert.alert('오류', e.message);
      return false;
    }
  };

  // 3. 용병 신청
  const applyForGuest = async (post: GuestPost) => {
    if (!auth.currentUser) return;
    const userUid = auth.currentUser.uid;

    if (post.hostCaptainId === userUid) {
      Alert.alert('오류', '본인이 작성한 글입니다.');
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const postRef = doc(db, "guest_posts", post.id);
        const postDoc = await transaction.get(postRef);
        if (!postDoc.exists()) throw "존재하지 않는 게시글입니다.";
        const data = postDoc.data() as GuestPost;
        if (data.status !== 'recruiting') throw "이미 마감된 모집입니다.";
        if (data.applicants?.includes(userUid)) throw "이미 신청한 내역이 있습니다.";

        transaction.update(postRef, { applicants: arrayUnion(userUid) });
      });
      
      // 호스트에게 알림 발송 (DB + Push)
      try {
        await addDoc(collection(db, "notifications"), {
            userId: post.hostCaptainId,
            type: 'guest_apply',
            title: '용병 신청 도착!',
            message: '새로운 용병 신청자가 있습니다. 확인해보세요.',
            createdAt: new Date().toISOString(),
            isRead: false
        });

        // Push
        const hostSnap = await getDoc(doc(db, "users", post.hostCaptainId));
        if (hostSnap.exists() && hostSnap.data().pushToken) {
            await sendPushNotification(
                hostSnap.data().pushToken,
                '용병 신청 도착!',
                '새로운 용병 신청자가 있습니다.',
                { link: `/guest/${post.id}` }
            );
        }
      } catch (notiErr) { console.log("Noti failed but ignore"); }

      Alert.alert('완료', '신청되었습니다! 호스트가 확인 후 연락할 것입니다.');
    } catch (e: any) {
      Alert.alert('신청 실패', typeof e === 'string' ? e : '알 수 없는 오류가 발생했습니다.');
    }
  };

  // 4. 신청 취소
  const cancelApplication = async (postId: string) => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, "guest_posts", postId), {
        applicants: arrayRemove(auth.currentUser.uid)
      });
      Alert.alert('취소됨', '신청이 취소되었습니다.');
    } catch (e) {
      Alert.alert('오류', '취소 처리에 실패했습니다.');
    }
  };

  // 5. 용병 수락
  const acceptGuest = async (post: GuestPost, applicantUid: string) => {
      try {
          await runTransaction(db, async (transaction) => {
              const postRef = doc(db, "guest_posts", post.id);
              const postDoc = await transaction.get(postRef);
              if (!postDoc.exists()) throw "게시글이 삭제되었습니다.";
              const data = postDoc.data();
              if (data.status !== 'recruiting') throw "이미 마감된 매칭입니다.";

              transaction.update(postRef, {
                  status: 'closed',
                  acceptedApplicantId: applicantUid
              });
          });

          // 용병에게 알림 발송 (DB + Push)
          await addDoc(collection(db, "notifications"), {
              userId: applicantUid,
              type: 'normal',
              title: '용병 매칭 확정! 🎉',
              message: `'${post.hostTeamName}' 팀의 용병으로 확정되셨습니다.`,
              createdAt: new Date().toISOString(),
              isRead: false
          });

          // Push
          const userSnap = await getDoc(doc(db, "users", applicantUid));
          if (userSnap.exists() && userSnap.data().pushToken) {
              await sendPushNotification(
                  userSnap.data().pushToken,
                  '용병 매칭 확정! 🎉',
                  `'${post.hostTeamName}' 팀의 용병으로 확정되셨습니다.`,
                  { link: '/home' }
              );
          }

          return true;
      } catch (e: any) {
          Alert.alert('수락 실패', typeof e === 'string' ? e : '오류가 발생했습니다.');
          return false;
      }
  };

  // 6. 게시글 삭제
  const deletePost = async (postId: string) => {
      try {
          await deleteDoc(doc(db, "guest_posts", postId));
          return true;
      } catch (e) {
          Alert.alert('오류', '삭제 처리에 실패했습니다.');
          return false;
      }
  };

  return { posts, loading, createPost, applyForGuest, cancelApplication, acceptGuest, deletePost };
};