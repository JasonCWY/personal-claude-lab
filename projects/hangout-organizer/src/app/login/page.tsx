"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const ERRORS: Record<string, string> = {
  not_host: "That email is not the host account for this app.",
  exchange_failed: "That sign-in link has expired. Request a new one.",
  missing_code: "That sign-in link was incomplete. Request a new one.",
};

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(ERRORS[params.get("error") ?? ""] ?? null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const next = params.get("next") ?? "/";
    const supabase = createClient();
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {busy ? "Sending…" : "Email me a link"}
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
