"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", icon: GridIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarIcon },
  { href: "/venues", label: "Venues", icon: PinIcon },
  { href: "/people", label: "Roster", icon: PeopleIcon },
  { href: "/templates", label: "Templates", icon: ListIcon },
];

/**
 * Same five destinations, two shapes.
 *
 * On a phone they are a fixed bottom bar: five thumb-sized targets at the edge
 * of the screen a hand actually reaches, instead of five small underlined words
 * wrapping onto a second line at the very top, which is the furthest point from
 * the thumb and the easiest place to mis-tap. On a wider screen the bar would be
 * an oddity, so the same list renders inline in the header instead.
 */
export function HostNav() {
  const pathname = usePathname();
  // "/" would otherwise prefix-match every page in the app.
  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <nav className="hidden gap-1 text-sm sm:flex">
        {NAV.map(({ href, label }) => {
          const on = isCurrent(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={`rounded-lg px-2.5 py-1.5 transition-colors ${
                on ? "bg-surface-2 font-medium text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-sm sm:hidden"
        // The bar sits on the home indicator otherwise, which both hides the
        // labels and makes the swipe-up gesture fight the last tab.
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul className="flex">
          {NAV.map(({ href, label, icon: Icon }) => {
            const on = isCurrent(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={`flex min-h-tap flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[0.65rem] transition-colors ${
                    on ? "text-ink" : "text-ink-soft"
                  }`}
                >
                  <Icon filled={on} />
                  <span className={on ? "font-semibold" : ""}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/*
 * Line icons, thickened rather than filled when active — a filled variant of
 * five different glyphs would need five more paths to stay recognisable, and
 * weight alone reads clearly enough at this size next to a bolded label.
 */
function base(filled: boolean) {
  return {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: filled ? 2.4 : 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;
}

function GridIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg {...base(filled)}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function CalendarIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg {...base(filled)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function PinIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg {...base(filled)}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PeopleIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg {...base(filled)}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 11.5a3.5 3.5 0 0 0 0-7M18 20a6.6 6.6 0 0 0-2-4.7" />
    </svg>
  );
}

function ListIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg {...base(filled)}>
      <rect x="8" y="3" width="13" height="15" rx="2" />
      <path d="M16 21H5a2 2 0 0 1-2-2V7" />
    </svg>
  );
}
