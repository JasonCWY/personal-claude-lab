import { describe, expect, it } from "vitest";
import { describeResponse, type ResponseNotice } from "@/lib/push-message";

const BASE: ResponseNotice = {
  personName: "Aisyah",
  pollTitle: "Badminton wk 3",
  pollId: "11111111-2222-3333-4444-555555555555",
  declined: false,
  isFirstAnswer: true,
  answered: 4,
  invited: 7,
};

const notice = (over: Partial<ResponseNotice> = {}) => describeResponse({ ...BASE, ...over });

describe("describeResponse", () => {
  it("reads as a new answer the first time someone submits", () => {
    const { title, body } = notice();
    expect(title).toBe("Aisyah answered");
    expect(body).toBe("Badminton wk 3 · 4 of 7 answered");
  });

  // The three answers CLAUDE.md refuses to collapse must stay distinguishable
  // on a lock screen, where the title is all that is reliably read.
  it("distinguishes a re-submission from a first answer", () => {
    expect(notice({ isFirstAnswer: false }).title).toBe("Aisyah changed their answer");
  });

  it("distinguishes a decline from an answer, first time or not", () => {
    expect(notice({ declined: true }).title).toBe("Aisyah can't make it");
    expect(notice({ declined: true, isFirstAnswer: false }).title).toBe("Aisyah can't make it");
  });

  it("carries the running count, which is what survives a collapsed stack", () => {
    expect(notice({ answered: 7, invited: 7 }).body).toContain("7 of 7 answered");
  });

  it("omits the count rather than printing 'of 0' when the invitee list is empty", () => {
    const { body } = notice({ invited: 0, answered: 0 });
    expect(body).toBe("Badminton wk 3");
    expect(body).not.toContain("0");
  });

  it("tags per poll so repeats replace instead of stacking", () => {
    expect(notice().tag).toBe(`poll:${BASE.pollId}`);
    // Same poll, different people and different answers -> same tag.
    expect(notice({ personName: "Farid", declined: true }).tag).toBe(notice().tag);
    // Different poll -> different tag, so two live polls do not overwrite
    // each other on the lock screen.
    expect(notice({ pollId: "other" }).tag).not.toBe(notice().tag);
  });

  it("links to the host page for that poll", () => {
    expect(notice().url).toBe(`/polls/${BASE.pollId}`);
  });

  it("clips a name and a title that would otherwise fill the whole line", () => {
    const { title, body } = notice({
      personName: "A".repeat(60),
      pollTitle: "B".repeat(80),
    });
    expect(title.length).toBeLessThanOrEqual(" answered".length + 24);
    expect(title).toContain("…");
    expect(body.startsWith(`${"B".repeat(39)}…`)).toBe(true);
  });

  it("falls back to 'Someone' rather than rendering an empty name", () => {
    expect(notice({ personName: "   " }).title).toBe("Someone answered");
  });
});
