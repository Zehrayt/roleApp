import * as THREE from "three";
import { findPath, type GridCell, type PathfindingGrid } from "../engine/PathFinder";
import { BlockCharacter } from "./BlockCharacter";
import { CameraRig, type CameraMode } from "./CameraRig";
import { DialoguePanel } from "./DialoguePanel";
import { buildMeshData, type MeshData } from "./mesher";
import { paintBlockAtlas } from "./textures";
import {
  buildTown,
  GROUND_Y,
  isInsideBuilding,
  isUpperBlock,
  type BuildingSpec,
  type Cell,
  type NpcSpec,
  type TownDefinition,
} from "./townMap";

const PLAYER_SPEED = 4.2; // cells per second
const TALK_RANGE = 2.6;
const STAND_Y = GROUND_Y + 1;

interface NpcRuntime {
  spec: NpcSpec;
  character: BlockCharacter;
  bubble: HTMLElement;
  bubbleText: HTMLElement;
  panel: DialoguePanel | null;
  /** Latest reply shown over the head until this timestamp (ms). */
  replyUntil: number;
  near: boolean;
}

interface LabelRuntime {
  el: HTMLElement;
  anchor: THREE.Vector3;
}

type Interaction =
  | { kind: "npc"; npc: NpcRuntime }
  | { kind: "portal"; building: BuildingSpec };

/**
 * The hub world: renders the block town with three.js, moves the player,
 * opens NPC conversations backed by the Praglish API and links to the
 * existing Phaser modes (dub studio, progress book) through portals.
 */
export class TownGame {
  private readonly host: HTMLElement;
  private readonly town: TownDefinition;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly rig: CameraRig;
  private readonly baseMesh: THREE.Mesh;
  private readonly upperMeshes = new Map<string, THREE.Mesh>();
  private readonly player: BlockCharacter;
  private readonly npcs: NpcRuntime[] = [];
  private readonly labels: LabelRuntime[] = [];
  private readonly npcCells = new Set<string>();
  private readonly grid: PathfindingGrid;
  private readonly marker: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly keys = new Set<string>();
  private readonly prompt: HTMLButtonElement;
  private readonly stats: HTMLElement;
  private readonly tmp = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  private blockCount = 0;
  private faceCount = 0;

  private cell: Cell;
  private path: GridCell[] = [];
  private segmentFrom: Cell | null = null;
  private segmentT = 0;
  private pendingTalk: NpcRuntime | null = null;
  private interaction: Interaction | null = null;
  private activePanel: DialoguePanel | null = null;
  private pointerDown: { x: number; y: number } | null = null;
  private last = performance.now();
  private fpsTime = 0;
  private fpsFrames = 0;
  private statsTime = 0;

