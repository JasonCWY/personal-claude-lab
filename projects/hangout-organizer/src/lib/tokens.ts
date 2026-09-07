import { randomBytes } from "node:crypto";

/**
 * Share-link token. 16 bytes of crypto randomness, base64url — the only thing
 * standing between a WhatsApp forward and someone else's poll, so it must not
 * come from Math.random().
 */
export function newShareToken(): string {
  return randomBytes(16).toString("base64url");
}
