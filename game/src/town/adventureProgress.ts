export type AdventureEvent = "talk:maya" | "talk:lina" | "talk:leo";

export interface AdventureStep {
  title: string;
  place: string;
  detail: string;
  event: AdventureEvent;
}

export const ADVENTURE_STEPS: readonly AdventureStep[] = [
  { title: "Yol için erzak", place: "Fırın · Maya", detail: "Maya ile İngilizce konuşarak yolculuk hazırlığına başla.", event: "talk:maya" },
  { title: "Eski kayıtlar", place: "Kütüphane · Lina", detail: "Lina ile İngilizce konuşarak eski kayıtları araştır.", event: "talk:lina" },
  { title: "Son hazırlık", place: "Kafe · Leo", detail: "Leo ile İngilizce konuşarak yol öncesi mola ver.", event: "talk:leo" },
];

export function nextAdventureStage(stage: number, event: AdventureEvent): number {
  return ADVENTURE_STEPS[stage]?.event === event ? stage + 1 : stage;
}

/** The old four-step journal had a vocabulary quest between Maya and Lina. */
export function migrateAdventureStageV1(stage: number): number {
  if (!Number.isInteger(stage) || stage < 0) return 0;
  return Math.min(stage <= 1 ? stage : stage - 1, ADVENTURE_STEPS.length);
}
