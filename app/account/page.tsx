"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
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
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

type CoolPostLite = {
  id: string;
  title: string;
  content: string;
  status: "draft" | "published";
  publishedAt?: any;
  updatedAt?: any;
};

// ✅ 時間顯示：容錯 Timestamp / seconds / Date / null
function fmtTs(v: any) {
  if (!v) return "尚未更新";
  try {
    if (typeof v?.toDate === "function") return v.toDate().toLocaleString("zh-TW");
    if (v instanceof Date) return v.toLocaleString("zh-TW");
    if (typeof v?.seconds === "number") return new Date(v.seconds * 1000).toLocaleString("zh-TW");
    return "尚未更新";
  } catch {
    return "尚未更新";
  }
}

// ====== 共用：分頁算法（跟爽文廣場同邏輯）======
function paginateByHeight(params: { text: string; measureEl: HTMLDivElement; maxHeight: number }) {
  const { text, measureEl, maxHeight } = params;

  const t = (text || "").trim();
  if (!t) return ["（無內容）"];

  const paras = t
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const pages: string[] = [];
  let buf = "";

  const fits = (candidate: string) => {
    measureEl.textContent = candidate;
    return measureEl.scrollHeight <= maxHeight;
  };

  const pushBuf = () => {
    const s = buf.trim();
    if (s) pages.push(s);
    buf = "";
  };

  const splitTooLong = (paragraph: string) => {
    let rest = paragraph;

    while (rest.length) {
      if (fits(rest)) {
        pages.push(rest);
        break;
      }

      // 二分找最大可放長度
      let lo = 1;
      let hi = rest.length;
      let best = 1;

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        const slice = rest.slice(0, mid);
        if (fits(slice)) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      // 往回找比較好的切點
      let cut = best;
      const back = Math.min(160, cut);
      const windowText = rest.slice(cut - back, cut);
      const marks = ["\n", "。", "！", "？", "，", "、", " ", "」", "）", "…"];
      for (const m of marks) {
        const idx = windowText.lastIndexOf(m);
        if (idx !== -1 && cut - back + idx > 40) {
          cut = cut - back + idx + 1;
          break;
        }
      }

      const page = rest.slice(0, cut).trimEnd();
      pages.push(page.length ? page : rest.slice(0, best));
      rest = rest.slice(cut).trimStart();
    }
  };

  for (const p of paras) {
    const candidate = buf ? `${buf}\n\n${p}` : p;

    if (fits(candidate)) {
      buf = candidate;
      continue;
    }

    if (buf) {
      pushBuf();

      if (fits(p)) {
        buf = p;
        continue;
      }
    }

    if (!fits(p)) {
      splitTooLong(p);
      continue;
    }

    buf = p;
  }

  if (buf) pushBuf();
  return pages.length ? pages : ["（無內容）"];
}

