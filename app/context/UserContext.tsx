import React, { createContext, useState, useEffect, useContext } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../configs/firebaseConfig';

// ✅ [수정됨] User 데이터 타입 정의 (호환성 유지)
type UserData = {
  uid: string;
  email: string | null;
  displayName: string | null; // 신규 표준 (Step 4, 5 코드용)
  name?: string;              // [복구] 기존 코드 호환용 (삭제하지 않음!)
  photoURL: string | null;
  teamId?: string | null;
  role?: string; // 'admin', 'leader', 'member', 'guest'
  appliedTeamId?: string | null;
  phoneNumber?: string;
  position?: string;
  affiliation?: string;
};

type UserContextType = {
  user: UserData | null;
  loading: boolean;        
  authInitialized: boolean; 
  refreshUser: () => Promise<void>; 
};

const UserContext = createContext<UserContextType>({
  user: null,
  loading: true,
  authInitialized: false,
  refreshUser: async () => {},
});

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);

  // Firestore에서 추가 유저 정보 가져오기
  const fetchUserData = async (firebaseUser: FirebaseUser) => {
    try {
      const docRef = doc(db, "users", firebaseUser.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        // 이름 결정 우선순위: DB name > Auth displayName > '익명'
        const finalName = data.name || firebaseUser.displayName || '익명';

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: finalName, // 신규 코드용
          name: finalName,        // 기존 코드용 (똑같은 값 넣어줌)
          photoURL: data.profileImage || firebaseUser.photoURL,
          teamId: data.teamId || null,
          role: data.role || 'guest',
          appliedTeamId: data.appliedTeamId || null,
          phoneNumber: data.phoneNumber || data.phone || '',
          position: data.position,
          affiliation: data.affiliation,
        });
      } else {
        const finalName = firebaseUser.displayName || '익명';
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: finalName,
          name: finalName, 
          photoURL: firebaseUser.photoURL,
          teamId: null,
          role: 'guest',
        });
      }
    } catch (e) {
      console.error("User Context Error:", e);
      setUser(null);
    }
  };

  const refreshUser = async () => {
    if (auth.currentUser) {
        setLoading(true);
        await fetchUserData(auth.currentUser);
        setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await fetchUserData(firebaseUser);
      } else {
        setUser(null);
      }
      setLoading(false);
      setAuthInitialized(true); 
    });

    return () => unsubscribe();
  }, []);

  return (
    <UserContext.Provider value={{ user, loading, authInitialized, refreshUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);