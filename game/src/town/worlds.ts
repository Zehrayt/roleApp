import { buildIsles } from "./islesMap";
import { buildTown, type TownDefinition, type WorldId } from "./townMap";

export const WORLD_NAMES: Record<WorldId, string> = { town: "Town", isles: "Misty Isles" };

/** The world to build for a page load: the isles only exist in Adventure mode. */
export function worldFromUrl(search: string, adventureMode: boolean): WorldId {
  return adventureMode && new URLSearchParams(search).get("world") === "isles" ? "isles" : "town";
}

export function buildWorld(id: WorldId): TownDefinition {
  return id === "isles" ? buildIsles() : buildTown();
}

/** The page URL for a world, keeping the current mode. */
export function worldUrl(id: WorldId, search: string): string {
  const params = new URLSearchParams(search);
  if (id === "town") params.delete("world");
  else params.set("world", id);
  const query = params.toString();
  return `${window.location.pathname}${query ? `?${query}` : ""}`;
}
