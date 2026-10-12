import * as THREE from "three";
import { paintFaceCanvas } from "./textures";
import type { CharacterLook } from "./townMap";

/**
 * A character built from boxes. One model turns to any direction, so no
 * 8-direction sprite sheets are needed; walking and talking are animated in code.
 */
export class BlockCharacter {
  readonly root = new THREE.Group();
  /** Target facing angle (radians around +y; 0 faces +z). */
  yaw = 0;
  private readonly body = new THREE.Group();
  private readonly head: THREE.Mesh;
  private readonly legL: THREE.Mesh;
  private readonly legR: THREE.Mesh;
  private readonly armL: THREE.Mesh;
  private readonly armR: THREE.Mesh;
  private phase = Math.random() * Math.PI * 2;
  private talkUntil = 0;

  constructor(look: CharacterLook) {
    this.root.add(this.body);
    const mat = (color: string) => new THREE.MeshLambertMaterial({ color });
    const pants = mat(look.pants);
    const shirt = mat(look.shirt);

    this.legL = this.box(0.24, 0.75, 0.24, pants, -0.125, 0.75, 0, true);
    this.legR = this.box(0.24, 0.75, 0.24, pants, 0.125, 0.75, 0, true);
    this.box(0.5, 0.75, 0.26, shirt, 0, 1.125, 0, false);
    if (look.apron) this.box(0.42, 0.62, 0.02, mat("#f7f4ec"), 0, 1.02, 0.14, false);
    this.armL = this.box(0.22, 0.72, 0.22, shirt, -0.37, 1.48, 0, true);
    this.armR = this.box(0.22, 0.72, 0.22, shirt, 0.37, 1.48, 0, true);

    const faceTexture = new THREE.CanvasTexture(paintFaceCanvas(look));
    faceTexture.magFilter = THREE.NearestFilter;
    faceTexture.minFilter = THREE.NearestFilter;
    faceTexture.generateMipmaps = false;
    faceTexture.colorSpace = THREE.SRGBColorSpace;
    const skin = mat(look.skin);
    const hair = mat(look.hair);
    const headGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    headGeometry.translate(0, 0.25, 0);
    // Box face order: +x, -x, +y, -y, +z (front), -z
    this.head = new THREE.Mesh(headGeometry, [skin, skin, hair, skin, new THREE.MeshLambertMaterial({ map: faceTexture }), hair]);
    this.head.position.set(0, 1.5, 0);
    this.body.add(this.head);

    if (look.hat) {
      const hat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.42), mat(look.hat));
      hat.position.set(0, 0.62, 0);
      this.head.add(hat);
    }
    if (look.ribbon) {
      const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 0.52), mat(look.ribbon));
      ribbon.position.set(0, 0.42, 0);
      this.head.add(ribbon);
    }

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.36, 18),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.root.add(shadow);
    this.body.scale.setScalar(0.92);
  }

  /** Nod and gesture for `seconds` (used while the NPC's reply is on screen or being spoken). */
  talk(seconds: number, now: number): void {
    this.talkUntil = Math.max(this.talkUntil, now + seconds * 1000);
  }

  update(dt: number, moving: boolean, now: number): void {
    const talking = now < this.talkUntil;
    this.phase += dt * (moving ? 10 : talking ? 7 : 2);
    const swing = moving ? Math.sin(this.phase) * 0.7 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = talking && !moving ? -0.5 + Math.sin(this.phase) * 0.35 : swing * 0.8;
    this.head.rotation.x = talking ? Math.sin(this.phase * 1.3) * 0.08 : 0;
    this.body.position.y = moving ? Math.abs(Math.cos(this.phase)) * 0.05 : Math.sin(this.phase) * 0.008;

    let delta = this.yaw - this.root.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.root.rotation.y += delta * Math.min(1, dt * 12);
  }

  private box(
    w: number, h: number, d: number, material: THREE.Material,
    x: number, y: number, z: number, pivotTop: boolean,
  ): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(w, h, d);
    if (pivotTop) geometry.translate(0, -h / 2, 0);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    this.body.add(mesh);
    return mesh;
  }
}
