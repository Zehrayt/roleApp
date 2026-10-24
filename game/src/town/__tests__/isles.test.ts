import { describe, expect, it } from "vitest";
import { findPath, type PathfindingGrid } from "../../engine/PathFinder";
import { Block } from "../blocks";
import { buildIsles } from "../islesMap";
import { GROUND_Y, isInsideBuilding, MEETING_PLACES } from "../townMap";

describe("Misty Isles map", () => {
  const isles = buildIsles();
  const { world } = isles;
  const grid = (): PathfindingGrid => ({
    width: world.width,
    height: world.depth,
    isWalkable: (x, z) => world.isStandable(x, z, GROUND_Y),
  });
  const spawn = { x: isles.spawn.x, y: isles.spawn.z };
  const door = (id: string) => {
    const b = isles.buildings.find((building) => building.id === id)!;
    return { x: b.door.x, y: b.door.z };
  };

  it("lands the player on the dock next to a boat home", () => {
    expect(grid().isWalkable(spawn.x, spawn.y)).toBe(true);
    expect(isles.boats[0]?.to).toBe("town");
    expect(isles.boats[0]?.anchors.length).toBeGreaterThan(4);
  });

  it("reaches the market, but the rune gate blocks the lighthouse until it opens", () => {
    expect(findPath(grid(), spawn, door("market"))).not.toBeNull();
    expect(findPath(grid(), spawn, door("lighthouse"))).toBeNull();
    const gate = isles.gates.find((g) => g.id === "mist_gate")!;
    expect(gate.blocks.every((b) => world.get(b.x, b.y, b.z) === Block.RUNE)).toBe(true);
    for (const b of gate.blocks) world.set(b.x, b.y, b.z, Block.AIR);
    expect(findPath(grid(), spawn, door("lighthouse"))).not.toBeNull();
  });

  it("puts each keeper inside their building on a standable cell", () => {
    for (const npc of isles.npcs) {
      expect(grid().isWalkable(npc.cell.x, npc.cell.z), npc.id).toBe(true);
      if (!npc.buildingId) continue;
      const building = isles.buildings.find((b) => b.id === npc.buildingId)!;
      expect(isInsideBuilding(building, npc.cell.x, npc.cell.z), npc.id).toBe(true);
    }
    expect(isles.npcs.find((n) => n.id === "sam")?.follows).toBe(true);
  });

  it("is the same every time (seeded)", () => {
    const again = buildIsles();
    expect(again.world.data).toEqual(buildIsles().world.data);
  });

  it("has its meeting places inside the right buildings", () => {
    for (const [id, place] of Object.entries(MEETING_PLACES).filter(([, p]) => p.world === "isles")) {
      expect(grid().isWalkable(place.cell.x, place.cell.z), id).toBe(true);
      const building = isles.buildings.find((b) => b.id === place.buildingId)!;
      expect(isInsideBuilding(building, place.cell.x, place.cell.z), id).toBe(true);
    }
  });
});
