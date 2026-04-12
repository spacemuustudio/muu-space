"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { auth } from "@/lib/firebase";
import type { FirebaseError } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getRedirectResult,
  linkWithRedirect,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  authReady: boolean;
  isAnonymous: boolean;
  isLoggedIn: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

type AuthErrorLike = {
  code?: string;
  message?: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const REDIRECT_PENDING_KEY = "muu_auth_redirect_pending_v1";
const REDIRECT_SETTLE_TIMEOUT_MS = 8000;
const ANONYMOUS_BOOTSTRAP_DELAY_MS = 150;

function readAuthError(error: unknown): AuthErrorLike {
  if (error && typeof error === "object") {
    const candidate = error as AuthErrorLike;
    return {
      code: candidate.code,
      message: candidate.message,
    };
  }

  return {
    message: String(error),
  };
}

function snapshotUser(user: User | null) {
  if (!user) return null;

  return {
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    providerIds: (user.providerData || []).map((provider) => provider.providerId),
  };
}

function isProbablyMobileBrowser() {
  if (typeof window === "undefined") return false;

  const smallViewport = window.matchMedia?.("(max-width: 768px)")?.matches ?? false;
  const userAgent = navigator.userAgent || "";
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);

  return smallViewport || mobileUA;
}

function setRedirectPending() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(REDIRECT_PENDING_KEY, "1");
    window.localStorage.setItem(REDIRECT_PENDING_KEY, "1");
  } catch {
    console.warn("[Auth] failed to mark redirect as pending");
  }
}

