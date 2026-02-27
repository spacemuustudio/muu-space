// lib/gemini-client.ts

/**
 * MVP 用的 AI 生成 client
 * - 未接真實 API 時，會回傳模擬文字
 * - 之後可直接替換成 Gemini / OpenAI API
 */

export async function generateTextClient(
  prompt: string,
  currentContent: string,
  mode: "append" | "insert" | "overwrite"
): Promise<string> {
  // ✅ 模擬延遲（讓 UI 看起來像真的在生成）
  await new Promise((res) => setTimeout(res, 800));

  // ✅ MVP fallback（之後可整段換成真實 API）
  return [
    "【AI 生成內容（模擬）】",
    "",
    `提示詞：${prompt}`,
    "",
    "這是一段用來測試 AI 輔助功能的文字。",
    "你可以之後再把這裡換成 Gemini 或 OpenAI 的 API 呼叫。",
  ].join("\n");
}
