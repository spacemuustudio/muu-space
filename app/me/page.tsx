"use client";

import {
  useEffect,
  useState,
  FormEvent,
  ChangeEvent,
} from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "../components/AuthProvider";

type FirestoreTimestamp = {
  seconds: number;
  nanoseconds: number;
};

type RecentEntry = {
  id: string;
  text: string;
  createdAt?: FirestoreTimestamp | null;
  userId?: string | null;
  views?: number;
};

type Comment = {
  id: string;
  text: string;
  author: string;
  createdAt?: FirestoreTimestamp | null;
};

// ========= 小工具們 =========

// 時間顯示（完整時間）
const formatTimestamp = (ts?: FirestoreTimestamp | null) => {
  if (!ts || typeof ts.seconds !== "number") return "";
  const date = new Date(ts.seconds * 1000);
  return date.toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// 是否在 72 小時內
const isWithin72Hours = (ts?: FirestoreTimestamp | null) => {
  if (!ts || typeof ts.seconds !== "number") return false;
  const createdMs =
    ts.seconds * 1000 + (ts.nanoseconds ?? 0) / 1_000_000;
  const diff = Date.now() - createdMs;
  const limit = 72 * 60 * 60 * 1000;
  return diff <= limit;
};

// 顯示「幾分鐘前 / 幾小時前 / 昨天 / 幾天前」
const formatRelativeTime = (ts?: FirestoreTimestamp | null) => {
  if (!ts || typeof ts.seconds !== "number") return "";
  const createdMs =
    ts.seconds * 1000 + (ts.nanoseconds ?? 0) / 1_000_000;
  const diff = Date.now() - createdMs;

  const minutes = Math.floor(diff / (60 * 1000));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  if (hours < 24) return `${hours} 小時前`;
  if (days === 1) return "昨天";
  return `${days} 天前`;
};

// 暱稱（跟故事牆一樣邏輯）
const getCurrentUserNickname = () => {
  if (typeof window === "undefined") return "訪客";
  return localStorage.getItem("muu_nickname") || "訪客";
};

export default function RecentSelfPage() {
  const { user, loading } = useAuth();

  const [text, setText] = useState("");
  const [entries, setEntries] = useState<RecentEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [activeEntry, setActiveEntry] = useState<RecentEntry | null>(
    null
  );
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] =
    useState(false);

  // 監聽所有 recentSelf（依 views desc, createdAt desc 排序）
  useEffect(() => {
    const ref = collection(db, "recentSelf");
    const q = query(
      ref,
      orderBy("views", "desc"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: RecentEntry[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<RecentEntry, "id">),
      }));
      // 只留下 72 小時內的
      setEntries(list.filter((e) => isWithin72Hours(e.createdAt)));
    });

    return () => unsub();
  }, []);

  // 監聽某一則最近的自己的留言
  useEffect(() => {
    if (!activeEntry) {
      setComments([]);
      return;
    }

    const ref = collection(
      db,
      "recentSelf",
      activeEntry.id,
      "comments"
    );
    const q = query(ref, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snapshot) => {
      const list: Comment[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Comment, "id">),
      }));
      setComments(list);
    });

    return () => unsub();
  }, [activeEntry]);

  // 新增一則最近的自己
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !user) return;

    setSubmitting(true);
    try {
      const ref = collection(db, "recentSelf");
      await addDoc(ref, {
        text: text.trim(),
        createdAt: serverTimestamp(),
        userId: user.uid,
        views: 0,
      });
      setText("");
    } catch (err) {
      console.error("新增最近的自己失敗", err);
      alert("寫入失敗，等等再試試看 QQ");
    } finally {
      setSubmitting(false);
    }
  };

  // 點開：開 modal + views +1
  const handleOpenEntry = async (entry: RecentEntry) => {
    setActiveEntry(entry);

    try {
      const ref = doc(db, "recentSelf", entry.id);
      await updateDoc(ref, {
        views: (entry.views ?? 0) + 1,
      });
    } catch (err) {
      console.error("更新瀏覽次數失敗", err);
    }
  };

  const handleCommentInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setNewComment(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  // 新增留言
  const handleAddComment = async () => {
    if (!activeEntry || !newComment.trim()) return;

    try {
      setIsSubmittingComment(true);
      const ref = collection(
        db,
        "recentSelf",
        activeEntry.id,
        "comments"
      );
      await addDoc(ref, {
        text: newComment.trim(),
        author: getCurrentUserNickname(),
        createdAt: serverTimestamp(),
      });
      setNewComment("");
    } catch (err) {
      console.error("新增留言失敗", err);
      alert("留言失敗，等等再試一次 QQ");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-[color:var(--text-subtle)]">
        正在為你打開最近的自己…
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[color:var(--bg-main)] text-[color:var(--text-main)]">
      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* 標題區 */}
        <header className="mb-8">
          <p className="text-sm tracking-[0.2em] text-[color:var(--text-subtle)]">
            MUU SPACE · 最近的自己
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl font-semibold font-['Noto_Serif_TC']">
            最近的自己，停一下
          </h1>
          <p className="mt-2 text-sm md:text-base text-[color:var(--text-subtle)]">
            這裡是大家最近 72 小時的狀態，有些話可能還很新，有些情緒正在慢慢消散。
            如果你剛好也卡在什麼地方，可以寫下來，或在別人的文字下面留一句話。
          </p>
        </header>

        {/* 輸入區 */}
        <section className="mb-8 rounded-2xl border border-[color:var(--border-soft)] bg-[color:var(--bg-card)]/90 shadow-sm backdrop-blur-sm p-5 md:p-6">
          <h2 className="text-lg	font-medium mb-3 font-['Noto_Serif_TC']">
            想寫下一點「現在的你」嗎？
          </h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              className="w-full min-h-[120px] rounded-xl border border-[color:var(--border-soft)] bg-[color:var(--bg-main)]/60 px-3 py-2 text-sm leading-relaxed outline-none focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)] transition resize-y"
              placeholder="最近讓你放不下的一件事、某個畫面、一句話，或只是現在的心情。"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex items-center justify-between pt-1 gap-3">
              <p className="text-xs text-[color:var(--text-subtle)]">
                這裡的內容會公開出現在「最近的自己」，但只會停留 72 小時，之後就會慢慢淡掉。
              </p>
              <button
                type="submit"
                disabled={submitting || !text.trim()}
                className="inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium shadow-sm 
                           bg-[color:var(--accent)] text-[color:var(--bg-card)]
                           disabled:opacity-60 disabled:cursor-not-allowed
                           hover:brightness-105 active:scale-[0.98] transition"
              >
                {submitting ? "寫入中…" : "記下最近的自己"}
              </button>
            </div>
          </form>
        </section>

        {/* 列表區：72 小時內的紀錄（漂浮便條 Masonry） */}
        <section className="mt-6">
          {entries.length === 0 ? (
            <p className="text-sm text-[color:var(--text-subtle)]">
              這 72 小時裡，還沒有任何被寫下的最近的自己。你可以成為第一個在這裡留下一段話的人。
            </p>
          ) : (
            <div className="columns-1 sm:columns-2 gap-4 space-y-4">
              {entries.map((entry) => (
                <article
                  key={entry.id}
                  className="mb-4 break-inside-avoid rounded-2xl border border-[color:var(--border-soft)]
                             bg-[color:var(--bg-card)]/95 shadow-sm px-4 py-3 md:px-5 md:py-4
                             cursor-pointer hover:-translate-y-0.5 hover:shadow-md transition"
                  onClick={() => handleOpenEntry(entry)}
                >
                  {/* 上側小列：相對時間 + 標籤 */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-medium tracking-wide text-[color:var(--text-subtle)]">
                      {formatRelativeTime(entry.createdAt)}
                    </span>
                    <span className="rounded-full bg-[color:var(--accent-soft)] px-2 py-0.5 text-[10px] text-[color:var(--text-subtle)]">
                      最近的自己
                    </span>
                  </div>

                  {/* 便條文字本體 */}
                  <p className="text-sm text-[color:var(--text-main)] whitespace-pre-wrap leading-relaxed">
                    {entry.text}
                  </p>

                  {/* 底部小資訊 */}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-[color:var(--text-subtle)]">
                    <span>{formatTimestamp(entry.createdAt) || "剛剛"}</span>
                    <span>被看過 {entry.views ?? 0} 次</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 展開全文 + 留言 Modal */}
      {activeEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center
                     bg-black/40 backdrop-blur-sm px-4"
          onClick={() => setActiveEntry(null)}
        >
          <div
            className="relative bg-[color:var(--bg-card)] rounded-3xl shadow-2xl
                       max-w-2xl w-[90%] md:w-[640px]
                       p-6 md:p-8 max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 關閉按鈕 */}
            <button
              aria-label="關閉"
              className="absolute right-4 top-4 text-[color:var(--text-subtle)]/60 hover:text-[color:var(--text-subtle)]
                         text-xl leading-none"
              onClick={() => setActiveEntry(null)}
            >
              ×
            </button>

            <div className="flex flex-col max-h-[82vh]">
              {/* 內容 + 留言列表 */}
              <div className="flex-1 overflow-y-auto pr-1">
                <p className="text-[11px] text-[color:var(--text-subtle)] mb-1">
                  {formatTimestamp(activeEntry.createdAt)}
                </p>
                <p className="text-sm md:text-[15px] text-[color:var(--text-main)] leading-relaxed whitespace-pre-wrap mb-6">
                  {activeEntry.text}
                </p>

                <section className="border-t border-[color:var(--border-soft)] pt-4">
                  <h3 className="text-lg font-medium mb-3 font-['Noto_Serif_TC']">
                    留言
                  </h3>
                  <div className="space-y-3">
                    {comments.length === 0 ? (
                      <p className="text-[13px] text-[color:var(--text-subtle)]">
                        還沒有留言，如果你有什麼想對這段話說的，可以留下一句話陪他。
                      </p>
                    ) : (
                      comments.map((c) => (
                        <div
                          key={c.id}
                          className="bg-[color:var(--bg-main)]/70 rounded-xl px-3 py-2.5 text-sm"
                        >
                          <div className="flex items-baseline justify-between mb-1">
                            <span className="font-medium text-[color:var(--text-main)]">
                              {c.author}
                            </span>
                            <span className="text-[11px] text-[color:var(--text-subtle)]">
                              {formatTimestamp(c.createdAt)}
                            </span>
                          </div>
                          <p className="text-[color:var(--text-main)] whitespace-pre-wrap">
                            {c.text}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              {/* 留言輸入區 */}
              <div className="mt-4 pt-3 border-t border-[color:var(--border-soft)]">
                <div className="flex items-end gap-2">
                  <textarea
                    className="flex-1 rounded-2xl border border-[color:var(--border-soft)] 
                               px-3 py-2 text-sm resize-none
                               bg-[color:var(--bg-main)]/70
                               focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)]
                               min-h-[40px] max-h-[120px] overflow-y-auto"
                    rows={1}
                    placeholder="想對這段最近的自己說點什麼嗎？"
                    value={newComment}
                    onChange={handleCommentInput}
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={
                      isSubmittingComment || newComment.trim() === ""
                    }
                    className="px-4 py-2 rounded-full text-sm
                               bg-[color:var(--accent)] text-[color:var(--bg-card)]
                               hover:brightness-105
                               disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {isSubmittingComment ? "送出中…" : "留言"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
