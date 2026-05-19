"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    async function checkSession() {
      const supabase = getSupabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        router.replace("/dashboard");
        return;
      }

      setCheckingSession(false);
    }

    checkSession();
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = getSupabaseBrowser();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-black font-[system-ui]">
        <p className="text-sm text-brand-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-black px-4 font-[system-ui]">
      <div className="w-full max-w-md overflow-hidden rounded-xl border border-brand-border bg-brand-surface shadow-2xl">
        <div className="h-1 bg-brand-red" />
        <div className="p-8">
          <h1 className="text-center text-4xl font-bold tracking-wide text-white">
            VINCI
          </h1>
          <p className="mt-2 text-center text-sm text-brand-muted">
            Vinicius Group Internal Dashboard
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label
                className="mb-1 block text-sm text-brand-muted"
                htmlFor="email"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-brand-border bg-brand-black px-3 py-2 text-white outline-none transition-colors focus:border-brand-red"
              />
            </div>

            <div>
              <label
                className="mb-1 block text-sm text-brand-muted"
                htmlFor="password"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-md border border-brand-border bg-brand-black px-3 py-2 text-white outline-none transition-colors focus:border-brand-red"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-brand-red py-2.5 font-medium text-white transition-colors hover:bg-brand-red-hover disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>

            {error ? (
              <p className="text-center text-sm text-brand-red">{error}</p>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
