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
      {/* Stacked on a phone: side by side, the URL got about 120px and the
          host could not see which link they were about to copy. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="scroll-x flex-1 whitespace-nowrap rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-muted">
          {url}
        </code>
        <button
          type="button"
          onClick={() => copy(url, "link")}
          className="min-h-tap shrink-0 rounded-lg border border-line-strong bg-surface px-3.5 py-2 text-sm font-medium transition hover:bg-surface-2 active:scale-[0.98]"
        >
          Copy link
        </button>
      </div>

      <div className="rounded-xl border border-line bg-surface-2 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Message preview
          </span>
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className="rounded-lg px-2 py-1.5 text-xs text-ink-muted underline transition-colors hover:text-ink"
          >
            {editing ? "Done editing" : "Edit"}
          </button>
        </div>

        {editing ? (
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={Math.min(14, message.split("\n").length + 2)}
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 font-mono text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        ) : (
          // Rendered the way WhatsApp would show it, so the host sees the real
          // shape of what they are pasting rather than a form field.
          <pre className="max-w-full whitespace-pre-wrap break-words rounded-lg bg-surface p-3 text-sm text-ink">
            {full}
          </pre>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-tap flex-1 items-center justify-center rounded-lg bg-ok-solid px-3.5 py-2 text-sm font-medium text-ok-solid-fg transition hover:brightness-110 active:scale-[0.98] sm:flex-none"
          >
            Open in WhatsApp
          </a>
          <button
            type="button"
            onClick={() => copy(full, "message")}
            className="inline-flex min-h-tap flex-1 items-center justify-center rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover active:scale-[0.98] sm:flex-none"
          >
            Copy message
          </button>
          {message !== defaultMessage && (
            <button
              type="button"
              onClick={() => setMessage(defaultMessage)}
              className="rounded-lg px-2 py-1.5 text-xs text-ink-soft underline transition-colors hover:text-ink"
            >
              Reset to generated text
            </button>
          )}
          <span className="text-xs text-ink-soft">{full.length} characters</span>
        </div>
      </div>

      {isLocal && (
        <p className="rounded-lg border border-warn-border bg-warn-bg p-3 text-xs text-warn-fg">
          This link points at <code>localhost</code>, so it only works on this machine and WhatsApp
          will not make it tappable. Deploy to Vercel and set <code>NEXT_PUBLIC_SITE_URL</code>
          {" "}to the public URL before sending it to anyone.
        </p>
      )}

      {copied === "failed" ? (
        <p className="text-xs text-bad-fg">Could not access the clipboard — copy it manually.</p>
      ) : copied ? (
        <p className="text-xs text-ok-fg">Copied the {copied}.</p>
      ) : null}
    </div>
  );
}
