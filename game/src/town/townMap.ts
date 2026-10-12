import { Block } from "./blocks";
import { createRng } from "./rng";
import { VoxelWorld } from "./VoxelWorld";

/**
 * The hub town. Every building is a "mekan" from the roleApp spec: the player
 * walks in through the door instead of picking a mode from a menu.
 *
 * Coordinates are block cells: x grows east, z grows south. Ground is y = 1.
 */

export const GROUND_Y = 1;
export const TOWN_SIZE = { width: 40, height: 16, depth: 40 } as const;

export interface Cell {
  x: number;
  z: number;
}

export interface CharacterLook {
  shirt: string;
  pants: string;
  skin: string;
  hair: string;
  eye: string;
  apron?: boolean;
  hat?: string;
  ribbon?: string;
}

/** Keys of ROLEPLAY_TTS_PROFILES in services/PraglishApiClient.ts. */
export type NpcVoice = "cafeNpc" | "librarian" | "barista";

export interface NpcSpec {
  id: string;
  name: string;
  title: string;
  /** Backend scenario id (api/game_data/scenarios/<location>.json). */
  location: string;
  /** Backend npc_role, matches NPC_PROFILES in ai/main.py. */
  npcRole: string;
  voice: NpcVoice;
  buildingId: string;
  cell: Cell;
  /** Ambient line shown over the NPC's head before a conversation starts. */
  greeting: string;
  look: CharacterLook;
}

export interface BlockPos {
  x: number;
  y: number;
  z: number;
}

/**
 * An object made of blocks that teaches a word. Tapping it (or pressing F next
 * to it) opens "What's this in English?"; answers go to /api/vocabulary.
 */
export interface PropSpec {
  id: string;
  buildingId: string;
  /** Vocabulary location: api/game_data/vocabulary/<location>.json */
  location: string;
  /** Concept id inside that vocabulary file. */
  concept: string;
  /** Turkish name shown as a hint. */
  nameTr: string;
  blocks: BlockPos[];
}

export interface Portal {
  /** Text on the interaction prompt, e.g. "Stüdyoya gir". */
  label: string;
  href: string;
}

/** A full-screen activity hosted by a building (e.g. the dub studio). */
export interface Activity {
  id: "dub";
  /** Text on the interaction prompt. */
  label: string;
}

export interface BuildingSpec {
  id: string;
  name: string;
  nameEn: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  door: Cell;
  /** Blocks at or above this y belong to the building's "upper" mesh, hidden while the player is inside. */
  cutY: number;
  portal?: Portal;
  activity?: Activity;
}

export interface TownDefinition {
  world: VoxelWorld;
  buildings: BuildingSpec[];
  npcs: NpcSpec[];
  props: PropSpec[];
  spawn: Cell;
}

function blockRange(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): BlockPos[] {
  const out: BlockPos[] = [];
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) out.push({ x, y, z });
  return out;
}

interface BuildingPlan {
  id: string;
  name: string;
  nameEn: string;
  x0: number;
  z0: number;
  w: number;
  d: number;
  wall: number;
  roof: number;
  floor: number;
  door: Cell;
  windows: Cell[];
  portal?: Portal;
  activity?: Activity;
}

function placeBuilding(world: VoxelWorld, plan: BuildingPlan): BuildingSpec {
  const { x0, z0, w, d } = plan;
  const x1 = x0 + w - 1;
  const z1 = z0 + d - 1;
  world.fill(x0, GROUND_Y, z0, x1, GROUND_Y, z1, plan.floor);
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const edgeX = x === x0 || x === x1;
      const edgeZ = z === z0 || z === z1;
      if (edgeX || edgeZ) world.fill(x, 2, z, x, 5, z, edgeX && edgeZ ? Block.LOG : plan.wall);
    }
  }
  for (const win of plan.windows) {
    world.set(win.x, 3, win.z, Block.GLASS);
    world.set(win.x, 4, win.z, Block.GLASS);
  }
  world.set(plan.door.x, 2, plan.door.z, Block.AIR);
  world.set(plan.door.x, 3, plan.door.z, Block.AIR);
  // Stepped hip roof with a one-block overhang.
  for (let k = 0, y = 6; ; k++, y++) {
    const ax = x0 - 1 + k;
    const bx = x1 + 1 - k;
    const az = z0 - 1 + k;
    const bz = z1 + 1 - k;
    if (ax > bx || az > bz) break;
    world.fill(ax, y, az, bx, y, bz, plan.roof);
  }
  const spec: BuildingSpec = {
    id: plan.id,
    name: plan.name,
    nameEn: plan.nameEn,
    x0,
    z0,
    x1,
    z1,
    door: plan.door,
    cutY: 3,
  };
  if (plan.portal) spec.portal = plan.portal;
  if (plan.activity) spec.activity = plan.activity;
  return spec;
}

