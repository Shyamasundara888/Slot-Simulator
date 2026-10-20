import type { SlotMath, SymbolId, SymbolKind } from "../core/types.js";
import type { LinesFile, PaytableFile, ReelsFile } from "./schema.js";

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

/** Unisce i file di matematica di un modulo e controlla che siano coerenti tra loro. */
export function buildSlotMath(reels: ReelsFile, lines: LinesFile, paytable: PaytableFile): SlotMath {
  const problems: string[] = [];
  const strips = reels.modes.base;
  const reelCount = strips.length;
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

  strips.forEach((strip, reel) => {
    if (strip.length < rows) problems.push(`reels: il rullo ${reel + 1} ha ${strip.length} simboli, meno delle ${rows} righe`);
    for (const s of new Set(strip)) {
      if (!symbols.has(s)) problems.push(`reels: il rullo ${reel + 1} usa il simbolo non definito ${s}`);
    }
  });

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
      pays: toPayArray(paytable.scatterPays ?? {}, reelCount * rows, "scatterPays", problems),
    };
  } else if (paytable.scatterPays) {
    problems.push("scatterPays: nessun simbolo di tipo scatter definito");
  }

  if (problems.length > 0) throw new ModuleError(problems);
  return { reelCount, rows, symbols, reels: strips, lines: lines.lines, linePays, wild: wilds[0] ?? null, scatter };
}
