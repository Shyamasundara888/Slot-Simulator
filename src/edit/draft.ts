import { strToU8 } from "fflate";
import type { z } from "zod";
import type { SymbolKind } from "../core/types.js";
import { ModuleError } from "../module/build.js";
import { MODULE_FILES, parseSlotModule, type SlotModule } from "../module/parse.js";
import type { featuresSchema, LinesFile, Manifest, PaytableFile, ReelsFile, sceneSchema } from "../module/schema.js";
import { writeModuleZip } from "../module/zip.js";

/**
 * Un modulo in modifica: gli stessi file di una cartella in slots/, già letti.
 * L'editor visuale e chi lavora da codice cambiano questi oggetti con le
 * funzioni qui sotto, poi li validano con checkDraft come farebbe il motore.
 */
export interface ModuleDraft {
  manifest: Manifest;
  reels: ReelsFile;
  lines: LinesFile;
  paytable: PaytableFile;
  features: z.input<typeof featuresSchema>;
  scene: z.input<typeof sceneSchema>;
  script: string | null;
  /** Altri file del modulo che la bozza conserva senza modificarli, come art/art.json. */
  extra: Record<string, unknown>;
}

const KNOWN: ReadonlySet<string> = new Set(Object.values(MODULE_FILES));

/** Crea una bozza dai file di un modulo, indicizzati per percorso relativo. I file restano intatti. */
export function draftFromFiles(files: Readonly<Record<string, unknown>>): ModuleDraft {
  const copy = structuredClone(files) as Record<string, unknown>;
  const extra = Object.fromEntries(Object.entries(copy).filter(([path]) => !KNOWN.has(path)));
  return {
    manifest: copy[MODULE_FILES.manifest] as Manifest,
    reels: copy[MODULE_FILES.reels] as ReelsFile,
    lines: copy[MODULE_FILES.lines] as LinesFile,
    paytable: copy[MODULE_FILES.paytable] as PaytableFile,
    features: (copy[MODULE_FILES.features] ?? {}) as ModuleDraft["features"],
    scene: (copy[MODULE_FILES.scene] ?? {}) as ModuleDraft["scene"],
    script: typeof copy[MODULE_FILES.script] === "string" ? (copy[MODULE_FILES.script] as string) : null,
    extra,
  };
}

/** I file della bozza, pronti per parseSlotModule. */
export function draftToFiles(draft: ModuleDraft): Record<string, unknown> {
  const files: Record<string, unknown> = {
    ...draft.extra,
    [MODULE_FILES.manifest]: draft.manifest,
    [MODULE_FILES.reels]: draft.reels,
    [MODULE_FILES.lines]: draft.lines,
    [MODULE_FILES.paytable]: draft.paytable,
    [MODULE_FILES.features]: draft.features,
    [MODULE_FILES.scene]: draft.scene,
  };
  if (draft.script !== null) files[MODULE_FILES.script] = draft.script;
  return structuredClone(files);
}

export interface DraftCheck {
  module: SlotModule | null;
  problems: string[];
}

/** Valida la bozza come `npm run mod -- check`, script escluso (va caricato a parte). */
export function checkDraft(draft: ModuleDraft, assets: Iterable<string> = []): DraftCheck {
  try {
    return { module: parseSlotModule(draftToFiles(draft), assets), problems: [] };
  } catch (err) {
    return { module: null, problems: err instanceof ModuleError ? err.problems : [String(err)] };
  }
}

/** Zip del mod, come `npm run mod -- pack`: i file del modulo e gli asset, senza le sorgenti in art/. */
export function draftZip(draft: ModuleDraft, assets: Readonly<Record<string, Uint8Array>>): Uint8Array {
  const files: Record<string, Uint8Array> = { ...assets };
  for (const [path, value] of Object.entries(draftToFiles(draft))) {
    if (!KNOWN.has(path)) continue;
    files[path] = strToU8(typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
  }
  return writeModuleZip(files);
}

export const reelCount = (draft: ModuleDraft) => draft.reels.modes.base.length;

/** Colore di partenza di un simbolo nuovo, come quelli che il motore assegna ai simboli senza scena. */
const NEW_COLORS: Record<SymbolKind, string> = { wild: "#f5b301", scatter: "#d6336c", normal: "#4dabf7" };

/** Primo id libero della forma S1, S2, ... */
export function freeSymbolId(draft: ModuleDraft): string {
  const used = new Set(draft.paytable.symbols.map((s) => s.id));
  let n = 1;
  while (used.has(`S${n}`)) n++;
  return `S${n}`;
}

/** Rinomina la chiave di un oggetto mantenendo l'ordine delle altre. */
function renameKey<T>(record: Record<string, T> | undefined, from: string, to: string): Record<string, T> | undefined {
  if (!record || !(from in record)) return record;
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key === from ? to : key, value]));
}

/** Simboli di art/art.json, se la bozza ne ha uno. */
function artSymbols(draft: ModuleDraft): Record<string, unknown> | undefined {
  const art = draft.extra["art/art.json"] as { symbols?: Record<string, unknown> } | undefined;
  return art && typeof art.symbols === "object" && art.symbols !== null ? art.symbols : undefined;
}

/** Aggiunge un simbolo in fondo alla paytable, senza pagamenti e fuori dai rulli. */
export function addSymbol(draft: ModuleDraft, id: string, kind: SymbolKind = "normal"): void {
  draft.paytable.symbols.push({ id, kind });
  draft.scene.symbols ??= {};
  draft.scene.symbols[id] = { label: id, color: NEW_COLORS[kind] };
}

/**
 * Cambia l'id di un simbolo in tutti i file: paytable, pagamenti, strisce dei
 * rulli, funzioni, scena e art/art.json. Lo script Lua non viene toccato.
 */
