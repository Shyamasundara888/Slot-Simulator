import { strToU8 } from "fflate";
import type { z } from "zod";
import type { SymbolKind } from "../core/types.js";
import { ModuleError } from "../module/build.js";
import { MODULE_FILES, parseSlotModule, type SlotModule } from "../module/parse.js";
import type { featuresSchema, LinesFile, Manifest, PaytableFile, ReelsFile, sceneSchema, UiFile } from "../module/schema.js";
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
  /** Layout ed elementi di interfaccia; null se il modulo non ha scenes/ui.json. */
  ui: UiFile | null;
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
    ui: (copy[MODULE_FILES.ui] ?? null) as UiFile | null,
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
  if (draft.ui !== null) files[MODULE_FILES.ui] = draft.ui;
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

// --- linee ---

/** Aggiunge una linea; senza posizioni è la riga centrale dritta. */
export function addLine(draft: ModuleDraft, line?: readonly number[]): void {
  const middle = Math.floor((draft.reels.rows - 1) / 2);
  draft.lines.lines.push(line ? [...line] : new Array<number>(reelCount(draft)).fill(middle));
}

export function removeLine(draft: ModuleDraft, index: number): void {
  if (draft.lines.lines.length > 1) draft.lines.lines.splice(index, 1);
}

/** Sposta la posizione di una linea su un rullo (da 0) alla riga indicata (da 0). */
export function setLineRow(draft: ModuleDraft, index: number, reel: number, row: number): void {
  const line = draft.lines.lines[index];
  if (line && reel < line.length && row >= 0 && row < draft.reels.rows) line[reel] = row;
}

/** Per ogni linea uguale a una precedente, l'indice (da 0) della prima uguale. */
export function duplicateLines(draft: ModuleDraft): Map<number, number> {
  const first = new Map<string, number>();
  const duplicates = new Map<number, number>();
  draft.lines.lines.forEach((line, i) => {
    const key = line.join(",");
    const seen = first.get(key);
    if (seen === undefined) first.set(key, i);
    else duplicates.set(i, seen);
  });
  return duplicates;
}

// --- rulli ---

/** Modalità dei rulli nell'ordine dei file: base, free, poi quelle degli script. */
export const reelModes = (draft: ModuleDraft) => Object.keys(draft.reels.modes);

/** Quante volte compare ogni simbolo su una striscia. */
export function stripCounts(strip: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of strip) counts.set(s, (counts.get(s) ?? 0) + 1);
  return counts;
}

/**
 * Crea una striscia dai conteggi, con ogni simbolo distribuito in modo
 * uniforme (round robin pesato): le copie di uno stesso simbolo stanno il più
 * lontano possibile tra loro e, quando si può, mai una accanto all'altra.
 * Lo stesso conteggio dà sempre la stessa striscia.
 */
export function spreadStrip(counts: ReadonlyMap<string, number>): string[] {
  const entries = [...counts].filter(([, n]) => n > 0).map(([symbol, n]) => ({ symbol, weight: n, left: n, current: 0 }));
  const length = entries.reduce((sum, e) => sum + e.weight, 0);
  const strip: string[] = [];
  for (let i = 0; i < length; i++) {
    for (const e of entries) if (e.left > 0) e.current += e.weight;
    const candidates = entries.filter((e) => e.left > 0).sort((a, b) => b.current - a.current);
    // Evita di ripetere il simbolo appena messo, e all'ultimo posto quello del primo: la striscia gira in tondo.
    const avoid = new Set([strip.at(-1), i === length - 1 ? strip[0] : undefined]);
    // Un simbolo che occupa metà dei posti rimasti va messo subito, o resterebbe per forza accanto a se stesso.
    // A parità conta il simbolo del primo posto, che non deve finire anche all'ultimo.
    const first = (e: { symbol: string }) => (e.symbol === strip[0] ? 1 : 0);
    const urgent = candidates
      .filter((e) => e.left * 2 >= length - i && !avoid.has(e.symbol))
      .sort((a, b) => b.left - a.left || first(b) - first(a))[0];
    const pick = urgent ?? candidates.find((e) => !avoid.has(e.symbol)) ?? candidates[0]!;
    pick.current -= length;
    pick.left--;
    strip.push(pick.symbol);
  }
  return strip;
}

