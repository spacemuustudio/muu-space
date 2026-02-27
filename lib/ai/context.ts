export function buildAiContext(params: {
  title: string;
  content: string;
  maxChars?: number; // 建議 2000
}) {
  const { title, content, maxChars = 2000 } = params;

  const recentContext = (content || "").slice(-maxChars);

  const paragraphs = (content || "")
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const lastParagraph = paragraphs.length ? paragraphs[paragraphs.length - 1] : "";

  return { title, recentContext, lastParagraph };
}