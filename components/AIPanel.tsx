"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AIPanelProps = {
  title: string;
  currentContent: string;
  onAppend: (text: string) => void;

  // ✅ 兼容你現在 cool-studio/page.tsx 傳 postId（不一定會用到）
  postId?: string;
};

type ModeKey = "開頭" | "接續" | "反轉" | "情緒" | "其他";

const MORANDI = {
  BG_SOFT: "bg-[#E9E4DC]",
  CARD: "bg-[#F8F6F2]",
  BORDER: "border-[#D8D2C8]",
  TEXT_SUB: "text-[#6B6B6B]",
  TEXT_MUTE: "text-[#8A8A8A]",
  ACCENT: "bg-[#7A8C99]",
  ACCENT_HOVER: "hover:bg-[#6C7E8B]",
};

function clampText(s: string, maxChars: number) {
  const t = (s || "").trim();
  if (t.length <= maxChars) return t;
  return t.slice(t.length - maxChars);
}

function getLastParagraph(content: string) {
  const parts = (content || "")
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || "";
}

function getLastSentence(paragraph: string) {
  const p = (paragraph || "").trim();
  if (!p) return "";
  // 用常見中文/英文句點分隔抓最後一句
  const chunks = p.split(/(?<=[。！？!?…])\s*/g).filter(Boolean);
  const last = chunks[chunks.length - 1] || p;
  return last.trim();
}

function uniqChips(arr: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr.map((s) => s.trim()).filter(Boolean)) {
    const k = x.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function Chip({
  label,
  active,
  onClick,
  title,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const base =
    "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm shadow-sm transition select-none";
  const normal = `bg-white border-[#D8D2C8] text-[#2F2F2F] hover:bg-[#E9E4DC]`;
  const activeCls = `bg-[#E2D8CC] border-[#CBBFB2] text-[#2F2F2F] ring-2 ring-[#7A8C99]/20`;
  return (
    <button
      type="button"
      className={`${base} ${active ? activeCls : normal}`}
      onClick={onClick}
      title={title}
    >
      {label}
    </button>
  );
}

function ChipInput({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const commit = () => {
    const val = v.trim();
    if (!val) {
      setOpen(false);
      setV("");
      return;
    }
    onAdd(val);
    setV("");
    setOpen(false);
  };

  return (
    <span className="inline-flex items-center gap-2">
      {!open ? (
        <Chip label="＋ 其他" onClick={() => setOpen(true)} title="新增自訂方向" />
      ) : (
        <span className="inline-flex items-center gap-2">
          <input
            ref={inputRef}
            value={v}
            onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                setV("");
              }
            }}
            placeholder={placeholder}
            className="h-9 w-[180px] rounded-xl border border-[#D8D2C8] bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#7A8C99]/30"
          />
          <button
            type="button"
            onClick={commit}
            className="h-9 rounded-xl border border-[#D8D2C8] bg-[#F8F6F2] px-3 text-sm shadow-sm hover:bg-[#E9E4DC]"
          >
            加入
          </button>
        </span>
      )}
    </span>
  );
}

