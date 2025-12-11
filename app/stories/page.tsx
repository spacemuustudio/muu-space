"use client";

import { useEffect, useState, FormEvent, ChangeEvent } from "react";
import {
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
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

type Story = {
  id: string;
  title: string;
  content: string;
  createdAt?: FirestoreTimestamp | null;
  views?: number;
  userId?: string | null;
};

type Comment = {
  id: string;
  text: string;
  author: string;
  createdAt?: FirestoreTimestamp | null;
};

// 格式化 Firestore 的時間
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

// 取得目前登入使用者的暱稱（請在登入時寫入 localStorage）
const getCurrentUserNickname = () => {
  if (typeof window === "undefined") return "訪客";
  return localStorage.getItem("muu_nickname") || "訪客";
};

export default function StoriesPage() {
  const { user } = useAuth(); // ✅ 拿到匿名登入的 user.uid

  const [stories, setStories] = useState<Story[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmittingStory, setIsSubmittingStory] = useState(false);

  const [activeStory, setActiveStory] = useState<Story | null>(null);

  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // 監聽 stories（依照 views desc -> createdAt desc 排序）
  useEffect(() => {
    const storiesRef = collection(db, "stories");
    const q = query(
      storiesRef,
      orderBy("views", "desc"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Story[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Story, "id">),
      }));
      setStories(data);
    });

    return () => unsubscribe();
  }, []);

  // 當打開某一則故事時，監聽它的 comments subcollection
  useEffect(() => {
    if (!activeStory) {
      setComments([]);
      return;
    }

    const commentsRef = collection(
      db,
      "stories",
      activeStory.id,
      "comments"
    );
    const q = query(commentsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Comment[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Comment, "id">),
      }));
      setComments(data);
    });

    return () => unsubscribe();
  }, [activeStory]);

  // 點開故事：開 modal + views +1
  const handleOpenStory = async (story: Story) => {
    setActiveStory(story);

    try {
      const storyRef = doc(db, "stories", story.id);
      await updateDoc(storyRef, {
        views: (story.views ?? 0) + 1,
      });
    } catch (error) {
      console.error("更新瀏覽次數失敗：", error);
    }
  };

  // 新增故事
  const handleSubmitStory = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    try {
      setIsSubmittingStory(true);
      const storiesRef = collection(db, "stories");
      await addDoc(storiesRef, {
        title: title.trim(),
        content: content.trim(),
        createdAt: serverTimestamp(),
        views: 0,
        userId: user?.uid ?? null, // ✅ 把發文的人記起來
      });

      setTitle("");
      setContent("");
    } catch (error) {
      console.error("新增故事失敗：", error);
      alert("新增故事失敗，等等再試一次 QQ");
    } finally {
      setIsSubmittingStory(false);
    }
  };

  // 新增留言
  const handleAddComment = async () => {
    if (!activeStory || !newComment.trim()) return;

    try {
      setIsSubmittingComment(true);
      const commentsRef = collection(
        db,
        "stories",
        activeStory.id,
        "comments"
      );
      await addDoc(commentsRef, {
        text: newComment.trim(),
        author: getCurrentUserNickname(),
        createdAt: serverTimestamp(),
      });

      setNewComment("");
    } catch (error) {
      console.error("新增留言失敗：", error);
      alert("留言失敗，等等再試一次 QQ");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleCommentInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setNewComment(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const formatStoryTime = (story: Story) =>
    formatTimestamp(story.createdAt) || "剛剛";

  return (
    <main className="min-h-screen bg-[color:var(--bg-main)] text-[color:var(--text-main)]">
      <div className="mx-auto max-w-4xl px-4 py-10">
        {/* 標題區 */}
        <header className="mb-8">
          <p className="text-sm tracking-[0.2em] text-[color:var(--text-subtle)]">
            MUU SPACE · 故事牆
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl font-semibold font-['Noto_Serif_TC']">
            關於生活的那些小片段
          </h1>
          <p className="mt-2 text-sm md:text-base text-[color:var(--text-subtle)]">
            有時候不是要多厲害的故事，只是想把今天卡在心裡的一角，換個地方放。
          </p>
        </header>

        {/* 新增故事表單 */}
        <section className="mb-10 rounded-2xl border border-[color:var(--border-soft)] bg-[color:var(--bg-card)]/90 shadow-sm backdrop-blur-sm p-5 md:p-6">
          <h2 className="text-lg font-medium mb-3 font-['Noto_Serif_TC']">
            想不想，寫一點今天的自己？
          </h2>
          <form onSubmit={handleSubmitStory} className="space-y-3">
            <input
              type="text"
              placeholder="故事標題，例如：『在公車上差點哭出來的那一站』"
              className="w-full rounded-xl border border-[color:var(--border-soft)] bg-[color:var(--bg-main)]/60 px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)] transition"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              placeholder="可以寫一點發生了什麼、你當下在想什麼、現在回頭看又有什麼不一樣⋯⋯"
              className="w-full min-h-[120px] rounded-xl border border-[color:var(--border-soft)] bg-[color:var(--bg-main)]/60 px-3 py-2 text-sm leading-relaxed outline-none focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)] transition resize-y"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="flex items-center justify-between pt-1 gap-3">
              <p className="text-xs text-[color:var(--text-subtle)]">
                這裡的故事會出現在下方「故事牆」，讓別人也看見原來他不是唯一那麼難熬的人。
              </p>
              <button
                type="submit"
                disabled={
                  isSubmittingStory ||
                  !title.trim() ||
                  !content.trim()
                }
                className="inline-flex items-center rounded-full px-4 py-1.5 text-sm font-medium shadow-sm 
                           bg-[color:var(--accent)] text-[color:var(--bg-card)]
                           disabled:opacity-60 disabled:cursor-not-allowed
                           hover:brightness-105 active:scale-[0.98] transition"
              >
                {isSubmittingStory ? "正在送出…" : "送出故事"}
              </button>
            </div>
          </form>
        </section>

        {/* 故事牆 */}
        <section>
          {stories.length === 0 ? (
            <p className="text-sm text-[color:var(--text-subtle)]">
              還沒有任何故事。要不要試試看，成為這面牆上的第一個人？
            </p>
          ) : (
            <div className="grid gap-4 md:gap-5 md:grid-cols-2">
              {stories.map((story) => (
                <article
                  key={story.id}
                  className="group relative flex flex-col rounded-2xl border border-[color:var(--border-soft)] bg-[color:var(--bg-card)]/95 shadow-sm p-4 md:p-5 hover:-translate-y-0.5 hover:shadow-md transition cursor-pointer"
                  onClick={() => handleOpenStory(story)}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-base md:text-lg font-semibold font-['Noto_Serif_TC'] line-clamp-2">
                      {story.title}
                    </h3>
                    <span className="shrink-0 rounded-full bg-[color:var(--accent-soft)] px-2 py-0.5 text-[10px] text-[color:var(--text-subtle)]">
                      {formatStoryTime(story)}
                    </span>
                  </div>
                  <p className="text-sm text-[color:var(--text-subtle)] leading-relaxed line-clamp-5 whitespace-pre-wrap">
                    {story.content}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-[color:var(--text-subtle)]">
                    <span>有人在這裡停留過一下下。</span>
                    <button
                      type="button"
                      className="text-[11px] underline-offset-2 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenStory(story);
                      }}
                    >
                      展開全文
                    </button>
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[color:var(--bg-card)] to-transparent opacity-0 group-hover:opacity-100 transition" />
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 展開全文 + 留言的 Modal */}
      {activeStory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center
                     bg-black/40 backdrop-blur-sm px-4"
          onClick={() => setActiveStory(null)}
        >
          <div
            className="relative bg-[color:var(--bg-card)] rounded-3xl shadow-2xl
                       max-w-2xl w-[90%] md:w-[640px]
                       p-6 md:p-8 max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="關閉"
              className="absolute right-4 top-4 text-[color:var(--text-subtle)]/60 hover:text-[color:var(--text-subtle)]
                         text-xl leading-none"
              onClick={() => setActiveStory(null)}
            >
              ×
            </button>

            <div className="flex flex-col max-h-[82vh]">
              <div className="flex-1 overflow-y-auto pr-1">
                <p className="text-[11px] text-[color:var(--text-subtle)] mb-1">
                  {formatStoryTime(activeStory)}
                </p>
                <h2 className="text-2xl font-semibold mb-4 font-['Noto_Serif_TC'] whitespace-pre-wrap">
                  {activeStory.title}
                </h2>

                <p className="text-sm md:text-[15px] text-[color:var(--text-main)] leading-relaxed whitespace-pre-wrap mb-6">
                  {activeStory.content}
                </p>

                <section className="border-t border-[color:var(--border-soft)] pt-4">
                  <h3 className="text-lg font-medium mb-3 font-['Noto_Serif_TC']">
                    留言
                  </h3>
                  <div className="space-y-3">
                    {comments.length === 0 ? (
                      <p className="text-[13px] text-[color:var(--text-subtle)]">
                        還沒有留言，可以成為第一個留下腳印的人。
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

              <div className="mt-4 pt-3 border-t border-[color:var(--border-soft)]">
                <div className="flex items-end gap-2">
                  <textarea
                    className="flex-1 rounded-2xl border border-[color:var(--border-soft)] 
                               px-3 py-2 text-sm resize-none
                               bg-[color:var(--bg-main)]/70
                               focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-soft)]
                               min-h-[40px] max-h-[120px] overflow-y-auto"
                    rows={1}
                    placeholder="想對這段分享說點什麼嗎？"
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
