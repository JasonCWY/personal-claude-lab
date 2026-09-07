import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * service_role client — BYPASSES RLS. Server-side only; `server-only` makes
 * importing this from a client component a build error.
 *
 * This is how the public share pages work: friends have no Supabase session, so
 * every read and write on their behalf goes through a route handler that uses
 * this client and scopes the query by share_token itself. Never expose it to a
 * caller who has not presented a valid token.
 */
export function createServiceClient() {
  return createSupabaseClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
