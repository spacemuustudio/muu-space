"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { uploadAvatar } from "@/lib/firebase/avatar-service";
import { useAuth } from "@/components/AuthProvider";

type AgeRange = "under18" | "18-24" | "25-34" | "35-44" | "45-54" | "55plus";
type Mbti =
  | "INTJ" | "INTP" | "ENTJ" | "ENTP"
  | "INFJ" | "INFP" | "ENFJ" | "ENFP"
  | "ISTJ" | "ISFJ" | "ESTJ" | "ESFJ"
  | "ISTP" | "ISFP" | "ESTP" | "ESFP";

type UserProfileDoc = {
  username: string | null;
  nickname: string | null;
  bio: string | null;
  ageRange: AgeRange | null;
  mbti: Mbti | null;
  avatarUrl: string | null;
};

const AGE_OPTIONS: { value: AgeRange; label: string }[] = [
  { value: "under18", label: "未滿 18" },
  { value: "18-24", label: "18–24" },
  { value: "25-34", label: "25–34" },
  { value: "35-44", label: "35–44" },
  { value: "45-54", label: "45–54" },
  { value: "55plus", label: "55+" },
];

const MBTI_OPTIONS: Mbti[] = [
  "INTJ","INTP","ENTJ","ENTP",
  "INFJ","INFP","ENFJ","ENFP",
  "ISTJ","ISFJ","ESTJ","ESFJ",
  "ISTP","ISFP","ESTP","ESFP",
];

// ✅ username 規則：只允許 a-z 0-9 _ ，3~20
function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}
function isValidUsername(uname: string): boolean {
  return /^[a-z0-9_]{3,20}$/.test(uname);
}

