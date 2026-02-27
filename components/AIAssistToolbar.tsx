"use client";

import { useMemo, useState } from "react";

type ActionType = "start" | "continue" | "twist" | "intensify";
type LengthPreset = "short" | "medium" | "long";

type Props = {
  title: string;
  content: string;
  onApplyAppend: (text: string) => void;
};

const ACTIONS: Array<{ key: ActionType; label: string; hint: string }> = [
  { key: "start", label: "✨ 開頭", hint: "幫你寫第一段開頭" },
  { key: "continue", label: "➡️ 接續", hint: "延續你目前內容往下寫" },
  { key: "twist", label: "🔀 反轉", hint: "來個轉折/揭露/翻盤" },
  { key: "intensify", label: "🎭 情緒", hint: "把情緒、張力拉高" },
];

const CHIPS: Record<ActionType, string[]> = {
  start: ["雨天開場", "酒店/夜晚", "校園青春", "霸總登場", "黑道氣氛", "末日危機"],
  continue: ["衝突升級", "曖昧升溫", "打臉爽感", "危機逼近", "誤會加深", "反擊開始"],
  twist: ["秘密揭露", "身份反轉", "其實在演", "背叛出現", "翻盤時刻", "真相一擊"],
  intensify: ["壓抑爆發", "冷戰開打", "黑化前兆", "哭笑交錯", "狠話對峙", "直接掀桌"],
};

function cutRecent(text: string, n = 2200) {
  const t = (text || "").trim();
  if (!t) return "";
  return t.length <= n ? t : t.slice(-n);
}

function pickLastParagraph(text: string) {
  const t = (text || "").trim();
  if (!t) return "";
  const parts = t.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : t;
}

function lengthToChars(p: LengthPreset) {
  if (p === "short") return 220;
  if (p === "long") return 420;
  return 300;
}

export default function AIAssistToolbar({ title, content, onApplyAppend }: Props) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<ActionType>("continue");
  const [chip, setChip] = useState<string>("");
  const [custom, setCustom] = useState<string>("");
  const [len, setLen] = useState<LengthPreset>("medium");

  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string>("");
  const [error, setError] = useState<string>("");

  const isEmpty = useMemo(() => !(content || "").trim(), [content]);

  // 空白時自動切到 start；有內容時預設 continue
  const effectiveAction: ActionType = isEmpty ? "start" : action;

  const direction = useMemo(() => {
    const c = custom.trim();
    const parts = [chip, c].filter(Boolean);
    return parts.join("，");
  }, [chip, custom]);

  const hint = ACTIONS.find((a) => a.key === effectiveAction)?.hint ?? "";

  const handleGenerate = async () => {
    setError("");

    // ✅ 方向必填（你也可以改成：start 時允許空方向，但我建議先保留必填，品質更穩）
    if (!direction.trim()) {
      setError("請先選一個方向（或輸入一句自訂方向）");
      return;
    }

    setLoading(true);
    try {
      const recentContext = cutRecent(content, 2200);
      const lastParagraph = pickLastParagraph(content);

      const res = await fetch("/api/ai/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: effectiveAction,
          title: title || "",
          content: content || "",
          recentContext,
          lastParagraph,
          direction,
          targetChars: lengthToChars(len),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "生成失敗");
      }

      setSuggestion((data.text || "").trim());
    } catch (e: any) {
      setError(e?.message || "生成失敗，請稍後再試");
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!suggestion.trim()) return;
    onApplyAppend(suggestion.trim());
    setSuggestion("");
    // 這邊不關面板也可以；我先保留開著，方便連續生成
  };

  const regen = () => {
    setSuggestion("");
    handleGenerate();
  };

  return (
    <div className="mt-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-xl border border-[#D8D2C8] bg-[#F8F6F2] px-3 py-2 text-sm shadow-sm hover:bg-[#E9E4DC]"
        >
          ✨ AI 寫作工具
        </button>

        <div className="text-xs text-[#6B6B6B]">
          {isEmpty ? "內容空白：將生成「開頭」" : "有內容：可生成「接續/反轉/情緒」"} · {hint}
        </div>
      </div>

      {/* Popover panel */}
      {open && (
        <div className="mt-3 rounded-2xl border border-[#D8D2C8] bg-[#F8F6F2] p-4 shadow-sm">
          {/* Action row */}
          <div className="flex flex-wrap gap-2">
            {ACTIONS.map((a) => {
              const disabled = isEmpty && a.key !== "start"; // 空白只允許 start（v1 先這樣最穩）
              const active = effectiveAction === a.key;

              return (
                <button
                  key={a.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => setAction(a.key)}
                  className={[
                    "rounded-full border px-3 py-1.5 text-sm",
                    active ? "border-[#7A8C99] bg-white" : "border-[#D8D2C8] bg-transparent",
                    disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-[#E9E4DC]",
                  ].join(" ")}
                >
                  {a.label}
                </button>
              );
            })}
          </div>

          {/* Chips */}
          <div className="mt-3">
            <div className="text-xs text-[#6B6B6B]">方向（先選一個就很夠用了）</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {CHIPS[effectiveAction].map((c) => {
                const active = chip === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChip(active ? "" : c)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-sm",
                      active ? "border-[#7A8C99] bg-white" : "border-[#D8D2C8] bg-transparent hover:bg-[#E9E4DC]",
                    ].join(" ")}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom direction */}
          <div className="mt-3">
            <div className="text-xs text-[#6B6B6B]">自訂補充（可選）</div>
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="例如：主角壓抑情緒終於爆發，但嘴硬不承認"
              className="mt-2 w-full rounded-xl border border-[#D8D2C8] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#7A8C99]/30"
            />
          </div>

          {/* Length */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="text-xs text-[#6B6B6B]">字數</div>
            {(["short", "medium", "long"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setLen(p)}
                className={[
                  "rounded-full border px-3 py-1.5 text-sm",
                  len === p ? "border-[#7A8C99] bg-white" : "border-[#D8D2C8] bg-transparent hover:bg-[#E9E4DC]",
                ].join(" ")}
              >
                {p === "short" ? "短" : p === "medium" ? "中" : "長"}
              </button>
            ))}
          </div>

          {/* Generate */}
          <div className="mt-4">
            {error && <div className="mb-2 text-sm text-red-600">{error}</div>}

            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="w-full rounded-2xl bg-[#7A8C99] px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-[#6C7E8B] disabled:opacity-50"
            >
              {loading ? "生成中…" : "生成一段建議"}
            </button>
          </div>

          {/* Suggestion card */}
          {suggestion && (
            <div className="mt-4 rounded-2xl border border-[#D8D2C8] bg-white p-3">
              <div className="text-sm font-medium">建議段落</div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#2F2F2F]">
                {suggestion}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={apply}
                  className="rounded-xl bg-[#7A8C99] px-3 py-2 text-sm text-white hover:bg-[#6C7E8B]"
                >
                  ✅ 套用到文章（append）
                </button>

                <button
                  type="button"
                  onClick={regen}
                  className="rounded-xl border border-[#D8D2C8] bg-[#F8F6F2] px-3 py-2 text-sm hover:bg-[#E9E4DC]"
                >
                  ♻️ 再來一段
                </button>

                <button
                  type="button"
                  onClick={() => setSuggestion("")}
                  className="rounded-xl border border-[#D8D2C8] bg-transparent px-3 py-2 text-sm hover:bg-[#E9E4DC]"
                >
                  ❌ 丟掉
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}