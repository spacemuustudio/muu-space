// lib/firebase/avatar-service.ts
import { storage, db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

function extFromFile(file: File) {
  const name = file.name.toLowerCase();
  const m = name.match(/\.(png|jpg|jpeg|webp|gif)$/);
  return m?.[1] ?? "jpg";
}

export async function uploadAvatar(params: { uid: string; file: File }) {
  const { uid, file } = params;

  // ✅ 基本防呆：2MB 以下、圖片類型
  if (!file.type.startsWith("image/")) throw new Error("只允許上傳圖片");
  if (file.size > 2 * 1024 * 1024) throw new Error("圖片太大（上限 2MB）");

  const ext = extFromFile(file);
  const path = `avatars/${uid}/avatar.${ext}`; // ✅ 固定檔名：每次上傳覆蓋（省錢、省空間）
  const r = ref(storage, path);

  // ✅ contentType 讓瀏覽器正確顯示
  await uploadBytes(r, file, { contentType: file.type });

  const url = await getDownloadURL(r);

  // ✅ 寫回 users/{uid}.avatarUrl
  await updateDoc(doc(db, "users", uid), {
    avatarUrl: url,
    updatedAt: serverTimestamp(),
  });

  return url;
}