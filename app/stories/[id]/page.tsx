import { notFound } from "next/navigation";

const mockStories = [
  {
    id: "1",
    title: "在公車上突然想哭的那一天",
    content: "這是第一篇的內容。",
  },
  {
    id: "2",
    title: "我決定暫時不那麼努力的一個晚上",
    content: "這是第二篇的內容。",
  },
  {
    id: "3",
    title: "跟家裡說出真話之後",
    content: "這是第三篇的內容。",
  },
];

export default async function StoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // 先把 Promise 解開
  const { id } = await params;

  const story = mockStories.find((s) => s.id === id);

  if (!story) return notFound();

  return (
    <main className="px-4 md:px-8 py-10">
      <h1 className="text-3xl font-bold mb-5">{story.title}</h1>
      <p className="text-gray-700 leading-relaxed whitespace-pre-line">
        {story.content}
      </p>
    </main>
  );
}
