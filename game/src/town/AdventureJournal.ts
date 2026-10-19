import { guestCredentials } from "../services/guestAuth";
import { ADVENTURE_STEPS, nextAdventureStage, type AdventureEvent } from "./adventureProgress";
import "./adventure.css";

export class AdventureJournal {
  private readonly root: HTMLElement;
  private readonly tracker: HTMLButtonElement;
  private readonly content: HTMLElement;
  private readonly storageKey = `roleapp.adventure.${guestCredentials().username}.v1`;
  private stage: number;

  constructor(container: HTMLElement, private readonly onOpen: () => void, private readonly onClose: () => void) {
    const saved = Number(window.localStorage.getItem(this.storageKey));
    this.stage = Number.isInteger(saved) && saved >= 0 && saved <= ADVENTURE_STEPS.length ? saved : 0;
    this.tracker = document.createElement("button");
    this.tracker.type = "button";
    this.tracker.className = "adventure-tracker";
    this.tracker.setAttribute("aria-label", "Aktif macera görevini aç");
    this.tracker.addEventListener("click", () => this.onOpen());
    container.appendChild(this.tracker);

    this.root = document.createElement("section");
    this.root.className = "adventure-journal";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-label", "Macera görevleri");
    this.root.innerHTML = `
      <div class="adventure-board">
        <header class="adventure-board__hero">
          <img src="/assets/modes/adventure.png" alt="Haritayla yolculuğa çıkan blok dünyalı gezgin" />
          <div class="adventure-board__hero-copy"><span>BÖLÜM 01 · ÖNSÖZ</span><h1>Yola çıkmadan önce</h1><p>Sisli geçide uzanan bir harita buldun. Yolculuğa başlamadan kasabada erzak, bilgi ve biraz cesaret toplamalısın.</p></div>
          <button type="button" class="adventure-board__close" aria-label="Görevleri kapat">✕</button>
        </header>
        <div class="adventure-board__content" data-content></div>
        <footer class="adventure-board__footer"><span>Görevler sırasıyla açılır · İlerleme bu tarayıcıda saklanır</span><button type="button" data-action="explore">KASABAYI KEŞFET ↗</button></footer>
      </div>`;
    container.appendChild(this.root);
    const content = this.root.querySelector<HTMLElement>("[data-content]");
    if (!content) throw new Error("Adventure journal content is missing");
    this.content = content;
    this.root.querySelector<HTMLButtonElement>(".adventure-board__close")?.addEventListener("click", () => this.close());
    this.root.querySelector<HTMLButtonElement>("[data-action='explore']")?.addEventListener("click", () => this.close());
    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.close();
      event.stopPropagation();
    });
    this.render();
  }

  get isOpen(): boolean { return !this.root.hidden; }

  open(): void {
    this.root.hidden = false;
    this.tracker.hidden = true;
    this.render();
    this.root.querySelector<HTMLButtonElement>("[data-action='explore']")?.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.tracker.hidden = false;
    this.onClose();
  }

  record(event: AdventureEvent): void {
    const next = nextAdventureStage(this.stage, event);
    if (next === this.stage) return;
    this.stage = next;
    window.localStorage.setItem(this.storageKey, String(next));
    this.render();
  }

  private render(): void {
    const done = this.stage === ADVENTURE_STEPS.length;
    this.tracker.innerHTML = `<span>✦ MACERA GÖREVİ</span><strong>${done ? "ÖNSÖZ TAMAMLANDI" : ADVENTURE_STEPS[this.stage]?.title ?? "Görev"}</strong><small>${done ? "Görev günlüğünü aç" : ADVENTURE_STEPS[this.stage]?.place ?? ""} ↗</small>`;
    this.content.innerHTML = `
      <div class="adventure-board__section"><div><span class="adventure-board__eyebrow">GÖREV ZİNCİRİ</span><h2>${done ? "Yolculuk başlıyor" : "Sıradaki adım"}</h2></div><span class="adventure-board__count">${Math.min(this.stage, ADVENTURE_STEPS.length)} / ${ADVENTURE_STEPS.length}</span></div>
      <div class="adventure-steps">${ADVENTURE_STEPS.map((step, index) => {
        const status = index < this.stage ? "is-done" : index === this.stage ? "is-active" : "is-locked";
        const badge = index < this.stage ? "✓" : index === this.stage ? "◆" : "▣";
        return `<article class="adventure-step ${status}"><span class="adventure-step__badge">${badge}</span><div><small>GÖREV ${String(index + 1).padStart(2, "0")} · ${step.place}</small><h3>${step.title}</h3><p>${step.detail}</p></div><span class="adventure-step__state">${index < this.stage ? "TAMAM" : index === this.stage ? "AKTİF" : "KİLİTLİ"}</span></article>`;
      }).join("")}</div>
      <p class="adventure-board__next">${done ? "Önsözü bitirdin! Sonraki bölümün keşif ve savaş görevleri geliştirme aşamasında." : "Aktif görevi bitirince sıradaki görev açılacak. Kasabadaki kişilere yaklaş ve E tuşuyla konuş."}</p>`;
  }
}
