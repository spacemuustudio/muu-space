import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

type Body = {
  title: string;
  recentContext: string;
  lastParagraph: string;
  direction: string;
  targetChars?: number;
};

function badRequest(msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status: 400 });
}

/** ===== Model picking (via REST ListModels) ===== */

type ListModelsResp = {
  models?: Array<{
    name?: string; // "models/gemini-2.0-flash"
    supportedGenerationMethods?: string[];
  }>;
};

let cachedModel: { model: string; expiresAt: number } | null = null;

async function listModelsViaRest(apiKey: string): Promise<ListModelsResp> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url, { method: "GET" });
  const text = await r.text();
  if (!r.ok) throw new Error(`ListModels failed: ${r.status} ${text}`);
  return JSON.parse(text) as ListModelsResp;
}

function pickBestModelName(models: ListModelsResp["models"]): string | null {
  const ok = (models || []).filter(
    (m) =>
      typeof m?.name === "string" &&
      Array.isArray(m.supportedGenerationMethods) &&
      m.supportedGenerationMethods.includes("generateContent")
  );

  if (!ok.length) return null;

  const nameOf = (m: any) => (m.name || "").toLowerCase();

  const prefer =
    ok.find((m) => nameOf(m).includes("flash")) ||
    ok.find((m) => nameOf(m).includes("lite")) ||
    ok.find((m) => nameOf(m).includes("pro")) ||
    ok[0];

  const full = prefer.name!;
  return full.startsWith("models/") ? full.slice("models/".length) : full;
}

async function getModelForKey(apiKey: string): Promise<string> {
  const now = Date.now();
  if (cachedModel && cachedModel.expiresAt > now) return cachedModel.model;

  const list = await listModelsViaRest(apiKey);
  const picked = pickBestModelName(list.models);
  if (!picked) throw new Error("No available model supports generateContent for this API key.");

  cachedModel = { model: picked, expiresAt: now + 10 * 60 * 1000 };
  return picked;
}

/** ===== helpers ===== */

function getLastSentence(paragraph: string) {
  const p = (paragraph || "").trim();
  if (!p) return "";
  const chunks = p.split(/(?<=[。！？!?…])\s*/g).filter(Boolean);
  return (chunks[chunks.length - 1] || p).trim();
}

/** ===== POST ===== */

export async function POST(req: Request) {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return NextResponse.json({ ok: false, error: "Missing GEMINI_API_KEY" }, { status: 500 });
    }

    const body = (await req.json()) as Body;

    const title = (body.title || "").trim();
    const recentContext = (body.recentContext || "").trim();
    const lastParagraph = (body.lastParagraph || "").trim();
    const direction = (body.direction || "").trim();
    const targetChars = body.targetChars ?? 320;

    if (!recentContext) return badRequest("recentContext is required");
    if (!direction) return badRequest("direction is required");

    const lastSentence = getLastSentence(lastParagraph);

    // ✅ 連續性強化版 systemInstruction
    const systemInstruction = `
你是「爽文寫作助手」。你只做一件事：根據既有內容與作者方向，產出「接續擴寫」的新段落。

【硬規則（必須遵守）】
1) 只能輸出「要 append 的新文字」，禁止貼回任何原文句子（不要重複/改寫/總結原文）
2) 必須緊貼上一段（lastParagraph）的狀態延續，禁止跳場景、禁止時間大跳躍、禁止突然新增重要設定
3) 開頭第一句要自然承接上一段最後一句的情緒/動作/語氣（像是同一段故事接續），不要另起爐灶
4) 不要寫標題、不加前言、不加解釋、不用條列
5) 只輸出一段（2~4 句），長度約 ${targetChars} 個中文字上下（不要超太多）
6) 保持與原文一致的語氣、人稱、節奏

【允許】
- 可以為了銜接做「最小補全」，但不得亂新增世界觀或新勢力
`.trim();

    const prompt = `
[標題]
${title || "(未提供)"}

[最近上下文（節錄）]
${recentContext}

[最後一段（最重要，請優先延續）]
${lastParagraph || "(無)"} 

[最後一句（你必須承接它的狀態）]
${lastSentence || "(無)"} 

[作者方向（你必須遵守）]
${direction}

[輸出]
只輸出「接續擴寫」的新段落文字本體。
`.trim();

    // debug（你要調 prompt 時很救命）
    console.log("AI continue: model picking...");
    console.log("AI continue: lastSentence =", lastSentence);
    console.log("AI continue: direction =", direction);

    const modelName = await getModelForKey(key);

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction,
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    if (!text || text.length < 20) {
      return NextResponse.json({ ok: false, error: "Empty generation" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, text, modelUsed: modelName });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}