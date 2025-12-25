import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
// 👇 [Path Check] app/context/UserContext.tsx -> ../../configs
import { auth, db } from '../../configs/firebaseConfig';

// [타입 정의]
export interface UserData {
  uid: string;
  email: string | null;
  name?: string;
  teamId?: string | null;
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
  loading: true, // 초기 로딩 상태는 true
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
            teamId: data.teamId,
            role: data.role,
            appliedTeamId: data.appliedTeamId,
            position: data.position,
            affiliation: data.affiliation,
        });
      } else {
        // DB에 정보가 없더라도 로그인은 유지 (신규 유저 등)
        setUser({ uid, email: auth.currentUser?.email || null });
      }
    } catch (e) {
      console.error("[UserContext] Fetch Error:", e);
      // 👇 [Fix] 에러가 발생해도 로그인은 풀리지 않도록 최소 정보로 설정
      // 이렇게 해야 DB 오류 시에도 '로그인 창'으로 튕기지 않고, '재시도' 등을 안내할 수 있음
      setUser({ uid, email: auth.currentUser?.email || null });
    }
  };

  // 정보 강제 새로고침 (팀 생성/가입 직후 사용)
  const refreshUser = async () => {
    if (auth.currentUser) {
      // 로딩 상태를 잠깐 주어서 UI가 갱신되도록 유도 가능 (선택사항)
      await fetchUserData(auth.currentUser.uid);
    }
  };

  useEffect(() => {
    // Auth 상태 감지 리스너
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true); // 상태 변경 시작 시 로딩 ON
      if (currentUser) {
        // 로그인 상태라면 DB 정보 조회
        await fetchUserData(currentUser.uid);
      } else {
        // 로그아웃 상태
        setUser(null);
      }
      setLoading(false); // 작업 완료 후 로딩 OFF
    });

    return () => unsubscribe();
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
}