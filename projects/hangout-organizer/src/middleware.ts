import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the host's Supabase session cookie and gates the host area.
 *
 * The matcher deliberately excludes /s/, /e/ and /api/public/ — those are the
 * friend-facing share paths and must stay reachable with no session at all.
 * Excluding them in the MATCHER rather than inside the handler matters: this
 * function used to build a Supabase client and verify a token on every public
 * request too, which put a pointless auth round trip in front of every share
 * link open and every availability submit.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getClaims() verifies the JWT locally against the project's JWKS (this
  // project signs with ES256) instead of asking the auth server who this is on
  // every single request. The key set is cached process-wide by auth-js, so
  // after the first request this is a few hundred microseconds of WebCrypto
  // rather than a network round trip. Expired sessions still refresh, because
  // getClaims reads the session through the same cookie storage as before.
  const { data: claims } = await supabase.auth.getClaims();
  const signedIn = Boolean(claims?.claims?.sub);

  const { pathname } = request.nextUrl;

  if (!signedIn && !pathname.startsWith("/login") && !pathname.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (signedIn && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *  - /s/, /e/, /api/public/  — the public share surface, which authorises
     *    itself by share token inside each route handler
     *  - Next internals and static assets
     */
    "/((?!s/|e/|api/public/|_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