export function renameSymbol(draft: ModuleDraft, from: string, to: string): void {
  if (from === to) return;
  for (const symbol of draft.paytable.symbols) if (symbol.id === from) symbol.id = to;
  draft.paytable.linePays = renameKey(draft.paytable.linePays, from, to)!;
  for (const strips of Object.values(draft.reels.modes)) {
    if (!strips) continue;
    for (const strip of strips) strip.forEach((s, i) => s === from && (strip[i] = to));
  }
  const ladder = draft.features.freeSpins?.upgradeLadder;
  if (ladder) ladder.forEach((s, i) => s === from && (ladder[i] = to));
  const scene = renameKey(draft.scene.symbols, from, to);
  if (scene) draft.scene.symbols = scene;
  const art = artSymbols(draft);
  if (art) (draft.extra["art/art.json"] as { symbols: Record<string, unknown> }).symbols = renameKey(art, from, to)!;
}

/** Toglie un simbolo da tutti i file, strisce dei rulli comprese. */
export function removeSymbol(draft: ModuleDraft, id: string): void {
  const kind = draft.paytable.symbols.find((s) => s.id === id)?.kind;
  draft.paytable.symbols = draft.paytable.symbols.filter((s) => s.id !== id);
  delete draft.paytable.linePays[id];
  if (kind === "scatter") delete draft.paytable.scatterPays;
  for (const [mode, strips] of Object.entries(draft.reels.modes)) {
    if (strips) draft.reels.modes[mode] = strips.map((strip) => strip.filter((s) => s !== id));
  }
  const fs = draft.features.freeSpins;
  if (fs?.upgradeLadder) fs.upgradeLadder = fs.upgradeLadder.filter((s) => s !== id);
  if (draft.scene.symbols) delete draft.scene.symbols[id];
  const art = artSymbols(draft);
  if (art) delete art[id];
}

/** Sposta un simbolo nella paytable: `delta` -1 lo porta su di una posizione, +1 giù. */
export function moveSymbol(draft: ModuleDraft, id: string, delta: number): void {
  const list = draft.paytable.symbols;
  const from = list.findIndex((s) => s.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return;
  const [symbol] = list.splice(from, 1);
  list.splice(to, 0, symbol!);
}

/** Cambia il tipo di un simbolo; uno scatter paga solo tramite scatterPays, quindi perde i pagamenti su linea. */
export function setSymbolKind(draft: ModuleDraft, id: string, kind: SymbolKind): void {
  const symbol = draft.paytable.symbols.find((s) => s.id === id);
  if (!symbol) return;
  symbol.kind = kind;
  if (kind === "scatter") delete draft.paytable.linePays[id];
}

/** Imposta un pagamento su linea; null o 0 lo tolgono. */
export function setLinePay(draft: ModuleDraft, id: string, count: number, value: number | null): void {
  const pays = { ...(draft.paytable.linePays[id] ?? {}) };
  if (value === null || value === 0) delete pays[String(count)];
  else pays[String(count)] = value;
  const sorted = Object.fromEntries(Object.entries(pays).sort(([a], [b]) => Number(a) - Number(b)));
  if (Object.keys(sorted).length === 0) delete draft.paytable.linePays[id];
  else draft.paytable.linePays[id] = sorted;
}

/** Imposta un pagamento scatter; null o 0 lo tolgono. */
export function setScatterPay(draft: ModuleDraft, count: number, value: number | null): void {
  const pays = { ...(draft.paytable.scatterPays ?? {}) };
  if (value === null || value === 0) delete pays[String(count)];
  else pays[String(count)] = value;
  const entries = Object.entries(pays).sort(([a], [b]) => Number(a) - Number(b));
  if (entries.length === 0) delete draft.paytable.scatterPays;
  else draft.paytable.scatterPays = Object.fromEntries(entries);
}

/** Toglie le chiavi numeriche oltre `max` da una tabella di pagamenti. */
function trimCounts(table: Record<string, number> | undefined, max: number): void {
  if (!table) return;
  for (const key of Object.keys(table)) if (Number(key) > max) delete table[key];
}

/**
 * Cambia la griglia. Rulli in più copiano l'ultima striscia e prolungano le
 * linee con l'ultima riga; rulli in meno vengono tolti. Con meno righe le
 * linee restano dentro la griglia; con più righe le strisce troppo corte si
 * allungano ripetendosi. Il risultato è valido, ma linee e strisce vanno
 * riviste per avere una slot sensata.
 */
export function resizeGrid(draft: ModuleDraft, reels: number, rows: number): void {
  draft.reels.rows = rows;
  for (const [mode, strips] of Object.entries(draft.reels.modes)) {
    if (!strips) continue;
    const resized = strips.slice(0, reels).map((strip) => [...strip]);
    while (resized.length < reels) resized.push([...resized.at(-1)!]);
    for (const strip of resized) {
      const length = strip.length;
      for (let i = 0; strip.length < rows; i++) strip.push(strip[i % length]!);
    }
    draft.reels.modes[mode] = resized;
  }
  draft.lines.lines = draft.lines.lines.map((line) => {
    const out = line.slice(0, reels).map((row) => Math.min(row, rows - 1));
    while (out.length < reels) out.push(out.at(-1) ?? 0);
    return out;
  });
  for (const pays of Object.values(draft.paytable.linePays)) trimCounts(pays, reels);
  trimCounts(draft.paytable.scatterPays, reels * rows);
  trimCounts(draft.features.freeSpins?.trigger.spins, reels * rows);
  const wild = draft.features.expandingWild;
  if (wild) {
    wild.reels = wild.reels.filter((r) => r <= reels);
    if (wild.reels.length === 0) delete draft.features.expandingWild;
  }
}
