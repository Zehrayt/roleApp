import { Block } from "./blocks";
import { createRng, type Rng } from "./rng";
import {
  blockRange,
  GROUND_Y,
  placeBuilding,
  placeTree,
  type BlockPos,
  type BuildingSpec,
  type Cell,
  type NpcSpec,
  type TownDefinition,
} from "./townMap";
import { VoxelWorld } from "./VoxelWorld";

/**
 * Kademe 3 — the Misty Isles. Generated in code (no external assets): three
 * islands shaped by value noise, a harbour with the Mist Market, a bridge with
 * a rune gate, and the old lighthouse. Walkable ground stays at y = 1 like the
 * town; cliffs, rocks and crystals rise above it as scenery.
 */
export const ISLES_SIZE = { width: 64, height: 18, depth: 64 } as const;

/** Smooth value noise in [0, 1) on a lattice of `cell` blocks. */
function valueNoise(rng: Rng, width: number, depth: number, cell: number): (x: number, z: number) => number {
  const gw = Math.ceil(width / cell) + 2;
  const gd = Math.ceil(depth / cell) + 2;
  const grid = Array.from({ length: gw * gd }, () => rng());
  const at = (gx: number, gz: number) => grid[gz * gw + gx] ?? 0;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, z) => {
    const fx = x / cell;
    const fz = z / cell;
    const x0 = Math.floor(fx);
    const z0 = Math.floor(fz);
    const tx = smooth(fx - x0);
    const tz = smooth(fz - z0);
    const top = at(x0, z0) + (at(x0 + 1, z0) - at(x0, z0)) * tx;
    const bottom = at(x0, z0 + 1) + (at(x0 + 1, z0 + 1) - at(x0, z0 + 1)) * tx;
    return top + (bottom - top) * tz;
  };
}

interface Isle {
  cx: number;
  cz: number;
  r: number;
}

const ISLES: readonly Isle[] = [
  { cx: 30, cz: 46, r: 14 }, // harbour isle: dock, Mist Market
  { cx: 44, cz: 15, r: 10 }, // lighthouse isle
  { cx: 13, cz: 19, r: 7 }, // crystal isle (scenery)
];

/** Walkable route from the dock to the lighthouse door; the bridge crosses open water. */
const ROUTE: readonly Cell[] = [
  { x: 30, z: 57 }, { x: 30, z: 48 }, { x: 24, z: 48 }, { x: 24, z: 43 },
  { x: 24, z: 48 }, { x: 33, z: 41 }, { x: 37, z: 33 }, { x: 41, z: 26 }, { x: 44, z: 22 }, { x: 44, z: 20 },
];
/** Open water between the harbour isle and the lighthouse isle (the bridge is the only way across). */
const STRAIT = { z0: 26, z1: 33 } as const;
const GATE_Z = 30;

function line(a: Cell, b: Cell): Cell[] {
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z), 1);
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: Math.round(a.x + ((b.x - a.x) * i) / steps),
    z: Math.round(a.z + ((b.z - a.z) * i) / steps),
  }));
}

/** The old lighthouse: a striped tower with a crystal beacon on top. */
function placeLighthouse(world: VoxelWorld): BuildingSpec {
  const x0 = 41;
  const z0 = 13;
  const x1 = 47;
  const z1 = 19;
  world.fill(x0, GROUND_Y, z0, x1, GROUND_Y, z1, Block.PLANKS);
  for (let y = 2; y <= 12; y++) {
    const band = Math.floor((y - 2) / 2) % 2 === 0 ? Block.PLASTER : Block.BRICK;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        if (edge && !corner) world.set(x, y, z, band);
        if (corner && y <= 11) world.set(x, y, z, Block.STONE);
      }
    }
  }
  for (const [x, z] of [[44, z1], [x0, 16], [x1, 16]] as const) {
    world.set(x, 3, z, Block.GLASS);
    world.set(x, 7, z, Block.GLASS);
    world.set(x, 10, z, Block.GLASS);
  }
  world.fill(x0, 13, z0, x1, 13, z1, Block.DARK); // gallery floor
  world.fill(43, 14, 15, 45, 15, 17, Block.GLASS); // lantern room
  world.fill(44, 14, 16, 44, 15, 16, Block.STONE); // the cold lamp (lit in the final scene)
  world.fill(43, 16, 15, 45, 16, 17, Block.ROOF);
  world.set(44, 2, z1, Block.AIR);
  world.set(44, 3, z1, Block.AIR);
  world.fill(42, 2, 14, 43, 2, 14, Block.SHELF); // star charts
  world.set(46, 2, 14, Block.CRYSTAL);
  return { id: "lighthouse", name: "Lighthouse", x0, z0, x1, z1, door: { x: 44, z: z1 }, cutY: 3 };
}

