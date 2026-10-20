import type { SymbolKind } from "../../../src/core/types.js";
import {
  addSymbol,
  freeSymbolId,
  type ModuleDraft,
  moveSymbol,
  reelCount,
  removeSymbol,
  renameSymbol,
  resizeGrid,
  setLinePay,
  setScatterPay,
  setSymbolKind,
} from "../../../src/edit/draft.js";
import type { SlotModule } from "../../../src/module/parse.js";
import { t } from "../i18n/index.js";
import { h, numberValue } from "./dom.js";

/** Quello che una scheda può leggere e fare. */
export interface TabContext {
  draft: ModuleDraft;
  /** L'ultima versione valida della bozza: dà i colori e le immagini effettivi dei simboli. */
  lastValid: SlotModule | null;
  assetUrls: ReadonlyMap<string, string>;
  /** Applica una modifica alla bozza, con annulla e ripeti. */
  apply(change: (draft: ModuleDraft) => void): void;
  /** Mostra un avviso sopra la scheda, per esempio un id già usato. */
  notify(text: string): void;
  /** Scelte di visualizzazione che restano tra un disegno e l'altro, come la modalità dei rulli aperta. */
  view: EditorView;
  setView(change: Partial<EditorView>): void;
}

export interface EditorView {
  /** Modalità dei rulli mostrata nella scheda Rulli. */
  mode: string;
  /** Vero se la scheda Rulli mostra le strisce simbolo per simbolo. */
  manualStrips: boolean;
}

export const TABS = ["general", "symbols", "paytable", "lines", "reels", "features"] as const;
export type Tab = (typeof TABS)[number];

const SYMBOL_ID = /^[A-Z0-9_]+$/;
const KINDS: readonly SymbolKind[] = ["normal", "wild", "scatter"];

/** Campo di testo legato a un percorso: `data-path` collega gli errori del motore al campo. */
export function textField(path: string, value: string, onChange: (value: string) => void, attrs: Record<string, string | number> = {}) {
  return h("input", {
    type: "text",
    value,
    "data-key": path,
    "data-path": path,
    ...attrs,
    onchange: (e: Event) => onChange((e.target as HTMLInputElement).value),
  });
}

export function numberField(path: string, value: number | undefined, onChange: (value: number | null) => void, attrs: Record<string, string | number> = {}) {
  return h("input", {
    type: "number",
    min: 0,
    step: "any",
    value: value ?? "",
    "data-key": path,
    "data-path": path,
    ...attrs,
    onchange: (e: Event) => onChange(numberValue(e.target as HTMLInputElement)),
  });
}

export const row = (label: string, field: HTMLElement, hint?: string) =>
  h("label", { class: "ed-field" }, h("span", {}, label), field, hint ? h("small", {}, hint) : null);

export function generalTab(ctx: TabContext): HTMLElement {
  const { draft } = ctx;
  const m = draft.manifest;
  const optional = (key: "author" | "description") => (value: string) =>
    ctx.apply((d) => {
      if (value.trim() === "") delete d.manifest[key];
      else d.manifest[key] = value;
    });
  const reels = reelCount(draft);
  const modes = Object.keys(draft.reels.modes).join(", ");
  return h(
    "div",
    { class: "ed-form" },
    row(t("editor.general.id"), textField("manifest.json#id", m.id, (v) => ctx.apply((d) => void (d.manifest.id = v.trim()))), t("editor.general.idHint")),
    row(t("editor.general.name"), textField("manifest.json#name", m.name, (v) => ctx.apply((d) => void (d.manifest.name = v)))),
    row(t("editor.general.version"), textField("manifest.json#version", m.version, (v) => ctx.apply((d) => void (d.manifest.version = v.trim()))), t("editor.general.versionHint")),
    row(t("editor.general.author"), textField("manifest.json#author", m.author ?? "", optional("author"))),
    row(
      t("editor.general.description"),
      h("textarea", {
        rows: 3,
        "data-key": "manifest.json#description",
        "data-path": "manifest.json#description",
        value: m.description ?? "",
        onchange: (e: Event) => optional("description")((e.target as HTMLTextAreaElement).value),
      }),
    ),
    h(
      "fieldset",
      { class: "ed-grid" },
      h("legend", {}, t("editor.general.grid")),
      row(
        t("editor.general.reels"),
        h("input", {
          type: "number", min: 2, max: 10, value: reels, "data-key": "grid-reels",
          onchange: (e: Event) => {
            const value = numberValue(e.target as HTMLInputElement);
            if (value !== null && Number.isInteger(value) && value >= 2 && value <= 10) ctx.apply((d) => resizeGrid(d, value, d.reels.rows));
            else ctx.notify(t("editor.general.reelsRange"));
          },
        }),
      ),
      row(
        t("editor.general.rows"),
        h("input", {
          type: "number", min: 1, max: 10, value: draft.reels.rows, "data-key": "grid-rows", "data-path": "math/reels.json#rows",
          onchange: (e: Event) => {
            const value = numberValue(e.target as HTMLInputElement);
            if (value !== null && Number.isInteger(value) && value >= 1 && value <= 10) ctx.apply((d) => resizeGrid(d, reelCount(d), value));
            else ctx.notify(t("editor.general.rowsRange"));
          },
        }),
      ),
      h("p", { class: "ed-hint" }, t("editor.general.gridHint", { lines: draft.lines.lines.length, modes })),
    ),
    row(
      t("editor.general.background"),
      h("input", {
        type: "color",
        value: draft.scene.background ?? "#1b1430",
        "data-key": "scenes/main.json#background",
        "data-path": "scenes/main.json#background",
        onchange: (e: Event) => ctx.apply((d) => void (d.scene.background = (e.target as HTMLInputElement).value)),
      }),
      draft.scene.backgroundImage ? t("editor.general.backgroundImage") : undefined,
    ),
  );
}

