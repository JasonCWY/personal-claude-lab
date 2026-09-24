"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";

const RESET_MS = 5000;

/**
 * A submit button that needs two clicks: the first arms it (label swaps to
 * `confirmLabel` for `RESET_MS`), the second lets the click through to the
 * enclosing `<form action={...}>` unmodified. Silently disarms if the second
 * click never comes, so nothing is ever submitted from a single tap.
 */
export function ConfirmSubmit({
  children,
  variant,
  className = "",
  confirmLabel = "Click again to confirm",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
  confirmLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  const resetAt = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (armed) return;
    e.preventDefault();
    setArmed(true);
    resetAt.current = setTimeout(() => setArmed(false), RESET_MS);
  }

  const label = armed ? confirmLabel : children;
  return variant ? (
    <Button type="submit" variant={variant} className={className} onClick={handleClick}>
      {label}
    </Button>
  ) : (
    <button type="submit" className={className} onClick={handleClick}>
      {label}
    </button>
  );
}
