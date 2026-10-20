import type { Grid, LineWin, ScatterWin, SlotMath, SymbolId } from "./types.js";

/**
 * Valuta una sequenza di simboli letta da sinistra a destra.
 * Il wild sostituisce i simboli normali ma non lo scatter; si paga la
 * combinazione migliore tra la sola corsa di wild e il simbolo sostituito.
 */
export function evaluateSymbols(
  math: SlotMath,
  symbols: readonly SymbolId[],
): { symbol: SymbolId; count: number; pay: number } | null {
  const { wild } = math;
  const isScatter = (s: SymbolId) => math.symbols.get(s) === "scatter";

  let wildRun = 0;
  while (wildRun < symbols.length && symbols[wildRun] === wild) wildRun++;

  const target = symbols[wildRun];
  let best: { symbol: SymbolId; count: number; pay: number } | null = null;

  if (target !== undefined && !isScatter(target)) {
    let count = wildRun;
    while (count < symbols.length && (symbols[count] === target || symbols[count] === wild)) count++;
    const pay = math.linePays.get(target)?.[count] ?? 0;
    if (pay > 0) best = { symbol: target, count, pay };
  }

  if (wild !== null && wildRun > 0) {
    const pay = math.linePays.get(wild)?.[wildRun] ?? 0;
    if (pay > 0 && (best === null || pay > best.pay)) best = { symbol: wild, count: wildRun, pay };
  }

  return best;
}

export function evaluateLines(math: SlotMath, grid: Grid): LineWin[] {
  const wins: LineWin[] = [];
  const symbols: SymbolId[] = new Array(math.reelCount);
  math.lines.forEach((rows, line) => {
    for (let reel = 0; reel < math.reelCount; reel++) symbols[reel] = grid[reel]![rows[reel]!]!;
    const win = evaluateSymbols(math, symbols);
    if (win) wins.push({ line, ...win });
  });
  return wins;
}

/** Gli scatter pagano ovunque compaiano sulla griglia. */
export function evaluateScatter(math: SlotMath, grid: Grid): ScatterWin | null {
  if (!math.scatter) return null;
  const { symbol, pays } = math.scatter;
  let count = 0;
  for (const column of grid) for (const s of column) if (s === symbol) count++;
  const pay = pays[Math.min(count, pays.length - 1)] ?? 0;
  return pay > 0 ? { symbol, count, pay } : null;
}
