import { describe, expect, it } from "vitest";
import { creatorReply, creatorReplyText, isCreatorQuestion, isCreatorReply } from "./creator";

describe("isCreatorQuestion", () => {
  it.each([
    "who made this project",
    "Who made this project?",
    "who is the creator",
    "Who is your creator?",
    "who created you",
    "who built this app",
    "Who developed AgriMitra?",
    "who is the developer of this app",
    "tell me about the creator",
    "creator of this project",
    "who made this",
    "who made you?",
    "this app is made by whom",
    "who is behind this project",
    "who are you made by",
    "ఈ ప్రాజెక్ట్ ఎవరు తయారు చేశారు?",
    "నిన్ను ఎవరు తయారు చేశారు",
    "సృష్టికర్త ఎవరు?",
    "ఈ యాప్‌ను ఎవరు రూపొందించారు",
    "డెవలపర్ ఎవరు",
  ])("matches %s", (question) => {
    expect(isCreatorQuestion(question)).toBe(true);
  });

  it.each([
    "who made this fertilizer",
    "who is the maker of this pesticide",
    "how to make compost",
    "Why are my tomato leaves turning yellow?",
    "which company developed this seed variety",
    "what can you do",
    "who are you",
    "When is the best time to sow paddy?",
    "ఈ ఎరువు ఎవరు తయారు చేశారు",
    "నా టమాటా ఆకులు పసుపు రంగులోకి ఎందుకు మారుతున్నాయి?",
  ])("does not match %s", (question) => {
    expect(isCreatorQuestion(question)).toBe(false);
  });
});

describe("creatorReply", () => {
  it("round-trips through the marker helpers in both languages", () => {
    for (const language of ["en", "te"] as const) {
      const reply = creatorReply(language);
      expect(isCreatorReply(reply)).toBe(true);
      expect(creatorReplyText(reply)).toContain("G. Jahnavi");
    }
    expect(isCreatorReply("A normal answer about paddy.")).toBe(false);
  });
});
