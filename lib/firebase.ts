// lib/firebase.ts
import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// =======================
// 讀取環境變數
// =======================
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!, // ✅ NEW
};

// ✅ 防呆：環境變數沒設好就直接報錯
if (
  !firebaseConfig.apiKey ||
  !firebaseConfig.authDomain ||
  !firebaseConfig.projectId ||
  !firebaseConfig.storageBucket
) {
  throw new Error(
    [
      "Firebase env missing. Check .env.local:",
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    ].join("\n")
  );
}

console.log("🔥 Firebase projectId =", firebaseConfig.projectId);

// =======================
// 初始化 App（避免重複初始化）
// =======================
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// =======================
// 匯出 Firestore + Auth + Storage
// =======================
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);