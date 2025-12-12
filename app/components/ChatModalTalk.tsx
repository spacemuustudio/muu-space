"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";
type Msg = { id: string; role: Role; text: string };

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function ChatModalTalk() {
  // 首頁那個「先輸入」的小框 + modal 裡的輸入框（共用）
  const [draft, setDraft] = useState("");

  // Modal 狀態
  const [open, setOpen] = useState(false);

  // 聊天記錄
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const listRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(
    () => !loading && draft.trim().length > 0,
    [loading, draft]
  );

  // 每次新訊息或 loading 改變，就自動捲到底
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading, open]);

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || loading) return;

    setErr("");
    setLoading(true);

    // ✅ 這次送出前的「使用者輪次」
    // messages 內含 user/assistant，所以要只數 user
    const nextTurn = messages.reduce((acc, m) => acc + (m.role === "user" ? 1 : 0), 0) + 1;

    // 1) 先把使用者訊息塞進去（UI 立即出現）
    const userMsg: Msg = { id: uid(), role: "user", text: clean };
    setMessages((prev) => [...prev, userMsg]);

    // 2) 開 modal
    setOpen(true);

    try {
      const res = await fetch("/api/talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: clean,
          turn: nextTurn,
        }),
      });

      const data: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErr(data?.error ?? "發生錯誤");
        return;
      }

      const replyText = String(data?.reply ?? "").trim();
      if (!replyText) {
        setErr("模型沒有回覆內容");
        return;
      }

      const aiMsg: Msg = { id: uid(), role: "assistant", text: replyText };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
      setDraft("");
    }
  };

  const onSubmit = () => {
    if (!canSend) return;
    void send(draft);
  };

  const resetChat = () => {
    setMessages([]);
    setErr("");
    setDraft("");
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      {/* 首頁輸入框（送出後跳 modal） */}
      <div className="rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-card)] p-4 shadow-sm">
        <div className="text-sm text-[var(--text-subtle)] mb-2">
          和我們說說（不公開）
        </div>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="先把心裡那坨丟出來也行…"
          className="w-full min-h-[120px] rounded-xl border border-[var(--border-soft)] bg-white p-3 outline-none focus:ring-2"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onSubmit();
          }}
        />

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onSubmit}
            disabled={!canSend}
            className="rounded-xl px-4 py-2 bg-[var(--accent)] text-[var(--text-main)] disabled:opacity-50"
          >
            {loading ? "回覆中…" : "送出"}
          </button>

          <button
            onClick={() => setOpen(true)}
            className="rounded-xl px-4 py-2 border border-[var(--border-soft)]"
          >
            打開對話
          </button>

          <button
            onClick={resetChat}
            className="ml-auto rounded-xl px-4 py-2 border border-[var(--border-soft)]"
          >
            清空對話
          </button>
        </div>
      </div>

      {/* Modal Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-card)] shadow-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-soft)]">
              <div>
                <div className="text-base font-semibold text-[var(--text-main)]">
                  muu space 對話
                </div>
                <div className="text-xs text-[var(--text-subtle)]">
                  每次回覆會是一段文字，但裡面分成三段
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={resetChat}
                  className="rounded-xl px-3 py-1.5 border border-[var(--border-soft)] text-sm"
                >
                  清空
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-1.5 bg-[var(--accent-soft)] text-sm"
                >
                  關閉
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={listRef}
              className="h-[60vh] overflow-y-auto px-4 py-4 space-y-3 bg-[var(--bg-main)]"
            >
              {messages.length === 0 && (
                <div className="text-sm text-[var(--text-subtle)]">
                  你可以先從一句話開始：<span className="italic">「我最近…」</span>
                </div>
              )}

              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={[
                      "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed border",
                      m.role === "user"
                        ? "bg-white border-[var(--border-soft)]"
                        : "bg-[var(--bg-card)] border-[var(--border-soft)]",
                    ].join(" ")}
                  >
                    {/* ✅ 保留換行：後端回覆用 \n\n 分三段就會顯示成三段 */}
                    <div className="whitespace-pre-wrap">{m.text}</div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm border border-[var(--border-soft)] bg-[var(--bg-card)]">
                    <span className="text-[var(--text-subtle)]">正在回覆…</span>
                  </div>
                </div>
              )}

              {err && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {err}
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="px-4 py-3 border-t border-[var(--border-soft)] bg-[var(--bg-card)]">
              <div className="flex gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="繼續說也行…（Ctrl/⌘ + Enter 送出）"
                  className="flex-1 min-h-[44px] max-h-[140px] rounded-xl border border-[var(--border-soft)] bg-white p-3 outline-none focus:ring-2"
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onSubmit();
                  }}
                />
                <button
                  onClick={onSubmit}
                  disabled={!canSend}
                  className="shrink-0 rounded-xl px-4 py-2 bg-[var(--accent)] text-[var(--text-main)] disabled:opacity-50"
                >
                  送出
                </button>
              </div>

              <div className="mt-2 text-xs text-[var(--text-subtle)]">
                小提示：AI 會用一則回覆，但分成三段；如果只出一段，就代表後端格式還沒鎖好。
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
