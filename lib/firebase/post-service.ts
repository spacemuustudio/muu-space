// lib/firebase/post-service.ts
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  limit,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type CoolPostStatus = "draft" | "published";

export type CoolPost = {
  id: string;
  authorId: string;
  authorName: string;

  // ✅ for /cool-square 顯示作者頭像＋username，並可連 /u/[username]
  authorUsername?: string;
  authorPhotoURL?: string | null;

  title: string;
  content: string;
  storySpec?: string;
  status: CoolPostStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  publishedAt?: Timestamp;
  likes: number;
  views: number;
};

const COL = "coolPosts";

function safeAuthorName(name: string) {
  const n = (name || "").trim();
  return n.length ? n.slice(0, 32) : "匿名創作者";
}

function safeStorySpec(spec: string) {
  const s = (spec || "").trim();
  if (!s) return "";
  return s.slice(0, 2000);
}

/**
 * ✅ 讀取 publicProfiles/{uid} 的公開欄位（username / avatarUrl）
 * 目的：避免讀 users（users 只允許本人讀，廣場會炸）
 */
async function getUserPublicMeta(
  uid: string
): Promise<{ username?: string; photoURL?: string | null }> {
  try {
    const ref = doc(db, "publicProfiles", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return {};

    const data = snap.data() as any;

    const username = typeof data.username === "string" ? data.username.trim() : "";

    // publicProfiles 建議欄位就叫 avatarUrl
    const avatarUrl = typeof data.avatarUrl === "string" ? data.avatarUrl : null;

    return {
      username: username || undefined,
      photoURL: avatarUrl || null,
    };
  } catch {
    return {};
  }
}

/**
 * 建立草稿
 * ⚠️ 重點：不要寫 publishedAt（Firestore 不能是 undefined）
 */
export async function createDraft(authorId: string, authorName: string) {
  const ref = doc(collection(db, COL));

  // ✅ 把 username / photoURL 一起寫進 post（避免廣場 N+1 查 users）
  const meta = await getUserPublicMeta(authorId);

  await setDoc(ref, {
    authorId,
    authorName: safeAuthorName(authorName),
    authorUsername: meta.username ?? null,
    authorPhotoURL: meta.photoURL ?? null,

    title: "",
    content: "",
    storySpec: "",
    status: "draft",
    likes: 0,
    views: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    // ❌ 不要 publishedAt
  });

  return ref.id;
}

/** 取得單篇 */
export async function getPost(id: string): Promise<CoolPost | null> {
  const ref = doc(db, COL, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() as any;

  return {
    id: snap.id,
    authorId: data.authorId ?? "",
    authorName: data.authorName ?? "匿名創作者",
    authorUsername: typeof data.authorUsername === "string" ? data.authorUsername : undefined,
    authorPhotoURL: typeof data.authorPhotoURL === "string" ? data.authorPhotoURL : null,

    title: data.title ?? "",
    content: data.content ?? "",
    storySpec: data.storySpec ?? "",
    status: (data.status ?? "draft") as CoolPostStatus,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    publishedAt: data.publishedAt,
    likes: typeof data.likes === "number" ? data.likes : 0,
    views: typeof data.views === "number" ? data.views : 0,
  };
}

/** 更新草稿（也允許更新 authorName / storySpec） */
export async function updatePost(
  id: string,
  data: Partial<Pick<CoolPost, "title" | "content" | "authorName" | "storySpec">>
) {
  const ref = doc(db, COL, id);

  // ✅ 防止 undefined 寫入 Firestore
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) cleaned[k] = v;
  }

  if (typeof cleaned.authorName === "string") {
    cleaned.authorName = safeAuthorName(cleaned.authorName);
  }

  if (typeof cleaned.storySpec === "string") {
    cleaned.storySpec = safeStorySpec(cleaned.storySpec);
  }

  await updateDoc(ref, {
    ...cleaned,
    updatedAt: serverTimestamp(),
  });
}

