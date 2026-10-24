import type { AdventureFlags, Cutscene, CutsceneStep, CutsceneTarget } from "../services/PraglishApiClient";
import type { Cell } from "./townMap";
import "./cutscene.css";

/** What a cutscene needs from the town: actors, camera, voices. */
export interface CutsceneStage {
  flags: AdventureFlags;
  actorName(who: string): string;
  placeActor(who: string, cell: Cell): void;
  /** Resolves when the actor arrives (or gives up and snaps there). */
  walkActor(who: string, to: Cell, run: boolean): Promise<void>;
  /** A free cell next to another actor, for "walk near". */
  cellNear(who: string): Cell | null;
  focus(target: CutsceneTarget, zoom?: number): void;
  /** Speak a line aloud; resolves when the audio ends or fails. */
  speak(who: string, text: string): Promise<void>;
  toast(text: string): void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Plays api/game_data/cutscenes/<id>.json in the town: letterbox bars, scripted
 * camera, characters walking and talking with voice + subtitles. Space, Enter or
 * a click moves to the next line; Esc skips the rest.
 */
export class CutscenePlayer {
  private readonly root: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly speaker: HTMLElement;
  private readonly line: HTMLElement;
  private readonly card: HTMLElement;
  private readonly veil: HTMLElement;
  private advance: (() => void) | null = null;
  private skipped = false;
  private playing = false;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "cutscene";
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="cutscene__bar cutscene__bar--top"></div>
      <div class="cutscene__bar cutscene__bar--bottom"></div>
      <div class="cutscene__veil"></div>
      <p class="cutscene__card" hidden></p>
      <div class="cutscene__subtitle" hidden><strong></strong><span></span><small>Space ▸</small></div>
      <button type="button" class="cutscene__skip">Skip <kbd>Esc</kbd></button>`;
    container.appendChild(this.root);
    const q = <T extends Element>(selector: string): T => {
      const el = this.root.querySelector<T>(selector);
      if (!el) throw new Error(`Cutscene is missing ${selector}`);
      return el;
    };
    this.subtitle = q(".cutscene__subtitle");
    this.speaker = q(".cutscene__subtitle strong");
    this.line = q(".cutscene__subtitle span");
    this.card = q(".cutscene__card");
    this.veil = q(".cutscene__veil");
    q<HTMLButtonElement>(".cutscene__skip").addEventListener("click", () => this.skip());
    this.root.addEventListener("click", (event) => {
      if (!(event.target as HTMLElement).closest(".cutscene__skip")) this.advance?.();
    });
    window.addEventListener("keydown", (event) => {
      if (!this.playing) return;
      if (event.key === "Escape") this.skip();
      else if (event.key === " " || event.key === "Enter") this.advance?.();
      else return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  async play(scene: Cutscene, stage: CutsceneStage): Promise<void> {
    this.playing = true;
    this.skipped = false;
    this.root.hidden = false;
    this.root.classList.add("is-on");
    try {
      for (const step of scene.steps) {
        if (this.skipped) break;
        if (step.when && !stage.flags[step.when]) continue;
        await this.run(step, stage);
      }
    } finally {
      this.subtitle.hidden = true;
      this.card.hidden = true;
      this.veil.className = "cutscene__veil";
      this.root.classList.remove("is-on");
      await sleep(350);
      this.root.hidden = true;
      this.playing = false;
      this.advance = null;
    }
  }

  private skip(): void {
    this.skipped = true;
    this.advance?.();
  }

  private async run(step: CutsceneStep, stage: CutsceneStage): Promise<void> {
    if (step.camera) stage.focus(step.camera.focus, step.camera.zoom);
    if (step.place) stage.placeActor(step.place.who, step.place.cell);
    if (step.toast) stage.toast(step.toast);
    if (step.effect) await this.effect(step.effect);
    if (step.wait) await this.pause(step.wait * 1000);
    if (step.title) {
      this.card.textContent = step.title.text;
      this.card.hidden = false;
      await this.pause(step.title.seconds * 1000);
      this.card.hidden = true;
    }
    if (step.walk) {
      const to = step.walk.to ?? (step.walk.near ? stage.cellNear(step.walk.near) : null);
      if (to) {
        const walking = stage.walkActor(step.walk.who, to, step.walk.run ?? false);
        if (step.walk.wait !== false) await Promise.race([walking, this.untilSkipped()]);
      }
    }
    if (step.say) await this.say(step.say.who, step.say.text, stage);
  }

  private async say(who: string, text: string, stage: CutsceneStage): Promise<void> {
    this.speaker.textContent = stage.actorName(who).toUpperCase();
    this.line.textContent = text;
    this.subtitle.hidden = false;
    const readMs = 1200 + text.split(/\s+/).length * 320;
    const spoken = stage.speak(who, text).then(() => sleep(400), () => sleep(readMs));
    await sleep(500); // never flash a line past
    await Promise.race([spoken, this.waitForAdvance()]);
    this.subtitle.hidden = true;
  }

  private async effect(kind: NonNullable<CutsceneStep["effect"]>): Promise<void> {
    if (kind === "flash") {
      this.veil.className = "cutscene__veil is-flash";
      await sleep(180);
      this.veil.className = "cutscene__veil";
      await sleep(250);
    } else if (kind === "fade_out") {
      this.veil.className = "cutscene__veil is-dark";
      await sleep(700);
    } else {
      this.veil.className = "cutscene__veil";
      await sleep(600);
    }
  }

  /** Wait, but let Space/click/Esc cut the pause short. */
  private pause(ms: number): Promise<void> {
    return Promise.race([sleep(ms), this.waitForAdvance()]);
  }

  private waitForAdvance(): Promise<void> {
    if (this.skipped) return Promise.resolve();
    return new Promise((resolve) => {
      this.advance = () => {
        this.advance = null;
        resolve();
      };
    });
  }

  private untilSkipped(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => (this.skipped ? resolve() : window.setTimeout(check, 100));
      check();
    });
  }
}
