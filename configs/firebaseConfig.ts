import { initializeApp, getApp, getApps } from "firebase/app";
import { 
  getAuth, 
  browserLocalPersistence, 
  type Auth 
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { Platform } from "react-native";
// ⚠️ [Native] 앱 개발 시 주석 해제 필요
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import { initializeAuth, getReactNativePersistence } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyBk1eBJBmtP1mVRa1a7N6XeOnCOS3ENXGI",
    authDomain: "uni-league-58c00.firebaseapp.com",
    projectId: "uni-league-58c00",
    storageBucket: "uni-league-58c00.firebasestorage.app",
    messagingSenderId: "339550534504",
    appId: "1:339550534504:web:acdff633f1b2336cd1b4dd",
    measurementId: "G-PFRH7T4P5X"
};

// 1. 앱 초기화 (중복 방지)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// 2. Auth 초기화
let auth: Auth;

if (Platform.OS === 'web') {
  // 🌍 WEB: 브라우저 표준 Persistence 사용 (새로고침 유지됨)
  auth = getAuth(app);
  auth.setPersistence(browserLocalPersistence).catch((error) => {
    console.error("Auth Persistence Error:", error);
  });
} else {
  // 📱 NATIVE: 일단 기본 Auth로 설정 (추후 앱 개발 시 AsyncStorage 연동 필요)
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;