/** Quante volte compare ogni simbolo sulle strisce base. */
function baseCounts(draft: ModuleDraft): Map<string, number> {
  const counts = new Map<string, number>();
  for (const strip of draft.reels.modes.base) for (const s of strip) counts.set(s, (counts.get(s) ?? 0) + 1);
  return counts;
}

export function symbolsTab(ctx: TabContext): HTMLElement {
  const { draft } = ctx;
  const counts = baseCounts(draft);
  const effective = (id: string) => ctx.lastValid?.scene.symbols.get(id);
  const sceneOf = (d: ModuleDraft, id: string) => {
    d.scene.symbols ??= {};
    return (d.scene.symbols[id] ??= { color: effective(id)?.color ?? "#4dabf7" });
  };

  const rename = (from: string, input: HTMLInputElement) => {
    const to = input.value.trim().toUpperCase();
    if (to === from) return void (input.value = from);
    if (!SYMBOL_ID.test(to)) {
      input.value = from;
      return ctx.notify(t("editor.symbols.idInvalid", { id: to }));
    }
    if (draft.paytable.symbols.some((s) => s.id === to)) {
      input.value = from;
      return ctx.notify(t("editor.symbols.idTaken", { id: to }));
    }
    ctx.apply((d) => renameSymbol(d, from, to));
    if (draft.script && new RegExp(`["']${from}["']`).test(draft.script)) ctx.notify(t("editor.symbols.scriptMentions", { from, to }));
  };

  const rows = draft.paytable.symbols.map(({ id, kind }, i) => {
    const style = draft.scene.symbols?.[id];
    const image = effective(id)?.image;
    const url = image ? ctx.assetUrls.get(image) : undefined;
    const color = style?.color ?? effective(id)?.color ?? "#4dabf7";
    return h(
      "tr",
      {},
      h(
        "td",
        { class: "ed-order" },
        h("button", { type: "button", "data-key": `up-${id}`, title: t("editor.symbols.up"), "aria-label": t("editor.symbols.up"), disabled: i === 0, onclick: () => ctx.apply((d) => moveSymbol(d, id, -1)) }, "↑"),
        h("button", { type: "button", "data-key": `down-${id}`, title: t("editor.symbols.down"), "aria-label": t("editor.symbols.down"), disabled: i === draft.paytable.symbols.length - 1, onclick: () => ctx.apply((d) => moveSymbol(d, id, 1)) }, "↓"),
      ),
      h("td", {}, url ? h("img", { class: "icon", src: url, alt: "" }) : h("span", { class: "swatch", style: `background:${color}` })),
      h(
        "td",
        {},
        h("input", {
          type: "text", value: id, size: 8, "data-key": `symbol-id-${i}`, "data-path": `math/paytable.json#symbols.${i}.id`,
          "aria-label": t("editor.symbols.id"),
          onchange: (e: Event) => rename(id, e.target as HTMLInputElement),
        }),
      ),
      h(
        "td",
        {},
        h(
          "select",
          {
            "data-key": `symbol-kind-${i}`, "aria-label": t("editor.symbols.kind"),
            onchange: (e: Event) => ctx.apply((d) => setSymbolKind(d, id, (e.target as HTMLSelectElement).value as SymbolKind)),
          },
          ...KINDS.map((k) => {
            const option = new Option(t(`editor.kind.${k}`), k);
            option.selected = k === kind;
            return option;
          }),
        ),
      ),
      h(
        "td",
        {},
        textField(`scenes/main.json#symbols.${id}.label`, style?.label ?? "", (v) =>
          ctx.apply((d) => {
            const s = sceneOf(d, id);
            if (v.trim() === "") delete s.label;
            else s.label = v;
          }),
          { size: 10, placeholder: id, "aria-label": t("editor.symbols.label") },
        ),
      ),
      h(
        "td",
        {},
        h("input", {
          type: "color", value: color, "data-key": `symbol-color-${id}`, "data-path": `scenes/main.json#symbols.${id}.color`,
          "aria-label": t("editor.symbols.color"),
          onchange: (e: Event) => ctx.apply((d) => void (sceneOf(d, id).color = (e.target as HTMLInputElement).value)),
        }),
      ),
      h("td", { class: "num" }, String(counts.get(id) ?? 0)),
      h(
        "td",
        {},
        h(
          "button",
          {
            type: "button", class: "ed-danger", title: t("editor.symbols.remove"), "aria-label": t("editor.symbols.remove"),
            onclick: () => {
              if (confirm(t("editor.symbols.removeConfirm", { id }))) ctx.apply((d) => removeSymbol(d, id));
            },
          },
          "✕",
        ),
      ),
    );
  });

  return h(
    "div",
    {},
    h(
      "table",
      { class: "ed-table" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", {}, ""),
          h("th", {}, ""),
          h("th", {}, t("editor.symbols.id")),
          h("th", {}, t("editor.symbols.kind")),
          h("th", {}, t("editor.symbols.label")),
          h("th", {}, t("editor.symbols.color")),
          h("th", { title: t("editor.symbols.onReelsTitle") }, t("editor.symbols.onReels")),
          h("th", {}, ""),
        ),
      ),
      h("tbody", {}, ...rows),
    ),
    h("button", { type: "button", "data-key": "add-symbol", onclick: () => ctx.apply((d) => addSymbol(d, freeSymbolId(d))) }, t("editor.symbols.add")),
    h("p", { class: "ed-hint" }, t("editor.symbols.hint")),
  );
}

