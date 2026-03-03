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
  getRedirectResult,
  signInWithCredential,
  GoogleAuthProvider,
  type User,
} from "firebase/auth";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isAnonymous: boolean;
  isLoggedIn: boolean; // 只有非匿名才算正式登入
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必須在 <AuthProvider> 裡使用");
  return ctx;
}

function snapshotUser(u: User | null) {
  if (!u) return null;
  return {
    uid: u.uid,
    isAnonymous: u.isAnonymous,
    email: u.email ?? null,
    displayName: u.displayName ?? null,
    providerIds: (u.providerData || []).map((p) => p.providerId),
  };
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const didTryAnonymousRef = useRef(false);
  const didInitRef = useRef(false);

  useEffect(() => {
    let alive = true;
    if (didInitRef.current) return;
    didInitRef.current = true;

    const init = async () => {
      // ✅ 1) 處理 redirect 收尾
      try {
        const res = await getRedirectResult(auth);
        console.log(
          "[Auth] redirect result:",
          JSON.stringify(snapshotUser(res?.user ?? null))
        );
      } catch (e: any) {
        const code = e?.code ?? null;
        const message = e?.message ?? String(e);
        console.warn(
          "[Auth] getRedirectResult failed:",
          JSON.stringify({ code, message })
        );

        if (
          code === "auth/credential-already-in-use" ||
          code === "auth/account-exists-with-different-credential"
        ) {
          try {
            const cred = GoogleAuthProvider.credentialFromError(e);
            if (cred) {
              const res2 = await signInWithCredential(auth, cred);
              console.log(
                "[Auth] fallback signInWithCredential success:",
                JSON.stringify(snapshotUser(res2.user))
              );
            } else {
              console.warn("[Auth] credentialFromError returned null");
            }
          } catch (e2: any) {
            console.error("[Auth] fallback signInWithCredential failed:", {
              code: e2?.code ?? null,
              message: e2?.message ?? String(e2),
            });
          }
        }
      }

      // ✅ 2) 監聽登入狀態
      const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        if (!alive) return;

        console.log(
          "[Auth] state changed:",
          JSON.stringify(snapshotUser(firebaseUser))
        );

        if (firebaseUser) {
          setUser(firebaseUser);
          setLoading(false);
          return;
        }

        // ✅ 3) 沒登入 → 自動匿名
        if (!didTryAnonymousRef.current) {
          didTryAnonymousRef.current = true;

          await new Promise((r) => setTimeout(r, 300));

          const u2 = auth.currentUser;
          if (u2) {
            setUser(u2);
            setLoading(false);
            return;
          }

          try {
            await signInAnonymously(auth);
            return;
          } catch (e3: any) {
            console.error("[Auth] signInAnonymously failed:", {
              code: e3?.code ?? null,
              message: e3?.message ?? String(e3),
            });
          }
        }

        setUser(null);
        setLoading(false);
      });

      return unsub;
    };

    let unsub: (() => void) | null = null;

    (async () => {
      unsub = await init();
    })();

    return () => {
      alive = false;
      if (unsub) unsub();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const isAnon = !!user?.isAnonymous;

    return {
      user,
      loading,
      isAnonymous: isAnon,
      isLoggedIn: !!user && !isAnon,
    };
  }, [user, loading]);

  // ✅ 不使用 h-screen，避免干擾 layout 結構
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-neutral-500">
        muu space 正在為你準備小宇宙…
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}