export function buildIsles(seed = 20261030): TownDefinition {
  const rng = createRng(seed);
  const { width, height, depth } = ISLES_SIZE;
  const world = new VoxelWorld(width, height, depth);
  const coast = valueNoise(rng, width, depth, 6);
  const detail = valueNoise(rng, width, depth, 3);
  const rocks = valueNoise(rng, width, depth, 4);

  // Sea floor and sea.
  world.fill(0, 0, 0, width - 1, 0, depth - 1, Block.SAND);
  world.fill(0, GROUND_Y, 0, width - 1, GROUND_Y, depth - 1, Block.WATER);

  // Islands: a radial falloff per isle, roughened by noise.
  const landness = (x: number, z: number) => {
    let best = -1;
    for (const isle of ISLES) {
      const d = Math.hypot(x - isle.cx, z - isle.cz) / isle.r;
      best = Math.max(best, 1 - d + (coast(x, z) - 0.5) * 0.55 + (detail(x, z) - 0.5) * 0.2);
    }
    return best;
  };
  const land = (x: number, z: number) => landness(x, z) > 0 && !(z >= STRAIT.z0 && z <= STRAIT.z1);
  for (let z = 1; z < depth - 1; z++) {
    for (let x = 1; x < width - 1; x++) {
      if (!land(x, z)) continue;
      const shore = landness(x, z) < 0.18;
      world.set(x, GROUND_Y, z, shore ? Block.SAND : Block.GRASS);
    }
  }

  // The walkable route: cobble on land, a plank bridge over water. Two blocks wide.
  const routeCells = new Set<string>();
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i];
    const b = ROUTE[i + 1];
    if (!a || !b) continue;
    for (const c of line(a, b)) {
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const x = c.x + dx;
        const z = c.z + dz;
        routeCells.add(`${x},${z}`);
        const onLand = world.get(x, GROUND_Y, z) !== Block.WATER;
        world.set(x, GROUND_Y, z, onLand ? Block.COBBLE : Block.PLANKS);
        world.fill(x, 2, z, x, 4, z, Block.AIR);
      }
    }
  }
  // Bridge rails where the route crosses the strait.
  for (const key of routeCells) {
    const [x, z] = key.split(",").map(Number) as [number, number];
    if (z < STRAIT.z0 || z > STRAIT.z1) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0]] as const) {
      const nx = x + dx;
      if (!routeCells.has(`${nx},${z}`) && world.get(nx, GROUND_Y, z) === Block.WATER) world.set(nx, GROUND_Y, z, Block.LOG);
    }
  }

  // Dock and boat on the south shore (arrival from town).
  world.fill(30, GROUND_Y, 55, 31, GROUND_Y, 62, Block.PLANKS);
  for (const z of [57, 60]) {
    world.set(29, GROUND_Y, z, Block.LOG);
    world.set(32, GROUND_Y, z, Block.LOG);
  }
  world.fill(33, GROUND_Y, 59, 35, GROUND_Y, 62, Block.PLANKS);
  world.fill(33, 2, 59, 35, 2, 59, Block.LOG);
  world.fill(33, 2, 62, 35, 2, 62, Block.LOG);
  world.fill(35, 2, 60, 35, 2, 61, Block.LOG);
  const boatAnchors: BlockPos[] = blockRange(33, 2, 59, 35, 2, 62).filter((b) => world.get(b.x, b.y, b.z) === Block.LOG);

  const buildings: BuildingSpec[] = [];
  // The Mist Market: a hall of stalls lit by crystals.
  buildings.push(placeBuilding(world, {
    id: "market", name: "Mist Market",
    x0: 19, z0: 36, w: 11, d: 7,
    wall: Block.PLANKS, roof: Block.AWNING, floor: Block.DARK,
    door: { x: 24, z: 42 },
    windows: [{ x: 21, z: 42 }, { x: 27, z: 42 }, { x: 19, z: 39 }, { x: 29, z: 39 }],
  }));
  world.fill(20, 2, 37, 22, 2, 37, Block.SHELF);
  world.fill(26, 2, 37, 28, 2, 37, Block.SHELF);
  world.set(21, 3, 37, Block.CRYSTAL);
  world.set(27, 3, 37, Block.CRYSTAL);
  world.fill(23, 2, 38, 25, 2, 38, Block.DARK); // Tobias's counter
  buildings.push(placeLighthouse(world));

  // Rune gate across the bridge: the spell opens it (TownGame removes these blocks).
  const gateBlocks: BlockPos[] = [];
  for (const key of routeCells) {
    const [x, z] = key.split(",").map(Number) as [number, number];
    if (z !== GATE_Z) continue;
    for (let y = 2; y <= 4; y++) gateBlocks.push({ x, y, z });
  }
  const gateXs = gateBlocks.map((b) => b.x);
  const gateMin = Math.min(...gateXs) - 1;
  const gateMax = Math.max(...gateXs) + 1;
  for (const x of [gateMin, gateMax]) {
    world.set(x, GROUND_Y, GATE_Z, Block.STONE);
    world.fill(x, 2, GATE_Z, x, 5, GATE_Z, Block.STONE);
    world.set(x, 6, GATE_Z, Block.CRYSTAL);
  }
  for (const b of gateBlocks) world.set(b.x, b.y, b.z, Block.RUNE);

  // Scenery: rock spires, crystal clusters and a few trees, kept off the route and buildings.
  const clear = (x: number, z: number) => {
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (routeCells.has(`${x + dx},${z + dz}`)) return false;
    return !buildings.some((b) => x >= b.x0 - 2 && x <= b.x1 + 2 && z >= b.z0 - 2 && z <= b.z1 + 2) &&
      !(x >= 27 && x <= 37 && z >= 53);
  };
  for (let z = 2; z < depth - 2; z++) {
    for (let x = 2; x < width - 2; x++) {
      if (world.get(x, GROUND_Y, z) !== Block.GRASS || !clear(x, z)) continue;
      const r = rocks(x, z);
      if (r > 0.78) {
        const h = 2 + Math.floor((r - 0.78) * 30);
        world.fill(x, 2, z, x, Math.min(height - 3, 2 + h), z, Block.STONE);
        world.set(x, GROUND_Y, z, Block.MOSS);
        if (rng() < 0.4) world.set(x, Math.min(height - 2, 3 + h), z, Block.CRYSTAL);
      } else if (r < 0.12 && rng() < 0.5) {
        world.set(x, 2, z, Block.CRYSTAL);
        if (rng() < 0.5) world.set(x, 3, z, Block.CRYSTAL);
      } else if (rng() < 0.012) {
        placeTree(world, x, z, rng);
      }
    }
  }

  const npcs: NpcSpec[] = [
    {
      id: "elowen", name: "Elowen", title: "Lighthouse Keeper", location: "lighthouse", npcRole: "keeper", voice: "keeper",
      buildingId: "lighthouse", cell: { x: 44, z: 16 },
      greeting: "Ah, travellers. The mist hasn't let a boat through in years…",
      look: { shirt: "#3e5a7a", pants: "#2b2f3a", skin: "#e8c3a0", hair: "#d9d9d9", eye: "#3b6a8a", hat: "#2f3f5a" },
    },
    {
      id: "tobias", name: "Tobias", title: "Merchant", location: "market", npcRole: "merchant", voice: "merchant",
      buildingId: "market", cell: { x: 24, z: 39 },
      greeting: "Lanterns, charms, maps! Everything has a price, friend.",
      look: { shirt: "#7a3e5a", pants: "#3a2a20", skin: "#b07a52", hair: "#2a1a10", eye: "#2a1a10", apron: true },
    },
    {
      // Sam travels with the player on the isles (same NPC as in town: location town / friend).
      id: "sam", name: "Sam", title: "Friend", location: "town", npcRole: "friend", voice: "friend",
      buildingId: "", cell: { x: 31, z: 57 }, follows: true,
      greeting: "This place is wild! Take a photo with me!",
      look: { shirt: "#e0a43a", pants: "#3b4a6b", skin: "#c98e63", hair: "#3a2414", eye: "#2b1d12" },
    },
  ];

  return {
    id: "isles",
    world,
    buildings,
    npcs,
    props: [],
    spawn: { x: 30, z: 58 },
    boats: [{ to: "town", label: "Sail back to town", anchors: boatAnchors }],
    gates: [{ id: "mist_gate", label: "Rune gate", blocks: gateBlocks }],
    atmosphere: { fog: "#c9d6e2", fogNear: 95, fogFar: 150 },
  };
}
