"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";

/** base64url -> Uint8Array. What pushManager.subscribe wants the key as. */
function decodeKey(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Enough to recognise a stale row later without parsing a user agent string. */
function describeDevice(): string {
  const ua = navigator.userAgent;
  const brands: [string, string][] = [
    ["Edg/", "Edge"],
    ["OPR/", "Opera"],
    ["Firefox/", "Firefox"],
    ["Chrome/", "Chrome"],
    ["Safari/", "Safari"],
  ];
  const platforms: [RegExp, string][] = [
    [/Android/, "Android"],
    [/iPhone|iPad|iPod/, "iOS"],
    [/Macintosh/, "Mac"],
    [/Windows/, "Windows"],
  ];
  const browser = brands.find(([token]) => ua.includes(token))?.[1] ?? "Browser";
  const platform = platforms.find(([pattern]) => pattern.test(ua))?.[1] ?? "Device";
  return `${platform} · ${browser}`;
}

type State = "checking" | "unsupported" | "needs-install" | "off" | "on" | "blocked";

/**
 * Turns push on for THIS device. One row per browser, so the host has to do
 * this once on the phone and once on the laptop — which is also why the label
 * says "this device" rather than something that sounds account-wide.
 */
export function PushToggle() {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Create (or refresh) the subscription and hand it to the server. */
  const register = useCallback(async () => {
    const registration = await navigator.serviceWorker.register("/sw.js");
    // A freshly registered worker is not active yet, and subscribing through an
    // inactive registration throws.
    await navigator.serviceWorker.ready;

    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) throw new Error("Push is not configured on this deployment.");

    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        // Web Push allows silent pushes; browsers do not. Chrome drops the
        // subscription outright if you ever send one without showing a
        // notification, so this is effectively mandatory.
        userVisibleOnly: true,
        applicationServerKey: decodeKey(key) as BufferSource,
      }));

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...subscription.toJSON(), label: describeDevice() }),
    });
    if (!response.ok) throw new Error("The server would not save this device.");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        /*
         * On iOS this is the normal state in a Safari TAB, not a broken one.
         * Safari only exposes PushManager to a site added to the Home Screen,
         * so the honest instruction is "install it", not "your browser cannot
         * do this" — and `display-mode: standalone` is how we tell the two
         * apart.
         */
        const standalone = window.matchMedia("(display-mode: standalone)").matches;
        const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        if (!cancelled) setState(ios && !standalone ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("blocked");
        return;
      }
      if (Notification.permission !== "granted") {
        if (!cancelled) setState("off");
        return;
      }

      /*
       * Permission is already granted, so re-register silently.
       *
       * Push subscriptions rotate — a browser update, a long gap, a cleared
       * site setting — and when one does, the old endpoint starts returning 410
       * and the host simply stops being notified. Nothing announces that. An
       * idempotent upsert on every host page load is the cheapest possible
       * guard against discovering it weeks later.
       */
      try {
        await register();
        if (!cancelled) setState("on");
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [register]);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      // Must be called from the click itself — browsers ignore a permission
      // request that is not tied to a gesture.
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("blocked");
        return;
      }
      if (permission !== "granted") return;
      await register();
      setState("on");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // Tell the server first: a row left behind after the browser has
        // forgotten the subscription is one that can only fail, and it would
        // not be pruned until the next send returns 410.
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const copy: Record<State, string> = {
    checking: "Checking this device…",
    unsupported: "This browser cannot receive notifications.",
    "needs-install": "Share → Add to Home Screen first, then open it from there. iOS only allows notifications from an installed app.",
    off: "Get a notification on this device when someone answers a poll.",
    on: "On for this device. You will be told when someone answers, changes their answer, or declines.",
    blocked: "Notifications are blocked for this site. Allow them in your browser's site settings, then reload.",
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">Notifications</p>
        <p className="mt-0.5 text-sm text-ink-muted">{error ?? copy[state]}</p>
      </div>
      {state === "on" && (
        <Button variant="secondary" onClick={turnOff} disabled={busy} className="shrink-0">
          {busy ? "Turning off…" : "Turn off"}
        </Button>
      )}
      {state === "off" && (
        <Button onClick={turnOn} disabled={busy} className="shrink-0">
          {busy ? "Enabling…" : "Notify me here"}
        </Button>
      )}
    </div>
  );
}
