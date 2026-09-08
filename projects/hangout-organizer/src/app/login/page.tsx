"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const ERRORS: Record<string, string> = {
  not_host: "That email is not the host account for this app.",
  exchange_failed: "That sign-in link has expired. Request a new one.",
  missing_code: "That sign-in link was incomplete. Request a new one.",
};

function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Password is the default because the magic-link round trip — switch to the
  // inbox, wait, tap, come back — is tedious for the one person who signs in
  // here several times a week. The link stays as a fallback for a new device.
  const [mode, setMode] = useState<"password" | "link">("password");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(ERRORS[params.get("error") ?? ""] ?? null);
  const [busy, setBusy] = useState(false);

  const next = params.get("next") ?? "/";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();

    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) {
        setError(error.message);
        return;
      }
      // The middleware re-checks the session and the (host) layout re-checks the
      // email, so this navigation is a convenience, not the gate.
      router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Hangout Organizer</h1>
      <p className="mt-1 text-sm text-slate-600">Host sign-in.</p>

      {sent ? (
        <p className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
          Check your inbox for the sign-in link.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="username"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
          />

          {mode === "password" && (
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
            />
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {busy
              ? mode === "password"
                ? "Signing in…"
                : "Sending…"
              : mode === "password"
                ? "Sign in"
                : "Email me a link"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "password" ? "link" : "password"));
              setError(null);
            }}
            className="w-full text-center text-xs text-slate-500 underline"
          >
            {mode === "password" ? "Email me a link instead" : "Use a password instead"}
          </button>
        </form>
      )}

      {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}

      <p className="mt-8 text-xs text-slate-500">
        Friends never sign in — they use the share link you send them.
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
