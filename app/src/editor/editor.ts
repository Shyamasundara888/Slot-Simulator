import { checkDraft, type DraftCheck, draftToFiles, draftZip, type ModuleDraft } from "../../../src/edit/draft.js";
import type { SlotModule } from "../../../src/module/parse.js";
import { exactRtp, type ExactResult } from "../../../src/sim/exact.js";
import type { SimulationResult } from "../../../src/sim/simulate.js";
import { locale, t } from "../i18n/index.js";
import { deleteDraft, loadDraft, saveDraft } from "../mod-store.js";
import { assetUrls, type ClientModule, errorText, releaseAssets } from "../modules.js";
import { h } from "./dom.js";
import { generalTab, paytableTab, symbolsTab, type Tab, type TabContext, TABS } from "./tabs.js";
import type { WorkerRequest, WorkerResponse } from "./worker.js";

/** Quello che l'editor chiede alla pagina che lo ospita. */
export interface EditorHost {
  /** Avvia l'anteprima giocabile con il modulo della bozza; fallisce se lo script non parte. */
  preview(mod: ClientModule, seed: string | undefined): Promise<void>;
  /** Vero mentre l'anteprima sta giocando un round. */
  isBusy(): boolean;
  /** Vero se l'id è di una slot inclusa nel sito: un mod non può usarlo. */
  isBundled(id: string): boolean;
  /** Aggiunge lo zip al menu come mod. */
  install(zip: Uint8Array): Promise<void>;
  close(): void;
}

/** Da dove parte la bozza: una slot del menu o il modello di una slot nuova. */
export interface EditorSource {
  /** Chiave della bozza salvata, per esempio "slot:pixel-quest" o "new". */
  key: string;
  /** Vero se la slot di partenza è inclusa nel sito: l'editor ne modifica una copia. */
  bundled: boolean;
  load(): Promise<{ draft: ModuleDraft; assets: Record<string, Uint8Array> }>;
}

const SIM_SPINS = [100_000, 1_000_000, 5_000_000] as const;
const HISTORY_LIMIT = 200;
/** Attesa dopo una modifica prima di riavviare l'anteprima, per non farlo a ogni tasto. */
const PREVIEW_DELAY = 600;

