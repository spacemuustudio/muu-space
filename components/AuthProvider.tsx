"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { auth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from "firebase/auth";

type AuthContextValue = {
  user: User | null;
  loading: boolean;

  /** 是否匿名登入（訪客） */
  isAnonymous: boolean;

  /** 是否已登入（有正式帳號；匿名不算） */
  isLoggedIn: boolean;
};

/**
 * ⚠️ 允許 null
 */
const AuthContext = createContext<AuthContextValue | null>(null);

/** =========================
 *  Hook
 * ========================= */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth 必須在 <AuthProvider> 裡使用");
  }
  return ctx;
}

/** =========================
 *  Provider
 * ========================= */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ 防止 onAuthStateChanged=null 時一直重複觸發匿名登入
  const didTryAnonymousRef = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setLoading(false);
        return;
      }

      // 沒登入：自動匿名登入（讓未登入訪客也能讀 Firestore）
      if (!didTryAnonymousRef.current) {
        didTryAnonymousRef.current = true;
        try {
          await signInAnonymously(auth);
          // 成功後 onAuthStateChanged 會再觸發一次，firebaseUser 就會有值
          return;
        } catch (e) {
          console.error("signInAnonymously failed:", e);
        }
      }

      // 若匿名登入失敗（或已嘗試過一次仍無 user），就保持 null
      setUser(null);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const isAnon = !!user?.isAnonymous;
    return {
      user,
      loading,
      isAnonymous: isAnon,
      // ✅ 「正式登入」才算 isLoggedIn，匿名不算
      isLoggedIn: !!user && !isAnon,
    };
  }, [user, loading]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-neutral-500">
        muu space 正在為你準備小宇宙…
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}