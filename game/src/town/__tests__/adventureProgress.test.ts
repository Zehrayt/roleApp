import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clampStage, questStatus } from "../adventureProgress";

describe("adventure quest progression", () => {
  it("keeps the server stage within the chapter", () => {
    expect(clampStage(-1, 3)).toBe(0);
    expect(clampStage(Number.NaN, 3)).toBe(0);
    expect(clampStage(2, 3)).toBe(2);
    expect(clampStage(7, 3)).toBe(3);
  });

  it("marks earlier quests done, the current one active, later ones locked", () => {
    expect([0, 1, 2].map((index) => questStatus(index, 1))).toEqual(["done", "active", "locked"]);
    expect([0, 1, 2].map((index) => questStatus(index, 3))).toEqual(["done", "done", "done"]);
  });
});

describe("adventure content file", () => {
  // In Docker the repo's api/game_data is mounted at /api/game_data; locally it sits next to game/.
  const candidates = ["../api/game_data/adventure.json", "/api/game_data/adventure.json"];
  const path = candidates.find((candidate) => {
    try { readFileSync(candidate); return true; } catch { return false; }
  });

  it.skipIf(!path)("has the display fields the journal renders", () => {
    const content = JSON.parse(readFileSync(path as string, "utf-8"));
    expect(content.chapter.title).toBeTruthy();
    expect(content.quests.length).toBeGreaterThan(0);
    for (const quest of content.quests) {
      expect(quest.id && quest.title && quest.place && quest.detail).toBeTruthy();
    }
  });
});