function placeTree(world: VoxelWorld, x: number, z: number, rng: () => number): void {
  world.fill(x, 2, z, x, 5, z, Block.LOG);
  for (let dy = 0; dy < 3; dy++) {
    const r = dy < 2 ? 2 : 1;
    const y = 5 + dy;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && rng() < 0.7) continue;
        if (world.get(x + dx, y, z + dz) === Block.AIR) world.set(x + dx, y, z + dz, Block.LEAVES);
      }
    }
  }
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    world.set(x + dx, 8, z + dz, Block.LEAVES);
  }
}

/** Finds the prop that owns the block at (x, y, z), if any. */
export function propAt(props: readonly PropSpec[], x: number, y: number, z: number): PropSpec | undefined {
  return props.find((p) => p.blocks.some((b) => b.x === x && b.y === y && b.z === z));
}

export function isInsideBuilding(b: BuildingSpec, x: number, z: number): boolean {
  return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;
}

/** True for blocks that belong to a building's upper (cut-away) part, including the roof overhang. */
export function isUpperBlock(b: BuildingSpec, x: number, y: number, z: number): boolean {
  return y >= b.cutY && x >= b.x0 - 1 && x <= b.x1 + 1 && z >= b.z0 - 1 && z <= b.z1 + 1;
}

