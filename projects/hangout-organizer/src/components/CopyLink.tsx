"use client";

import { useState } from "react";

/**
 * Copies the share link plus a ready-to-paste WhatsApp message — the app has no
 * WhatsApp integration (the Business API is neither free nor worth it here), so
 * sharing is deliberately a clipboard hand-off.
 */
export function CopyLink({ url, message }: { url: string; message?: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-lg bg-slate-100 px-3 py-2 text-xs">
          {url}
        </code>
        <button
          type="button"
          onClick={() => copy(url, "link")}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Copy link
        </button>
        {message && (
          <button
            type="button"
            onClick={() => copy(`${message}\n${url}`, "message")}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Copy WhatsApp message
          </button>
        )}
      </div>
      {copied === "failed" ? (
        <p className="text-xs text-rose-700">Could not access the clipboard — copy it manually.</p>
      ) : copied ? (
        <p className="text-xs text-emerald-700">Copied the {copied}.</p>
      ) : null}
    </div>
  );
}
