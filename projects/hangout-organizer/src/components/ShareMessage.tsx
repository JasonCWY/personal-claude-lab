"use client";

import { useState } from "react";

/**
 * The WhatsApp hand-off: shows the message, lets the host edit it, then copies.
 *
 * Sharing here is deliberately a clipboard hand-off rather than an integration
 * — the WhatsApp Business API is neither free nor worth it for a friend group.
 * Given that, the host is the one doing the sending, so they should be able to
 * see and reword what they are about to paste. The generated text is a starting
 * point, not a fixed output.
 */
export function ShareMessage({
  url,
  defaultMessage,
}: {
  url: string;
  defaultMessage: string;
}) {
  const [message, setMessage] = useState(defaultMessage);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // The URL goes on its own line, last. WhatsApp turns a bare URL into a
  // tappable link and builds a preview card from it, but only when nothing is
  // glued to either end - trailing punctuation or a bracket both break it.
  const full = `${message}\n\n${url}`;

  // wa.me opens WhatsApp with the text already in the box, so the host picks
  // a chat and sends rather than copying and pasting. A plain deep link, not
  // the Business API - nothing to sign up for and nothing to pay.
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(full)}`;

  // A URL WhatsApp will not linkify: localhost has no public TLD, so until the
  // app is deployed the pasted link is dead text on anyone else’s phone.
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(url);

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
    <div className="space-y-3">
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
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Message preview
          </span>
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="text-xs text-slate-600 underline"
          >
            {editing ? "Done editing" : "Edit"}
          </button>
        </div>

        {editing ? (
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={Math.min(14, message.split("\n").length + 2)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs"
          />
        ) : (
          // Rendered the way WhatsApp would show it, so the host sees the real
          // shape of what they are pasting rather than a form field.
          <pre className="max-w-full whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-sm text-slate-800">
            {full}
          </pre>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Open in WhatsApp
          </a>
          <button
            type="button"
            onClick={() => copy(full, "message")}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Copy message
          </button>
          {message !== defaultMessage && (
            <button
              type="button"
              onClick={() => setMessage(defaultMessage)}
              className="text-xs text-slate-500 underline"
            >
              Reset to generated text
            </button>
          )}
          <span className="text-xs text-slate-500">{full.length} characters</span>
        </div>
      </div>

      {isLocal && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          This link points at <code>localhost</code>, so it only works on this machine and WhatsApp
          will not make it tappable. Deploy to Vercel and set <code>NEXT_PUBLIC_SITE_URL</code>
          {" "}to the public URL before sending it to anyone.
        </p>
      )}

      {copied === "failed" ? (
        <p className="text-xs text-rose-700">Could not access the clipboard — copy it manually.</p>
      ) : copied ? (
        <p className="text-xs text-emerald-700">Copied the {copied}.</p>
      ) : null}
    </div>
  );
}
