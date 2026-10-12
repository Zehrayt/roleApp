import type {
  PraglishApiClient,
  VocabularyProgressEntry,
  VocabularySubmitResponse,
} from "../services/PraglishApiClient";
import type { PropSpec } from "./townMap";

export interface VocabPanelEvents {
  /** A word was accepted (new or already known); used to refresh prop markers. */
  onProgress(prop: PropSpec, completed: boolean): void;
  onClose(): void;
}

type Kind = "user" | "good" | "known" | "bad" | "error";

/**
 * "What's this in English?" panel for a block prop. Backed by
 * POST /api/vocabulary/submit and GET /api/vocabulary/progress/{user}/{location}.
 */
export class VocabPanel {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly meter: HTMLElement;
  private readonly messages: HTMLElement;
  private readonly status: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly send: HTMLButtonElement;
  private prop: PropSpec | null = null;
  private api: PraglishApiClient | null = null;

  constructor(container: HTMLElement, private readonly events: VocabPanelEvents) {
    this.root = document.createElement("section");
    this.root.className = "town-dialogue town-vocab";
    this.root.hidden = true;
    this.root.setAttribute("aria-label", "Kelime alıştırması");
    this.root.innerHTML = `
      <header class="town-dialogue__head">
        <div><strong data-title></strong><span>Bu İngilizcede ne?</span></div>
        <button type="button" class="town-dialogue__close" aria-label="Kapat">Kapat <kbd>Esc</kbd></button>
      </header>
      <p class="town-vocab__hint" data-hint></p>
      <p class="town-vocab__meter" data-meter></p>
      <div class="town-dialogue__messages town-vocab__messages" aria-live="polite"></div>
      <p class="town-dialogue__status" role="status"></p>
      <form class="town-dialogue__form">
        <input type="text" maxlength="60" autocomplete="off" placeholder="İngilizce adı…" aria-label="Nesnenin İngilizce adı" />
        <button type="submit" class="town-dialogue__send">Dene</button>
      </form>`;
    container.appendChild(this.root);

    const q = <T extends Element>(selector: string): T => {
      const el = this.root.querySelector<T>(selector);
      if (!el) throw new Error(`VocabPanel is missing ${selector}`);
      return el;
    };
    this.title = q("[data-title]");
    this.hint = q("[data-hint]");
    this.meter = q("[data-meter]");
    this.messages = q(".town-vocab__messages");
    this.status = q(".town-dialogue__status");
    this.input = q("input");
    this.send = q(".town-dialogue__send");

    q<HTMLButtonElement>(".town-dialogue__close").addEventListener("click", () => this.close());
    q<HTMLFormElement>("form").addEventListener("submit", (event) => {
      event.preventDefault();
      void this.submit();
    });
    this.root.addEventListener("keydown", (event) => {
      if (!this.isOpen) return;
      if (event.key === "Escape") this.close();
      // Keep typing ("e", "w", …) from moving the player or opening other panels.
      event.stopPropagation();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(prop: PropSpec, api: PraglishApiClient): void {
    this.prop = prop;
    this.api = api;
    this.title.textContent = "Kelime avı";
    this.hint.textContent = `İpucu: Türkçesi "${prop.nameTr}".`;
    this.meter.textContent = "";
    this.messages.replaceChildren();
    this.status.textContent = "Yükleniyor…";
    this.root.hidden = false;
    this.input.value = "";
    this.input.focus();
    void this.loadProgress(prop, api, true);
  }

  close(): void {
    if (!this.isOpen) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && this.root.contains(focused)) focused.blur();
    this.root.hidden = true;
    this.events.onClose();
  }

  private async loadProgress(prop: PropSpec, api: PraglishApiClient, initial = false): Promise<void> {
    try {
      const entries = await api.getVocabularyProgress();
      if (this.prop !== prop) return;
      this.renderMeter(entries.find((e) => e.concept === prop.concept));
      if (initial) this.status.textContent = "Nesnenin İngilizce adını yaz";
    } catch (error: unknown) {
      if (this.prop !== prop || !initial) return;
      this.status.textContent = error instanceof Error ? error.message : "İlerleme yüklenemedi";
    }
  }

  private renderMeter(entry: VocabularyProgressEntry | undefined): void {
    if (!entry) {
      this.meter.textContent = "";
      return;
    }
    const earned = entry.words.filter((w) => w.earned);
    const total = entry.words.length;
    const found = earned.map((w) => w.word).join(", ");
    this.meter.textContent = entry.completed
      ? `Tamamlandı: ${found}`
      : `${earned.length}/${total} kelime bulundu${found ? `: ${found}` : ""}. Eş anlamlıları da sayılır.`;
  }

  private async submit(): Promise<void> {
    const word = this.input.value.trim();
    const prop = this.prop;
    const api = this.api;
    if (!word || !prop || !api || this.send.disabled) return;
    this.input.value = "";
    this.append(word, "user");
    this.setBusy(true);
    try {
      const result = await api.submitVocabulary(prop.concept, word);
      this.renderResult(prop, api, word, result);
    } catch (error: unknown) {
      this.append(error instanceof Error ? error.message : "Gönderilemedi.", "error");
      this.status.textContent = "Bağlantı hatası · API çalışıyor mu?";
    } finally {
      this.setBusy(false);
      this.input.focus();
    }
  }

  private renderResult(prop: PropSpec, api: PraglishApiClient, word: string, r: VocabularySubmitResponse): void {
    if (!r.matched) {
      this.append(`"${word}" olmadı. Tekrar dene.`, "bad");
      this.status.textContent = "İpucu: tek kelime ya da kısa bir ad yeterli";
      return;
    }
    const progress = r.words_total !== undefined && r.words_earned !== undefined
      ? ` (${r.words_earned}/${r.words_total})`
      : "";
    if (r.already_earned) {
      this.append(`"${word}" doğru, bunu zaten bulmuştun${progress}.`, "known");
    } else {
      this.append(`Doğru! "${word}" · +${r.reward_coins} jeton${progress}`, "good");
    }
    const completed = r.concept_completed === true;
    this.status.textContent = completed ? "Bu nesnenin bütün kelimelerini buldun." : "Başka bir karşılığı var mı?";
    this.events.onProgress(prop, completed);
    void this.loadProgress(prop, api);
  }

  private append(text: string, kind: Kind): void {
    const row = document.createElement("div");
    row.className = `town-dialogue__msg is-vocab-${kind}`;
    const who = document.createElement("strong");
    who.textContent = kind === "user" ? "SEN" : "OYUN";
    const body = document.createElement("span");
    body.textContent = text;
    row.append(who, body);
    this.messages.append(row);
    this.messages.scrollTop = this.messages.scrollHeight;
  }

  private setBusy(busy: boolean): void {
    this.input.disabled = busy;
    this.send.disabled = busy;
    this.send.textContent = busy ? "…" : "Dene";
  }
}
