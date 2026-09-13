import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getHostIdentity } from "@/lib/auth";
import { HostNav } from "@/components/HostNav";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Declared here rather than in the root layout on purpose: this is what makes
 * the app installable, and only the host should be installing it. It is also
 * what iOS requires before it will allow notifications at all — Safari exposes
 * PushManager only to a site added to the Home Screen.
 */
export const metadata: Metadata = {
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Hangout" },
};

/**
 * Auth guard. Middleware already redirects anonymous visitors, but this is the
 * check that matters: it also rejects a valid Supabase session belonging to
 * anyone other than the host.
 */
export default async function HostLayout({ children }: { children: React.ReactNode }) {
  const { signedIn, hostEmail } = await getHostIdentity();
  if (!signedIn) redirect("/login");
  if (!hostEmail) redirect("/login?error=not_host");

  return (
    <div className="min-h-dvh">
      {/*
        Sticky, because the pages that need it most are the long ones — a poll
        with a full heatmap and three activities runs well past a phone screen,
        and getting back used to mean scrolling to the top first.
      */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <Link href="/" className="font-semibold tracking-tight">
            Hangout
            <span className="hidden sm:inline"> Organizer</span>
          </Link>
          <HostNav />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg px-2 py-1.5 text-sm text-ink-soft transition-colors hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/*
        The trailing padding clears the fixed bottom bar on a phone. Without it
        the last card on every page sits underneath the tabs.
      */}
      <main className="mx-auto max-w-5xl px-4 py-6 pb-28 sm:pb-8">{children}</main>
    </div>
  );
}
