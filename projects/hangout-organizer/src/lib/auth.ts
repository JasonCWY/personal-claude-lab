import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { HOST_EMAIL } from "@/lib/env";

export interface HostIdentity {
  /** A verified session exists, whoever it belongs to. */
  signedIn: boolean;
  /** Set only when that session belongs to HOST_EMAIL. */
  hostEmail: string | null;
}

/**
 * Who is asking, from the cookie session.
 *
 * `getClaims()` rather than `getUser()`: this project signs JWTs with ES256, so
 * the token is verified locally against the cached JWKS instead of costing an
 * auth-server round trip on every render. The verification is cryptographic —
 * a forged or tampered token still fails — and the DB-level gate is unchanged,
 * since `is_host()` reads the email out of the JWT that Postgres itself sees.
 *
 * The one thing given up versus `getUser()` is instant revocation: a session
 * killed server-side stays usable until its access token expires (one hour by
 * default). For a single-host app whose data is gated by `is_host()` in RLS,
 * that is a good trade for taking a network hop out of every page load.
 * `auth/callback` still uses `getUser()`, so sign-in itself is unchanged.
 *
 * `cache()` dedupes this across the layout and every page in the same render.
 */
export const getHostIdentity = cache(async (): Promise<HostIdentity> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { signedIn: false, hostEmail: null };
  const email = (claims.email as string | undefined)?.toLowerCase() ?? "";
  return { signedIn: true, hostEmail: email === HOST_EMAIL() ? email : null };
});
