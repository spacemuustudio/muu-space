"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, PenLine, Circle, User, LogOut } from "lucide-react";

import { auth } from "@/lib/firebase";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [innerOpen, setInnerOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const [fbUser, setFbUser] = useState<import("firebase/auth").User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [loggingOut, setLoggingOut] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const innerMenuRef = useRef<HTMLDivElement | null>(null);

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  // ✅ 監聽登入狀態
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFbUser(u);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // ✅ 切頁時關閉下拉
  useEffect(() => {
    setInnerOpen(false);
    setUserOpen(false);
  }, [pathname]);

  // ✅ 點外面關閉下拉
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
    if (!fbUser) return "";
    return fbUser.displayName || fbUser.email || "使用者";
  }, [fbUser]);

  const avatarUrl = useMemo(() => {
    if (!fbUser) return null;
    return fbUser.photoURL || null;
  }, [fbUser]);

  // ✅ Google 直接登入（優先）
  const handleGoogleLogin = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      // 你要更乾淨可加：provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      // 登入成功會自動觸發 onAuthStateChanged
      router.push("/account");
    } catch (e) {
      console.error("google login error:", e);
      // fallback：如果 popup 被擋/被取消，你也可以導去 /login
      // router.push("/login");
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
    } catch (e) {
      console.error("logout error:", e);
      setLoggingOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        {/* 左：品牌 */}
        <Link href="/" className="font-semibold tracking-tight">
          muu space
        </Link>

        {/* 中：主導覽 */}
        <nav className="flex items-center gap-2">
          {/* 爽文廣場 */}
          <Link
            href="/cool-square"
            className={[
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
              isActive("/cool-square") ? "bg-gray-100" : "hover:bg-gray-50",
            ].join(" ")}
          >
            <BookOpen size={18} />
            <span>爽文廣場</span>
          </Link>

          {/* 工作室 */}
          <Link
            href="/cool-studio"
            className={[
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
              isActive("/cool-studio") ? "bg-gray-100" : "hover:bg-gray-50",
            ].join(" ")}
          >
            <PenLine size={18} />
            <span>工作室</span>
          </Link>

          {/* 靜心角落（子母集合） */}
          <div className="relative" ref={innerMenuRef}>
            <button
              onClick={() => setInnerOpen((v) => !v)}
              className={[
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                pathname?.startsWith("/inner") || pathname?.startsWith("/inner-space") || pathname?.startsWith("/stories") || pathname?.startsWith("/me")
                  ? "bg-gray-100"
                  : "hover:bg-gray-50",
              ].join(" ")}
              aria-haspopup="menu"
              aria-expanded={innerOpen}
            >
              <Circle size={18} />
              <span>靜心角落</span>
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

          {/* 個人 */}
          <Link
            href="/account"
            className={[
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
              isActive("/account") ? "bg-gray-100" : "hover:bg-gray-50",
            ].join(" ")}
          >
            <User size={18} />
            <span>個人</span>
          </Link>
        </nav>

        {/* 右：登入狀態 */}
        <div className="flex items-center gap-2" ref={userMenuRef}>
          {authLoading ? (
            <div className="text-xs text-gray-500 w-[120px] text-right">載入中…</div>
          ) : fbUser ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserOpen((v) => !v)}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-gray-50"
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
                <span className="max-w-[140px] truncate">{displayName}</span>
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
              {/* ✅ Google 優先登入 */}
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-60"
              >
                {googleLoading ? "Google 登入中…" : "Google 登入"}
              </button>

              {/* ✅ 進 login 頁（你可以在 /login 裡做「註冊/登入」tab） */}
              <Link
                href="/login"
                className="rounded-md bg-black px-3 py-2 text-sm text-white hover:opacity-90"
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

/* ========= 子項目元件 ========= */
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