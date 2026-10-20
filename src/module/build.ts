import type { FreeSpinsConfig, SlotMath, SymbolId, SymbolKind } from "../core/types.js";
import { type FeaturesFile, featuresSchema, type LinesFile, type PaytableFile, type ReelsFile } from "./schema.js";

export class ModuleError extends Error {
  constructor(readonly problems: string[]) {
    super(`Modulo non valido:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "ModuleError";
  }
}

function toPayArray(table: Record<string, number>, maxCount: number, where: string, problems: string[]): number[] {
  const pays = new Array<number>(maxCount + 1).fill(0);
  for (const [key, value] of Object.entries(table)) {
    const count = Number(key);
    if (count < 1 || count > maxCount) problems.push(`${where}: numero di simboli ${count} fuori da 1..${maxCount}`);
    else pays[count] = value;
  }
  return pays;
}

/** Per scatter e free spin: un conteggio senza valore proprio usa quello del conteggio inferiore più vicino. */
function fillForward(pays: number[]): number[] {
  for (let n = 1; n < pays.length; n++) if (pays[n] === 0) pays[n] = pays[n - 1]!;
  return pays;
}

function checkStrips(
  name: string,
  strips: SymbolId[][],
  reelCount: number,
  rows: number,
  symbols: ReadonlyMap<SymbolId, SymbolKind>,
  problems: string[],
): void {
  if (strips.length !== reelCount) problems.push(`reels: ${name} ha ${strips.length} rulli, la modalità base ne ha ${reelCount}`);
  strips.forEach((strip, reel) => {
    if (strip.length < rows) problems.push(`reels: ${name}, il rullo ${reel + 1} ha ${strip.length} simboli, meno delle ${rows} righe`);
    for (const s of new Set(strip)) {
      if (!symbols.has(s)) problems.push(`reels: ${name}, il rullo ${reel + 1} usa il simbolo non definito ${s}`);
    }
  });
}

/** Unisce i file di matematica di un modulo e controlla che siano coerenti tra loro. */
export function buildSlotMath(
  reels: ReelsFile,
  lines: LinesFile,
  paytable: PaytableFile,
  featuresInput: FeaturesFile = {},
): SlotMath {
  const problems: string[] = [];
  const features = featuresSchema.parse(featuresInput);
  const base = reels.modes.base;
  const free = reels.modes.free ?? base;
  const reelCount = base.length;
  const { rows } = reels;

  const symbols = new Map<SymbolId, SymbolKind>();
  for (const { id, kind } of paytable.symbols) {
    if (symbols.has(id)) problems.push(`paytable: simbolo ${id} definito due volte`);
    symbols.set(id, kind);
  }

  const ofKind = (kind: SymbolKind) => [...symbols].filter(([, k]) => k === kind).map(([id]) => id);
  const wilds = ofKind("wild");
  const scatters = ofKind("scatter");
  if (wilds.length > 1) problems.push(`paytable: al massimo un wild, trovati ${wilds.join(", ")}`);
  if (scatters.length > 1) problems.push(`paytable: al massimo uno scatter, trovati ${scatters.join(", ")}`);

  checkStrips("modalità base", base, reelCount, rows, symbols, problems);
  if (reels.modes.free) checkStrips("modalità free", reels.modes.free, reelCount, rows, symbols, problems);

  lines.lines.forEach((line, i) => {
    if (line.length !== reelCount) problems.push(`lines: la linea ${i + 1} ha ${line.length} posizioni, servono ${reelCount}`);
    if (line.some((row) => row >= rows)) problems.push(`lines: la linea ${i + 1} usa una riga oltre la ${rows}`);
  });

  const linePays = new Map<SymbolId, number[]>();
  for (const [id, table] of Object.entries(paytable.linePays)) {
    const kind = symbols.get(id);
    if (kind === undefined) problems.push(`linePays: simbolo non definito ${id}`);
    else if (kind === "scatter") problems.push(`linePays: lo scatter ${id} paga solo tramite scatterPays`);
    else linePays.set(id, toPayArray(table, reelCount, `linePays.${id}`, problems));
  }

  let scatter: SlotMath["scatter"] = null;
  const scatterSymbol = scatters[0];
  if (scatterSymbol !== undefined) {
    scatter = {
      symbol: scatterSymbol,
      pays: fillForward(toPayArray(paytable.scatterPays ?? {}, reelCount * rows, "scatterPays", problems)),
    };
  } else if (paytable.scatterPays) {
    problems.push("scatterPays: nessun simbolo di tipo scatter definito");
  }

  const expandingWildReels = new Set<number>();
  if (features.expandingWild) {
    if (wilds.length === 0) problems.push("features.expandingWild: nessun simbolo di tipo wild definito");
    for (const reel of features.expandingWild.reels) {
      if (reel > reelCount) problems.push(`features.expandingWild: il rullo ${reel} non esiste`);
      else expandingWildReels.add(reel - 1);
    }
  }

  let freeSpins: FreeSpinsConfig | null = null;
  const fs = features.freeSpins;
  if (fs) {
    if (scatterSymbol === undefined) problems.push("features.freeSpins: servono gli scatter per attivarli");
    const ladder = fs.upgradeLadder ?? [];
    const upgrade = fs.perExpandedWild?.upgrade ?? false;
    if (upgrade && ladder.length === 0) problems.push("features.freeSpins: l'upgrade richiede upgradeLadder");
    if (upgrade && expandingWildReels.size === 0) problems.push("features.freeSpins: l'upgrade richiede expandingWild");
    if (new Set(ladder).size !== ladder.length) problems.push("features.freeSpins.upgradeLadder: simboli ripetuti");
    for (const s of ladder) {
      if (symbols.get(s) !== "normal") problems.push(`features.freeSpins.upgradeLadder: ${s} non è un simbolo normale`);
    }
    const awards = fillForward(toPayArray(fs.trigger.spins, reelCount * rows, "features.freeSpins.trigger.spins", problems));
    for (let n = 0; n < fs.trigger.minScatters && n < awards.length; n++) awards[n] = 0;
    if (!awards.some((a) => a > 0)) problems.push("features.freeSpins.trigger.spins: nessun free spin assegnato");
    freeSpins = {
      minScatters: fs.trigger.minScatters,
      awards,
      retrigger: fs.retrigger,
      extraSpinsPerExpandedWild: fs.perExpandedWild?.extraSpins ?? 0,
      upgradeOnExpandedWild: upgrade,
      upgradeLadder: ladder,
      maxSpins: fs.maxSpins,
    };
  } else if (reels.modes.free) {
    problems.push("reels: ci sono strisce per la modalità free ma features.freeSpins manca");
  }

  if (problems.length > 0) throw new ModuleError(problems);
  return {
    reelCount,
    rows,
    symbols,
    reels: { base, free },
    lines: lines.lines,
    linePays,
    wild: wilds[0] ?? null,
    scatter,
    expandingWildReels,
    freeSpins,
    maxWin: features.maxWin ?? Infinity,
  };
}
