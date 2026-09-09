import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  experimental: {
    /**
     * Client router cache lifetime, in seconds.
     *
     * Every page here is `force-dynamic`, and Next's default stale time for a
     * dynamic route is 0 — so moving Dashboard → Calendar → Dashboard refetched
     * the dashboard from the server, and so did every browser Back. Holding the
     * payload for half a minute makes navigating around the app feel immediate.
     *
     * This is safe against stale data because the mutations are server actions
     * that call `revalidatePath`, which clears the client router cache for the
     * affected path — so confirming a session or editing the roster still shows
     * the new state at once. The window only ever hides a change made somewhere
     * other than this tab, which for a single-host app is the rare case.
     */
    staleTimes: { dynamic: 30, static: 180 },
  },
};

export default nextConfig;
