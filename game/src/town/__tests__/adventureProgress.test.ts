import { describe, expect, it } from "vitest";
import { ADVENTURE_STEPS, nextAdventureStage } from "../adventureProgress";

describe("adventure quest progression", () => {
  it("unlocks only the next quest after its matching event", () => {
    expect(nextAdventureStage(0, "talk:lina")).toBe(0);
    expect(nextAdventureStage(0, "talk:maya")).toBe(1);
    expect(nextAdventureStage(1, "talk:maya")).toBe(1);
    expect(nextAdventureStage(1, "vocab:library")).toBe(2);
    expect(nextAdventureStage(2, "talk:lina")).toBe(3);
    expect(nextAdventureStage(3, "talk:leo")).toBe(4);
  });

  it("stays complete after the final quest", () => {
    expect(nextAdventureStage(ADVENTURE_STEPS.length, "talk:maya")).toBe(ADVENTURE_STEPS.length);
  });
});
