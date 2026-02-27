"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

type PublicProfile = {
  username: string | null;
  nickname: string | null;
  bio?: string | null; // ✅ 如果你沒把 bio 存 publicProfiles，這裡就會是 null/undefined
  avatarUrl: string | null;

  // ⚠️ 公開頁「不要」再放 ageRange/mbti，除非你真的要公開
  // ageRange?: string | null;
  // mbti?: string | null;
};

type Post = {
  id: string;
  title: string;
  content: string;
  publishedAt?: any;
};

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
  authorLine?: string; // 例如：@woo
  content?: string;
  onClose: () => void;
}) {
  const { title, authorLine, content, onClose } = props;

  const NAVBAR_H = 56;
  const TOP_OFFSET = NAVBAR_H;

  const measureRef = useRef<HTMLDivElement | null>(null);
  const [measureReady, setMeasureReady] = useState(false);
  const setMeasureNode = useCallback((node: HTMLDivElement | null) => {
    measureRef.current = node;
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
    const measureEl = measureRef.current;
    if (!measureEl || !measureReady) return [(content || "").trim() || "（無內容）"];

    return paginateByHeight({
      text: content || "",
      measureEl,
      maxHeight: pageMaxHeight,
    });
  }, [content, pageMaxHeight, measureReady]);

  useEffect(() => setCur(0), [title, content]);

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

export default function PublicUserPage() {
  const params = useParams<{ username: string }>();
  const username = (params?.username || "").toString().trim().toLowerCase();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;

    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);
      setProfile(null);
      setPosts([]);

      try {
        // 1) usernames/{username} -> uid
        const unameRef = doc(db, "usernames", username);
        const unameSnap = await getDoc(unameRef);

        if (!unameSnap.exists()) {
          setErr("找不到這個使用者");
          return;
        }

        const uid = (unameSnap.data() as any)?.uid as string | undefined;
        if (!uid) {
          setErr("使用者資料異常（缺 uid）");
          return;
        }

        // 2) publicProfiles/{uid} ✅ 公開可讀
        const pubRef = doc(db, "publicProfiles", uid);
        const pubSnap = await getDoc(pubRef);

        // publicProfiles 可能尚未建立（那個帳號沒去 /account/edit 存過）
        const p: any = pubSnap.exists() ? pubSnap.data() : {};

        const normalized: PublicProfile = {
          username: typeof p.username === "string" ? p.username : username,
          nickname: typeof p.nickname === "string" ? p.nickname : null,
          bio: typeof p.bio === "string" ? p.bio : null,
          avatarUrl: typeof p.avatarUrl === "string" ? p.avatarUrl : null,
        };

        if (!alive) return;
        setProfile(normalized);

        // 3) published posts by author
        const qy = query(
          collection(db, "coolPosts"),
          where("authorId", "==", uid),
          where("status", "==", "published"),
          orderBy("publishedAt", "desc")
        );

        const snaps = await getDocs(qy);

        const list: Post[] = snaps.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            title: data.title ?? "（無標題）",
            content: data.content ?? "",
            publishedAt: data.publishedAt,
          };
        });

        if (!alive) return;
        setPosts(list);
      } catch (e: any) {
        console.error(e);
        setErr(e?.message || "讀取失敗");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [username]);

  return (
    <main className="min-h-screen" style={{ background: "var(--bg-main)" }}>
      <div className="mx-auto max-w-3xl px-4 py-10">
        {loading ? (
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
            載入中…
          </p>
        ) : err ? (
          <p className="text-sm" style={{ color: "var(--danger, #ef4444)" }}>
            {err}
          </p>
        ) : (
          <>
            <div
              className="rounded-3xl p-6"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-soft)",
                boxShadow: "var(--shadow-soft)",
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="h-16 w-16 rounded-full overflow-hidden"
                  style={{
                    border: "1px solid var(--border-soft)",
                    background: "color-mix(in srgb, var(--bg-card) 70%, #fff 30%)",
                  }}
                >
                  {profile?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatarUrl} className="h-full w-full object-cover" alt="avatar" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs" style={{ color: "var(--text-subtle)" }}>
                      {(profile?.username?.[0] || "?").toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="text-lg font-semibold" style={{ color: "var(--text-main)" }}>
                    {profile?.nickname ?? "未設定暱稱"}
                  </div>
                  <div className="text-sm" style={{ color: "var(--text-subtle)" }}>
                    @{profile?.username ?? username}
                  </div>
                  <div className="mt-1 text-sm" style={{ color: "var(--text-main)" }}>
                    {profile?.bio ?? "（尚未填寫簡介）"}
                  </div>

                  {/* ✅ 小提醒：publicProfiles 不存在的情況 */}
                  {!profile?.avatarUrl && !profile?.nickname && !profile?.bio ? (
                    <div className="mt-2 text-xs" style={{ color: "var(--text-subtle)" }}>
                      （提示：這個帳號可能還沒去「編輯個人檔案」儲存過，所以公開資料是空的）
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-8">
              <div className="mb-3 font-semibold" style={{ color: "var(--text-main)" }}>
                已發布作品
              </div>

              {posts.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
                  尚未發布作品
                </p>
              ) : (
                <div className="grid gap-3">
                  {posts.map((post) => (
                    <div
                      key={post.id}
                      onClick={() => setOpenPost(post)}
                      className="cursor-pointer rounded-2xl p-4 transition"
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border-soft)",
                        boxShadow: "var(--shadow-soft)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0px)";
                      }}
                    >
                      <div className="font-semibold" style={{ color: "var(--text-main)" }}>
                        {post.title}
                      </div>
                      <div className="mt-1 text-sm line-clamp-2" style={{ color: "var(--text-subtle)" }}>
                        {post.content}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {openPost && (
              <CoolReaderModal
                title={openPost.title}
                authorLine={`@${profile?.username ?? username}`}
                content={openPost.content}
                onClose={() => setOpenPost(null)}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}