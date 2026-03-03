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

/**
 * ✅ 用 localStorage 記「剛剛有走 redirect」：避免回來那瞬間被匿名搶走
 * - iOS / in-app browser 對 sessionStorage 有時不穩
 * - 存 timestamp 方便過期
 */
const REDIRECT_PENDING_KEY = "muu_auth_redirect_pending_ts";

function getRedirectPendingTs(): number | null {
  try {
    if (typeof window === "undefined") return null;
    const v = window.localStorage.getItem(REDIRECT_PENDING_KEY);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function hasRedirectPending(maxAgeMs = 60_000) {
  const ts = getRedirectPendingTs();
  if (!ts) return false;
  return Date.now() - ts < maxAgeMs;
}

function clearRedirectPending() {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(REDIRECT_PENDING_KEY);
  } catch {
    // ignore
  }
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
      // ✅ 1) 處理 redirect 收尾（手機 redirect 回來主要靠這個）
      try {
        const res = await getRedirectResult(auth);
        console.log("[Auth] redirect result:", JSON.stringify(snapshotUser(res?.user ?? null)));

        // ✅ 如果 redirect 真的帶回 user：清掉 pending
        if (res?.user) {
          clearRedirectPending();
        }
      } catch (e: any) {
        const code = e?.code ?? null;
        const message = e?.message ?? String(e);
        console.warn("[Auth] getRedirectResult failed:", JSON.stringify({ code, message }));

        // 若曾經走過「link」路線，可能會看到這些 error
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
              clearRedirectPending();
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

        console.log("[Auth] state changed:", JSON.stringify(snapshotUser(firebaseUser)));

        // ✅ 有 user（包含匿名/正式）就結束 loading
        if (firebaseUser) {
          setUser(firebaseUser);
          setLoading(false);

          // ✅ 一旦拿到「非匿名」就一定清 pending（避免卡住）
          if (!firebaseUser.isAnonymous) clearRedirectPending();

          return;
        }

        // ✅ 3) 沒登入 → 自動匿名（但要避開 redirect 回來那個瞬間）
        if (!didTryAnonymousRef.current) {
          didTryAnonymousRef.current = true;

          // ⛑️ 如果剛剛走過 redirect：先不要匿名，給它時間 finalize
          if (hasRedirectPending(90_000)) {
            console.log("[Auth] redirect pending -> delay anonymous");

            // 給 redirect 多一點時間（手機常比較慢）
            await new Promise((r) => setTimeout(r, 2500));

            // 再看一次 currentUser
            const uWait = auth.currentUser;
            if (uWait) {
              console.log(
                "[Auth] pending redirect -> currentUser is ready:",
                JSON.stringify(snapshotUser(uWait))
              );
              setUser(uWait);
              setLoading(false);
              clearRedirectPending();
              return;
            }

            // 再補一次 getRedirectResult（有時第一次太早拿會是 null）
            try {
              const rr = await getRedirectResult(auth);
              console.log(
                "[Auth] pending redirect -> retry redirect result:",
                JSON.stringify(snapshotUser(rr?.user ?? null))
              );
              if (rr?.user) {
                setUser(rr.user);
                setLoading(false);
                clearRedirectPending();
                return;
              }
            } catch (eRetry: any) {
              console.warn("[Auth] pending redirect -> retry getRedirectResult failed:", {
                code: eRetry?.code ?? null,
                message: eRetry?.message ?? String(eRetry),
              });
            }

            // ✅ pending 超時就清掉，避免永遠不匿名
            if (!hasRedirectPending(90_000)) {
              clearRedirectPending();
            }
          }

          // 原本的 300ms 邏輯保留
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