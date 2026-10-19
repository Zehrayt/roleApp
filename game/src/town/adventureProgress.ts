export type AdventureEvent = "talk:maya" | "vocab:library" | "talk:lina" | "talk:leo";

export interface AdventureStep {
  title: string;
  place: string;
  detail: string;
  event: AdventureEvent;
}

export const ADVENTURE_STEPS: readonly AdventureStep[] = [
  { title: "Yol için erzak", place: "Fırın · Maya", detail: "Maya ile İngilizce konuşarak yolculuk hazırlığına başla.", event: "talk:maya" },
  { title: "Bir kelime, bir ipucu", place: "Kütüphane · Nesneler", detail: "Kütüphanedeki bir nesnenin İngilizce adını doğru söyle.", event: "vocab:library" },
  { title: "Eski kayıtlar", place: "Kütüphane · Lina", detail: "Lina ile İngilizce konuşarak eski kayıtları araştır.", event: "talk:lina" },
  { title: "Son hazırlık", place: "Kafe · Leo", detail: "Leo ile İngilizce konuşarak yol öncesi mola ver.", event: "talk:leo" },
];

export function nextAdventureStage(stage: number, event: AdventureEvent): number {
  return ADVENTURE_STEPS[stage]?.event === event ? stage + 1 : stage;
}
