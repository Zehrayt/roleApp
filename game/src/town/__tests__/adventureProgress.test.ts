import { describe, expect, it } from "vitest";
import { ADVENTURE_STEPS, migrateAdventureStageV1, nextAdventureStage } from "../adventureProgress";

describe("adventure quest progression", () => {
  it("unlocks only the next quest after its matching event", () => {
    expect(ADVENTURE_STEPS).toHaveLength(3);
    expect(nextAdventureStage(0, "talk:lina")).toBe(0);
    expect(nextAdventureStage(0, "talk:maya")).toBe(1);
    expect(nextAdventureStage(1, "talk:maya")).toBe(1);
    expect(nextAdventureStage(1, "talk:lina")).toBe(2);
    expect(nextAdventureStage(2, "talk:leo")).toBe(3);
  });

  it("stays complete after the final quest", () => {
    expect(nextAdventureStage(ADVENTURE_STEPS.length, "talk:maya")).toBe(ADVENTURE_STEPS.length);
  });

  it("preserves old journal progress after removing the vocabulary quest", () => {
    expect([0, 1, 2, 3, 4].map(migrateAdventureStageV1)).toEqual([0, 1, 1, 2, 3]);
    expect(migrateAdventureStageV1(Number.NaN)).toBe(0);
  });
});
