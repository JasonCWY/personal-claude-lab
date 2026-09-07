"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client — used ONLY for the host's auth flow (magic link sign-in/out).
 *
 * It never reads or writes application tables. RLS grants `anon` no policies at
 * all, so this key cannot see data even if someone lifts it out of the bundle.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
