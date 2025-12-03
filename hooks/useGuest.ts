import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, doc, arrayUnion, arrayRemove, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../configs/firebaseConfig';
import { Alert } from 'react-native';

export type GuestPost = {
  id: string;
  hostTeamId: string;
  hostTeamName: string;
  hostCaptainId: string;
  matchDate: string; // ISO String
  location: string;
  positions: string[]; // ['L', 'S'] etc
  gender: 'male' | 'female' | 'mixed';
  fee: string;
  description: string;
  status: 'recruiting' | 'closed';
  applicants: string[]; // uid list
  createdAt: string;
};

export const useGuest = () => {
  const [posts, setPosts] = useState<GuestPost[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. 모집글 목록 조회 (실시간)
  useEffect(() => {
    const q = query(
      collection(db, "guest_posts"),
      where("status", "==", "recruiting"),
      orderBy("matchDate", "asc") // 날짜 임박순 정렬
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: GuestPost[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as GuestPost);
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
    if (post.hostCaptainId === auth.currentUser.uid) {
      Alert.alert('오류', '본인이 작성한 글입니다.');
      return;
    }
    if (post.applicants && post.applicants.includes(auth.currentUser.uid)) {
      Alert.alert('알림', '이미 신청했습니다.');
      return;
    }

    try {
      await updateDoc(doc(db, "guest_posts", post.id), {
        applicants: arrayUnion(auth.currentUser.uid)
      });
      
      // 호스트에게 알림 발송
      try {
        await addDoc(collection(db, "notifications"), {
            userId: post.hostCaptainId,
            type: 'guest_apply',
            title: '용병 신청 도착!',
            message: '새로운 용병 신청자가 있습니다. 확인해보세요.',
            createdAt: new Date().toISOString(),
            isRead: false
        });
      } catch (notiErr) {
          console.log("Notification failed but application succeeded");
      }

      Alert.alert('완료', '신청되었습니다! 호스트가 확인 후 연락할 것입니다.');
    } catch (e) {
      console.error(e);
      Alert.alert('오류', '신청 실패');
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
      Alert.alert('오류', '취소 실패');
    }
  };

  return { posts, loading, createPost, applyForGuest, cancelApplication };
};