function hasRedirectPending() {
  if (typeof window === "undefined") return false;

  try {
    return (
      window.sessionStorage.getItem(REDIRECT_PENDING_KEY) === "1" ||
      window.localStorage.getItem(REDIRECT_PENDING_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function clearRedirectPending() {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(REDIRECT_PENDING_KEY);
    window.localStorage.removeItem(REDIRECT_PENDING_KEY);
  } catch {
    console.warn("[Auth] failed to clear redirect pending marker");
  }
}

async function recoverRedirectResult(label: string) {
  try {
    const result = await getRedirectResult(auth);
    const redirectUser = result?.user ?? null;

    console.log("[Auth] redirect result", {
      label,
      user: snapshotUser(redirectUser),
    });

    return redirectUser;
  } catch (error: unknown) {
    const { code, message } = readAuthError(error);

    console.warn("[Auth] getRedirectResult failed", { label, code, message });

    if (
      code === "auth/credential-already-in-use" ||
      code === "auth/account-exists-with-different-credential"
    ) {
      try {
        const credential = GoogleAuthProvider.credentialFromError(error as FirebaseError);

        if (!credential) {
          console.warn("[Auth] credentialFromError returned null");
          return null;
        }

        const retryResult = await signInWithCredential(auth, credential);
        console.log("[Auth] recovered with signInWithCredential", {
          label,
          user: snapshotUser(retryResult.user),
        });
        return retryResult.user;
      } catch (retryError: unknown) {
        const retryMeta = readAuthError(retryError);

        console.error("[Auth] signInWithCredential recovery failed", {
          label,
          code: retryMeta.code ?? null,
          message: retryMeta.message ?? null,
        });
      }
    }

    return null;
  }
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }

  return context;
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [redirectRecovering, setRedirectRecovering] = useState(false);

  const mountedRef = useRef(true);
  const authChangeRunRef = useRef(0);
  const redirectPendingRef = useRef(false);
  const redirectRecoveryStartedRef = useRef(false);
  const redirectRecoveryFinishedRef = useRef(false);
  const redirectRecoveryPromiseRef = useRef<Promise<User | null> | null>(null);
  const redirectRecoveryResolverRef = useRef<((user: User | null) => void) | null>(null);
  const redirectRecoveryTimeoutRef = useRef<number | null>(null);
  const anonymousBootstrapRef = useRef(false);
  const anonymousDeferredLogRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    redirectPendingRef.current = hasRedirectPending();

    let unsubscribe: (() => void) | null = null;

    const clearRedirectRecoveryTimeout = () => {
      if (redirectRecoveryTimeoutRef.current !== null) {
        window.clearTimeout(redirectRecoveryTimeoutRef.current);
        redirectRecoveryTimeoutRef.current = null;
      }
    };

    const resolveRedirectWaiter = (resolvedUser: User | null) => {
      clearRedirectRecoveryTimeout();

      if (redirectRecoveryResolverRef.current) {
        const resolve = redirectRecoveryResolverRef.current;
        redirectRecoveryResolverRef.current = null;
        resolve(resolvedUser);
      }
    };

    const finalizeRedirectRecovery = (status: "success" | "abandoned", resolvedUser: User | null) => {
      resolveRedirectWaiter(resolvedUser);
      clearRedirectPending();
      redirectPendingRef.current = false;
      redirectRecoveryStartedRef.current = false;
      redirectRecoveryFinishedRef.current = true;
      setRedirectRecovering(false);

      console.log("[Auth] redirect recovery finished", {
        status,
        user: snapshotUser(resolvedUser),
      });

      return resolvedUser;
    };

    const ensureRedirectRecovery = (reason: string) => {
      if (!(redirectPendingRef.current || hasRedirectPending())) {
        redirectRecoveryFinishedRef.current = true;
        return Promise.resolve(auth.currentUser ?? null);
      }

      if (redirectRecoveryPromiseRef.current) {
        console.log("[Auth] redirect recovery join", { reason });
        return redirectRecoveryPromiseRef.current;
      }

      redirectRecoveryStartedRef.current = true;
      redirectRecoveryFinishedRef.current = false;
      setRedirectRecovering(true);

      console.log("[Auth] redirect recovery start", {
        reason,
        currentUser: snapshotUser(auth.currentUser),
      });

      redirectRecoveryPromiseRef.current = (async () => {
        const redirectUser = await recoverRedirectResult("bootstrap");
        if (redirectUser && !redirectUser.isAnonymous) {
          return finalizeRedirectRecovery("success", redirectUser);
        }

        const currentUser = auth.currentUser;
        console.log("[Auth] redirect bootstrap inspection", {
          redirectUser: snapshotUser(redirectUser),
          currentUser: snapshotUser(currentUser),
          pending: redirectPendingRef.current || hasRedirectPending(),
        });

        if (currentUser && !currentUser.isAnonymous) {
          return finalizeRedirectRecovery("success", currentUser);
        }

        console.log("[Auth] redirect recovery waiting for auth state");

        const waitedUser = await new Promise<User | null>((resolve) => {
          redirectRecoveryResolverRef.current = resolve;
          redirectRecoveryTimeoutRef.current = window.setTimeout(() => {
            redirectRecoveryResolverRef.current = null;
            redirectRecoveryTimeoutRef.current = null;
            console.warn("[Auth] redirect recovery timeout; giving up");
            resolve(null);
          }, REDIRECT_SETTLE_TIMEOUT_MS);
        });

        const finalUser =
          waitedUser ??
          (auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser : null);

        return finalizeRedirectRecovery(finalUser ? "success" : "abandoned", finalUser);
      })().finally(() => {
        redirectRecoveryPromiseRef.current = null;
      });

      return redirectRecoveryPromiseRef.current;
    };

    const init = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
        console.log("[Auth] persistence set to browserLocalPersistence");
      } catch (error: unknown) {
        console.warn("[Auth] setPersistence failed", error);
      }

      if (redirectPendingRef.current) {
        void ensureRedirectRecovery("init");
      }

      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        const runId = ++authChangeRunRef.current;

        void (async () => {
          console.log("[Auth] state changed", snapshotUser(firebaseUser));

          let nextUser = firebaseUser;
          const recoveryActive =
            redirectPendingRef.current ||
            hasRedirectPending() ||
            (redirectRecoveryStartedRef.current && !redirectRecoveryFinishedRef.current);

          if (recoveryActive) {
            if (firebaseUser && !firebaseUser.isAnonymous) {
              console.log("[Auth] redirect auth state resolved", snapshotUser(firebaseUser));
              resolveRedirectWaiter(firebaseUser);
            } else {
              console.log("[Auth] redirect auth state still pending", snapshotUser(firebaseUser));
            }

            nextUser = await ensureRedirectRecovery("auth-state");
          } else {
            clearRedirectPending();
            redirectPendingRef.current = false;
            redirectRecoveryFinishedRef.current = true;
            setRedirectRecovering(false);
          }

          if (!mountedRef.current || runId !== authChangeRunRef.current) {
            return;
          }

          setUser(nextUser);
          setAuthReady(true);
        })();
      });
    };

    void init();

    return () => {
      mountedRef.current = false;
      clearRedirectRecoveryTimeout();
      redirectRecoveryResolverRef.current = null;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  useEffect(() => {
    const redirectBlocked =
      redirectRecovering ||
      redirectPendingRef.current ||
      hasRedirectPending() ||
      (redirectRecoveryStartedRef.current && !redirectRecoveryFinishedRef.current);

    if (redirectBlocked) {
      if (!anonymousDeferredLogRef.current) {
        console.log("[Auth] anonymous bootstrap deferred until redirect recovery finishes");
        anonymousDeferredLogRef.current = true;
      }
      return;
    }

    if (anonymousDeferredLogRef.current) {
      console.log("[Auth] anonymous bootstrap allowed");
      anonymousDeferredLogRef.current = false;
    }

    if (!authReady || user) return;
    if (anonymousBootstrapRef.current) return;

    const timer = window.setTimeout(() => {
      if (auth.currentUser) {
        return;
      }

      anonymousBootstrapRef.current = true;

      void (async () => {
        try {
          console.log("[Auth] bootstrap anonymous session");
          await signInAnonymously(auth);
        } catch (error: unknown) {
          const meta = readAuthError(error);

          console.error("[Auth] signInAnonymously failed", {
            code: meta.code ?? null,
            message: meta.message ?? null,
          });
        } finally {
          anonymousBootstrapRef.current = false;
        }
      })();
    }, ANONYMOUS_BOOTSTRAP_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [authReady, redirectRecovering, user]);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch (error: unknown) {
      console.warn("[Auth] setPersistence before sign-in failed", error);
    }

    const isDevelopment = process.env.NODE_ENV !== "production";
    const mobile = isProbablyMobileBrowser();
    const currentUser = auth.currentUser;
    const shouldUpgradeAnonymous = !!currentUser?.isAnonymous;

    console.log("[Auth] starting Google sign-in", {
      mobile,
      env: isDevelopment ? "development" : "production",
      strategy: shouldUpgradeAnonymous ? "upgrade-anonymous" : "sign-in",
      currentUser: snapshotUser(currentUser),
    });

    if (isDevelopment || !mobile) {
      console.log(isDevelopment ? "[Auth] using popup (dev)" : "[Auth] using popup (prod-desktop)", {
        mobile,
        currentUser: snapshotUser(currentUser),
      });

      const result = await signInWithPopup(auth, provider);
      console.log("[Auth] popup sign-in success", snapshotUser(result.user));
      clearRedirectPending();
      redirectPendingRef.current = false;
      redirectRecoveryStartedRef.current = false;
      redirectRecoveryFinishedRef.current = true;
      setRedirectRecovering(false);
      return;
    }

    console.log("[Auth] using redirect (prod)", {
      mobile,
      strategy: shouldUpgradeAnonymous ? "upgrade-anonymous" : "sign-in",
      currentUser: snapshotUser(currentUser),
    });

    if (mobile) {
      setRedirectPending();
      redirectPendingRef.current = true;
      redirectRecoveryStartedRef.current = false;
      redirectRecoveryFinishedRef.current = false;
      setRedirectRecovering(true);

      console.log("[Auth] mobile redirect branch selected", {
        mode: shouldUpgradeAnonymous ? "linkWithRedirect" : "signInWithRedirect",
        currentUser: snapshotUser(currentUser),
      });

      if (currentUser && currentUser.isAnonymous) {
        console.log("[Auth] invoking linkWithRedirect for anonymous upgrade");
        await linkWithRedirect(currentUser, provider);
      } else {
        console.log("[Auth] invoking signInWithRedirect");
        await signInWithRedirect(auth, provider);
      }

      console.warn("[Auth] redirect call returned without leaving page");
      return;
    }
  };

  const logout = async () => {
    if (redirectRecoveryTimeoutRef.current !== null) {
      window.clearTimeout(redirectRecoveryTimeoutRef.current);
      redirectRecoveryTimeoutRef.current = null;
    }

    if (redirectRecoveryResolverRef.current) {
      const resolve = redirectRecoveryResolverRef.current;
      redirectRecoveryResolverRef.current = null;
      resolve(null);
    }

    clearRedirectPending();
    redirectPendingRef.current = false;
    redirectRecoveryStartedRef.current = false;
    redirectRecoveryFinishedRef.current = true;
    redirectRecoveryPromiseRef.current = null;
    setRedirectRecovering(false);
    await signOut(auth);
  };

  const value = useMemo<AuthContextValue>(() => {
    const isAnonymous = !!user?.isAnonymous;

    return {
      user,
      loading: !authReady || redirectRecovering,
      authReady,
      isAnonymous,
      isLoggedIn: !!user && !isAnonymous,
      signInWithGoogle,
      logout,
    };
  }, [authReady, redirectRecovering, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
