"use client";

import { useEffect, useState } from "react";

type Mode = "light" | "dark" | "system";

const KEY = "theme";

/**
 * Three explicit states rather than one flip.
 *
 * A two-way toggle has to pick a starting side, and whichever it picks is wrong
 * for half the people opening a share link at night. "System" is the honest
 * default — it is also the only state that keeps following the phone when it
 * switches at sunset — so it stays reachable rather than being something you
 * fall out of permanently the first time you touch the control.
 *
 * The class is applied by the inline script in the root layout, before first
 * paint. This component only writes the preference and re-applies it; it never
 * owns the initial value, which is why there is no flash of the wrong theme.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("system");
  // The server has no idea what this browser prefers, so the selected state can
  // only be painted after mount. The buttons render identically either way, so
  // nothing moves — the highlight just arrives a frame late.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(KEY) as Mode | null;
    setMode(stored ?? "system");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = mode === "dark" || (mode === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    if (mode === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [mode, ready]);

  function choose(next: Mode) {
    setMode(next);
    // "system" is the absence of a preference, so it is stored as one. That
    // keeps it meaning "follow the device" on a browser that later changes.
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`inline-flex rounded-lg border border-line bg-surface-2 p-0.5 ${className}`}
    >
      {(
        [
          ["light", "Light", <SunIcon key="s" />],
          ["system", "Match device", <DeviceIcon key="d" />],
          ["dark", "Dark", <MoonIcon key="m" />],
        ] as const
      ).map(([value, label, icon]) => {
        const on = ready && mode === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            title={label}
            onClick={() => choose(value)}
            className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
              on ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
            }`}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}

/* Stroked 16px glyphs, sized in `em` so they track the button's font size. */
const svg = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function SunIcon() {
  return (
    <svg {...svg} className="text-[1rem]">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...svg} className="text-[1rem]">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function DeviceIcon() {
  return (
    <svg {...svg} className="text-[1rem]">
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8" />
    </svg>
  );
}
