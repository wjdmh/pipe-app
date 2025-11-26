import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyBk1eBJBmtP1mVRa1a7N6XeOnCOS3ENXGI",
    authDomain: "uni-league-58c00.firebaseapp.com",
    projectId: "uni-league-58c00",
    storageBucket: "uni-league-58c00.firebasestorage.app",
    messagingSenderId: "339550534504",
    appId: "1:339550534504:web:acdff633f1b2336cd1b4dd",
    measurementId: "G-PFRH7T4P5X"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;