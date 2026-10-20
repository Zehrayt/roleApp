import type { AdventureState, InventoryEntry } from "../services/PraglishApiClient";
import { ADVENTURE_STEPS } from "./adventureProgress";
import "./adventure.css";

export class AdventureJournal {
  private readonly root: HTMLElement;
  private readonly tracker: HTMLButtonElement;
  private readonly content: HTMLElement;
  private stage = 0;
  private inventory: InventoryEntry[] = [];
  private loaded = false;
  private loadError: string | null = null;

  constructor(container: HTMLElement, private readonly onOpen: () => void, private readonly onClose: () => void, private readonly onInventory: () => void) {
    this.tracker = document.createElement("button");
    this.tracker.type = "button";
    this.tracker.className = "adventure-tracker";
    this.tracker.setAttribute("aria-label", "Open the active adventure quest");
    this.tracker.addEventListener("click", () => this.onOpen());
    container.appendChild(this.tracker);

    this.root = document.createElement("section");
    this.root.className = "adventure-journal";
    this.root.hidden = true;
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-label", "Adventure quests");
    this.root.innerHTML = `
      <div class="adventure-board">
        <header class="adventure-board__hero">
          <img src="/assets/modes/adventure.png" alt="A block-world traveler setting out with a map" />
          <div class="adventure-board__hero-copy"><span>CHAPTER 01 · PROLOGUE</span><h1>Before the Journey</h1><p>You found a map leading to the misty pass. Gather supplies, knowledge, and a little courage in town before you leave.</p></div>
          <button type="button" class="adventure-board__close" aria-label="Close quests">✕</button>
        </header>
        <div class="adventure-board__content" data-content></div>
        <footer class="adventure-board__footer"><span>Quests unlock in order · Progress is saved to your account</span><div><button type="button" data-action="inventory">🎒 INVENTORY</button><button type="button" data-action="explore">EXPLORE TOWN ↗</button></div></footer>
      </div>`;
    container.appendChild(this.root);
    const content = this.root.querySelector<HTMLElement>("[data-content]");
    if (!content) throw new Error("Adventure journal content is missing");
    this.content = content;
    this.root.querySelector<HTMLButtonElement>(".adventure-board__close")?.addEventListener("click", () => this.close());
    this.root.querySelector<HTMLButtonElement>("[data-action='explore']")?.addEventListener("click", () => this.close());
    this.root.querySelector<HTMLButtonElement>("[data-action='inventory']")?.addEventListener("click", () => this.onInventory());
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

  setState(state: AdventureState): void {
    this.stage = Number.isInteger(state.stage) ? Math.max(0, Math.min(state.stage, ADVENTURE_STEPS.length)) : 0;
    this.inventory = state.inventory;
    this.loaded = true;
    this.loadError = null;
    this.render();
  }

  setError(message: string): void {
    this.loaded = true;
    this.loadError = message;
    this.render();
  }

  setStage(stage: number): void {
    this.stage = Math.max(0, Math.min(stage, ADVENTURE_STEPS.length));
    this.loaded = true;
    this.loadError = null;
    this.render();
  }

  addItems(changes: InventoryEntry[]): void {
    for (const change of changes) {
      const current = this.inventory.find((item) => item.item_id === change.item_id);
      if (current) current.quantity += change.quantity;
      else this.inventory.push({ ...change });
    }
    this.inventory = this.inventory.filter((item) => item.quantity > 0);
    this.loadError = null;
    this.render();
  }

  private render(): void {
    const done = this.stage === ADVENTURE_STEPS.length;
    this.tracker.innerHTML = `<span>✦ ADVENTURE QUEST</span><strong>${done ? "PROLOGUE COMPLETE" : ADVENTURE_STEPS[this.stage]?.title ?? "Quest"}</strong><small>${done ? "Open the quest journal" : ADVENTURE_STEPS[this.stage]?.place ?? ""} ↗</small>`;
    this.content.innerHTML = `
      <div class="adventure-board__section"><div><span class="adventure-board__eyebrow">QUEST CHAIN</span><h2>${done ? "The Journey Begins" : "Next Step"}</h2></div><span class="adventure-board__count">${Math.min(this.stage, ADVENTURE_STEPS.length)} / ${ADVENTURE_STEPS.length}</span></div>
      <section class="adventure-inventory" aria-label="Inventory"><strong>🎒 INVENTORY</strong><span>${this.loadError ? this.loadError : !this.loaded ? "Loading…" : this.inventory.length ? this.inventory.map((item) => `${escapeHtml(item.name)} ×${item.quantity}`).join(" · ") : "Empty for now"}</span></section>
      <div class="adventure-steps">${ADVENTURE_STEPS.map((step, index) => {
        const status = index < this.stage ? "is-done" : index === this.stage ? "is-active" : "is-locked";
        const badge = index < this.stage ? "✓" : index === this.stage ? "◆" : "▣";
        return `<article class="adventure-step ${status}"><span class="adventure-step__badge">${badge}</span><div><small>QUEST ${String(index + 1).padStart(2, "0")} · ${step.place}</small><h3>${step.title}</h3><p>${step.detail}</p></div><span class="adventure-step__state">${index < this.stage ? "DONE" : index === this.stage ? "ACTIVE" : "LOCKED"}</span></article>`;
      }).join("")}</div>
      <p class="adventure-board__next">${done ? "You finished the prologue! Exploration and combat quests for the next chapter are in development." : "Complete the active quest to unlock the next one. Approach a character and press T to talk."}</p>`;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
