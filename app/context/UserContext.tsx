import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
// 👇 [Fix] 경로 수정: ../ -> ../../ (최상위 configs 폴더 참조)
import { auth, db } from '../../configs/firebaseConfig';

// [타입 정의]
export interface UserData {
  uid: string;
  email: string | null;
  name?: string;
  teamId?: string | null; // 핵심: 이 값이 있어야 팀 유무를 판단하여 "팀 찾기" 화면을 건너뜀
  role?: string;
  appliedTeamId?: string | null;
  position?: string;
  affiliation?: string;
}

interface UserContextType {
  user: UserData | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

// Context 생성
const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  refreshUser: async () => {},
});

// Hook: 컴포넌트에서 useUser()로 정보 접근
export const useUser = () => useContext(UserContext);

// Provider: 앱 데이터를 공급하는 부모 컴포넌트
export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  // Firestore에서 최신 유저 정보 조회
  const fetchUserData = async (uid: string) => {
    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const data = userSnap.data();
        setUser({ 
            uid, 
            email: auth.currentUser?.email || null,
            name: data.name,
            teamId: data.teamId, // 여기서 팀 정보를 가져옵니다
            role: data.role,
            appliedTeamId: data.appliedTeamId,
            position: data.position,
            affiliation: data.affiliation,
        });
      } else {
        setUser({ uid, email: auth.currentUser?.email || null });
      }
    } catch (e) {
      console.error("[UserContext] Fetch Error:", e);
    }
  };

  // 정보 강제 새로고침 (팀 생성/가입 직후 사용)
  const refreshUser = async () => {
    if (auth.currentUser) {
      await fetchUserData(auth.currentUser.uid);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        await fetchUserData(currentUser.uid);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
}