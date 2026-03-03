"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";
import { createDraft, getPost, publishPost, updatePost } from "@/lib/firebase/post-service";
import AIPanel from "@/components/AIPanel";

import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

type PostStatus = "draft" | "published";

type UserProfileDoc = {
  username?: string | null;
};

export default function CoolStudioPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();

  // ✅ 固定 id（避免 searchParams 物件特性造成 effect 不穩）
  const id = useMemo(() => searchParams.get("id"), [searchParams]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ✅ 只信 AuthProvider：正式登入才算可用（匿名不算）
  const { user, loading: authLoading, isLoggedIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [postId, setPostId] = useState<string | null>(null);
  const [status, setStatus] = useState<PostStatus>("draft");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const [authorName, setAuthorName] = useState<string>("匿名");

  // ✅ 防：authorName 改變不觸發其他流程
  const authorNameRef = useRef<string>("匿名");
  useEffect(() => {
    authorNameRef.current = authorName || "匿名";
  }, [authorName]);

  // ✅ 防：新增草稿連點
  const [creatingDraft, setCreatingDraft] = useState(false);

  // ✅ 跑流程版本號（避免切頁時舊 async 回來覆蓋）
  const runIdRef = useRef(0);

  // ====== Morandi Tokens ======
  const BG = "bg-[#F4F1EC]";
  const BG_SOFT = "bg-[#E9E4DC]";
  const CARD = "bg-[#F8F6F2]";
  const BORDER = "border-[#D8D2C8]";
  const TEXT_MAIN = "text-[#2F2F2F]";
  const TEXT_SUB = "text-[#6B6B6B]";
  const TEXT_MUTE = "text-[#8A8A8A]";
  const ACCENT = "bg-[#7A8C99]";
  const ACCENT_HOVER = "hover:bg-[#6C7E8B]";

  // ✅ Step 1：未正式登入 → 不准進工作室（直接導 login）
  useEffect(() => {
    if (authLoading) return;

    if (!isLoggedIn) {
      const next = "/cool-studio" + (qs ? `?${qs}` : "");
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isLoggedIn, qs]);

  // ✅ 讀取 username 當作者顯示（只在正式登入後）
  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn || !user) return;

    let cancelled = false;

    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.exists() ? (snap.data() as UserProfileDoc) : null;

        const uname = (data?.username ?? "").trim();
        const fallback = (user.displayName ?? "").trim();

        if (!cancelled) setAuthorName(uname || fallback || "匿名");
      } catch {
        const fallback = (user.displayName ?? "").trim();
        if (!cancelled) setAuthorName(fallback || "匿名");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, isLoggedIn, user?.uid, user?.displayName, user]);

  // ✅ Step 2：有 id 才開啟文章；沒有 id 不自動建草稿（止血爆草稿）
  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn || !user) return;

    const runId = ++runIdRef.current;

    // 沒 id：回到「入口狀態」，不做任何 Firestore 寫入
    if (!id) {
      setPostId(null);
      setStatus("draft");
      setTitle("");
      setContent("");
      setLastSaved(null);
      setLoading(false);
      return;
    }

    // 有 id：開該篇
    setLoading(true);

    (async () => {
      try {
        const post = await getPost(id);
        if (runIdRef.current !== runId) return;

        if (!post) {
          alert("找不到文章（可能被刪除或沒權限）。");
          router.replace("/cool-studio");
          return;
        }

        const postAuthorId = (post as any)?.authorId as string | undefined;
        const postStatus = (post as any)?.status as string | undefined;

        // ✅ 草稿防呆：不是自己的草稿不准開
        if (postStatus === "draft" && postAuthorId && postAuthorId !== user.uid) {
          alert("你沒有權限開啟這篇草稿。");
          router.replace("/cool-studio");
          return;
        }

        setPostId(post.id);
        setStatus(((post.status as PostStatus) ?? "draft") as PostStatus);
        setTitle(post.title ?? "");
        setContent(post.content ?? "");
      } catch (e) {
        console.error("Studio open failed:", e);
        alert("工作室載入失敗（請看 Console 錯誤）");
        router.replace("/cool-studio");
      } finally {
        if (runIdRef.current === runId) setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isLoggedIn, user?.uid, id]);

  // ✅ 明確按鈕建立草稿（不再自動）
  const handleCreateDraft = async () => {
    if (!isLoggedIn || !user) return;
    if (creatingDraft) return;

    // ✅ 如果已經在編輯某篇，就不允許再新增，避免「手滑一直噴草稿」
    if (postId) return;

    setCreatingDraft(true);
    setLoading(true);

    const runId = ++runIdRef.current;

    try {
      const newId = await createDraft(user.uid, authorNameRef.current);
      if (runIdRef.current !== runId) return;

      setPostId(newId);
      setStatus("draft");
      setTitle("");
      setContent("");
      setLastSaved(null);

      router.replace(`/cool-studio?id=${newId}`);
    } catch (e) {
      console.error("Create draft failed:", e);
      alert("新增草稿失敗（請看 Console）");
    } finally {
      if (runIdRef.current === runId) {
        setLoading(false);
        setCreatingDraft(false);
      }
    }
  };

  const handleSave = async () => {
    if (!isLoggedIn || !user) return;
    if (!postId || isSaving) return;
    if (status === "published") return;

    setIsSaving(true);
    try {
      await updatePost(postId, { title, content, authorName: authorNameRef.current });
      setLastSaved(new Date());
    } catch (e) {
      console.error("Save failed", e);
      alert("儲存失敗");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAppend = (text: string) => {
    if (!text) return;

    setContent((prev) => prev + "\n\n" + text);

    setTimeout(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.scrollTop = ta.scrollHeight;
      ta.focus();
    }, 0);
  };

  const handlePublish = async () => {
    if (!isLoggedIn || !user) return;
    if (!postId || isPublishing) return;

    if (!title.trim() || !content.trim()) {
      alert("標題與內容不能為空");
      return;
    }
    if (!confirm("確定要發布嗎？發布後將公開在廣場。")) return;

    setIsPublishing(true);
    try {
      await updatePost(postId, { title, content, authorName: authorNameRef.current });
      await publishPost(postId);
      setStatus("published");
      alert("發布成功！");
      router.push("/cool-square");
    } catch (e) {
      console.error("Publish failed", e);
      alert("發布失敗");
    } finally {
      setIsPublishing(false);
    }
  };

  // =========================
  // Render Gates
  // =========================

  // ✅ auth 還在確認：顯示載入
  if (authLoading) {
    return (
      <div className={`min-h-screen ${BG} ${TEXT_MAIN} flex items-center justify-center`}>
        <div className="w-full max-w-sm px-6">
          <div className={`rounded-2xl border ${BORDER} ${CARD} p-5 shadow-sm`}>
            <div className="text-base font-medium">準備工作室中…</div>
            <div className={`mt-2 text-sm ${TEXT_SUB}`}>正在確認登入狀態</div>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#DED7CD]">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-[#7A8C99]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ✅ 未正式登入（含匿名）：不給進（這裡是保底，通常已被 router.replace 走了）
  if (!isLoggedIn) {
    return (
      <main className={`min-h-screen ${BG} ${TEXT_MAIN} flex items-center justify-center px-6`}>
        <div className={`w-full max-w-md rounded-2xl border ${BORDER} ${CARD} p-6 shadow-sm`}>
          <div className="text-lg font-semibold">需要登入才能使用工作室</div>
          <div className={`mt-2 text-sm ${TEXT_SUB}`}>
            你目前是訪客狀態。登入後才能建立草稿、使用 AI 輔助與發布作品。
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => {
                const next = "/cool-studio" + (qs ? `?${qs}` : "");
                router.replace(`/login?next=${encodeURIComponent(next)}`);
              }}
              className={`rounded-xl px-4 py-2 text-sm font-medium text-white ${ACCENT} ${ACCENT_HOVER}`}
            >
              去登入
            </button>

            <button
              onClick={() => router.push("/cool-square")}
              className={`rounded-xl border ${BORDER} ${CARD} px-4 py-2 text-sm hover:${BG_SOFT}`}
            >
              先逛爽文廣場
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ✅ 正式登入但沒有 id：顯示入口頁（不自動建草稿）
  if (!postId && !loading) {
    return (
      <main className={`min-h-screen ${BG} ${TEXT_MAIN}`}>
        <div className="mx-auto max-w-4xl px-4 pt-10 md:px-6">
          <div className={`rounded-2xl border ${BORDER} ${CARD} p-6 shadow-sm`}>
            <div className="text-xl font-semibold">Cool Studio</div>
            <div className={`mt-2 text-sm ${TEXT_SUB}`}>
              你已登入。按下「新增草稿」才會建立一篇草稿（不再自動生成，避免爆資料）。
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button
                onClick={handleCreateDraft}
                disabled={creatingDraft}
                className={`rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${ACCENT} ${ACCENT_HOVER}`}
              >
                {creatingDraft ? "建立中…" : "新增草稿"}
              </button>

              <button
                onClick={() => router.push("/account")}
                className={`rounded-xl border ${BORDER} ${CARD} px-4 py-2 text-sm hover:${BG_SOFT}`}
              >
                去個人頁看我的草稿
              </button>
            </div>
          </div>

          <div className={`mt-4 rounded-2xl border ${BORDER} ${CARD} p-5 shadow-sm`}>
            <div className="text-sm font-medium">提示</div>
            <div className={`mt-1 text-sm ${TEXT_SUB}`}>
              之後我們會把這頁做成「草稿列表 + 新增草稿」的真正入口（更合理）。
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ✅ 有 id 但正在載入文章
  if (loading || !postId) {
    return (
      <div className={`min-h-screen ${BG} ${TEXT_MAIN} flex items-center justify-center`}>
        <div className="w-full max-w-sm px-6">
          <div className={`rounded-2xl border ${BORDER} ${CARD} p-5 shadow-sm`}>
            <div className="text-base font-medium">準備工作室中…</div>
            <div className={`mt-2 text-sm ${TEXT_SUB}`}>正在載入草稿</div>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[#DED7CD]">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-[#7A8C99]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================
  // Editor UI（你原本的 UI 下面保持）
  // =========================

  const wordCount = content.trim() ? content.trim().replace(/\s+/g, "").length : 0;
  const approxMin = Math.max(1, Math.round(wordCount / 450));

  return (
    <main className={`min-h-screen ${BG} ${TEXT_MAIN} relative overflow-hidden`}>
      {/* Header */}
      <div className="sticky top-0 z-20">
        <div className={`${BG}/80 backdrop-blur`}>
          <div className="mx-auto max-w-4xl px-4 md:px-6">
            <div className={`flex items-center justify-between border-b ${BORDER} py-4`}>
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={() => router.back()}
                  className={`h-9 w-9 shrink-0 rounded-xl border ${BORDER} ${CARD} shadow-sm hover:${BG_SOFT} flex items-center justify-center`}
                  aria-label="back"
                  title="返回"
                >
                  <span className={`${TEXT_SUB}`}>←</span>
                </button>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-semibold tracking-tight">Cool Studio</div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs border ${BORDER} ${
                        status === "draft" ? "bg-[#E9E4DC]" : "bg-[#DDE4E8]"
                      } ${TEXT_SUB}`}
                    >
                      {status === "draft" ? "草稿" : "已發布"}
                    </span>
                  </div>

                  <div className={`mt-0.5 text-xs ${TEXT_SUB} truncate`}>
                    {lastSaved ? `已儲存 ${lastSaved.toLocaleTimeString()}` : "提示：寫到一半記得存一下（之後可做自動儲存）"}
                  </div>
                </div>
              </div>

              <div className="hidden items-center gap-2 md:flex">
                <button
                  onClick={handleSave}
                  disabled={isSaving || status === "published"}
                  className={`rounded-xl border ${BORDER} ${CARD} px-3 py-2 text-sm shadow-sm hover:${BG_SOFT} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isSaving ? "儲存中…" : "儲存草稿"}
                </button>

                <button
                  onClick={handlePublish}
                  disabled={isPublishing || status === "published"}
                  className={`rounded-xl px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${ACCENT} ${ACCENT_HOVER}`}
                >
                  {isPublishing ? "發布中…" : status === "published" ? "已發布" : "發布"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="mx-auto max-w-4xl px-4 pb-28 pt-6 md:px-6 md:pb-10">
        <div className={`rounded-2xl border ${BORDER} ${CARD} shadow-sm`}>
          <div className="p-4 md:p-6">
            <input
              type="text"
              placeholder="輸入標題…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full bg-transparent text-2xl md:text-3xl font-semibold tracking-tight placeholder:${TEXT_MUTE} focus:outline-none`}
            />

            {/* ✅ AI 工具：插在標題下方 */}
            <AIPanel title={title} currentContent={content} postId={postId} onAppend={handleAppend} />

            <div className={`my-4 h-px ${BORDER} border-t`} />

            <textarea
              ref={textareaRef}
              placeholder="開始寫作…（你可以先寫大綱，之後再慢慢補肉）"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className={`min-h-[56vh] w-full resize-none bg-transparent text-base md:text-[17px] leading-8 placeholder:${TEXT_MUTE} focus:outline-none`}
            />

            <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 text-xs ${TEXT_SUB}`}>
              <div className="flex items-center gap-2">
                <span className={`rounded-full ${BG_SOFT} px-3 py-1`}>字數 {wordCount}</span>
                <span className={`rounded-full ${BG_SOFT} px-3 py-1`}>約 {approxMin} 分鐘</span>
              </div>

              <div className="flex items-center gap-2">
                <span className={`${TEXT_SUB}`}>作者顯示：{authorName}</span>
              </div>
            </div>
          </div>
        </div>

        <div className={`mt-4 rounded-2xl border ${BORDER} ${CARD} p-4 shadow-sm`}>
          <div className="text-sm font-medium">快捷操作</div>
          <div className={`mt-1 text-sm ${TEXT_SUB}`}>
            1) 在標題下方用 AI 生成建議段落　2) 先「儲存草稿」再發布　3) 發布後會出現在廣場
          </div>
        </div>
      </div>

      {/* Mobile Bottom Bar */}
      <div className={`fixed bottom-0 left-0 right-0 z-30 border-t ${BORDER} ${BG}/90 backdrop-blur md:hidden`}>
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-3">
          <button
            onClick={handleSave}
            disabled={isSaving || status === "published"}
            className={`flex-1 rounded-xl border ${BORDER} ${CARD} py-3 text-sm shadow-sm hover:${BG_SOFT} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isSaving ? "儲存中…" : "儲存"}
          </button>

          <button
            onClick={handlePublish}
            disabled={isPublishing || status === "published"}
            className={`flex-1 rounded-xl py-3 text-sm font-medium text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${ACCENT} ${ACCENT_HOVER}`}
          >
            {isPublishing ? "發布中…" : status === "published" ? "已發布" : "發布"}
          </button>
        </div>
      </div>
    </main>
  );
}