export default function AIPanel({ title, currentContent, onAppend }: AIPanelProps) {
  // ✅ 工具總開關（你要的左上角按鈕）
  const [toolOpen, setToolOpen] = useState(true);

  // 故事設定
  const [storyOpen, setStoryOpen] = useState(false);
  const [storySetting, setStorySetting] = useState("");
  const [storyLocked, setStoryLocked] = useState(false);

  // 模式（第一層）
  const [mode, setMode] = useState<ModeKey>("接續");

  // 第二層方向 chips
  const [selectedDirs, setSelectedDirs] = useState<string[]>([]);
  const [customDirs, setCustomDirs] = useState<string[]>([]);

  // 自訂細節（不要跟方向重複）
  const [details, setDetails] = useState("");

  // 提示（規則/偏好）
  const [hint, setHint] = useState("");

  // 長度
  const [lenKey, setLenKey] = useState<"短" | "中" | "長">("中");
  const targetChars = useMemo(() => {
    if (lenKey === "短") return 220;
    if (lenKey === "長") return 420;
    return 320;
  }, [lenKey]);

  // 結果
  const [result, setResult] = useState("");
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 冷卻（避免狂點）
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);

  const lastParagraph = useMemo(() => getLastParagraph(currentContent), [currentContent]);
  const lastSentence = useMemo(() => getLastSentence(lastParagraph), [lastParagraph]);

  const contentOk = useMemo(() => {
    const c = (currentContent || "").trim();
    // 至少幾句，避免模型亂寫
    return c.replace(/\s+/g, "").length >= 30 && lastParagraph.trim().length >= 10;
  }, [currentContent, lastParagraph]);

  const MODE_HINT: Record<ModeKey, string> = {
    開頭: "適合：建立場景、人物、鉤子。避免一下跳太多設定。",
    接續: "必須承接上一段「最後一句」的狀態，不要跳場景。",
    反轉: "先讓讀者相信某件事，再用小伏筆翻轉；別硬扭。",
    情緒: "用感官與動作推進情緒，避免純講道理。",
    其他: "你可以用自訂方向/細節把想法說清楚。",
  };

  const DIR_PRESETS: Record<ModeKey, string[]> = {
    開頭: ["世界觀鉤子", "角色出場", "危機埋伏", "先甜後刀", "開場衝突"],
    接續: ["緊張拉滿", "暖味升溫", "爆氣/崩裂", "危機逼近", "誤會加深", "節奏加快"],
    反轉: ["假象揭露", "身份反轉", "立場翻盤", "伏筆回收", "背叛出現"],
    情緒: ["壓抑", "崩潰", "羞恥", "狂喜", "心死", "希望萌芽"],
    其他: ["更黑一點", "更甜一點", "更快一點", "更狠一點"],
  };

  const allDirChips = useMemo(() => {
    const presets = DIR_PRESETS[mode] || [];
    return presets;
  }, [mode]);

  function toggleDir(label: string) {
    setSelectedDirs((prev) => {
      const has = prev.includes(label);
      if (has) return prev.filter((x) => x !== label);
      return [...prev, label];
    });
  }

  function removeCustomDir(label: string) {
    setCustomDirs((prev) => prev.filter((x) => x !== label));
  }

  const directionString = useMemo(() => {
    const dirs = uniqChips([...selectedDirs, ...customDirs]);
    const parts: string[] = [];

    // 第一層（模式）
    if (mode && mode !== "其他") parts.push(`模式：${mode}`);

    // 第二層（方向）
    if (dirs.length) parts.push(`方向：${dirs.join("、")}`);

    // 細節
    if (details.trim()) parts.push(`細節：${details.trim()}`);

    // 提示/偏好
    if (hint.trim()) parts.push(`提示：${hint.trim()}`);

    // 故事設定
    if (storySetting.trim()) {
      parts.push(
        storyLocked
          ? `故事設定（必須遵守，不可違反）：${storySetting.trim()}`
          : `故事設定（盡量遵守）：${storySetting.trim()}`
      );
    }

    return parts.join("\n");
  }, [mode, selectedDirs, customDirs, details, hint, storySetting, storyLocked]);

  const canGenerate = useMemo(() => {
    if (loading) return false;
    if (Date.now() < cooldownUntil) return false;
    if (!contentOk) return false;
    // directionString 至少要有「方向/細節/提示/故事設定」任一個
    return directionString.trim().length > 0;
  }, [loading, cooldownUntil, contentOk, directionString]);

  async function handleGenerate() {
    // ✅ 每次生成先清掉上一輪錯誤
    setError(null);
    setModelUsed(null);

    if (!contentOk) {
      setError("內容不足無法生成（至少先寫幾句，並要有完整上一段）");
      return;
    }
    if (!directionString.trim()) {
      setError("請選方向或輸入細節（至少填一項）");
      return;
    }

    setLoading(true);
    setResult("");

    try {
      const recentContext = clampText(currentContent, 2000);

      const res = await fetch("/api/ai/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || "",
          recentContext,
          lastParagraph: lastParagraph || "",
          direction: directionString,
          targetChars,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data?.ok) {
        setError(data?.error || `生成失敗（${res.status}）`);
        return;
      }

      const text = (data?.text || "").trim();
      if (!text) {
        setError("生成內容為空");
        return;
      }

      setResult(text);
      if (data?.modelUsed) setModelUsed(String(data.modelUsed));

      // ✅ 冷卻 700ms（防連點）
      setCooldownUntil(Date.now() + 700);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`mt-4 rounded-2xl border ${MORANDI.BORDER} ${MORANDI.CARD} shadow-sm`}>
      {/* 工具 header：左上角按鈕 + 右側描述 */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
        <button
          type="button"
          onClick={() => setToolOpen((v) => !v)}
          className={`inline-flex items-center gap-2 rounded-xl border ${MORANDI.BORDER} bg-white px-3 py-2 text-sm shadow-sm hover:${MORANDI.BG_SOFT}`}
          title="顯示/隱藏 AI 寫作工具"
        >
          ✨ AI 寫作工具
          <span className={`${MORANDI.TEXT_SUB}`}>{toolOpen ? "收起" : "展開"}</span>
        </button>

        <div className={`hidden md:block text-xs ${MORANDI.TEXT_SUB}`}>
          有內容：可生成「開頭/接續/反轉/情緒」；重點是延續你目前內容往下寫
        </div>
      </div>

      {!toolOpen ? null : (
        <div className="px-4 pb-5 md:px-6">
          {/* 故事設定（可收合） */}
          <div className={`rounded-2xl border ${MORANDI.BORDER} bg-white p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">📌 故事設定（強烈建議填）</div>
                <div className={`mt-0.5 text-xs ${MORANDI.TEXT_SUB} truncate`}>
                  {storySetting.trim()
                    ? "你填了之後，生成會更連貫、更不跳戲。"
                    : "（目前未設定）→ 你填了之後，生成會更連貫、更不跳戲。"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={storyLocked}
                    onChange={(e) => setStoryLocked(e.target.checked)}
                  />
                  <span className={MORANDI.TEXT_SUB}>鎖定（更嚴格）</span>
                </label>
                <button
                  type="button"
                  onClick={() => setStoryOpen((v) => !v)}
                  className={`rounded-full border ${MORANDI.BORDER} bg-[#F8F6F2] px-3 py-1 text-xs shadow-sm hover:${MORANDI.BG_SOFT}`}
                >
                  {storyOpen ? "收起" : "展開"}
                </button>
              </div>
            </div>

            {storyOpen ? (
              <>
                <textarea
                  value={storySetting}
                  onChange={(e) => setStorySetting(e.target.value)}
                  placeholder="例：世界觀（現代/末日/仙俠）・主角姓名與性格・主要人物關係・禁忌（不要死人/不要嘴砲）・固定設定（能力/身分/地點）…"
                  className="mt-3 min-h-[84px] w-full resize-none rounded-2xl border border-[#D8D2C8] bg-white p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-[#7A8C99]/30"
                />
                <div className={`mt-2 text-xs ${MORANDI.TEXT_SUB}`}>
                  小技巧：你可以先用一句話寫「世界觀 + 主角目標 + 禁忌」，先有就贏。
                </div>
              </>
            ) : null}
          </div>

          {/* 第一層：模式 */}
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              {(["開頭", "接續", "反轉", "情緒", "其他"] as ModeKey[]).map((m) => (
                <Chip key={m} label={`✨ ${m}`} active={mode === m} onClick={() => setMode(m)} />
              ))}
            </div>

            <div className={`mt-2 text-xs ${MORANDI.TEXT_SUB}`}>{MODE_HINT[mode]}</div>
          </div>

          {/* 第二層：方向 */}
          <div className="mt-4">
            <div className="text-sm font-medium">方向（先選幾個就很夠用了）</div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {allDirChips.map((d) => (
                <Chip key={d} label={d} active={selectedDirs.includes(d)} onClick={() => toggleDir(d)} />
              ))}

              {/* ✅ 你畫圈的「其他」：同層級輸入 */}
              <ChipInput
                placeholder="輸入方向後 Enter"
                onAdd={(v) => setCustomDirs((prev) => uniqChips([...prev, v]))}
              />
            </div>

            {/* 自訂 chips 顯示 */}
            {customDirs.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {customDirs.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-2 rounded-full border border-[#CBBFB2] bg-[#E2D8CC] px-3 py-1 text-sm shadow-sm"
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => removeCustomDir(c)}
                      className="rounded-full border border-[#CBBFB2] bg-white px-2 py-0.5 text-xs hover:bg-[#E9E4DC]"
                      title="移除"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* 自訂細節（不要跟方向重複） */}
          <div className="mt-4">
            <div className={`text-sm font-medium`}>自訂細節（不要跟方向重複，寫你想補的「具體內容」）</div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="例：把末世空氣味道寫細；女魔頭掌控的是「能量管控」；主角手上的幽光像指南針；不要突然新增新勢力。"
              className="mt-2 min-h-[86px] w-full resize-none rounded-2xl border border-[#D8D2C8] bg-white p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-[#7A8C99]/30"
            />
          </div>

          {/* 提示 */}
          <div className="mt-4">
            <div className={`text-sm font-medium`}>提示（可選，會給 API 當規則/偏好）</div>
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="例：第一人稱、節奏更快、對白多一點、不嘴砲、要更濃狗血…"
              className="mt-2 h-11 w-full rounded-2xl border border-[#D8D2C8] bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#7A8C99]/30"
            />
          </div>

          {/* 長度 + 狀態 */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">字數：</span>
              {(["短", "中", "長"] as const).map((k) => (
                <Chip key={k} label={k} active={lenKey === k} onClick={() => setLenKey(k)} />
              ))}
            </div>

            <div className={`text-xs ${MORANDI.TEXT_SUB}`}>
              {!contentOk ? "內容不足無法生成（至少先寫幾句）" : `接續來源：${lastSentence ? `「${lastSentence}」` : "（尚未抓到上一句）"}`}
            </div>
          </div>

          {/* 生成按鈕 */}
          <div className="mt-4">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={`w-full rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${MORANDI.ACCENT} ${MORANDI.ACCENT_HOVER}`}
            >
              {loading ? "生成中…" : "生成一段建議"}
            </button>

            {error ? <div className="mt-2 text-sm text-red-600">{error}</div> : null}
            {modelUsed ? <div className={`mt-2 text-xs ${MORANDI.TEXT_SUB}`}>模型：{modelUsed}</div> : null}
          </div>

          {/* 建議段落 */}
          <div className="mt-4 rounded-2xl border border-[#D8D2C8] bg-white p-4">
            <div className="text-sm font-medium">建議段落</div>
            <div className={`mt-1 text-xs ${MORANDI.TEXT_SUB}`}>
              （生成後會出現在這裡，你可以先看過再套用）
            </div>

            <div className="mt-3 whitespace-pre-wrap text-sm leading-7">
              {result ? result : <span className={MORANDI.TEXT_MUTE}>（尚未生成）</span>}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!result) return;
                  onAppend(result);
                  // ✅ 套用後保留結果不清掉，使用者可以再套一次或再來一段
                }}
                disabled={!result}
                className="rounded-xl border border-[#D8D2C8] bg-[#7A8C99] px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50"
              >
                ✅ 套用到文章（append）
              </button>

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  handleGenerate();
                }}
                disabled={!canGenerate}
                className="rounded-xl border border-[#D8D2C8] bg-[#F8F6F2] px-4 py-2 text-sm shadow-sm hover:bg-[#E9E4DC] disabled:opacity-50"
              >
                ♻️ 再來一段
              </button>

              <button
                type="button"
                onClick={() => {
                  setResult("");
                  setModelUsed(null);
                  setError(null);
                }}
                className="rounded-xl border border-[#D8D2C8] bg-white px-4 py-2 text-sm shadow-sm hover:bg-[#E9E4DC]"
              >
                ✖ 丟掉
              </button>
            </div>
          </div>

          {/* Debug（你之後調教 prompt 超好用） */}
          <details className="mt-4">
            <summary className={`cursor-pointer text-xs ${MORANDI.TEXT_SUB}`}>送出內容（debug）</summary>
            <pre className="mt-2 whitespace-pre-wrap rounded-2xl border border-[#D8D2C8] bg-white p-3 text-xs leading-6">
{`mode=${mode}
selectedDirs=${JSON.stringify(selectedDirs)}
customDirs=${JSON.stringify(customDirs)}
targetChars=${targetChars}

directionString:
${directionString}`}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}