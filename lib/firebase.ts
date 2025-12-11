// lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// =======================
// 讀取環境變數
// =======================
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

// Debug：確認你前端真的連到哪個 Firebase 專案
console.log("🔥 Firebase projectId =", firebaseConfig.projectId);

// =======================
// 初始化 App（避免重複初始化）
// =======================
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// =======================
// 匯出 Firestore + Auth
// =======================
export const db = getFirestore(app);
export const auth = getAuth(app);
