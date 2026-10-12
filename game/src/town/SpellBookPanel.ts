import type {
  PraglishApiClient,
  SpellBookEntry,
  SpellBookStatus,
} from "../services/PraglishApiClient";

type Filter = "all" | SpellBookStatus;

/** Status label + shape so colour is never the only signal (roleApp 16.4). */
const STATUS: Record<SpellBookStatus, { label: string; mark: string; hint: string }> = {
  red: { label: "Kırmızı", mark: "●", hint: "Zorlanıyorsun; NPC'ler bu kelimeyi kullanacak" },
  yellow: { label: "Sarı", mark: "▲", hint: "Tekrar etmeye değer" },
  new: { label: "Yeni", mark: "○", hint: "Yeni karşılaştın" },
  green: { label: "Yeşil", mark: "✓", hint: "Oturuyor" },
};

const PLACE: Record<string, string> = {
  bakery: "Fırın",
  library: "Kütüphane",
  cafe: "Dinleme Köşesi",
};

export interface SpellBookEvents {
  onClose(): void;
}

/**
 * The Spell Book: every word the player struggled with or used, hardest first.
 * Data comes from GET /api/spellbook/{user_id}, which recomputes the struggle
 * score (roleApp section 4) from raw word events.
 */
export class SpellBookPanel {
  private readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly status: HTMLElement;
  private readonly filterButtons: HTMLButtonElement[];
  private entries: SpellBookEntry[] = [];
  private filter: Filter = "all";

  constructor(container: HTMLElement, private readonly events: SpellBookEvents) {
    this.root = document.createElement("section");
    this.root.className = "town-book";
    this.root.hidden = true;
    this.root.setAttribute("aria-label", "Büyü Kitabı");
    this.root.innerHTML = `
      <header class="town-book__head">
        <div>
          <p class="town-book__eyebrow">Spell Book</p>
          <h2 class="town-book__title">Büyü Kitabı</h2>
        </div>
        <button type="button" class="town-dialogue__close" aria-label="Kapat">Kapat <kbd>Esc</kbd></button>
      </header>
      <p class="town-book__summary" data-summary></p>
      <div class="town-book__filters" role="group" aria-label="Duruma göre süz">
        <button type="button" data-filter="all" aria-pressed="true">Hepsi</button>
        <button type="button" data-filter="red" aria-pressed="false">● Kırmızı</button>
        <button type="button" data-filter="yellow" aria-pressed="false">▲ Sarı</button>
        <button type="button" data-filter="new" aria-pressed="false">○ Yeni</button>
        <button type="button" data-filter="green" aria-pressed="false">✓ Yeşil</button>
      </div>
      <ol class="town-book__list" aria-live="polite"></ol>
      <p class="town-dialogue__status" role="status"></p>`;
    container.appendChild(this.root);

    const q = <T extends Element>(selector: string): T => {
      const el = this.root.querySelector<T>(selector);
      if (!el) throw new Error(`SpellBookPanel is missing ${selector}`);
      return el;
    };
    this.list = q(".town-book__list");
    this.summary = q("[data-summary]");
    this.status = q(".town-dialogue__status");
    this.filterButtons = [...this.root.querySelectorAll<HTMLButtonElement>("[data-filter]")];
    for (const btn of this.filterButtons) {
      btn.addEventListener("click", () => {
        this.filter = (btn.dataset["filter"] ?? "all") as Filter;
        for (const b of this.filterButtons) b.setAttribute("aria-pressed", String(b === btn));
        this.render();
      });
    }
    q<HTMLButtonElement>(".town-dialogue__close").addEventListener("click", () => this.close());
    this.root.addEventListener("keydown", (event) => {
      if (!this.isOpen) return;
      if (event.key === "Escape") this.close();
      event.stopPropagation();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(api: PraglishApiClient): void {
    this.root.hidden = false;
    this.status.textContent = "Yükleniyor…";
    this.root.querySelector<HTMLButtonElement>(".town-dialogue__close")?.focus();
    void api.getSpellBook()
      .then((entries) => {
        this.entries = entries;
        this.status.textContent = "";
        this.render();
      })
      .catch((error: unknown) => {
        this.status.textContent = error instanceof Error ? error.message : "Büyü Kitabı yüklenemedi";
      });
  }

  close(): void {
    if (!this.isOpen) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && this.root.contains(focused)) focused.blur();
    this.root.hidden = true;
    this.events.onClose();
  }

  private render(): void {
    const counts = { red: 0, yellow: 0, new: 0, green: 0 };
    for (const e of this.entries) counts[e.status]++;
    this.summary.textContent = this.entries.length
      ? `${this.entries.length} kelime · ${counts.red} kırmızı · ${counts.yellow} sarı · ${counts.green} yeşil`
      : "";

    const shown = this.filter === "all" ? this.entries : this.entries.filter((e) => e.status === this.filter);
    this.list.replaceChildren();
    if (shown.length === 0) {
      const empty = document.createElement("li");
      empty.className = "town-book__empty";
      empty.textContent = this.entries.length
        ? "Bu durumda kelime yok."
        : "Henüz kelime yok. NPC'lerle İngilizce konuş ya da binalardaki nesnelere dokun; zorlandığın ve doğru kullandığın kelimeler burada birikir.";
      this.list.append(empty);
      return;
    }
    for (const entry of shown) this.list.append(this.renderEntry(entry));
  }

  private renderEntry(e: SpellBookEntry): HTMLElement {
    const meta = STATUS[e.status];
    const li = document.createElement("li");
    li.className = `town-book__word is-${e.status}`;

    const head = document.createElement("div");
    head.className = "town-book__word-head";
    const word = document.createElement("strong");
    word.textContent = e.lemma;
    const chip = document.createElement("span");
    chip.className = "town-book__chip";
    chip.textContent = `${meta.mark} ${meta.label}`;
    chip.title = meta.hint;
    head.append(word, chip);

    const bar = document.createElement("div");
    bar.className = "town-book__bar";
    bar.setAttribute("role", "meter");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(e.struggle_score));
    bar.setAttribute("aria-label", `Zorlanma ${Math.round(e.struggle_score)}/100`);
    const fill = document.createElement("i");
    fill.style.width = `${Math.max(2, Math.min(100, e.struggle_score))}%`;
    bar.append(fill);

    const facts = document.createElement("p");
    facts.className = "town-book__facts";
    const fails = e.meaning_fails + e.usage_fails + e.pronunciation_fails;
    const places = e.sources.map((s) => PLACE[s] ?? s).join(", ");
    facts.textContent = [
      `zorlanma ${Math.round(e.struggle_score)}`,
      fails ? `${fails} zorlanma anı` : null,
      e.active_successes ? `${e.active_successes} doğru kullanım` : null,
      places || null,
    ].filter(Boolean).join(" · ");

    li.append(head, bar, facts);
    if (e.example) {
      const example = document.createElement("q");
      example.className = "town-book__example";
      example.textContent = e.example;
      li.append(example);
    }
    return li;
  }
}