/** Colonne di una tabella di pagamenti: da 2 al massimo, più 1 se qualcuno la usa. */
function payColumns(tables: readonly (Record<string, number> | undefined)[], max: number): number[] {
  const used = tables.flatMap((table) => Object.keys(table ?? {}).map(Number));
  const from = used.includes(1) ? 1 : 2;
  const to = Math.max(max, ...used);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

export function paytableTab(ctx: TabContext): HTMLElement {
  const { draft } = ctx;
  const reels = reelCount(draft);
  const paying = draft.paytable.symbols.filter((s) => s.kind !== "scatter");
  const scatter = draft.paytable.symbols.find((s) => s.kind === "scatter");
  const label = (id: string) => draft.scene.symbols?.[id]?.label ?? id;
  const columns = payColumns(paying.map((s) => draft.paytable.linePays[s.id]), reels);
  const head = (cols: number[]) => h("thead", {}, h("tr", {}, h("th", {}, t("pt.symbol")), ...cols.map((n) => h("th", {}, `${n}×`))));

  const lineTable = h(
    "table",
    { class: "ed-table ed-pays" },
    head(columns),
    h(
      "tbody",
      {},
      ...paying.map(({ id }) =>
        h(
          "tr",
          {},
          h("td", {}, label(id)),
          ...columns.map((n) =>
            h(
              "td",
              {},
              numberField(`math/paytable.json#linePays.${id}.${n}`, draft.paytable.linePays[id]?.[String(n)], (v) => ctx.apply((d) => setLinePay(d, id, n, v)), {
                "aria-label": t("editor.paytable.cell", { symbol: label(id), n }),
              }),
            ),
          ),
        ),
      ),
    ),
  );

  const parts: HTMLElement[] = [h("h3", {}, t("editor.paytable.lines", { lines: draft.lines.lines.length })), lineTable];
  if (scatter) {
    const cols = payColumns([draft.paytable.scatterPays], reels);
    parts.push(
      h("h3", {}, t("editor.paytable.scatter")),
      h(
        "table",
        { class: "ed-table ed-pays" },
        head(cols),
        h(
          "tbody",
          {},
          h(
            "tr",
            {},
            h("td", {}, label(scatter.id)),
            ...cols.map((n) =>
              h(
                "td",
                {},
                numberField(`math/paytable.json#scatterPays.${n}`, draft.paytable.scatterPays?.[String(n)], (v) => ctx.apply((d) => setScatterPay(d, n, v)), {
                  "aria-label": t("editor.paytable.cell", { symbol: label(scatter.id), n }),
                }),
              ),
            ),
          ),
        ),
      ),
      h("p", { class: "ed-hint" }, t("editor.paytable.scatterHint")),
    );
  }
  parts.push(h("p", { class: "ed-hint" }, t("editor.paytable.hint")));
  return h("div", {}, ...parts);
}
