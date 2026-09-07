import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { HOST_EMAIL } from "@/lib/env";

/**
 * Magic-link landing point, and the actual allowlist gate.
 *
 * Supabase will happily mint a session for any email that completes the link
 * flow, so restricting sign-up in the dashboard is not enough on its own: if the
 * address is not HOST_EMAIL we sign the session straight back out.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  if ((data.user.email ?? "").toLowerCase() !== HOST_EMAIL()) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_host`);
  }

  return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`);
}