export function buildTown(seed = 20261012): TownDefinition {
  const rng = createRng(seed);
  const { width, height, depth } = TOWN_SIZE;
  const world = new VoxelWorld(width, height, depth);

  // Ground, paths and the plaza fountain.
  world.fill(0, 0, 0, width - 1, 0, depth - 1, Block.DIRT);
  world.fill(0, GROUND_Y, 0, width - 1, GROUND_Y, depth - 1, Block.GRASS);
  world.fill(0, GROUND_Y, 19, width - 1, GROUND_Y, 20, Block.COBBLE);
  world.fill(19, GROUND_Y, 3, 20, GROUND_Y, depth - 1, Block.COBBLE);
  world.fill(16, GROUND_Y, 16, 23, GROUND_Y, 23, Block.COBBLE);
  world.fill(17, 2, 17, 22, 2, 22, Block.BRICK);
  world.fill(18, 2, 18, 21, 2, 21, Block.AIR);
  world.fill(18, GROUND_Y, 18, 21, GROUND_Y, 21, Block.WATER);

  const buildings: BuildingSpec[] = [];

  // Fırın — Negotiation Table (backend scenario: bakery / baker)
  buildings.push(placeBuilding(world, {
    id: "bakery", name: "Fırın", nameEn: "Bakery",
    x0: 4, z0: 4, w: 10, d: 8,
    wall: Block.PLASTER, roof: Block.ROOF, floor: Block.PLANKS,
    door: { x: 8, z: 11 },
    windows: [{ x: 5, z: 11 }, { x: 6, z: 11 }, { x: 11, z: 11 }, { x: 12, z: 11 }, { x: 13, z: 6 }, { x: 13, z: 7 }, { x: 13, z: 9 }],
  }));
  world.fill(5, 5, 12, 12, 5, 12, Block.AWNING);
  world.fill(6, 2, 7, 11, 2, 7, Block.DARK); // counter
  world.fill(11, 2, 5, 12, 3, 5, Block.BRICK); // oven
  world.fill(5, 2, 5, 6, 2, 5, Block.PLANKS); // flour crates
  world.set(12, 2, 10, Block.LEAVES); // potted plant
  world.fill(8, GROUND_Y, 12, 8, GROUND_Y, 18, Block.COBBLE);

  // Kütüphane — Smart Reading Scrolls (library / librarian)
  buildings.push(placeBuilding(world, {
    id: "library", name: "Kütüphane", nameEn: "Library",
    x0: 26, z0: 4, w: 10, d: 8,
    wall: Block.BRICK, roof: Block.DARK, floor: Block.PLANKS,
    door: { x: 30, z: 11 },
    windows: [{ x: 27, z: 11 }, { x: 28, z: 11 }, { x: 33, z: 11 }, { x: 34, z: 11 }, { x: 26, z: 7 }, { x: 26, z: 8 }],
  }));
  world.fill(27, 2, 5, 34, 4, 5, Block.SHELF);
  world.fill(28, 2, 8, 29, 2, 8, Block.DARK); // reading table
  world.set(28, 2, 9, Block.PLANKS); // chair
  world.fill(33, 2, 8, 33, 2, 9, Block.SHELF);
  world.fill(30, GROUND_Y, 12, 30, GROUND_Y, 18, Block.COBBLE);

  // Dinleme Köşesi — Shadowing Studio (cafe / barista)
  buildings.push(placeBuilding(world, {
    id: "cafe", name: "Dinleme Köşesi", nameEn: "Café",
    x0: 4, z0: 26, w: 10, d: 8,
    wall: Block.PLANKS, roof: Block.ROOF, floor: Block.DARK,
    door: { x: 8, z: 26 },
    windows: [{ x: 5, z: 26 }, { x: 6, z: 26 }, { x: 10, z: 26 }, { x: 11, z: 26 }, { x: 12, z: 26 }, { x: 4, z: 29 }, { x: 4, z: 30 }],
  }));
  world.fill(10, 2, 31, 12, 2, 31, Block.DARK);
  world.set(6, 2, 29, Block.LOG);
  world.set(6, 2, 31, Block.LOG);
  world.set(5, 2, 29, Block.PLANKS); // chairs
  world.set(5, 2, 31, Block.PLANKS);
  world.fill(8, GROUND_Y, 21, 8, GROUND_Y, 25, Block.COBBLE);

  // Dublaj Stüdyosu — "Listen & Repeat" (dub the scene), opened in place as an overlay.
  buildings.push(placeBuilding(world, {
    id: "studio", name: "Dublaj Stüdyosu", nameEn: "Dub Studio",
    x0: 27, z0: 26, w: 8, d: 7,
    wall: Block.BRICK, roof: Block.DARK, floor: Block.DARK,
    door: { x: 30, z: 26 },
    windows: [{ x: 28, z: 26 }, { x: 32, z: 26 }, { x: 33, z: 26 }],
    activity: { id: "dub", label: "Dublaj Stüdyosu'na gir" },
  }));
  world.fill(28, 2, 31, 33, 2, 31, Block.DARK);
  world.fill(30, GROUND_Y, 21, 30, GROUND_Y, 25, Block.COBBLE);

  const trees: Array<[number, number]> = [[17, 8], [2, 15], [37, 15], [24, 36], [16, 37], [2, 37], [37, 37], [22, 9]];
  for (const [x, z] of trees) placeTree(world, x, z, rng);
  for (let i = 0; i < 14; i++) {
    const x = 22 + Math.floor(rng() * 4);
    const z = 26 + Math.floor(rng() * 12);
    if (world.get(x, 2, z) === Block.AIR && world.get(x, GROUND_Y, z) === Block.GRASS) world.set(x, 2, z, Block.LEAVES);
  }

  const npcs: NpcSpec[] = [
    {
      id: "maya", name: "Maya", title: "Fırıncı", location: "bakery", npcRole: "baker", voice: "cafeNpc",
      buildingId: "bakery", cell: { x: 9, z: 6 },
      greeting: "Good morning! The croissants just came out of the oven.",
      look: { shirt: "#c96a3c", pants: "#5b4636", skin: "#d8a27a", hair: "#2b1b12", eye: "#3a2a1a", apron: true, hat: "#f7f4ec" },
    },
    {
      id: "lina", name: "Lina", title: "Kütüphaneci", location: "library", npcRole: "librarian", voice: "librarian",
      buildingId: "library", cell: { x: 31, z: 7 },
      greeting: "Shh… looking for something to read today?",
      look: { shirt: "#5a4a8c", pants: "#2d2a3a", skin: "#f0c9a6", hair: "#b3562e", eye: "#2e5e3a" },
    },
    {
      id: "leo", name: "Leo", title: "Barista", location: "cafe", npcRole: "barista", voice: "barista",
      buildingId: "cafe", cell: { x: 11, z: 32 },
      greeting: "Hey! What can I get you? Today's playlist is great.",
      look: { shirt: "#2f4d3a", pants: "#2a2a2a", skin: "#a8724f", hair: "#1a1210", eye: "#1a1210", apron: true },
    },
  ];

  const props: PropSpec[] = [
    { id: "bakery-counter", buildingId: "bakery", location: "bakery", concept: "counter", nameTr: "tezgâh", blocks: blockRange(6, 2, 7, 11, 2, 7) },
    { id: "bakery-oven", buildingId: "bakery", location: "bakery", concept: "oven", nameTr: "fırın (ocak)", blocks: blockRange(11, 2, 5, 12, 3, 5) },
    { id: "bakery-plant", buildingId: "bakery", location: "bakery", concept: "plant", nameTr: "saksı bitkisi", blocks: [{ x: 12, y: 2, z: 10 }] },
    { id: "library-bookcase", buildingId: "library", location: "library", concept: "bookcase", nameTr: "kitaplık", blocks: blockRange(27, 2, 5, 34, 4, 5) },
    { id: "library-table", buildingId: "library", location: "library", concept: "table", nameTr: "masa", blocks: blockRange(28, 2, 8, 29, 2, 8) },
    { id: "library-chair", buildingId: "library", location: "library", concept: "chair", nameTr: "sandalye", blocks: [{ x: 28, y: 2, z: 9 }] },
    { id: "cafe-table", buildingId: "cafe", location: "cafe", concept: "table", nameTr: "masa", blocks: [{ x: 6, y: 2, z: 29 }, { x: 6, y: 2, z: 31 }] },
    { id: "cafe-chair", buildingId: "cafe", location: "cafe", concept: "chair", nameTr: "sandalye", blocks: [{ x: 5, y: 2, z: 29 }, { x: 5, y: 2, z: 31 }] },
    { id: "cafe-counter", buildingId: "cafe", location: "cafe", concept: "counter", nameTr: "tezgâh", blocks: blockRange(10, 2, 31, 12, 2, 31) },
  ];

  return { world, buildings, npcs, props, spawn: { x: 8, z: 15 } };
}
