// app/api/talk/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type ReqBody = {
  message?: string;
};

const SYSTEM_PROMPT = `
你是「muu space」裡的陪伴者。
你的工作不是分析、不是教學、不是帶方向，
而是陪對方把當下的狀態放在這裡，慢慢站穩。

【整體原則】
- 回覆一定要夠長、夠完整，但不要像在解釋事情
- 不是在幫對方想辦法，而是在陪他待在此刻
- 文字可以溫和，但不要像老師、顧問、心理師

【語氣】
- 像坐在旁邊說話，不急、不推、不總結
- 不需要把事情講清楚，也不需要收尾得很好
- 可以重複停留在同一個狀態附近，而不是往前推

【請避免的寫法】
- 不要條列原因或因素
- 不要出現「所以」、「因此」、「這代表」
- 不要提出改進、方法、策略、下一步
- 不要把話帶到未來或表現好壞的評價

【長度與格式】
- 使用繁體中文
- 回覆請自然分成三段（中間空一行即可）
- 整體請維持偏長的回覆（約 200～320 個中文字）
- 不要使用條列、符號或 emoji

【重要提醒】
如果你覺得自己回得很有道理、很有幫助、很像在教人，
請退回來，改成只是陪在旁邊說話。
`.trim();


async function callGroq(message: string) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { ok: false as const, status: 500, data: { error: "伺服器未設定 GROQ_API_KEY" } };
  }

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      temperature: 0.6,
      max_tokens: 500, // 先拉高，確保不會太短
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
    }),
  });

  if (!resp.ok) {
    const raw = await resp.text();
    return {
      ok: false as const,
      status: 500,
      data: { error: "Groq API 呼叫失敗", detail: raw },
    };
  }

  const data = await resp.json();
  const reply: string = data?.choices?.[0]?.message?.content?.trim?.() ?? "";

  if (!reply) {
    return {
      ok: false as const,
      status: 500,
      data: { error: "模型沒有回覆內容", detail: data },
    };
  }

  return { ok: true as const, status: 200, data: { reply } };
}

export async function POST(req: Request) {
  try {
    const body: ReqBody = await req.json().catch(() => ({}));
    const message = (body?.message ?? "").trim();

    if (!message) {
      return NextResponse.json({ error: "缺少 message 或格式不正確" }, { status: 400 });
    }
    if (message.length > 3000) {
      return NextResponse.json({ error: "文字太長（上限 3000 字）" }, { status: 400 });
    }

    const result = await callGroq(message);

    // ✅ 成功就回
    if (result.ok) {
      return NextResponse.json(result.data, { status: 200 });
    }

    // ✅ 失敗：先給前端一個「一定會顯示」的 fallback（避免你整個聊天框空掉）
    const fallback =
      "我有收到你剛剛那段話。\n\n現在先不用把它說得很完整也沒關係，你能把它放出來，本身就不容易。\n\n如果你願意，可以再多留一點點：此刻最卡的是哪一小塊？";

    return NextResponse.json(
      { reply: fallback, error: result.data.error, detail: result.data.detail },
      { status: 200 }
    );
  } catch (err) {
    const fallback =
      "我在，但剛剛系統有點卡住。\n\n你不需要重打全部；你可以用一句話接著說，我會在這裡。\n\n如果你願意，就從「現在最難受的地方是…」開始也可以。";
    return NextResponse.json({ reply: fallback, error: "伺服器錯誤", detail: String(err) }, { status: 200 });
  }
}
