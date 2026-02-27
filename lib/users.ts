// lib/users.ts
import { db } from "@/lib/firebase";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

export type AgeRange =
  | "under18"
  | "18-24"
  | "25-34"
  | "35-44"
  | "45plus";

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string;
  photoURL: string | null;

  // 可略過
  ageRange: AgeRange | null;
  mbti: string | null;

  role: "user" | "admin";
  createdAt?: any;
  lastSeenAt?: any;
};

export async function upsertUserProfile(input: {
  uid: string;
  email: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  ageRange?: AgeRange | null;
  mbti?: string | null;
}) {
  const ref = doc(db, "users", input.uid);

  await setDoc(
    ref,
    {
      uid: input.uid,
      email: input.email ?? null,
      displayName: input.displayName ?? "",
      photoURL: input.photoURL ?? null,

      // ✅ 可略過欄位
      ageRange: input.ageRange ?? null,
      mbti: input.mbti ?? null,

      role: "user",
      // ✅ 第一次會寫入，之後 merge 不會把已存在的 createdAt 覆蓋掉（若你不想覆蓋可改成只在 onboarding 寫）
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    } satisfies UserProfile,
    { merge: true }
  );
}