/** 發布 */
export async function publishPost(id: string) {
  const ref = doc(db, COL, id);

  // ✅ 發布時確保作者 username/photoURL 補齊（舊草稿也能補到）
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data() as any;
    const authorId = data.authorId as string | undefined;

    if (authorId) {
      const meta = await getUserPublicMeta(authorId);

      await updateDoc(ref, {
        status: "published",
        publishedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),

        authorUsername: meta.username ?? data.authorUsername ?? null,
        authorPhotoURL: meta.photoURL ?? data.authorPhotoURL ?? null,
      });

      return;
    }
  }

  // fallback：至少能發布
  await updateDoc(ref, {
    status: "published",
    publishedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** 讀取已發布文章（廣場） */
export async function listPublishedPosts(take = 50): Promise<CoolPost[]> {
  const q = query(
    collection(db, COL),
    where("status", "==", "published"),
    orderBy("publishedAt", "desc"),
    limit(take)
  );

  const snaps = await getDocs(q);

  return snaps.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      authorId: data.authorId ?? "",
      authorName: data.authorName ?? "匿名創作者",
      authorUsername: typeof data.authorUsername === "string" ? data.authorUsername : undefined,
      authorPhotoURL: typeof data.authorPhotoURL === "string" ? data.authorPhotoURL : null,

      title: data.title ?? "",
      content: data.content ?? "",
      storySpec: data.storySpec ?? "",
      status: "published",
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      publishedAt: data.publishedAt,
      likes: typeof data.likes === "number" ? data.likes : 0,
      views: typeof data.views === "number" ? data.views : 0,
    };
  });
}

/**
 * ✅ views +1（transaction 明確寫 int）
 * 符合你 rules：changedKeys 只有 ["views"] 且 views == resource.views + 1
 */
export async function incrementView(id: string) {
  const ref = doc(db, COL, id);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;

    const data = snap.data() as any;
    const current = typeof data.views === "number" ? data.views : 0;

    // ⚠️ 只更新 views（不要順便 updatedAt），不然 changedKeys 就不只 views 了
    tx.update(ref, { views: current + 1 });
  });
}

/**
 * ✅ 按讚（防重複）
 * 交易內同時：
 * 1) 建 likes/{uid}
 * 2) likes 計數 +1（只改 likes，符合你 rules）
 */
export async function likePost(postId: string, uid: string) {
  const postRef = doc(db, COL, postId);
  const likeRef = doc(db, COL, postId, "likes", uid);

  await runTransaction(db, async (tx) => {
    const likeSnap = await tx.get(likeRef);
    if (likeSnap.exists()) return; // 已按讚 → 不重複加

    const postSnap = await tx.get(postRef);
    if (!postSnap.exists()) return;

    const data = postSnap.data() as any;
    const current = typeof data.likes === "number" ? data.likes : 0;

    tx.set(likeRef, { createdAt: serverTimestamp() });
    // ⚠️ 只更新 likes（不要 updatedAt）
    tx.update(postRef, { likes: current + 1 });
  });
}

/**
 * ✅ 取消讚
 * 交易內同時：
 * 1) 刪 likes/{uid}
 * 2) likes 計數 -1（不小於 0）
 */
export async function unlikePost(postId: string, uid: string) {
  const postRef = doc(db, COL, postId);
  const likeRef = doc(db, COL, postId, "likes", uid);

  await runTransaction(db, async (tx) => {
    const likeSnap = await tx.get(likeRef);
    if (!likeSnap.exists()) return; // 沒按讚 → 不做事

    const postSnap = await tx.get(postRef);
    if (!postSnap.exists()) return;

    const data = postSnap.data() as any;
    const current = typeof data.likes === "number" ? data.likes : 0;

    tx.delete(likeRef);
    tx.update(postRef, { likes: Math.max(0, current - 1) });
  });
}