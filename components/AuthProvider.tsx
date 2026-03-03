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
  setPersistence,
  browserLocalPersistence,
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

// ✅ pending key：sessionStorage + localStorage 都寫，避免手機跳新分頁 sessionStorage 消失
const REDIRECT_PENDING_KEY = "muu_auth_redirect_pending_v1";

function setRedirectPending() {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(REDIRECT_PENDING_KEY, "1");
    window.localStorage.setItem(REDIRECT_PENDING_KEY, "1");
  } catch {
    // ignore
  }
}

function hasRedirectPending() {
  try {
    if (typeof window === "undefined") return false;
    return (
      window.sessionStorage.getItem(REDIRECT_PENDING_KEY) === "1" ||
      window.localStorage.getItem(REDIRECT_PENDING_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function clearRedirectPending() {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(REDIRECT_PENDING_KEY);
    window.localStorage.removeItem(REDIRECT_PENDING_KEY);
  } catch {
    // ignore
  }
}

async function tryGetRedirectResultOnce(tag: string) {
  try {
    const res = await getRedirectResult(auth);
    console.log(
      `[Auth] ${tag} redirect result:`,
      JSON.stringify(snapshotUser(res?.user ?? null))
    );
    return res?.user ?? null;
  } catch (e: any) {
    const code = e?.code ?? null;
    const message = e?.message ?? String(e);
    console.warn(`[Auth] ${tag} getRedirectResult failed:`, { code, message });

    // 若看到 credential already in use，做 fallback
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
          return res2.user;
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

    return null;
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
      // ✅ 0) 強制設定 persistence（手機更穩）
      try {
        await setPersistence(auth, browserLocalPersistence);
        console.log("[Auth] persistence = browserLocalPersistence");
      } catch (e) {
        console.warn("[Auth] setPersistence failed:", e);
      }

      // ✅ 1) 先處理 redirect 收尾（一次）
      const firstRedirectUser = await tryGetRedirectResultOnce("first");
      if (firstRedirectUser) clearRedirectPending();

      // ✅ 2) 再監聽登入狀態
      const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        if (!alive) return;

        console.log(
          "[Auth] state changed:",
          JSON.stringify(snapshotUser(firebaseUser))
        );

        // ✅ 如果回來就已經有正式 user：直接結束
        if (firebaseUser && !firebaseUser.isAnonymous) {
          setUser(firebaseUser);
          setLoading(false);
          clearRedirectPending();
          return;
        }

        // ✅ 如果是匿名 user（或 null），但 pending=true：
        //    先給 redirect finalize 的時間，重試幾次 getRedirectResult / currentUser
        if (hasRedirectPending()) {
          console.log("[Auth] redirect pending detected -> wait & retry");

          // 這段期間先不要放行成匿名（避免 UI 進入匿名狀態後卡住）
          // 讓 loading 維持住（最多約 6~7 秒）
          for (let i = 0; i < 6; i++) {
            // 1) currentUser 先看一次（有時比 getRedirectResult 快）
            const cu = auth.currentUser;
            if (cu && !cu.isAnonymous) {
              console.log(
                "[Auth] pending -> currentUser ready:",
                JSON.stringify(snapshotUser(cu))
              );
              setUser(cu);
              setLoading(false);
              clearRedirectPending();
              return;
            }

            // 2) 再補 getRedirectResult
            const rrUser = await tryGetRedirectResultOnce(`retry#${i + 1}`);
            if (rrUser) {
              setUser(rrUser);
              setLoading(false);
              clearRedirectPending();
              return;
            }

            // 3) 等一下再試
            await new Promise((r) => setTimeout(r, 1100));
          }

          // 真的沒拿到 -> 清掉 pending，讓流程繼續（才會去匿名）
          console.warn("[Auth] pending timeout -> clear pending and continue");
          clearRedirectPending();
        }

        // ✅ 有 user（即使匿名）也可以結束 loading
        if (firebaseUser) {
          setUser(firebaseUser);
          setLoading(false);
          return;
        }

        // ✅ 3) 沒登入 -> 自動匿名（只做一次）
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

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-neutral-500">
        muu space 正在為你準備小宇宙…
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ✅ 這行 export 給 Navbar 用（避免你再複製 key 名稱）
export { setRedirectPending };