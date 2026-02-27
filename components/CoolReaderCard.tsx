"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

type Props = {
  title?: string;
  authorLine?: string; // 例如： "woo · 2026/02/27 ..."
  content?: string;
  onClose?: () => void;

  // 這三個讓你跟廣場一致（用你現有 token）
  navbarH?: number;     // default 56
  pageHeaderH?: number; // default 56
};

export default function CoolReaderCard({
  title,
  authorLine,
  content,
  onClose,
  navbarH = 56,
  pageHeaderH = 56,
}: Props) {
  const TOP_OFFSET = navbarH + pageHeaderH;

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

    // 到最後一頁，點右側 → 關閉（符合 modal 使用情境）
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      {/* 量測盒 */}
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