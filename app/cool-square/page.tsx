"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { likePost, unlikePost, incrementView } from "@/lib/firebase/post-service";
import { useAuth } from "@/components/AuthProvider";

type CoolPost = {
  id: string;
  title?: string;
  content?: string;
  status?: "draft" | "published";
  authorName?: string;

  // ✅ authorId 用來補洞（讀 publicProfiles/{authorId}）
  authorId?: string;

  // ✅ 顯示頭像＋username並可連到 /u/[username]
  authorUsername?: string;
  authorPhotoURL?: string | null;

  createdAt?: Timestamp | { seconds: number } | Date | null;
  publishedAt?: Timestamp | { seconds: number } | Date | null;

  likeCount?: number;
  likes?: number;
  views?: number;
};

function formatTime(v: CoolPost["createdAt"] | CoolPost["publishedAt"]) {
  if (!v) return "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyV: any = v;
  const d: Date =
    typeof anyV?.toDate === "function"
      ? anyV.toDate()
      : v instanceof Date
      ? v
      : typeof anyV?.seconds === "number"
      ? new Date(anyV.seconds * 1000)
      : new Date();
  return d.toLocaleString("zh-TW");
}

/**
 * ✅ 依「內容區高度」真實分頁（不卡片內捲動）
 * - 先以段落拼頁
 * - 段落太長會再切（用二分找最長可放片段）
 */
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

      // 往回找比較好的切點（避免切在半個詞/半句）
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

