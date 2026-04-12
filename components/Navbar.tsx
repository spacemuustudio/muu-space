"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Circle, LogOut, PenLine, User } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";

type AuthErrorLike = {
  code?: string;
  message?: string;
};

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

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [innerOpen, setInnerOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const innerMenuRef = useRef<HTMLDivElement | null>(null);

  const { user, loading: authLoading, isLoggedIn, signInWithGoogle, logout } = useAuth();

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  useEffect(() => {
    setInnerOpen(false);
    setUserOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (userOpen && userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserOpen(false);
      }

      if (innerOpen && innerMenuRef.current && !innerMenuRef.current.contains(target)) {
        setInnerOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [innerOpen, userOpen]);

  const displayName = useMemo(() => {
    if (!user) return "";
    return user.displayName || user.email || "使用者";
  }, [user]);

  const avatarUrl = useMemo(() => user?.photoURL || null, [user]);

  const handleGoogleLogin = async () => {
    if (googleLoading) return;

    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      router.refresh();
    } catch (error: unknown) {
      const meta = readAuthError(error);

      console.error("[Navbar] Google login error", {
        code: meta.code ?? null,
        message: meta.message ?? null,
      });

      alert(
        "Google 登入失敗。請先檢查 Firebase Console 的 Google provider、Authorized domains 與 authDomain 設定，再看 Console 內的錯誤碼。"
      );
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);
    try {
      await logout();
      setUserOpen(false);
      router.replace("/");
      router.refresh();
    } catch (error) {
      console.error("[Navbar] logout error", error);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/" className="shrink-0 font-semibold tracking-tight">
          muu space
        </Link>

        <nav className="flex min-w-0 items-center gap-1 md:gap-2">
          <Link
            href="/cool-square"
            className={[
              "flex items-center gap-2 rounded-md px-2 py-2 text-sm md:px-3",
              isActive("/cool-square") ? "bg-gray-100" : "hover:bg-gray-50",
            ].join(" ")}
          >
            <BookOpen size={18} />
            <span className="hidden md:inline">Cool Square</span>
          </Link>

          <Link
            href="/cool-studio"
            className={[
              "flex items-center gap-2 rounded-md px-2 py-2 text-sm md:px-3",
              isActive("/cool-studio") ? "bg-gray-100" : "hover:bg-gray-50",
            ].join(" ")}
          >
            <PenLine size={18} />
            <span className="hidden md:inline">Cool Studio</span>
          </Link>

          <div className="relative" ref={innerMenuRef}>
            <button
              type="button"
              onClick={() => setInnerOpen((value) => !value)}
              className={[
                "flex items-center gap-2 rounded-md px-2 py-2 text-sm md:px-3",
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
              <span className="hidden md:inline">Inner Space</span>
              <span className="text-xs">▾</span>
            </button>

            {innerOpen ? (
              <div className="absolute left-0 z-50 mt-2 w-44 rounded-md border bg-white shadow-lg">
                <DropdownItem href="/inner-space" label="Inner Space" onDone={() => setInnerOpen(false)} />
                <DropdownItem href="/stories" label="Stories" onDone={() => setInnerOpen(false)} />
                <DropdownItem href="/me" label="Me" onDone={() => setInnerOpen(false)} />
              </div>
            ) : null}
          </div>

          <Link
            href="/account"
            className={[
              "flex items-center gap-2 rounded-md px-2 py-2 text-sm md:px-3",
              isActive("/account") ? "bg-gray-100" : "hover:bg-gray-50",
            ].join(" ")}
          >
            <User size={18} />
            <span className="hidden md:inline">帳號</span>
          </Link>
        </nav>

        <div className="relative flex shrink-0 items-center gap-2" ref={userMenuRef}>
          {authLoading ? (
            <div className="w-[104px] text-right text-xs text-gray-500 md:w-[132px]">驗證中...</div>
          ) : isLoggedIn ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserOpen((value) => !value)}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-gray-50 md:px-3"
                aria-haspopup="menu"
                aria-expanded={userOpen}
              >
                <span
                  className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border"
                  style={{ borderColor: "rgba(0,0,0,0.08)" }}
                >
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-gray-500">
                      {(displayName[0] || "U").toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="hidden max-w-[140px] truncate md:inline">{displayName}</span>
                <span className="text-xs">▾</span>
              </button>

              {userOpen ? (
                <div className="absolute right-0 z-50 mt-2 w-44 overflow-hidden rounded-md border bg-white shadow-lg">
                  <MenuItem label="帳號" onClick={() => {
                    setUserOpen(false);
                    router.push("/account");
                  }} />
                  <MenuItem label="編輯資料" onClick={() => {
                    setUserOpen(false);
                    router.push("/account/edit");
                  }} />
                  <div className="h-px bg-gray-100" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2">
                      <LogOut size={16} />
                      {loggingOut ? "登出中..." : "登出"}
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="rounded-md border px-2 py-2 text-sm hover:bg-gray-50 disabled:opacity-60 md:px-3"
              >
                {googleLoading ? "Google 登入中..." : "Google 登入"}
              </button>

              <Link
                href="/login"
                className="rounded-md bg-black px-2 py-2 text-sm text-white hover:opacity-90 md:px-3"
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
  href,
  label,
  onDone,
}: {
  href: string;
  label: string;
  onDone: () => void;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
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
