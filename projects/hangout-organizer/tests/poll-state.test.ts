import { describe, expect, it } from "vitest";
import { formatTimeLeft, isPollOpen, pollClosedReason, pollDeadline } from "@/lib/poll-state";

const NOW = new Date("2026-09-13T12:00:00Z");
const iso = (offsetMinutes: number) => new Date(NOW.getTime() + offsetMinutes * 60000).toISOString();

describe("pollClosedReason", () => {
  it("is open with no cut-off set", () => {
    expect(pollClosedReason({ status: "polling", closes_at: null }, NOW)).toBeNull();
    expect(isPollOpen({ status: "polling" }, NOW)).toBe(true);
  });

  it("is open while the cut-off is still ahead", () => {
    expect(pollClosedReason({ status: "polling", closes_at: iso(1) }, NOW)).toBeNull();
  });

  it("closes the moment the cut-off is reached, not a minute later", () => {
    expect(pollClosedReason({ status: "polling", closes_at: NOW.toISOString() }, NOW)).toBe("cut-off");
    expect(pollClosedReason({ status: "polling", closes_at: iso(-1) }, NOW)).toBe("cut-off");
  });

  it("reports the host's decision ahead of an expired cut-off", () => {
    // Both gates are shut. "I closed it" is the more useful thing to say.
    expect(pollClosedReason({ status: "closed", closes_at: iso(-60) }, NOW)).toBe("host");
  });

  it("stays closed when the host closed it early, cut-off or not", () => {
    expect(pollClosedReason({ status: "closed", closes_at: iso(600) }, NOW)).toBe("host");
  });

  it("treats an unparseable cut-off as no cut-off, never as closed", () => {
    // Refusing every answer because of a bad date string is the worse failure:
    // nothing outside the app could explain why the link stopped working.
    expect(pollClosedReason({ status: "polling", closes_at: "not a date" }, NOW)).toBeNull();
    expect(pollDeadline({ status: "polling", closes_at: "not a date" })).toBeNull();
  });
});

describe("formatTimeLeft", () => {
  it("counts down in units that survive a stale page", () => {
    expect(formatTimeLeft({ status: "polling", closes_at: iso(1) }, NOW)).toBe("1 minute");
    expect(formatTimeLeft({ status: "polling", closes_at: iso(45) }, NOW)).toBe("45 minutes");
    expect(formatTimeLeft({ status: "polling", closes_at: iso(60) }, NOW)).toBe("1 hour");
    expect(formatTimeLeft({ status: "polling", closes_at: iso(60 * 5) }, NOW)).toBe("5 hours");
    expect(formatTimeLeft({ status: "polling", closes_at: iso(60 * 72) }, NOW)).toBe("3 days");
  });

  it("returns null rather than a negative countdown once it has passed", () => {
    expect(formatTimeLeft({ status: "polling", closes_at: iso(-5) }, NOW)).toBeNull();
    expect(formatTimeLeft({ status: "polling", closes_at: null }, NOW)).toBeNull();
  });
});