  constructor(host: HTMLElement) {
    this.host = host;
    this.town = buildTown();
    this.cell = { ...this.town.spawn };

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.prepend(this.renderer.domElement);

    // Blocks
    const atlas = new THREE.CanvasTexture(paintBlockAtlas());
    atlas.magFilter = THREE.NearestFilter;
    atlas.minFilter = THREE.NearestFilter;
    atlas.generateMipmaps = false;
    atlas.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 });

    const { world, buildings } = this.town;
    this.blockCount = world.countBlocks();
    this.baseMesh = this.createMesh(
      buildMeshData(world, (x, y, z) => !buildings.some((b) => isUpperBlock(b, x, y, z))),
      material,
    );
    for (const b of buildings) {
      const mesh = this.createMesh(buildMeshData(world, (x, y, z) => isUpperBlock(b, x, y, z)), material);
      this.upperMeshes.set(b.id, mesh);
    }

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7a4a, 2.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 6, 2);
    this.scene.add(sun);

    // Characters
    this.player = new BlockCharacter({
      shirt: "#2f8f83", pants: "#2c3a63", skin: "#e9b98f", hair: "#4a2c1a", eye: "#2a3d6b", ribbon: "#e2574c",
    });
    this.player.root.position.set(this.cell.x + 0.5, STAND_Y, this.cell.z + 0.5);
    this.scene.add(this.player.root);
    for (const spec of this.town.npcs) this.npcs.push(this.createNpc(spec));

    this.grid = {
      width: world.width,
      height: world.depth,
      isWalkable: (x, z) => world.isStandable(x, z, GROUND_Y) && !this.npcCells.has(`${x},${z}`),
    };

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.42, 4, 1),
      new THREE.MeshBasicMaterial({ color: 0xf2b134, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.marker.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    this.scene.add(this.marker);

    this.focus.set(this.cell.x + 0.5, STAND_Y + 0.6, this.cell.z + 0.5);
    this.rig = new CameraRig(this.focus);

    // HUD
    for (const b of buildings) this.labels.push(this.createLabel(b));
    this.prompt = this.createHud();
    this.stats = this.mustQuery<HTMLElement>("[data-town-stats]");

    this.bindInput();
    window.addEventListener("resize", () => this.resize());
    this.resize();
    requestAnimationFrame((t) => this.tick(t));
  }

  // ---------------------------------------------------------------- setup

  private createMesh(data: MeshData, material: THREE.Material): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(data.uvs, 2));
    g.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));
    g.setIndex(new THREE.BufferAttribute(data.indices, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    this.scene.add(mesh);
    this.faceCount += data.faceCount;
    return mesh;
  }

  private createNpc(spec: NpcSpec): NpcRuntime {
    const character = new BlockCharacter(spec.look);
    character.root.position.set(spec.cell.x + 0.5, STAND_Y, spec.cell.z + 0.5);
    character.root.userData["npcId"] = spec.id;
    this.scene.add(character.root);
    this.npcCells.add(`${spec.cell.x},${spec.cell.z}`);

    const bubble = document.createElement("div");
    bubble.className = "town-bubble";
    bubble.hidden = true;
    const name = document.createElement("strong");
    name.textContent = `${spec.title} ${spec.name}`;
    const text = document.createElement("span");
    bubble.append(name, text);
    this.host.appendChild(bubble);
    return { spec, character, bubble, bubbleText: text, panel: null, replyUntil: 0, near: false };
  }

  private createLabel(b: BuildingSpec): LabelRuntime {
    const el = document.createElement("div");
    el.className = "town-label";
    const name = document.createElement("span");
    name.textContent = b.name;
    const en = document.createElement("small");
    en.textContent = `· ${b.nameEn}`;
    el.append(name, en);
    this.host.appendChild(el);
    let dx = 0;
    let dz = 0;
    if (b.door.z === b.z1) dz = 1.6;
    else if (b.door.z === b.z0) dz = -0.6;
    else if (b.door.x === b.x1) dx = 1.6;
    else dx = -0.6;
    return { el, anchor: new THREE.Vector3(b.door.x + 0.5 + dx, 6.2, b.door.z + 0.5 + dz) };
  }

  private createHud(): HTMLButtonElement {
    const hud = document.createElement("div");
    hud.className = "town-hud";
    hud.innerHTML = `
      <div class="town-brand">
        <p class="town-brand__eyebrow">Praglish</p>
        <h1 class="town-brand__title">Kasaba</h1>
        <p class="town-brand__hint">Yürümek için zemine dokun · NPC'ye yaklaşıp <kbd>E</kbd></p>
      </div>
      <nav class="town-links" aria-label="Diğer modlar">
        <a class="town-btn" href="studio.html?scene=DashboardScene">Gelişim defteri</a>
        <a class="town-btn" href="studio.html">Tüm modlar</a>
      </nav>
      <div class="town-stats" data-town-stats aria-hidden="true"></div>
      <div class="town-controls" role="toolbar" aria-label="Kamera">
        <button class="town-btn" data-act="rotL" title="Sola döndür (Q)">↺<kbd>Q</kbd></button>
        <button class="town-btn" data-act="rotR" title="Sağa döndür (R)">↻<kbd>R</kbd></button>
        <button class="town-btn" data-act="zoomOut" title="Uzaklaş">−</button>
        <button class="town-btn" data-act="zoomIn" title="Yakınlaş">+</button>
        <button class="town-btn" data-act="mode-iso" aria-pressed="true">İzometrik</button>
        <button class="town-btn" data-act="mode-perspective" aria-pressed="false">Perspektif</button>
      </div>
      <button class="town-prompt" type="button" hidden></button>`;
    this.host.appendChild(hud);

    hud.querySelectorAll<HTMLButtonElement>("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.dataset["act"];
        if (act === "rotL") this.rig.rotate(-1);
        else if (act === "rotR") this.rig.rotate(1);
        else if (act === "zoomIn") this.rig.zoomBy(-1);
        else if (act === "zoomOut") this.rig.zoomBy(1);
        else if (act === "mode-iso") this.setCameraMode("iso");
        else if (act === "mode-perspective") this.setCameraMode("perspective");
      });
    });
    const prompt = hud.querySelector<HTMLButtonElement>(".town-prompt");
    if (!prompt) throw new Error("HUD prompt missing");
    prompt.addEventListener("click", () => this.interact());
    return prompt;
  }

  private setCameraMode(mode: CameraMode): void {
    this.rig.mode = mode;
    this.host.querySelectorAll<HTMLButtonElement>("[data-act^='mode-']").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset["act"] === `mode-${mode}`));
    });
  }

  private mustQuery<T extends Element>(selector: string): T {
    const el = this.host.querySelector<T>(selector);
    if (!el) throw new Error(`Missing ${selector}`);
    return el;
  }

  // ---------------------------------------------------------------- input

  private bindInput(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", (e) => {
      this.pointerDown = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointerup", (e) => {
      const down = this.pointerDown;
      this.pointerDown = null;
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
      this.handleTap(e.clientX, e.clientY);
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.rig.zoomBy(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      if (k === "escape") this.activePanel?.close();
      else if (k === "e" || k === "enter") this.interact();
      else if (k === "q") this.rig.rotate(-1);
      else if (k === "r") this.rig.rotate(1);
      else if (k === "+" || k === "=") this.rig.zoomBy(-1);
      else if (k === "-") this.rig.zoomBy(1);
      else if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        this.keys.add(k);
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
  }

  private handleTap(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.rig.camera);

    // Tapping an NPC walks next to them and opens the conversation.
    const npcHit = this.raycaster.intersectObjects(this.npcs.map((n) => n.character.root), true)[0];
    if (npcHit) {
      let obj: THREE.Object3D | null = npcHit.object;
      while (obj && obj.userData["npcId"] === undefined) obj = obj.parent;
      const npc = this.npcs.find((n) => n.spec.id === obj?.userData["npcId"]);
      if (npc) {
        if (this.distanceTo(npc) <= TALK_RANGE) this.openDialogue(npc);
        else {
          this.pendingTalk = npc;
          const target = this.nearestStandable(npc.spec.cell.x, npc.spec.cell.z);
          if (target) this.walkTo(target);
        }
        return;
      }
    }

    const targets = [this.baseMesh, ...[...this.upperMeshes.values()].filter((m) => m.visible)];
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit || !hit.face) return;
    const n = hit.face.normal;
    const p = hit.point.clone().addScaledVector(n, n.y > 0.5 ? -0.01 : 0.5);
    const target = this.nearestStandable(Math.floor(p.x), Math.floor(p.z));
    this.pendingTalk = null;
    if (target) this.walkTo(target);
  }

  private walkTo(target: Cell): void {
    const moving = this.segmentFrom !== null && this.path.length > 0;
    const startCell = moving ? this.path[0] : undefined;
    const start: GridCell = startCell ?? { x: this.cell.x, y: this.cell.z };
    const route = findPath(this.grid, start, { x: target.x, y: target.z });
    if (!route) return;
    this.path = moving && startCell ? [startCell, ...route] : route;
    this.marker.position.set(target.x + 0.5, STAND_Y + 0.03, target.z + 0.5);
    (this.marker.material as THREE.MeshBasicMaterial).opacity = 0.95;
  }

  private keyboardStep(): void {
    let f = 0;
    let s = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) f += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) f -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) s += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) s -= 1;
    if (!f && !s) return;
    const a = this.rig.heading;
    const vx = -Math.sin(a) * f + Math.cos(a) * s;
    const vz = -Math.cos(a) * f - Math.sin(a) * s;
    const len = Math.hypot(vx, vz);
    const dx = Math.round(vx / len);
    const dz = Math.round(vz / len);
    const { x, z } = this.cell;
    if (!this.grid.isWalkable(x + dx, z + dz)) return;
    if (dx && dz && (!this.grid.isWalkable(x + dx, z) || !this.grid.isWalkable(x, z + dz))) return;
    this.pendingTalk = null;
    this.path = [{ x: x + dx, y: z + dz }];
  }

  private nearestStandable(x: number, z: number): Cell | null {
    for (let r = 0; r <= 6; r++) {
      let best: Cell | null = null;
      let bestDist = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (!this.grid.isWalkable(x + dx, z + dz)) continue;
          const d = dx * dx + dz * dz;
          if (d < bestDist) {
            bestDist = d;
            best = { x: x + dx, z: z + dz };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  // ---------------------------------------------------------------- interaction

  private distanceTo(npc: NpcRuntime): number {
    const p = this.player.root.position;
    const q = npc.character.root.position;
    return Math.hypot(p.x - q.x, p.z - q.z);
  }

  private currentBuilding(): BuildingSpec | undefined {
    const x = Math.floor(this.player.root.position.x);
    const z = Math.floor(this.player.root.position.z);
    return this.town.buildings.find((b) => isInsideBuilding(b, x, z));
  }

  private interact(): void {
    const it = this.interaction;
    if (!it) return;
    if (it.kind === "npc") this.openDialogue(it.npc);
    else if (it.building.portal) window.location.href = it.building.portal.href;
  }

  private openDialogue(npc: NpcRuntime): void {
    this.pendingTalk = null;
    if (this.activePanel && this.activePanel !== npc.panel) this.activePanel.close();
    if (!npc.panel) {
      npc.panel = new DialoguePanel(npc.spec, this.host, {
        onReply: (text, speaker, seconds) => {
          npc.bubbleText.textContent = speaker === "coach" ? `(Koç) ${text}` : text;
          npc.replyUntil = performance.now() + seconds * 1000;
          if (speaker === "npc") npc.character.talk(seconds, performance.now());
        },
        onClose: () => {
          if (this.activePanel === npc.panel) {
            this.activePanel = null;
            this.host.classList.remove("is-talking");
          }
        },
      });
    }
    this.activePanel = npc.panel;
    this.host.classList.add("is-talking");
    npc.panel.open();
  }

  // ---------------------------------------------------------------- loop

  private resize(): void {
    this.renderer.setSize(this.host.clientWidth, this.host.clientHeight);
  }

  private tick(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    this.updatePlayer(dt, now);
    this.updateWorld();

    for (const npc of this.npcs) {
      const dx = this.player.root.position.x - npc.character.root.position.x;
      const dz = this.player.root.position.z - npc.character.root.position.z;
      npc.near = Math.hypot(dx, dz) < TALK_RANGE + 0.4;
      npc.character.yaw = npc.near || npc.panel?.isOpen ? Math.atan2(dx, dz) : 0;
      npc.character.update(dt, false, now);
      if (npc.near && this.pendingTalk === npc) this.openDialogue(npc);
    }

    this.focus.set(this.player.root.position.x, STAND_Y + 0.6, this.player.root.position.z);
    this.rig.update(dt, this.focus, this.host.clientWidth, this.host.clientHeight);
    this.renderer.render(this.scene, this.rig.camera);
    this.updateOverlays(now);
    this.updateStats(dt);
    requestAnimationFrame((t) => this.tick(t));
  }

  private updatePlayer(dt: number, now: number): void {
    if (this.path.length === 0 && !this.activePanel) this.keyboardStep();
    let moving = false;
    const next = this.path[0];
    if (next) {
      if (!this.segmentFrom) {
        this.segmentFrom = { ...this.cell };
        this.segmentT = 0;
      }
      const from = this.segmentFrom;
      const dist = Math.hypot(next.x - from.x, next.y - from.z) || 1;
      this.segmentT += (dt * PLAYER_SPEED) / dist;
      const t = Math.min(1, this.segmentT);
      this.player.root.position.x = from.x + 0.5 + (next.x - from.x) * t;
      this.player.root.position.z = from.z + 0.5 + (next.y - from.z) * t;
      this.player.yaw = Math.atan2(next.x - from.x, next.y - from.z);
      moving = true;
      if (t >= 1) {
        this.cell = { x: next.x, z: next.y };
        this.path.shift();
        this.segmentFrom = null;
      }
    }
    this.player.update(dt, moving, now);
    const mat = this.marker.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, mat.opacity - dt * (moving ? 0.4 : 1.6));
  }

  private updateWorld(): void {
    const inside = this.currentBuilding();
    for (const [id, mesh] of this.upperMeshes) mesh.visible = id !== inside?.id;

    // What can the player do right now?
    let nearest: NpcRuntime | null = null;
    for (const npc of this.npcs) {
      const d = this.distanceTo(npc);
      if (d <= TALK_RANGE && (!nearest || d < this.distanceTo(nearest))) nearest = npc;
    }
    if (nearest) this.interaction = { kind: "npc", npc: nearest };
    else if (inside?.portal) this.interaction = { kind: "portal", building: inside };
    else this.interaction = null;

    const it = this.interaction;
    const showPrompt = it !== null && !(it.kind === "npc" && it.npc.panel?.isOpen);
    this.prompt.hidden = !showPrompt;
    if (it && showPrompt) {
      this.prompt.textContent = it.kind === "npc"
        ? `E · ${it.npc.spec.name} ile konuş`
        : `E · ${it.building.portal?.label ?? "Gir"}`;
    }
  }

  private updateOverlays(now: number): void {
    for (const label of this.labels) this.place(label.el, label.anchor);
    for (const npc of this.npcs) {
      const hasReply = now < npc.replyUntil;
      const show = hasReply || (npc.near && !npc.panel?.isOpen);
      npc.bubble.hidden = !show;
      if (!show) continue;
      if (!hasReply) npc.bubbleText.textContent = npc.spec.greeting;
      this.tmp.set(npc.character.root.position.x, STAND_Y + 2.35, npc.character.root.position.z);
      this.place(npc.bubble, this.tmp);
    }
  }

  private place(el: HTMLElement, world: THREE.Vector3): void {
    const v = this.tmp.copy(world).project(this.rig.camera);
    if (v.z > 1 || v.z < -1) {
      el.style.visibility = "hidden";
      return;
    }
    el.style.visibility = "visible";
    const x = ((v.x + 1) / 2) * this.host.clientWidth;
    const y = ((1 - v.y) / 2) * this.host.clientHeight;
    el.style.transform = `translate(${Math.round(x - el.offsetWidth / 2)}px, ${Math.round(y - el.offsetHeight - 8)}px)`;
  }

  private updateStats(dt: number): void {
    this.fpsTime += dt;
    this.fpsFrames++;
    this.statsTime += dt;
    if (this.statsTime < 0.5) return;
    const fps = Math.round(this.fpsFrames / this.fpsTime);
    this.fpsTime = 0;
    this.fpsFrames = 0;
    this.statsTime = 0;
    const nf = new Intl.NumberFormat("tr-TR");
    this.stats.textContent =
      `${nf.format(this.blockCount)} blok · ${nf.format(this.faceCount)} yüz · ` +
      `${this.renderer.info.render.calls} çizim · ${fps} fps`;
  }
}
