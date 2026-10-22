// Quest content lives in api/game_data/adventure.json and arrives with GET /api/adventure/state.
// The server decides when a quest completes; the client only displays progress.

export type QuestStatus = "done" | "active" | "locked";

/** Keep a server stage inside 0..questCount (questCount means the chapter is complete). */
export function clampStage(stage: number, questCount: number): number {
  if (!Number.isInteger(stage) || stage < 0) return 0;
  return Math.min(stage, Math.max(0, questCount));
}

export function questStatus(index: number, stage: number): QuestStatus {
  if (index < stage) return "done";
  return index === stage ? "active" : "locked";
}
