"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { upsertUserProfile, type AgeRange } from "@/lib/users";

const AGE_OPTIONS: { label: string; value: AgeRange }[] = [
  { label: "未滿 18", value: "under18" },
  { label: "18–24", value: "18-24" },
  { label: "25–34", value: "25-34" },
  { label: "35–44", value: "35-44" },
  { label: "45 以上", value: "45plus" },
];

function normalizeMBTI(raw: string) {
  const v = raw.trim().toUpperCase();
  if (!v) return null;
  // 簡單驗證：4 碼且只允許 I/E N/S F/T P/J
  if (!/^[IE][NS][FT][PJ]$/.test(v)) return null;
  return v;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/cool-studio";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);

  // 目前登入狀態（僅顯示用）
  const [me, setMe] = useState<{ email: string | null; verified: boolean } | null>(null);

  // ✅ 註冊補充資料（可略過）
  const [ageRange, setAgeRange] = useState<AgeRange | "">("");
  const [mbtiInput, setMbtiInput] = useState("");
  const mbti = useMemo(() => normalizeMBTI(mbtiInput), [mbtiInput]);

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        setMe(null);
        return;
      }
      setMe({ email: user.email, verified: user.emailVerified });
    });
  }, []);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      alert("請輸入 Email 與密碼");
      return;
    }
    if (password.trim().length < 6) {
      alert("密碼至少 6 碼");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password.trim());

        // ✅ 登入成功：確保 users/{uid} 存在（不強迫填年齡/MBTI）
        await upsertUserProfile({
          uid: cred.user.uid,
          email: cred.user.email,
          displayName: cred.user.displayName,
          photoURL: cred.user.photoURL,
        });

        // （可選）你要強制驗證才可進工作室，可開啟這段
        // if (!cred.user.emailVerified) {
        //   alert("請先到信箱完成驗證，再登入使用。");
        //   await signOut(auth);
        //   return;
        // }

        router.replace(next || "/");
        return;
      }

      // === register ===
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password.trim());

      // ✅ 註冊成功：先建立 users/{uid}，把（可略過的）年齡/MBTI 一併存起來
      await upsertUserProfile({
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: cred.user.displayName,
        photoURL: cred.user.photoURL,
        ageRange: ageRange ? (ageRange as AgeRange) : null,
        mbti: mbti ?? null,
      });

      await sendEmailVerification(cred.user);

      alert("註冊成功！已寄出驗證信，請到信箱點連結驗證後再登入。");

      // 你目前設計：註冊後先登出、回登入模式（OK）
      await signOut(auth);
      setMode("login");
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "登入/註冊失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    alert("已登出");
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md bg-white border rounded-2xl p-6 shadow-sm">
        <h1 className="text-xl font-bold mb-2">{mode === "login" ? "登入" : "註冊"}</h1>
        <p className="text-sm text-gray-500 mb-6">
          {mode === "login" ? "登入後即可進入創作工作室" : "註冊後會寄驗證信到你的信箱（年齡段/MBTI 可略過）"}
        </p>

        {me ? (
          <div className="mb-6 rounded-xl bg-gray-50 p-3 text-sm">
            <div>目前登入：{me.email}</div>
            <div>信箱驗證：{me.verified ? "已驗證" : "未驗證"}</div>
            <button
              onClick={handleLogout}
              className="mt-3 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-sm"
            >
              登出
            </button>
          </div>
        ) : null}

        <div className="space-y-3">
          <input
            className="w-full border rounded-xl px-3 py-2 outline-none"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            className="w-full border rounded-xl px-3 py-2 outline-none"
            placeholder="Password（至少 6 碼）"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          {/* ✅ 註冊才顯示：年齡段 / MBTI（可略過） */}
          {mode === "register" ? (
            <div className="mt-2 space-y-3 rounded-xl border bg-gray-50 p-3">
              <div className="text-xs text-gray-500">
                下面兩項都可略過（之後也能在個人檔案頁補）
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium text-gray-700">年齡段（可略過）</div>
                <select
                  className="w-full border rounded-xl px-3 py-2 bg-white outline-none"
                  value={ageRange}
                  onChange={(e) => setAgeRange(e.target.value as any)}
                >
                  <option value="">略過</option>
                  {AGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium text-gray-700">MBTI（可略過）</div>
                <input
                  className="w-full border rounded-xl px-3 py-2 outline-none"
                  placeholder="例如 INFP / ENTJ（可留空）"
                  value={mbtiInput}
                  onChange={(e) => setMbtiInput(e.target.value)}
                />
                {mbtiInput.trim() && !mbti ? (
                  <div className="text-xs text-red-500">格式不對（例：INFP）— 也可以直接留空略過</div>
                ) : null}
              </div>
            </div>
          ) : null}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-xl bg-black text-white py-2 disabled:opacity-50"
          >
            {loading ? "處理中..." : mode === "login" ? "登入" : "註冊"}
          </button>

          <button
            onClick={() => setMode((m) => (m === "login" ? "register" : "login"))}
            className="w-full rounded-xl border py-2 text-sm"
          >
            {mode === "login" ? "沒有帳號？去註冊" : "已有帳號？去登入"}
          </button>
        </div>
      </div>
    </main>
  );
}