// ====== Modal：爽文廣場同款閱讀卡片（點左右翻頁）======
function CoolReaderModal(props: {
  title?: string;
  authorLine?: string;
  content?: string;
  onClose: () => void;
}) {
  const { title, authorLine, content, onClose } = props;

  const NAVBAR_H = 56;
  const TOP_OFFSET = NAVBAR_H;

  const [measureReady, setMeasureReady] = useState(false);
  const [measureEl, setMeasureEl] = useState<HTMLDivElement | null>(null);

  const setMeasureNode = useCallback((node: HTMLDivElement | null) => {
    setMeasureEl(node);
    if (node) setMeasureReady(true);
  }, []);

  const [pageMaxHeight, setPageMaxHeight] = useState<number>(420);
  const [cur, setCur] = useState(0);

  useEffect(() => {
    const calc = () => {
      const viewH = window.innerHeight - TOP_OFFSET;
      const cardH = Math.floor(viewH * 0.8);
      const contentH = cardH - 92 - 32 - 16;
      setPageMaxHeight(Math.max(220, contentH));
    };

    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [TOP_OFFSET]);

  const pages = useMemo(() => {
    if (!measureEl || !measureReady) return [(content || "").trim() || "（無內容）"];
    return paginateByHeight({ text: content || "", measureEl, maxHeight: pageMaxHeight });
  }, [content, pageMaxHeight, measureEl, measureReady]);

  useEffect(() => {
    setCur(0);
  }, [title, content]);

  const handleTap = (clientX: number, left: number, width: number) => {
    const x = clientX - left;
    const isLeftThird = x <= width / 3;

    if (isLeftThird) {
      if (cur > 0) setCur((p) => p - 1);
      return;
    }

    if (cur < pages.length - 1) {
      setCur((p) => p + 1);
      return;
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      {/* 隱藏量測盒 */}
      <div className="fixed -left-[99999px] top-0 w-[min(672px,calc(100vw-32px))]">
        <div
          ref={setMeasureNode}
          className="whitespace-pre-wrap"
          style={{
            padding: "16px 20px",
            maxHeight: pageMaxHeight,
            overflow: "hidden",
            color: "var(--text-main)",
            fontSize: "15px",
            lineHeight: "1.75",
            letterSpacing: "0.02em",
            width: "100%",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
          }}
        />
      </div>

      <div
        className="w-full max-w-2xl h-[80%] rounded-3xl flex flex-col overflow-hidden relative select-none"
        style={{
          background: "var(--bg-card)",
          border: `1px solid var(--border-soft)`,
          boxShadow: "var(--shadow-soft)",
        }}
        onClick={(e) => {
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          handleTap(e.clientX, rect.left, rect.width);
        }}
      >
        <div className="px-5 pt-5 pb-3 border-b" style={{ borderColor: "var(--border-soft)" }}>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold leading-snug" style={{ color: "var(--text-main)" }}>
              {title?.trim() ? title : "（無標題）"}
            </h2>
            {authorLine ? (
              <div className="mt-1 text-xs" style={{ color: "var(--text-subtle)" }}>
                {authorLine}
              </div>
            ) : null}
          </div>
        </div>

        <div className="px-5 py-4 flex-1 overflow-hidden">
          <div
            className="whitespace-pre-wrap"
            style={{
              color: "var(--text-main)",
              fontSize: "15px",
              lineHeight: 1.75,
              letterSpacing: "0.02em",
              maxHeight: pageMaxHeight,
              overflow: "hidden",
              wordBreak: "break-word",
              overflowWrap: "anywhere",
            }}
          >
            {pages[cur]}
          </div>
        </div>

        <div className="absolute bottom-3 right-4 text-[11px] select-none" style={{ color: "var(--text-subtle)" }}>
          {cur + 1} / {pages.length}
        </div>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const router = useRouter();

  // ✅ 只信 AuthProvider 的狀態（避免匿名被當正式登入）
  const { user, loading: authLoading, isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfileDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [publishedPosts, setPublishedPosts] = useState<CoolPostLite[]>([]);
  const [draftPosts, setDraftPosts] = useState<CoolPostLite[]>([]);
  const [openPost, setOpenPost] = useState<CoolPostLite | null>(null);

  // ✅ 登出狀態（防連點）
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await signOut(auth);
      router.replace("/");
    } catch (e) {
      console.error("logout error:", e);
      setErr("登出失敗（可能是網路問題）");
    } finally {
      setLoggingOut(false);
    }
  };

  // ✅ 只有「正式登入」才載入 profile + my posts
  useEffect(() => {
    if (!isLoggedIn || !user) return;

    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        // 1) profile（暫時先用 users；之後你要做 publicProfiles 再改）
        const ref = doc(db, "users", user.uid);
        const snap = await getDoc(ref);

        if (!alive) return;

        setProfile(
          snap.exists()
            ? (snap.data() as UserProfileDoc)
            : {
                username: null,
                nickname: null,
                bio: null,
                ageRange: null,
                mbti: null,
                avatarUrl: null,
                createdAt: null,
                updatedAt: null,
              }
        );

        // 2) my published
        const qPub = query(
          collection(db, "coolPosts"),
          where("authorId", "==", user.uid),
          where("status", "==", "published"),
          orderBy("publishedAt", "desc")
        );

        // 3) my drafts
        const qDraft = query(
          collection(db, "coolPosts"),
          where("authorId", "==", user.uid),
          where("status", "==", "draft"),
          orderBy("updatedAt", "desc")
        );

        const [pubSnaps, draftSnaps] = await Promise.all([getDocs(qPub), getDocs(qDraft)]);
        if (!alive) return;

        setPublishedPosts(
          pubSnaps.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              title: data.title ?? "（無標題）",
              content: data.content ?? "",
              status: "published",
              publishedAt: data.publishedAt,
              updatedAt: data.updatedAt,
            };
          })
        );

        setDraftPosts(
          draftSnaps.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              title: data.title ?? "（無標題）",
              content: data.content ?? "",
              status: "draft",
              publishedAt: data.publishedAt,
              updatedAt: data.updatedAt,
            };
          })
        );
      } catch (e: any) {
        console.error(e);

        if (typeof e?.message === "string" && e.message.includes("requires an index")) {
          setErr("此查詢需要 Firestore Index（請看 console 的連結建立）。");
        } else {
          setErr("讀取失敗（可能是 Firestore rules / index / 網路）");
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isLoggedIn, user]);

  const completion = useMemo(() => {
    const fields = [
      Boolean(profile?.username),
      Boolean(profile?.nickname),
      Boolean(profile?.bio),
      Boolean(profile?.ageRange),
      Boolean(profile?.mbti),
    ];
    return { count: fields.filter(Boolean).length, total: fields.length };
  }, [profile]);

  // ✅ authLoading：顯示載入
  if (authLoading) {
    return (
      <main className="py-10">
        <h1 className="text-2xl font-semibold">個人</h1>
        <p className="mt-3 text-sm" style={{ color: "var(--text-subtle)" }}>
          載入中…
        </p>
      </main>
    );
  }

  // ✅ 未正式登入（包含匿名）→ 顯示請登入（不查 Firestore、不顯示登出/草稿）
  if (!isLoggedIn) {
    return (
      <main className="py-10">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-main)" }}>
          個人
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--text-subtle)" }}>
          你目前是訪客狀態（未登入）。登入後才能查看個人頁、草稿與作品。
        </p>

        <div className="mt-6 flex gap-2">
          <Link
            href="/login?next=%2Faccount"
            className="rounded-md bg-black px-4 py-2 text-sm text-white hover:opacity-90"
          >
            註冊 / 登入
          </Link>
        </div>
      </main>
    );
  }

  // ✅ 正式登入但 user 意外為 null（理論上不會，但保護）
  if (!user) {
    return (
      <main className="py-10">
        <h1 className="text-2xl font-semibold">個人</h1>
        <p className="mt-3 text-sm" style={{ color: "var(--text-subtle)" }}>
          載入中…
        </p>
      </main>
    );
  }

  return (
    <main className="py-10">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-main)" }}>
            個人
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-subtle)" }}>
            這裡是你的個人頁（展示）。要修改資料請去「編輯個人檔案」。
          </p>
        </div>

        <div
          className="rounded-xl border px-4 py-3 text-sm"
          style={{
            background: "var(--bg-card)",
            borderColor: "var(--border-soft)",
            boxShadow: "var(--shadow-soft)",
            color: "var(--text-main)",
          }}
        >
          <div className="font-medium">
            完成度：{completion.count}/{completion.total}{" "}
            {completion.count === completion.total ? "✅" : "⏳"}
          </div>
          <div className="mt-1" style={{ color: "var(--text-subtle)" }}>
            最後更新：{fmtTs(profile?.updatedAt)}
          </div>
        </div>
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
          <div className="text-sm" style={{ color: "var(--danger, #dc2626)" }}>
            {err}
          </div>
        ) : loading ? (
          <div className="text-sm" style={{ color: "var(--text-subtle)" }}>
            讀取中…
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div
                  className="h-16 w-16 rounded-full border overflow-hidden"
                  style={{
                    borderColor: "var(--border-soft)",
                    background: "color-mix(in srgb, var(--bg-main) 60%, white)",
                  }}
                >
                  {profile?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatarUrl} className="h-full w-full object-cover" alt="avatar" />
                  ) : null}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-semibold" style={{ color: "var(--text-main)" }}>
                      {profile?.nickname ?? "未設定暱稱"}
                    </div>
                    <div className="text-sm" style={{ color: "var(--text-subtle)" }}>
                      @{profile?.username ?? "未設定 username"}
                    </div>
                  </div>
                  <div className="mt-1 text-sm" style={{ color: "var(--text-main)" }}>
                    {profile?.bio ?? "（尚未填寫簡介）"}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link
                  href="/account/edit"
                  className="rounded-xl border px-4 py-2 text-sm font-medium hover:opacity-90"
                  style={{
                    borderColor: "var(--border-soft)",
                    color: "var(--text-main)",
                    background: "transparent",
                  }}
                >
                  編輯個人檔案
                </Link>

                {profile?.username ? (
                  <Link
                    href={`/u/${profile.username}`}
                    className="rounded-xl border px-4 py-2 text-sm font-medium hover:opacity-90"
                    style={{
                      borderColor: "var(--border-soft)",
                      color: "var(--text-main)",
                      background: "transparent",
                    }}
                  >
                    查看公開頁
                  </Link>
                ) : null}

                {/* ✅ 登出 */}
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="rounded-xl border px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
                  style={{
                    borderColor: "color-mix(in srgb, var(--danger, #dc2626) 35%, var(--border-soft))",
                    color: "var(--danger, #dc2626)",
                    background: "transparent",
                  }}
                >
                  {loggingOut ? "登出中…" : "登出"}
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl p-4" style={{ background: "color-mix(in srgb, var(--bg-main) 70%, white)" }}>
                <div className="text-xs" style={{ color: "var(--text-subtle)" }}>
                  MBTI
                </div>
                <div className="mt-1 text-base font-semibold" style={{ color: "var(--text-main)" }}>
                  {profile?.mbti ?? "未設定"}
                </div>
              </div>

              <div className="rounded-xl p-4" style={{ background: "color-mix(in srgb, var(--bg-main) 70%, white)" }}>
                <div className="text-xs" style={{ color: "var(--text-subtle)" }}>
                  年齡區間
                </div>
                <div className="mt-1 text-base font-semibold" style={{ color: "var(--text-main)" }}>
                  {profile?.ageRange ?? "未設定"}
                </div>
              </div>

              <div className="rounded-xl p-4" style={{ background: "color-mix(in srgb, var(--bg-main) 70%, white)" }}>
                <div className="text-xs" style={{ color: "var(--text-subtle)" }}>
                  作品
                </div>
                <div className="mt-1 text-base font-semibold" style={{ color: "var(--text-main)" }}>
                  {publishedPosts.length}
                </div>
              </div>
            </div>

            {/* Sections */}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {/* 我的作品 */}
              <div className="rounded-2xl border p-5" style={{ borderColor: "var(--border-soft)" }}>
                <div className="font-semibold" style={{ color: "var(--text-main)" }}>
                  我的作品
                </div>
                <p className="mt-2 text-sm" style={{ color: "var(--text-subtle)" }}>
                  你在爽文廣場已發布的作品。
                </p>

                {publishedPosts.length === 0 ? (
                  <div className="mt-4 text-sm" style={{ color: "var(--text-subtle)" }}>
                    目前還沒有已發布作品。
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {publishedPosts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setOpenPost(p)}
                        className="text-left rounded-xl border px-4 py-3 transition hover:opacity-90"
                        style={{
                          borderColor: "var(--border-soft)",
                          background: "color-mix(in srgb, var(--bg-main) 60%, white)",
                        }}
                      >
                        <div className="font-semibold" style={{ color: "var(--text-main)" }}>
                          {p.title}
                        </div>
                        <div className="mt-1 text-sm line-clamp-2" style={{ color: "var(--text-subtle)" }}>
                          {p.content}
                        </div>
                        <div className="mt-2 text-[11px]" style={{ color: "var(--text-subtle)" }}>
                          發布：{fmtTs(p.publishedAt)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 我的草稿 */}
              <div className="rounded-2xl border p-5" style={{ borderColor: "var(--border-soft)" }}>
                <div className="font-semibold" style={{ color: "var(--text-main)" }}>
                  我的草稿
                </div>
                <p className="mt-2 text-sm" style={{ color: "var(--text-subtle)" }}>
                  你在爽文工作室尚未發布的草稿，點一下回去繼續寫。
                </p>

                {draftPosts.length === 0 ? (
                  <div className="mt-4 text-sm" style={{ color: "var(--text-subtle)" }}>
                    目前沒有草稿。
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {draftPosts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => router.push(`/cool-studio?id=${encodeURIComponent(p.id)}`)}
                        className="text-left rounded-xl border px-4 py-3 transition hover:opacity-90"
                        style={{
                          borderColor: "var(--border-soft)",
                          background: "color-mix(in srgb, var(--bg-main) 60%, white)",
                        }}
                      >
                        <div className="font-semibold" style={{ color: "var(--text-main)" }}>
                          {p.title}
                        </div>
                        <div className="mt-1 text-sm line-clamp-2" style={{ color: "var(--text-subtle)" }}>
                          {p.content || "（尚未開始內容）"}
                        </div>
                        <div className="mt-2 text-[11px]" style={{ color: "var(--text-subtle)" }}>
                          更新：{fmtTs(p.updatedAt)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Published 作品：用廣場同款 Reader modal */}
      {openPost && (
        <CoolReaderModal
          title={openPost.title}
          authorLine={profile?.username ? `@${profile.username}` : "（未設定 username）"}
          content={openPost.content}
          onClose={() => setOpenPost(null)}
        />
      )}
    </main>
  );
}