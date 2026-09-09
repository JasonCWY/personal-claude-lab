import type { Config } from "tailwindcss";

/**
 * Colours are semantic tokens backed by CSS variables, not raw palette steps.
 *
 * The alternative — `dark:` on every call site — would have meant a second class
 * on roughly 370 of them, and the first `bg-white` anyone forgot would be a
 * white card in a dark app. Here a theme is one block of variables in
 * globals.css, and a component that says `bg-surface text-ink` is correct in
 * both themes by construction.
 *
 * Variables hold space-separated RGB channels rather than hex so that Tailwind's
 * slash-opacity syntax keeps working: `bg-ok-bg/40` compiles to
 * `rgb(var(--ok-bg) / 0.4)`.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        /** The page itself, behind every card. */
        canvas: token("canvas"),
        surface: {
          DEFAULT: token("surface"),
          2: token("surface-2"),
          3: token("surface-3"),
        },
        ink: {
          DEFAULT: token("ink"),
          muted: token("ink-muted"),
          soft: token("ink-soft"),
          faint: token("ink-faint"),
        },
        line: {
          DEFAULT: token("line"),
          strong: token("line-strong"),
        },
        /** Primary action. Near-black on light, near-white on dark. */
        accent: {
          DEFAULT: token("accent"),
          fg: token("accent-fg"),
          hover: token("accent-hover"),
        },
        /** Yes / booked / free. */
        ok: {
          bg: token("ok-bg"),
          border: token("ok-border"),
          fg: token("ok-fg"),
          solid: token("ok-solid"),
          "solid-fg": token("ok-solid-fg"),
        },
        /** Waiting / partial / needs attention. */
        warn: {
          bg: token("warn-bg"),
          border: token("warn-border"),
          fg: token("warn-fg"),
          solid: token("warn-solid"),
          "solid-fg": token("warn-solid-fg"),
        },
        /** Destructive or failed. */
        bad: {
          bg: token("bad-bg"),
          border: token("bad-border"),
          fg: token("bad-fg"),
        },
        /** Events, kept distinct from sessions on the calendar. */
        info: {
          bg: token("info-bg"),
          "bg-hover": token("info-bg-hover"),
          fg: token("info-fg"),
        },
        /** An unpainted cell in the availability grid. */
        slot: {
          DEFAULT: token("slot"),
          hover: token("slot-hover"),
        },
        /** Heatmap density ramp, coolest to hottest. */
        heat: {
          1: token("heat-1"),
          2: token("heat-2"),
          3: token("heat-3"),
          4: token("heat-4"),
          fg: token("heat-fg"),
        },
      },
      spacing: {
        // Home-indicator clearance on iPhones, zero everywhere else.
        safe: "env(safe-area-inset-bottom, 0px)",
      },
      minHeight: {
        // The tap target floor. Anything a thumb aims for should clear this.
        tap: "2.75rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
