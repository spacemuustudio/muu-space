"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { upsertUserProfile, type AgeRange } from "@/lib/users";
import { useAuth } from "@/components/AuthProvider";

type AuthErrorLike = {
  code?: string;
  message?: string;
};

const AGE_OPTIONS: { label: string; value: AgeRange }[] = [
  { label: "Under 18", value: "under18" },
  { label: "18-24", value: "18-24" },
  { label: "25-34", value: "25-34" },
  { label: "35-44", value: "35-44" },
  { label: "45+", value: "45plus" },
];

function normalizeMBTI(raw: string) {
  const value = raw.trim().toUpperCase();
  if (!value) return null;
  if (!/^[IE][NS][FT][PJ]$/.test(value)) return null;
  return value;
}

function readAuthError(error: unknown): AuthErrorLike {
  if (error && typeof error === "object") {
    const candidate = error as AuthErrorLike;
    return {
      code: candidate.code,
      message: candidate.message,
    };
  }

  return { message: String(error) };
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/cool-studio";

  const { user, loading: authLoading, isLoggedIn, signInWithGoogle, logout } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [ageRange, setAgeRange] = useState<AgeRange | "">("");
  const [mbtiInput, setMbtiInput] = useState("");
  const mbti = useMemo(() => normalizeMBTI(mbtiInput), [mbtiInput]);

  const handleGoogleLogin = async () => {
    if (googleLoading) return;

    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      router.replace(next || "/");
      router.refresh();
    } catch (error: unknown) {
      const meta = readAuthError(error);
      console.error("[LoginPage] Google login failed", {
        code: meta.code ?? null,
        message: meta.message ?? null,
      });
      alert("Google login failed. Check the console and Firebase Auth settings.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      alert("Please enter email and password.");
      return;
    }

    if (password.trim().length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password.trim());

        await upsertUserProfile({
          uid: credential.user.uid,
          email: credential.user.email,
          displayName: credential.user.displayName,
          photoURL: credential.user.photoURL,
        });

        router.replace(next || "/");
        router.refresh();
        return;
      }

      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password.trim());

      await upsertUserProfile({
        uid: credential.user.uid,
        email: credential.user.email,
        displayName: credential.user.displayName,
        photoURL: credential.user.photoURL,
        ageRange: ageRange ? (ageRange as AgeRange) : null,
        mbti: mbti ?? null,
      });

      await sendEmailVerification(credential.user);
      alert("Registration complete. Verification email sent.");
      await logout();
      setMode("login");
    } catch (error: unknown) {
      const meta = readAuthError(error);
      console.error("[LoginPage] email auth failed", {
        code: meta.code ?? null,
        message: meta.message ?? null,
      });
      alert(meta.message || "Login/register failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.refresh();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-bold">{mode === "login" ? "Login" : "Register"}</h1>
        <p className="mb-6 text-sm text-gray-500">
          {mode === "login"
            ? "Sign in to continue to Cool Studio and your account."
            : "Optional profile details can be edited later."}
        </p>

        {authLoading ? (
          <div className="mb-6 rounded-xl bg-gray-50 p-3 text-sm text-gray-500">Checking auth state...</div>
        ) : isLoggedIn && user ? (
          <div className="mb-6 rounded-xl bg-gray-50 p-3 text-sm">
            <div>Signed in as: {user.email || user.displayName || user.uid}</div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white"
            >
              Sign out
            </button>
          </div>
        ) : null}

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading || authLoading}
            className="w-full rounded-xl border py-2 text-sm disabled:opacity-50"
          >
            {googleLoading ? "Signing in with Google..." : "Sign in with Google"}
          </button>

          <div className="flex items-center gap-3 text-xs text-gray-400">
            <div className="h-px flex-1 bg-gray-200" />
            <span>or use email</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <input
            className="w-full rounded-xl border px-3 py-2 outline-none"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />

          <input
            className="w-full rounded-xl border px-3 py-2 outline-none"
            placeholder="Password (at least 6 characters)"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          {mode === "register" ? (
            <div className="space-y-3 rounded-xl border bg-gray-50 p-3">
              <div className="text-xs text-gray-500">These fields are optional.</div>

              <div className="space-y-1">
                <div className="text-sm font-medium text-gray-700">Age range</div>
                <select
                  className="w-full rounded-xl border bg-white px-3 py-2 outline-none"
                  value={ageRange}
                  onChange={(event) => setAgeRange(event.target.value as AgeRange | "")}
                >
                  <option value="">Skip</option>
                  {AGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium text-gray-700">MBTI</div>
                <input
                  className="w-full rounded-xl border px-3 py-2 outline-none"
                  placeholder="Example: INFP / ENTJ"
                  value={mbtiInput}
                  onChange={(event) => setMbtiInput(event.target.value)}
                />
                {mbtiInput.trim() && !mbti ? (
                  <div className="text-xs text-red-500">Use a 4-letter format like INFP.</div>
                ) : null}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-xl bg-black py-2 text-white disabled:opacity-50"
          >
            {loading ? "Working..." : mode === "login" ? "Login" : "Register"}
          </button>

          <button
            type="button"
            onClick={() => setMode((current) => (current === "login" ? "register" : "login"))}
            className="w-full rounded-xl border py-2 text-sm"
          >
            {mode === "login" ? "No account? Register" : "Already have an account? Login"}
          </button>
        </div>
      </div>
    </main>
  );
}
