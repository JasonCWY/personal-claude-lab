import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hangout Organizer",
  description: "Weekly badminton and pickleball sessions, venues, and event checklists.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the page paint under the notch and the home indicator; the layouts
  // pad themselves back out of both with env(safe-area-inset-*).
  viewportFit: "cover",
  // Pinch-zoom is deliberately NOT capped. It used to be, to stop a zoom
  // starting mid-drag on the availability grid, but `touch-action: none` on the
  // grid cells already prevents that where it happens — and blocking zoom
  // everywhere to fix one component takes magnification away from anyone who
  // needs it to read the page at all.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#090d16" },
  ],
};

/*
 * Runs before the first paint, so the correct theme is on <html> by the time
 * anything is drawn. Doing this in React instead would mean rendering the light
 * theme, hydrating, and then switching — the white flash that gives away a
 * bolted-on dark mode, and the one thing most worth avoiding on a phone at
 * night. It is inlined rather than imported for the same reason: a fetch for it
 * would land after the paint it exists to precede.
 */
const APPLY_THEME = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The script above mutates this element's class list before React sees it,
    // which is exactly the mismatch this attribute exists to permit.
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: APPLY_THEME }} />
        {children}
      </body>
    </html>
  );
}
