export type AdventureEvent = "inventory:provisions" | "inventory:boat_manual" | "talk:leo";

export interface AdventureStep {
  title: string;
  place: string;
  detail: string;
  event: AdventureEvent;
}

export const ADVENTURE_STEPS: readonly AdventureStep[] = [
  { title: "Supplies for the Road", place: "Bakery · Maya", detail: "Get food or a drink for your journey from Maya. This quest is complete when the item enters your inventory.", event: "inventory:provisions" },
  { title: "Boat-Building Handbook", place: "Library · Lina", detail: "Get a boat-building handbook from Lina. This quest is complete when the book enters your inventory.", event: "inventory:boat_manual" },
  { title: "One Last Stop", place: "Café · Leo", detail: "Talk to Leo in English and take a break before your journey.", event: "talk:leo" },
];

export function nextAdventureStage(stage: number, event: AdventureEvent): number {
  return ADVENTURE_STEPS[stage]?.event === event ? stage + 1 : stage;
}

/** The old four-step journal had a vocabulary quest between Maya and Lina. */
export function migrateAdventureStageV1(stage: number): number {
  if (!Number.isInteger(stage) || stage < 0) return 0;
  return Math.min(stage <= 1 ? stage : stage - 1, ADVENTURE_STEPS.length);
}