/** Cambia quante volte un simbolo compare su un rullo (da 0); la striscia viene ridistribuita. */
export function setSymbolCount(draft: ModuleDraft, mode: string, reel: number, symbol: string, count: number): void {
  const strip = draft.reels.modes[mode]?.[reel];
  if (!strip) return;
  const counts = stripCounts(strip);
  // Un simbolo nuovo va in fondo, nell'ordine della paytable.
  counts.set(symbol, Math.max(0, Math.floor(count)));
  const order = draft.paytable.symbols.map((s) => s.id).filter((id) => counts.has(id));
  for (const id of counts.keys()) if (!order.includes(id)) order.push(id);
  draft.reels.modes[mode]![reel] = spreadStrip(new Map(order.map((id) => [id, counts.get(id)!])));
}

/** Sostituisce la striscia di un rullo (da 0), per chi vuole decidere l'ordine dei simboli. */
export function setStrip(draft: ModuleDraft, mode: string, reel: number, strip: readonly string[]): void {
  const strips = draft.reels.modes[mode];
  if (strips && reel < strips.length) strips[reel] = [...strip];
}

/** Aggiunge una modalità copiando le strisce di un'altra; per le modalità degli script serve anche un nome nella scena. */
export function addMode(draft: ModuleDraft, mode: string, from = "base", label?: string): void {
  const source = draft.reels.modes[from] ?? draft.reels.modes.base;
  draft.reels.modes[mode] = source.map((strip) => [...strip]);
  if (mode !== "free" && label) {
    draft.scene.modes ??= {};
    draft.scene.modes[mode] = { label };
  }
}

/** Toglie una modalità (mai base) e il suo nome nella scena. */
export function removeMode(draft: ModuleDraft, mode: string): void {
  if (mode === "base") return;
  delete draft.reels.modes[mode];
  if (draft.scene.modes) delete draft.scene.modes[mode];
}

// --- funzioni ---

type FreeSpins = NonNullable<ModuleDraft["features"]["freeSpins"]>;

/** Attiva o toglie i wild espandenti; attivi partono dai rulli centrali. */
export function setExpandingWild(draft: ModuleDraft, enabled: boolean): void {
  if (!enabled) return void delete draft.features.expandingWild;
  const reels = reelCount(draft);
  const middle = Array.from({ length: Math.max(1, reels - 2) }, (_, i) => i + 2).filter((r) => r <= reels);
  draft.features.expandingWild = { reels: middle };
}

/** Aggiunge o toglie un rullo (da 1) tra quelli su cui il wild si espande. */
export function toggleExpandingReel(draft: ModuleDraft, reel: number, on: boolean): void {
  const wild = draft.features.expandingWild;
  if (!wild) return;
  const reels = new Set(wild.reels);
  if (on) reels.add(reel);
  else reels.delete(reel);
  if (reels.size === 0) delete draft.features.expandingWild;
  else wild.reels = [...reels].sort((a, b) => a - b);
}

/**
 * Attiva o toglie i free spin. Attivi partono con 3 scatter per 10 free spin;
 * tolti, se ne vanno anche le strisce della modalità free, che senza free
 * spin non sono ammesse.
 */
export function setFreeSpins(draft: ModuleDraft, enabled: boolean): void {
  if (enabled) {
    draft.features.freeSpins ??= { trigger: { minScatters: 3, spins: { "3": 10 } }, retrigger: false };
    return;
  }
  delete draft.features.freeSpins;
  delete draft.reels.modes.free;
}

/** Modifica i free spin già attivi. */
export function updateFreeSpins(draft: ModuleDraft, change: (fs: FreeSpins) => void): void {
  const fs = draft.features.freeSpins;
  if (!fs) return;
  change(fs);
  const per = fs.perExpandedWild;
  if (per && !per.extraSpins && !per.upgrade && !per.multiplier) delete fs.perExpandedWild;
  if (fs.upgradeLadder && fs.upgradeLadder.length === 0) delete fs.upgradeLadder;
}

/** Free spin assegnati da un numero di scatter; null o 0 lo tolgono. */
export function setFreeSpinsAward(draft: ModuleDraft, scatters: number, spins: number | null): void {
  updateFreeSpins(draft, (fs) => {
    const table = { ...fs.trigger.spins };
    if (spins === null || spins === 0) delete table[String(scatters)];
    else table[String(scatters)] = spins;
    fs.trigger.spins = Object.fromEntries(Object.entries(table).sort(([a], [b]) => Number(a) - Number(b)));
  });
}

/** Tetto di vincita in multipli della puntata totale; null lo toglie. */
export function setMaxWin(draft: ModuleDraft, maxWin: number | null): void {
  if (maxWin === null || maxWin <= 0) delete draft.features.maxWin;
  else draft.features.maxWin = maxWin;
}