const percent = (x: number, digits = 2) =>
  `${(x * 100).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
const oneIn = (p: number) => Math.round(1 / p).toLocaleString(locale);

type Simulation =
  | { state: "idle" }
  | { state: "running"; spins: number; worker: Worker }
  | { state: "done"; result: SimulationResult; stale: boolean }
  | { state: "error"; message: string };

export class Editor {
  private past: ModuleDraft[] = [];
  private future: ModuleDraft[] = [];
  private tab: Tab = "general";
  private check: DraftCheck = { module: null, problems: [] };
  private lastValid: SlotModule | null = null;
  private exact: ExactResult | null = null;
  private scriptError: string | null = null;
  private simulation: Simulation = { state: "idle" };
  private simSpins: number = SIM_SPINS[1];
  private seed = "";
  private seedSearch: Worker | null = null;
  private notice = "";
  private saved: "saved" | "saving" | "unsaved" = "saved";
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private renderQueued = false;
  private urls: Map<string, string>;
  private readonly onKey = (e: KeyboardEvent) => this.shortcut(e);

  private constructor(
    private readonly root: HTMLElement,
    private readonly host: EditorHost,
    private readonly source: EditorSource,
    private draft: ModuleDraft,
    private assets: Record<string, Uint8Array>,
    private resumed: number | null,
  ) {
    this.urls = assetUrls(assets);
    document.addEventListener("keydown", this.onKey);
    this.refresh();
    this.render();
    this.schedulePreview(0);
  }

  /** Apre l'editor: riprende la bozza salvata per questa sorgente, se c'è. */
  static async open(root: HTMLElement, host: EditorHost, source: EditorSource): Promise<Editor> {
    const stored = await loadDraft(source.key);
    if (stored) return new Editor(root, host, source, stored.draft, stored.assets, stored.saved);
    const { draft, assets } = await source.load();
    return new Editor(root, host, source, draft, assets, null);
  }

  /** Chiude l'editor senza perdere la bozza, che resta salvata nel browser. */
  async dispose(): Promise<void> {
    clearTimeout(this.previewTimer);
    if (this.simulation.state === "running") this.simulation.worker.terminate();
    this.seedSearch?.terminate();
    if (this.saved !== "saved") await this.save();
    clearTimeout(this.saveTimer);
    releaseAssets({ assets: this.urls });
    document.removeEventListener("keydown", this.onKey);
    this.root.replaceChildren();
  }

  private get assetPaths(): string[] {
    return Object.keys(this.assets);
  }

  // --- stato della bozza ---

  private apply(change: (draft: ModuleDraft) => void): void {
    const next = structuredClone(this.draft);
    change(next);
    if (JSON.stringify(next) === JSON.stringify(this.draft)) return this.queueRender();
    this.past.push(this.draft);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.draft = next;
    this.changed();
  }

  private undo(): void {
    const previous = this.past.pop();
    if (!previous) return;
    this.future.push(this.draft);
    this.draft = previous;
    this.changed();
  }

  private redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.draft);
    this.draft = next;
    this.changed();
  }

  private changed(): void {
    this.notice = "";
    this.refresh();
    if (this.simulation.state === "done") this.simulation.stale = true;
    this.saved = "unsaved";
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), 400);
    this.schedulePreview(PREVIEW_DELAY);
    this.queueRender();
  }

  /** Valida la bozza e ricalcola i numeri esatti. */
  private refresh(): void {
    this.check = checkDraft(this.draft, this.assetPaths);
    if (this.check.module) {
      this.lastValid = this.check.module;
      this.exact = exactRtp(this.check.module.math);
    } else this.exact = null;
  }

  private async save(): Promise<void> {
    this.saved = "saving";
    try {
      await saveDraft({ key: this.source.key, draft: this.draft, assets: this.assets, saved: Date.now() });
      if (this.saved === "saving") this.saved = "saved";
    } catch (err) {
      console.warn("Bozza non salvata:", err);
      this.saved = "unsaved";
    }
    this.renderStatus();
  }

  private clientModule(module: SlotModule): ClientModule {
    return { module, assets: this.urls, files: draftToFiles(this.draft) };
  }

  /** Riavvia l'anteprima quando la bozza è valida e il round in corso è finito. */
  private schedulePreview(delay: number): void {
    clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => {
      const module = this.check.module;
      if (!module) return;
      if (this.host.isBusy()) return this.schedulePreview(300);
      this.host.preview(this.clientModule(module), this.seed.trim() || undefined).then(
        () => this.setScriptError(null),
        (err: unknown) => this.setScriptError(errorText(err)),
      );
    }, delay);
  }

  private setScriptError(message: string | null): void {
    if (message === this.scriptError) return;
    this.scriptError = message;
    this.queueRender();
  }

  // --- calcoli nel worker ---

  private runWorker(request: WorkerRequest, onDone: (response: WorkerResponse) => void): Worker {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      worker.terminate();
      onDone(data);
    };
    worker.onerror = (e) => {
      worker.terminate();
      onDone({ kind: "error", message: e.message || t("editor.numbers.workerError") });
    };
    worker.postMessage(request);
    return worker;
  }

  private simulate(): void {
    if (!this.check.module || this.simulation.state === "running") return;
    const spins = this.simSpins;
    const worker = this.runWorker({ kind: "simulate", files: draftToFiles(this.draft), spins, seed: "editor" }, (response) => {
      this.simulation =
        response.kind === "simulated"
          ? { state: "done", result: response.result, stale: false }
          : { state: "error", message: response.kind === "error" ? response.message : "" };
      this.queueRender();
    });
    this.simulation = { state: "running", spins, worker };
    this.queueRender();
  }

  private cancelSimulation(): void {
    if (this.simulation.state !== "running") return;
    this.simulation.worker.terminate();
    this.simulation = { state: "idle" };
    this.queueRender();
  }

  private findSeed(feature: "free" | "extra"): void {
    if (!this.check.module || this.seedSearch) return;
    this.seedSearch = this.runWorker({ kind: "findSeed", files: draftToFiles(this.draft), feature, limit: 50_000 }, (response) => {
      this.seedSearch = null;
      if (response.kind === "seed" && response.seed) {
        this.seed = response.seed;
        this.notice = t("editor.numbers.seedFound", { seed: response.seed });
        this.schedulePreview(0);
      } else this.notice = response.kind === "error" ? response.message : t("editor.numbers.seedNotFound");
      this.queueRender();
    });
    this.queueRender();
  }

  // --- esportazione ---

  private zip(): Uint8Array | null {
    if (!this.check.module) {
      alert(t("editor.actions.invalid"));
      return null;
    }
    return draftZip(this.draft, this.assets);
  }

  private download(): void {
    const zip = this.zip();
    if (!zip) return;
    const { id, version } = this.draft.manifest;
    const url = URL.createObjectURL(new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }));
    h("a", { href: url, download: `${id}-${version}.zip` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async install(): Promise<void> {
    const { id } = this.draft.manifest;
    if (this.host.isBundled(id)) {
      this.notice = t("editor.actions.bundledId", { id });
      return this.queueRender();
    }
    const zip = this.zip();
    if (zip) await this.host.install(zip);
  }

  private async restart(): Promise<void> {
    if (!confirm(t("editor.actions.restartConfirm"))) return;
    clearTimeout(this.saveTimer);
    await deleteDraft(this.source.key).catch((err: unknown) => console.warn(err));
    const { draft, assets } = await this.source.load();
    releaseAssets({ assets: this.urls });
    this.urls = assetUrls(assets);
    this.assets = assets;
    this.draft = draft;
    this.past = [];
    this.future = [];
    this.resumed = null;
    this.saved = "saved";
    this.notice = "";
    this.refresh();
    this.schedulePreview(0);
    this.queueRender();
  }

  // --- interfaccia ---

  private shortcut(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (!(e.ctrlKey || e.metaKey) || target.matches("input, textarea") || document.querySelector("dialog[open]")) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) this.undo();
    else if ((key === "z" && e.shiftKey) || key === "y") this.redo();
    else return;
    e.preventDefault();
  }

  private queueRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    // Dopo il cambio di focus: così il campo su cui si è spostato l'utente torna attivo.
    setTimeout(() => {
      this.renderQueued = false;
      this.render();
    }, 0);
  }

  private render(): void {
    const active = document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement) ? document.activeElement.dataset.key : undefined;
    const scroll = this.root.querySelector(".ed-body")?.scrollTop ?? 0;
    const ctx: TabContext = {
      draft: this.draft,
      lastValid: this.lastValid,
      assetUrls: this.urls,
      apply: (change) => this.apply(change),
      notify: (text) => {
        this.notice = text;
        this.queueRender();
      },
    };
    const body = { general: generalTab, symbols: symbolsTab, paytable: paytableTab }[this.tab](ctx);
    this.markProblems(body);

    this.root.replaceChildren(
      this.header(),
      this.problemsView(),
      this.numbersView(),
      h(
        "nav",
        { class: "ed-tabs", role: "tablist" },
        ...TABS.map((tab) =>
          h(
            "button",
            {
              type: "button", role: "tab", "data-key": `tab-${tab}`, "aria-selected": String(tab === this.tab), class: tab === this.tab ? "active" : "",
              onclick: () => {
                this.tab = tab;
                this.render();
              },
            },
            t(`editor.tab.${tab}`),
          ),
        ),
      ),
      ...(this.notice ? [h("p", { class: "ed-notice", role: "status" }, this.notice)] : []),
      h("section", { class: "ed-body", role: "tabpanel" }, body),
      this.actionsView(),
    );
    const body2 = this.root.querySelector(".ed-body");
    if (body2) body2.scrollTop = scroll;
    if (active) this.root.querySelector<HTMLElement>(`[data-key="${CSS.escape(active)}"]`)?.focus();
  }

  private header(): HTMLElement {
    return h(
      "header",
      { class: "ed-head" },
      h("div", {}, h("strong", {}, t("editor.title")), " ", h("span", { class: "ed-name" }, this.draft.manifest.name || this.draft.manifest.id)),
      h(
        "div",
        { class: "ed-head-actions" },
        h("button", { type: "button", id: "ed-undo", "data-key": "undo", disabled: this.past.length === 0, title: t("editor.undoTitle"), onclick: () => this.undo() }, t("editor.undo")),
        h("button", { type: "button", id: "ed-redo", "data-key": "redo", disabled: this.future.length === 0, title: t("editor.redoTitle"), onclick: () => this.redo() }, t("editor.redo")),
        h("button", { type: "button", id: "ed-close", onclick: () => this.host.close() }, t("editor.close")),
      ),
      h(
        "p",
        { class: "ed-source" },
        this.source.bundled ? t("editor.copyOfBundled") : null,
        this.resumed ? ` ${t("editor.resumed", { when: new Date(this.resumed).toLocaleString(locale) })}` : null,
        " ",
        h("span", { class: "ed-saved", id: "ed-saved" }, this.savedText()),
      ),
    );
  }

  private savedText(): string {
    return t(this.saved === "saved" ? "editor.saved" : this.saved === "saving" ? "editor.saving" : "editor.unsaved");
  }

  private renderStatus(): void {
    const el = this.root.querySelector("#ed-saved");
    if (el) el.textContent = this.savedText();
  }

  /** Segna i campi citati dagli errori del motore: "file.json: percorso: messaggio". */
  private markProblems(body: HTMLElement): void {
    for (const problem of this.check.problems) {
      const match = /^([\w/.-]+\.json): ([^:]+): (.+)$/.exec(problem);
      if (!match) continue;
      const [, file, path, message] = match as unknown as [string, string, string, string];
      const field = body.querySelector<HTMLElement>(`[data-path="${CSS.escape(`${file}#${path}`)}"]`);
      if (!field) continue;
      field.classList.add("invalid");
      field.setAttribute("aria-invalid", "true");
      field.title = message;
    }
  }

  private problemsView(): HTMLElement {
    const problems = [...this.check.problems, ...(this.scriptError ? [this.scriptError] : [])];
    if (problems.length === 0) return h("div", { class: "ed-problems ok", role: "status", id: "ed-problems" }, t("editor.valid"));
    const shown = problems.slice(0, 8);
    return h(
      "div",
      { class: "ed-problems", role: "status", id: "ed-problems" },
      h("strong", {}, problems.length === 1 ? t("editor.problemOne") : t("editor.problems", { n: problems.length })),
      h("ul", {}, ...shown.map((p) => h("li", {}, p))),
      problems.length > shown.length ? h("p", {}, t("editor.moreProblems", { n: problems.length - shown.length })) : null,
    );
  }

  private numbersView(): HTMLElement {
    const exact = this.exact;
    const math = this.check.module?.math;
    const lines: (HTMLElement | null)[] = [];
    if (exact && math) {
      lines.push(
        h("p", { class: "ed-big" }, t("editor.numbers.baseRtp"), " ", h("strong", { id: "ed-base-rtp" }, percent(exact.baseRtp))),
        h(
          "p",
          {},
          t("editor.numbers.split", { lines: percent(exact.lineRtp), scatter: percent(exact.scatterRtp) }),
          exact.freeSpinsProbability > 0 ? ` · ${t("editor.numbers.freeEvery", { n: oneIn(exact.freeSpinsProbability) })}` : "",
        ),
      );
    } else lines.push(h("p", {}, t("editor.numbers.invalid")));

    const sim = this.simulation;
    let simView: HTMLElement;
    if (sim.state === "running") {
      simView = h(
        "p",
        {},
        t("editor.numbers.running", { n: sim.spins.toLocaleString(locale) }),
        " ",
        h("button", { type: "button", onclick: () => this.cancelSimulation() }, t("editor.numbers.cancel")),
      );
    } else {
      const select = h(
        "select",
        { "aria-label": t("editor.numbers.rounds"), onchange: (e: Event) => (this.simSpins = Number((e.target as HTMLSelectElement).value)) },
        ...SIM_SPINS.map((n) => {
          const option = new Option(t("editor.numbers.roundsOption", { n: n.toLocaleString(locale) }), String(n));
          option.selected = n === this.simSpins;
          return option;
        }),
      );
      const result =
        sim.state === "done"
          ? this.simulationView(sim.result, sim.stale)
          : sim.state === "error"
            ? h("p", { class: "ed-error" }, sim.message)
            : null;
      simView = h(
        "div",
        {},
        h("p", {}, select, " ", h("button", { type: "button", id: "ed-simulate", disabled: !math, onclick: () => this.simulate() }, t("editor.numbers.simulate"))),
        result,
      );
    }

    const seedInput = h("input", {
      type: "text", id: "ed-seed", size: 8, value: this.seed, placeholder: t("editor.numbers.seedRandom"), "data-key": "seed",
      onchange: (e: Event) => {
        this.seed = (e.target as HTMLInputElement).value;
        this.schedulePreview(0);
      },
    });
    const seedButtons = this.seedSearch
      ? [h("span", {}, t("editor.numbers.seedSearching"))]
      : [
          math?.freeSpins ? h("button", { type: "button", id: "ed-seed-free", onclick: () => this.findSeed("free") }, t("editor.numbers.seedFree")) : null,
          this.draft.script !== null && math ? h("button", { type: "button", onclick: () => this.findSeed("extra") }, t("editor.numbers.seedExtra")) : null,
        ];

    return h(
      "section",
      { class: "ed-numbers", "aria-label": t("editor.numbers.title") },
      ...lines,
      simView,
      h("p", { class: "ed-seed" }, h("label", {}, `${t("editor.numbers.seed")} `, seedInput), " ", ...seedButtons),
    );
  }

  private simulationView(r: SimulationResult, stale: boolean): HTMLElement {
    const confidence = percent(r.rtpConfidence95);
    const extra = Object.entries(r.extra).map(([mode, s]) => t("editor.numbers.mode", { mode: this.lastValid?.scene.modes.get(mode)?.label ?? mode, rtp: percent(s.rtp) }));
    const parts = [
      t("editor.numbers.simRtp", { rtp: percent(r.rtp), confidence }),
      t("editor.numbers.simSplit", { base: percent(r.baseRtp), free: percent(r.freeSpinsRtp) }) + (extra.length ? `, ${extra.join(", ")}` : ""),
      t("editor.numbers.simHit", { hit: percent(r.hitFrequency, 1), sd: r.stdDev.toLocaleString(locale, { maximumFractionDigits: 2 }) }),
      t("editor.numbers.simMax", { max: r.maxWin.toLocaleString(locale, { maximumFractionDigits: 2 }) }) +
        (r.freeSpins && r.freeSpins.triggers > 0 ? ` · ${t("editor.numbers.freeEvery", { n: oneIn(r.freeSpins.triggers / r.spins) })}` : ""),
    ];
    return h(
      "div",
      { class: stale ? "ed-sim stale" : "ed-sim", id: "ed-sim" },
      ...parts.map((p) => h("p", {}, p)),
      stale ? h("p", { class: "ed-hint" }, t("editor.numbers.stale")) : null,
    );
  }

  private actionsView(): HTMLElement {
    return h(
      "footer",
      { class: "ed-actions" },
      h("button", { type: "button", id: "ed-download", onclick: () => this.download() }, t("editor.actions.download")),
      h("button", { type: "button", id: "ed-install", onclick: () => void this.install() }, t("editor.actions.install")),
      h("button", { type: "button", class: "ed-danger", onclick: () => void this.restart() }, t("editor.actions.restart")),
    );
  }
}
