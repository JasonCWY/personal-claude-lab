import Link from "next/link";
import { redirect } from "next/navigation";
import { getHostIdentity } from "@/lib/auth";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/calendar", label: "Calendar" },
  { href: "/venues", label: "Venues" },
  { href: "/people", label: "Roster" },
  { href: "/templates", label: "Templates" },
];

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
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold tracking-tight">
            Hangout Organizer
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-slate-900">
                {item.label}
              </Link>
            ))}
          </nav>
          <form action="/auth/signout" method="post" className="ml-auto">
            <button type="submit" className="text-sm text-slate-500 hover:text-slate-900">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
