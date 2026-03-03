"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, PenLine, Circle, User, LogOut } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { auth } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";

function isProbablyMobile() {
  if (typeof window === "undefined") return false;
  const small = window.matchMedia?.("(max-width: 768px)")?.matches;
  const ua = navigator.userAgent || "";
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  return Boolean(small || mobileUA);
}

function snapAuthUser() {
  const u = auth.currentUser;
  if (!u) return null;
  return {
    uid: u.uid,
    isAnonymous: u.isAnonymous,
    providerIds: (u.providerData || []).map((p) => p.providerId),
  };
}

// ✅ 跟 AuthProvider 用同一個 key（localStorage + timestamp）
const REDIRECT_PENDING_KEY = "muu_auth_redirect_pending_ts";

function markRedirectPending() {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(REDIRECT_PENDING_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [innerOpen, setInnerOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const [loggingOut, setLoggingOut] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const innerMenuRef = useRef<HTMLDivElement | null>(null);

  const { user, loading: authLoading, isLoggedIn } = useAuth();

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  useEffect(() => {
    setInnerOpen(false);
    setUserOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (userOpen && userMenuRef.current && !userMenuRef.current.contains(t)) setUserOpen(false);
      if (innerOpen && innerMenuRef.current && !innerMenuRef.current.contains(t)) setInnerOpen(false);
    };

    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [userOpen, innerOpen]);

  const displayName = useMemo(() => {
    if (!user) return "";
    return user.displayName || user.email || "使用者";
  }, [user]);

  const avatarUrl = useMemo(() => {
    if (!user) return null;
    return user.photoURL || null;
  }, [user]);

  const handleGoogleLogin = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      const mobile = isProbablyMobile();
      console.log("[Navbar] Google login clicked:", { mobile, current: snapAuthUser() });

      // ✅ 手機：redirect（並記 pending，避免回來瞬間被匿名搶走）
      if (mobile) {
        console.log("[Navbar] mobile -> signInWithRedirect");
        markRedirectPending();
        await signInWithRedirect(auth, provider);
        return;
      }

      // ✅ 桌機：popup
      console.log("[Navbar] desktop -> signInWithPopup");
      await signInWithPopup(auth, provider);

      console.log("[Navbar] popup success:", snapAuthUser());
      router.refresh();
    } catch (e: any) {
      console.error("[Navbar] google login error:", {
        code: e?.code ?? null,
        message: e?.message ?? String(e),
      });

      // popup 被擋/被關：fallback redirect
      if (e?.code === "auth/popup-blocked" || e?.code === "auth/popup-closed-by-user") {
        try {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: "select_account" });
          console.warn("[Navbar] popup blocked/closed -> fallback redirect");
          markRedirectPending();
          await signInWithRedirect(auth, provider);
          return;
        } catch (e2: any) {
          console.error("[Navbar] fallback redirect failed:", {
            code: e2?.code ?? null,
            message: e2?.message ?? String(e2),
          });
        }
      }

      alert("Google 登入失敗。請開 Console 看錯誤 code（常見：unauthorized-domain / popup-blocked）。");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut(auth);
      setUserOpen(false);
      router.replace("/");
      router.refresh();
    } catch (e) {
      console.error("logout error:", e);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="font-semibold tracking-tight">
          muu space
        </Link>

        {/* ✅ 手機：只顯示 icon（避免擠爆）；md 以上才顯示文字 */}
        <nav className="flex items-center gap-1 md:gap-2">
          <Link
            href="/cool-square"
            className={[
              "flex items-center gap-2 rounded-md px-2 md:px-3 py-2 text-sm",
              isActive("/cool-square") ? "bg-gray-100" : "hover:bg-gray-50",
            ].join(" ")}
          >
            <BookOpen size={18} />
            <span className="hidden md:inline">爽文廣場</span>
          </Link>

          <Link
            href="/cool-studio"
            className={[
              "flex items-center gap-2 rounded-md px-2 md:px-3 py-2 text-sm",
              isActive("/cool-studio") ? "bg-gray-100" : "hover:bg-gray-50",
            ].join(" ")}
          >
            <PenLine size={18} />
            <span className="hidden md:inline">工作室</span>
          </Link>

          <div className="relative" ref={innerMenuRef}>
            <button
              onClick={() => setInnerOpen((v) => !v)}
              className={[
                "flex items-center gap-2 rounded-md px-2 md:px-3 py-2 text-sm",
                pathname?.startsWith("/inner") ||
                pathname?.startsWith("/inner-space") ||
                pathname?.startsWith("/stories") ||
                pathname?.startsWith("/me")
                  ? "bg-gray-100"
                  : "hover:bg-gray-50",
              ].join(" ")}
              aria-haspopup="menu"
              aria-expanded={innerOpen}
            >
              <Circle size={18} />
              <span className="hidden md:inline">靜心角落</span>
              <span className="text-xs">▾</span>
            </button>

            {innerOpen && (
              <div className="absolute left-0 mt-2 w-44 rounded-md border bg-white shadow-lg">
                <DropdownItem
                  label="和我們說說"
                  href="/inner-space"
                  onDone={() => setInnerOpen(false)}
                  router={router}
                />
                <DropdownItem
                  label="故事牆"
                  href="/stories"
                  onDone={() => setInnerOpen(false)}
                  router={router}
                />
                <DropdownItem
                  label="最近的自己"
                  href="/me"
                  onDone={() => setInnerOpen(false)}
                  router={router}
                />
              </div>
            )}
          </div>

          <Link
            href="/account"
            className={[
              "flex items-center gap-2 rounded-md px-2 md:px-3 py-2 text-sm",
              isActive("/account") ? "bg-gray-100" : "hover:bg-gray-50",
            ].join(" ")}
          >
            <User size={18} />
            <span className="hidden md:inline">個人</span>
          </Link>
        </nav>

        <div className="flex items-center gap-2" ref={userMenuRef}>
          {authLoading ? (
            <div className="text-xs text-gray-500 w-[120px] text-right">載入中…</div>
          ) : isLoggedIn ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserOpen((v) => !v)}
                className="flex items-center gap-2 rounded-md px-2 md:px-3 py-2 text-sm hover:bg-gray-50"
                aria-haspopup="menu"
                aria-expanded={userOpen}
              >
                <span
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full overflow-hidden border"
                  style={{ borderColor: "rgba(0,0,0,0.08)" }}
                >
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-gray-500">{(displayName?.[0] || "U").toUpperCase()}</span>
                  )}
                </span>
                <span className="hidden md:inline max-w-[140px] truncate">{displayName}</span>
                <span className="text-xs">▾</span>
              </button>

              {userOpen && (
                <div className="absolute right-0 mt-2 w-44 rounded-md border bg-white shadow-lg overflow-hidden">
                  <MenuItem
                    label="個人頁"
                    onClick={() => {
                      setUserOpen(false);
                      router.push("/account");
                    }}
                  />
                  <MenuItem
                    label="編輯資料"
                    onClick={() => {
                      setUserOpen(false);
                      router.push("/account/edit");
                    }}
                  />
                  <div className="h-px bg-gray-100" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2">
                      <LogOut size={16} />
                      {loggingOut ? "登出中…" : "登出"}
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="rounded-md border px-2 md:px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
              >
                {googleLoading ? "Google 登入中…" : "Google 登入"}
              </button>

              <Link
                href="/login"
                className="rounded-md bg-black px-2 md:px-3 py-2 text-sm text-white hover:opacity-90"
              >
                註冊 / 登入
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function DropdownItem({
  label,
  href,
  router,
  onDone,
}: {
  label: string;
  href: string;
  router: ReturnType<typeof useRouter>;
  onDone: () => void;
}) {
  return (
    <button
      onClick={() => {
        router.push(href);
        onDone();
      }}
      className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-100"
    >
      {label}
    </button>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
    >
      {label}
    </button>
  );
}