/** Fail loudly at first use rather than silently talking to the wrong project. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.local.example to .env.local ` +
        `(or set it in the Vercel dashboard) — see CLAUDE.md.`,
    );
  }
  return value;
}

export const SUPABASE_URL = () => required("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_ANON_KEY = () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
export const SUPABASE_SERVICE_ROLE_KEY = () => required("SUPABASE_SERVICE_ROLE_KEY");
export const HOST_EMAIL = () => required("HOST_EMAIL").trim().toLowerCase();
/**
 * Base URL for share links. Always carries a scheme, and that is the point.
 *
 * Typed into the Vercel dashboard this is naturally written the way a domain is
 * spoken — "my-app.vercel.app" — and everything downstream still looked fine:
 * the host page rendered it, the clipboard copied it, WhatsApp sent it. But a
 * bare domain is not a URL, so iOS Messages and WhatsApp render it as plain
 * grey text and the friend receiving it has nothing to tap. The share message
 * IS the distribution mechanism for this app, so it must not depend on how
 * carefully an environment variable was typed months ago.
 *
 * https rather than http when guessing: anything this points at in production
 * is behind TLS, and http would cost every visitor a redirect. Localhost keeps
 * whatever scheme it was given, since that value is written here, not typed
 * into a dashboard.
 */
export const SITE_URL = () => {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").trim();
  const hasScheme =
    raw.toLowerCase().startsWith("http://") || raw.toLowerCase().startsWith("https://");
  let url = hasScheme ? raw : `https://${raw}`;
  while (url.endsWith("/")) url = url.slice(0, -1);
  return url;
};

/*
 * Web Push (VAPID). Generated once with `npx web-push generate-vapid-keys` and
 * then fixed forever: the public key is baked into every subscription a browser
 * has already created, so rotating the pair silently invalidates every device
 * and the only symptom is notifications quietly never arriving again.
 *
 * The public key is NEXT_PUBLIC_ on purpose. The browser must hand it to
 * pushManager.subscribe(), and it is an ECDSA public key — it authenticates the
 * sender to the push service, it does not authorise anything.
 */
export const VAPID_PUBLIC_KEY = () => required("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
export const VAPID_PRIVATE_KEY = () => required("VAPID_PRIVATE_KEY");
/** Contact address the push service can reach if this sender misbehaves. */
export const VAPID_SUBJECT = () => required("VAPID_SUBJECT");
