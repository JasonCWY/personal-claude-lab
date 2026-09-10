import Link from "next/link";

export function Card({
  children,
  className = "",
  /** Set it to make a card a link target, e.g. /venues#v-<id>. */
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`rounded-xl border border-line bg-surface p-4 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    // Stacked on a phone, side by side once there is room. The action used to
    // wrap under a long subtitle at an arbitrary point and land half-indented.
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/**
 * `min-h-tap` is 44px — the smallest target most people can hit reliably with a
 * thumb. The old padding gave about 36, which is fine for a mouse and a
 * near-miss on a phone, and this app is opened on phones.
 */
const buttonBase =
  "inline-flex min-h-tap items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-accent text-accent-fg hover:bg-accent-hover",
    secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-2",
    danger: "border border-bad-border bg-surface text-bad-fg hover:bg-bad-bg",
  }[variant];
  return (
    <button {...props} className={`${buttonBase} ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={`${buttonBase} bg-accent text-accent-fg hover:bg-accent-hover`}>
      {children}
    </Link>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

/**
 * `text-base` is load-bearing, not a style choice: iOS Safari zooms the whole
 * page in when a focused field's text is under 16px, and then leaves it zoomed.
 */
const inputClass =
  "w-full min-h-tap rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-faint transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClass} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClass} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={inputClass} rows={props.rows ?? 3} />;
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "green" | "amber" | "rose";
}) {
  // The inset ring is what keeps these legible on dark, where a tinted fill
  // alone sits too close to the card behind it to read as a distinct chip.
  const tones = {
    slate: "bg-surface-2 text-ink-muted ring-line",
    green: "bg-ok-bg text-ok-fg ring-ok-border",
    amber: "bg-warn-bg text-warn-fg ring-warn-border",
    rose: "bg-bad-bg text-bad-fg ring-bad-border",
  }[tone];
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones}`}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-ink-soft">
      {children}
    </p>
  );
}

/**
 * Surfaces a message a server action passed back via ?error=. Server actions
 * cannot return a value to a plain <form action={...}>, so they redirect with
 * the reason attached and the page renders it here.
 */
export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-lg border border-bad-border bg-bad-bg p-3 text-sm text-bad-fg"
    >
      {message}
    </div>
  );
}
