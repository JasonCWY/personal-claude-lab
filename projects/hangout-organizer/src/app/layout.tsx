import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hangout Organizer",
  description: "Weekly badminton and pickleball sessions, venues, and event checklists.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The availability grid is drag-based; pinch-zooming mid-drag makes it unusable.
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