export default function CoolSquarePage() {
  const DEBUG = false;
  const { user, isAnonymous, loading: authLoading } = useAuth();
  const canLike = !!user && !isAnonymous;

  const [posts, setPosts] = useState<CoolPost[]>([]);
  const [loading, setLoading] = useState(true);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const [pageByPost, setPageByPost] = useState<Record<string, number>>({});
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [likeCount, setLikeCount] = useState<Record<string, number>>({});

  // 👀 防狂刷：同篇只 +1 一次（前端節流）
  const viewedRef = useRef<Set<string>>(new Set());

  // ✅ 兩條 header：Navbar(56) + 本頁 header(56)
  const NAVBAR_H = 56;
  const PAGE_HEADER_H = 56;
  const TOP_OFFSET = NAVBAR_H + PAGE_HEADER_H; // 112

  // ✅ 量測盒：用 callback ref 確保「ref 一掛上就觸發重算」
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [measureReady, setMeasureReady] = useState(false);

  const setMeasureNode = useCallback((node: HTMLDivElement | null) => {
    measureRef.current = node;
    if (node) setMeasureReady(true);
  }, []);

  const [pageMaxHeight, setPageMaxHeight] = useState<number>(420);

  // ✅ Firestore 讀取（Published 應該公開可讀，不要硬卡 user）
  useEffect(() => {
    if (authLoading) return;

    const q = query(
      collection(db, "coolPosts"),
      where("status", "==", "published"),
      orderBy("publishedAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: CoolPost[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setPosts(list);

        setLikeCount(() => {
          const next: Record<string, number> = {};
          for (const p of list) {
            const likes = typeof p.likes === "number" ? p.likes : undefined;
            const lc = typeof p.likeCount === "number" ? p.likeCount : undefined;
            next[p.id] = likes ?? lc ?? 0;
          }
          return next;
        });

        setLoading(false);
      },
      (err) => {
        console.error("cool-square onSnapshot error:", err);
        setLoading(false);
        alert(err?.message || "讀取失敗（可能是 Firestore rules / index）");
      }
    );

    return () => unsub();
  }, [authLoading]);

  /**
   * ✅ 補洞：舊文章若沒有 authorUsername/authorPhotoURL
   * 改成讀 publicProfiles/{authorId}（公開可讀）
   *
   * ⚠️ 重點：用 patchedRef 記錄「已補過的 postId」
   * 避免 setPosts 後 effect 再跑造成循環
   */
  const patchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (posts.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const targets = posts.filter((p) => {
          if (!p.authorId) return false;
          if (patchedRef.current.has(p.id)) return false;
          const missing = !p.authorUsername || !p.authorPhotoURL;
          return missing;
        });

        if (targets.length === 0) return;

        // 先把這批標記為「已嘗試補洞」，避免重入
        for (const t of targets) patchedRef.current.add(t.id);

        const results = await Promise.all(
          targets.map(async (p) => {
            const pref = doc(db, "publicProfiles", p.authorId!);
            const psnap = await getDoc(pref);
            if (!psnap.exists()) return null;

            const u = psnap.data() as any;
            const username = typeof u.username === "string" ? u.username.trim() : "";
            const avatarUrl = typeof u.avatarUrl === "string" ? u.avatarUrl : null;

            return {
              postId: p.id,
              authorUsername: username || null,
              authorPhotoURL: avatarUrl || null,
            };
          })
        );

        if (cancelled) return;

        const patch = results.filter(Boolean) as Array<{
          postId: string;
          authorUsername: string | null;
          authorPhotoURL: string | null;
        }>;

        if (patch.length === 0) return;

        setPosts((prev) =>
          prev.map((p) => {
            const hit = patch.find((x) => x.postId === p.id);
            if (!hit) return p;

            return {
              ...p,
              authorUsername: p.authorUsername ?? hit.authorUsername ?? undefined,
              authorPhotoURL: p.authorPhotoURL ?? hit.authorPhotoURL ?? null,
            };
          })
        );
      } catch (e) {
        console.error("patch author meta error:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [posts]);

  // ✅ 我是否點過讚：只有「正式登入」才查
  useEffect(() => {
    const uid = user?.uid;

    if (!uid || !canLike) {
      setLiked({});
      return;
    }
    if (posts.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const entries = await Promise.all(
          posts.map(async (p) => {
            const likeRef = doc(db, "coolPosts", p.id, "likes", uid);
            const snap = await getDoc(likeRef);
            return [p.id, snap.exists()] as const;
          })
        );

        if (cancelled) return;

        const next: Record<string, boolean> = {};
        for (const [postId, isLiked] of entries) next[postId] = isLiked;
        setLiked(next);
      } catch (e) {
        console.error("load liked state error:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, posts, canLike]);

  // 外層 scroll → 算目前第幾篇（snap）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onScroll = () => {
      const h = el.clientHeight || 1;
      const idx = Math.round(el.scrollTop / h);
      setActiveIndex(Math.max(0, Math.min(idx, posts.length - 1)));
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [posts.length]);

  // 👀 activeIndex 改變就 views +1（同篇只加一次）
  // ⚠️ 你 rules 要求 signedIn 才能 views +1，所以匿名/未登入跳過
  useEffect(() => {
    const current = posts[activeIndex];
    if (!current?.id) return;

    if (!user || isAnonymous) return;

    const postId = current.id;
    if (viewedRef.current.has(postId)) return;

    viewedRef.current.add(postId);

    (async () => {
      try {
        await incrementView(postId);
      } catch (e) {
        console.error("incrementView error:", e);
      }
    })();
  }, [activeIndex, posts, user, isAnonymous]);

  // ✅ 計算內容區高度（卡片 80% 規格）
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

  // ✅ 分頁計算
  const pagesById = useMemo(() => {
    const measureEl = measureRef.current;
    const map: Record<string, string[]> = {};

    if (!measureEl || !measureReady) {
      for (const p of posts) map[p.id] = [(p.content || "").trim() || "（無內容）"];
      return map;
    }

    for (const p of posts) {
      if (DEBUG && posts[0]?.id === p.id) {
        measureEl.textContent = p.content || "";
        console.log("MEASURE", {
          maxHeight: pageMaxHeight,
          scrollHeight: measureEl.scrollHeight,
          clientHeight: measureEl.clientHeight,
        });
        console.log("CONTENT_LEN", (p.content || "").length);
      }

      map[p.id] = paginateByHeight({
        text: p.content || "",
        measureEl,
        maxHeight: pageMaxHeight,
      });
    }

    return map;
  }, [posts, pageMaxHeight, measureReady, DEBUG]);

  // pagesById 變化時，確保目前頁碼不會超出
  useEffect(() => {
    setPageByPost((prev) => {
      const next = { ...prev };
      for (const p of posts) {
        const pages = pagesById[p.id] || ["（無內容）"];
        const cur = next[p.id] ?? 0;
        if (cur > pages.length - 1) next[p.id] = Math.max(0, pages.length - 1);
      }
      return next;
    });
  }, [posts, pagesById]);

  const scrollToIndex = (idx: number) => {
    const el = containerRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(idx, posts.length - 1));
    el.scrollTo({ top: next * el.clientHeight, behavior: "smooth" });
  };

  const handleCardTap = (postId: string, clientX: number, left: number, width: number) => {
    const pages = pagesById[postId] || ["（無內容）"];
    const cur = pageByPost[postId] ?? 0;

    const x = clientX - left;
    const isLeftThird = x <= width / 3;

    if (isLeftThird) {
      if (cur > 0) {
        setPageByPost((p) => ({ ...p, [postId]: cur - 1 }));
        return;
      }

      const prevIdx = activeIndex - 1;
      if (prevIdx >= 0) {
        const prevId = posts[prevIdx]?.id;
        if (prevId) {
          const prevPages = pagesById[prevId] || ["（無內容）"];
          setPageByPost((p) => ({ ...p, [prevId]: Math.max(0, prevPages.length - 1) }));
        }
        scrollToIndex(prevIdx);
      }
      return;
    }

    if (cur < pages.length - 1) {
      setPageByPost((p) => ({ ...p, [postId]: cur + 1 }));
      return;
    }

    const nextIdx = activeIndex + 1;
    if (nextIdx < posts.length) {
      const nextId = posts[nextIdx]?.id;
      if (nextId) setPageByPost((p) => ({ ...p, [nextId]: 0 }));
      scrollToIndex(nextIdx);
    }
  };

  // 👍 真實按讚：匿名/未登入 return；已讚 unlike；未讚 like；同步本地 UI
  const toggleLike = async (postId: string) => {
    if (!canLike) return;

    const uid = user?.uid;
    if (!uid) return;

    const isLiked = !!liked[postId];

    setLiked((prev) => ({ ...prev, [postId]: !isLiked }));
    setLikeCount((prev) => {
      const now = prev[postId] ?? 0;
      const next = Math.max(0, now + (isLiked ? -1 : 1));
      return { ...prev, [postId]: next };
    });

    try {
      if (isLiked) {
        await unlikePost(postId, uid);
      } else {
        await likePost(postId, uid);
      }
    } catch (e) {
      console.error("toggleLike error:", e);

      // rollback UI
      setLiked((prev) => ({ ...prev, [postId]: isLiked }));
      setLikeCount((prev) => {
        const now = prev[postId] ?? 0;
        const next = Math.max(0, now + (isLiked ? 1 : -1));
        return { ...prev, [postId]: next };
      });
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: "var(--text-subtle)" }}>
        載入中...
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: "var(--text-subtle)" }}>
        目前還沒有已發布作品。先去 /cool-studio 發布一篇吧～
      </div>
    );
  }

  return (
    <main className="h-screen overflow-hidden" style={{ background: "var(--bg-main)" }}>
      {/* ✅ 隱藏量測盒：做真實分頁 */}
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

      {/* ✅ 本頁 header：固定在 Navbar 下方（不會被擋） */}
      <header
        className="fixed left-0 right-0 z-40 backdrop-blur border-b"
        style={{
          top: 56,
          background: "color-mix(in srgb, var(--bg-card) 92%, transparent)",
          borderColor: "var(--border-soft)",
        }}
      >
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
          <div className="font-semibold tracking-wide" style={{ color: "var(--text-main)" }}>
            爽文廣場
          </div>

          <a
            href="/cool-studio"
            className="text-sm px-4 py-2 rounded-full transition-colors"
            style={{
              background: "var(--btn-primary)",
              color: "var(--btn-primary-text)",
            }}
          >
            去創作 →
          </a>
        </div>
      </header>

      {/* ✅ 內容容器需要避開兩條 header（112px） */}
      <div ref={containerRef} className="h-screen overflow-y-scroll snap-y snap-mandatory" style={{ paddingTop: 112 }}>
        {posts.map((p) => {
          const pages = pagesById[p.id] || ["（無內容）"];
          const cur = Math.min(pageByPost[p.id] ?? 0, pages.length - 1);

          const username = (p.authorUsername || "").trim();
          const avatarUrl = p.authorPhotoURL || null;

          // 顯示時間：優先 publishedAt，沒有才用 createdAt
          const timeText = formatTime(p.publishedAt ?? p.createdAt);

          return (
            <section
              key={p.id}
              className="snap-start flex items-center justify-center px-4"
              style={{ height: `calc(100vh - ${112}px)` }}
            >
              <div
                className="w-full max-w-2xl h-[80%] rounded-3xl flex flex-col overflow-hidden relative select-none"
                style={{
                  background: "var(--bg-card)",
                  border: `1px solid var(--border-soft)`,
                  boxShadow: "var(--shadow-soft)",
                }}
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  handleCardTap(p.id, e.clientX, rect.left, rect.width);
                }}
              >
                <div className="px-5 pt-5 pb-3 border-b" style={{ borderColor: "var(--border-soft)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-xl font-semibold leading-snug" style={{ color: "var(--text-main)" }}>
                        {p.title?.trim() ? p.title : "（無標題）"}
                      </h2>

                      {/* ✅ 作者區：頭像 + @username（可點） + 時間 */}
                      <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--text-subtle)" }}>
                        {username ? (
                          <a
                            href={`/u/${encodeURIComponent(username)}`}
                            className="inline-flex items-center gap-2 rounded-full hover:opacity-90"
                            onClick={(ev) => ev.stopPropagation()}
                            style={{ cursor: "pointer" }}
                            aria-label="前往作者個人主頁"
                          >
                            {/* ✅ 放大頭像 */}
                            <span
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full overflow-hidden"
                              style={{
                                background: "color-mix(in srgb, var(--border-soft) 60%, transparent)",
                                border: "1px solid var(--border-soft)",
                              }}
                            >
                              {avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-xs" style={{ color: "var(--text-subtle)" }}>
                                  {(username[0] || "?").toUpperCase()}
                                </span>
                              )}
                            </span>

                            <span className="font-medium" style={{ color: "var(--text-main)" }}>
                              @{username}
                            </span>
                          </a>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            {/* ✅ 放大頭像（fallback） */}
                            <span
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full overflow-hidden"
                              style={{
                                background: "color-mix(in srgb, var(--border-soft) 60%, transparent)",
                                border: "1px solid var(--border-soft)",
                              }}
                            >
                              <span className="text-xs" style={{ color: "var(--text-subtle)" }}>
                                {(p.authorName?.[0] || "？").toUpperCase()}
                              </span>
                            </span>
                            <span>{p.authorName || "匿名"}</span>
                          </span>
                        )}

                        <span>· {timeText}</span>
                      </div>
                    </div>

                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        void toggleLike(p.id);
                      }}
                      className="px-3 py-1.5 rounded-full text-sm border transition-colors"
                      style={{
                        borderColor: liked[p.id] ? "var(--accent)" : "var(--border-soft)",
                        background: liked[p.id] ? "var(--accent)" : "transparent",
                        color: liked[p.id] ? "var(--btn-primary-text)" : "var(--text-subtle)",
                        opacity: canLike ? 1 : 0.7,
                        cursor: canLike ? "pointer" : "not-allowed",
                      }}
                      disabled={!canLike}
                      title={!canLike ? "登入後才能按讚" : "按讚"}
                    >
                      👍 {likeCount[p.id] ?? (typeof p.likes === "number" ? p.likes : 0)}
                    </button>
                  </div>
                </div>

                {/* ✅ 內容區：完全不滾動 */}
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
            </section>
          );
        })}
      </div>
    </main>
  );
}