export default function AccountEditPage() {
  const router = useRouter();
  const nextUrl = "/account/edit";

  // ✅ 全站一致：只信 AuthProvider（匿名不算登入）
  const { user: authUser, loading: authLoading, isLoggedIn } = useAuth();

  // 這裡沿用原本型別，避免你其他地方依賴 User 型別的行為
  const user = (authUser as User | null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ✅ 記住原本的 username：一旦設定就鎖住
  const [originalUsername, setOriginalUsername] = useState<string | null>(null);

  const [form, setForm] = useState<UserProfileDoc>({
    username: null,
    nickname: null,
    bio: null,
    ageRange: null,
    mbti: null,
    avatarUrl: null,
  });

  // ✅ Auth gate：未正式登入（含匿名）→ 導去 login
  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn || !user) {
      router.replace(`/login?next=${encodeURIComponent(nextUrl)}`);
    }
  }, [authLoading, isLoggedIn, user, router]);

  // Load profile (from users/{uid})
  useEffect(() => {
    if (!isLoggedIn || !user) return;

    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!alive) return;

        if (snap.exists()) {
          const data = snap.data() as any;

          const loadedUsername =
            typeof data.username === "string" && data.username.trim()
              ? data.username
              : null;

          setOriginalUsername(loadedUsername);

          setForm({
            username: loadedUsername,
            nickname: data.nickname ?? null,
            bio: data.bio ?? null,
            ageRange: data.ageRange ?? null,
            mbti: data.mbti ?? null,
            avatarUrl: data.avatarUrl ?? null,
          });
        } else {
          setOriginalUsername(null);
          setForm({
            username: null,
            nickname: null,
            bio: null,
            ageRange: null,
            mbti: null,
            avatarUrl: null,
          });
        }
      } catch (e) {
        console.error(e);
        setErr("讀取個人資料失敗（可能是 rules / 網路）");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isLoggedIn, user]);

  const canSave = useMemo(() => {
    if (originalUsername) return true;

    const uname = normalizeUsername(form.username ?? "");
    if (!uname) return true; // 允許不設定 username 也可存
    return isValidUsername(uname);
  }, [form.username, originalUsername]);

  const handleAvatarPick = async (file: File | null) => {
    if (!file) return;
    if (!isLoggedIn || !user) return;

    setUploading(true);
    setErr(null);
    try {
      const url = await uploadAvatar({ uid: user.uid, file });
      setForm((p) => ({ ...p, avatarUrl: url }));
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "上傳失敗");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!isLoggedIn || !user || saving) return;
    if (!canSave) {
      setErr("Username 格式不正確（只能 a-z、0-9、_，長度 3–20）");
      return;
    }

    setSaving(true);
    setErr(null);

    const uid = user.uid;

    const usernameNormalized = normalizeUsername(form.username ?? "") || null;
    const nickname = (form.nickname ?? "").trim() || null;
    const bio = (form.bio ?? "").trim() || null;
    const ageRange = form.ageRange ?? null;
    const mbti = form.mbti ?? null;
    const avatarUrl = form.avatarUrl ?? null;

    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, "users", uid);
        const publicRef = doc(db, "publicProfiles", uid);

        // ✅ username 只允許第一次設定
        let finalUsername: string | null = originalUsername;

        if (!originalUsername) {
          finalUsername = usernameNormalized;

          if (finalUsername) {
            if (!isValidUsername(finalUsername)) {
              throw new Error("Username 格式不正確（只能 a-z、0-9、_，長度 3–20）");
            }

            const unameRef = doc(db, "usernames", finalUsername);
            const unameSnap = await tx.get(unameRef);

            if (unameSnap.exists()) {
              const ownerUid = (unameSnap.data() as any)?.uid;
              if (ownerUid && ownerUid !== uid) {
                throw new Error("這個 Username 已被使用，換一個吧");
              }
            } else {
              tx.set(unameRef, { uid, createdAt: serverTimestamp() });
            }
          }
        }

        // users（私有）
        tx.set(
          userRef,
          {
            username: finalUsername,
            nickname,
            bio,
            ageRange,
            mbti,
            avatarUrl,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        // publicProfiles（公開）
        tx.set(
          publicRef,
          {
            username: finalUsername,
            nickname,
            avatarUrl,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });

      router.push("/account");
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "儲存失敗（可能是 rules / 網路）");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !isLoggedIn || !user) {
    return (
      <main className="py-10">
        <div className="text-sm" style={{ color: "var(--text-subtle)" }}>載入中…</div>
      </main>
    );
  }

  return (
    <main className="py-10">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-main)" }}>編輯個人檔案</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-subtle)" }}>
            頭像會上傳到 Firebase Storage，並同步寫入：
            <br />
            ・users/{user.uid}.avatarUrl（私有資料）
            <br />
            ・publicProfiles/{user.uid}.avatarUrl（公開顯示用，不含 email）
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push("/account")}
          className="rounded-xl border px-4 py-2 text-sm hover:opacity-90"
          style={{ borderColor: "var(--border-soft)", color: "var(--text-main)" }}
        >
          返回
        </button>
      </div>

      <div
        className="mt-8 rounded-2xl border p-6"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-soft)",
          boxShadow: "var(--shadow-soft)",
        }}
      >
        {err ? (
          <div className="mb-4 text-sm" style={{ color: "var(--danger, #dc2626)" }}>{err}</div>
        ) : null}

        {loading ? (
          <div className="text-sm" style={{ color: "var(--text-subtle)" }}>讀取中…</div>
        ) : (
          <div className="grid gap-6">
            {/* Avatar */}
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-main)" }}>頭像</div>

              <div className="mt-3 flex items-center gap-4">
                <div
                  className="h-20 w-20 rounded-full border overflow-hidden"
                  style={{
                    borderColor: "var(--border-soft)",
                    background: "color-mix(in srgb, var(--bg-main) 60%, white)",
                  }}
                >
                  {form.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                  ) : null}
                </div>

                <label
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm hover:opacity-90"
                  style={{ borderColor: "var(--border-soft)", color: "var(--text-main)" }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleAvatarPick(e.target.files?.[0] ?? null)}
                    disabled={uploading}
                  />
                  {uploading ? "上傳中…" : "選擇圖片"}
                </label>

                <div className="text-xs" style={{ color: "var(--text-subtle)" }}>
                  建議：正方形、2MB 內
                </div>
              </div>
            </div>

            {/* Username */}
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-main)" }}>Username</div>

              <input
                value={form.username ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                placeholder="例如: curlmao"
                disabled={!!originalUsername}
                className="mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none disabled:opacity-60"
                style={{ borderColor: "var(--border-soft)", background: "transparent", color: "var(--text-main)" }}
              />

              <div className="mt-2 text-xs" style={{ color: "var(--text-subtle)" }}>
                {originalUsername
                  ? "Username 已設定後不可更改（避免 username 對應表失效）。"
                  : "只能使用 a-z、0-9、_，長度 3–20；設定後會鎖住不可改。"}
              </div>
            </div>

            {/* Nickname */}
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-main)" }}>暱稱</div>
              <input
                value={form.nickname ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, nickname: e.target.value }))}
                placeholder="例如: 捲毛"
                className="mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none"
                style={{ borderColor: "var(--border-soft)", background: "transparent", color: "var(--text-main)" }}
              />
            </div>

            {/* Bio */}
            <div>
              <div className="text-sm font-semibold" style={{ color: "var(--text-main)" }}>簡介</div>
              <textarea
                value={form.bio ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
                placeholder="一句話介紹你自己"
                className="mt-2 w-full min-h-[96px] rounded-xl border px-4 py-3 text-sm outline-none"
                style={{ borderColor: "var(--border-soft)", background: "transparent", color: "var(--text-main)" }}
              />
            </div>

            {/* Age / MBTI */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text-main)" }}>年齡區間</div>
                <select
                  value={form.ageRange ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, ageRange: (e.target.value as any) || null }))}
                  className="mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "var(--border-soft)", background: "transparent", color: "var(--text-main)" }}
                >
                  <option value="">未設定</option>
                  {AGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text-main)" }}>MBTI</div>
                <select
                  value={form.mbti ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, mbti: (e.target.value as any) || null }))}
                  className="mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none"
                  style={{ borderColor: "var(--border-soft)", background: "transparent", color: "var(--text-main)" }}
                >
                  <option value="">未設定</option>
                  {MBTI_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !canSave}
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "var(--accent, #7A8C99)" }}
              >
                {saving ? "儲存中…" : "儲存並返回"}
              </button>

              {!originalUsername && (form.username ?? "").trim() && !canSave ? (
                <div className="self-center text-xs" style={{ color: "var(--danger, #dc2626)" }}>
                  Username 格式不正確（a-z / 0-9 / _，3–20）
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}