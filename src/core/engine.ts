import { evaluateLines, evaluateScatter } from "./evaluate.js";
import type { Rng } from "./rng.js";
import type { FreeSpinsResult, Grid, Mode, RoundResult, SlotMath, SpinResult, SymbolId } from "./types.js";

/** Costruisce la griglia visibile a partire dalle posizioni di arresto. */
export function gridFromStops(math: SlotMath, stops: readonly number[], mode: Mode = "base"): Grid {
  return math.reels[mode].map((strip, reel) => {
    const stop = stops[reel]!;
    const column = new Array<string>(math.rows);
    for (let row = 0; row < math.rows; row++) column[row] = strip[(stop + row) % strip.length]!;
    return column;
  });
}

/** Al livello L i primi L simboli della scala diventano il simbolo di livello L. */
export function upgradeGrid(grid: Grid, ladder: readonly SymbolId[], level: number): Grid {
  if (level <= 0) return grid;
  const target = ladder[Math.min(level, ladder.length - 1)]!;
  const upgraded = new Set(ladder.slice(0, level));
  return grid.map((column) => column.map((s) => (upgraded.has(s) ? target : s)));
}

/**
 * Espande i wild sui rulli abilitati: coprono tutta la colonna tranne gli
 * scatter, che restano visibili e continuano a contare.
 */
export function expandWilds(math: SlotMath, grid: Grid): { grid: Grid; expandedReels: number[] } {
  const { wild } = math;
  const scatter = math.scatter?.symbol;
  const expandedReels: number[] = [];
  if (wild === null || math.expandingWildReels.size === 0) return { grid, expandedReels };
  const out = grid.map((column, reel) => {
    if (!math.expandingWildReels.has(reel) || !column.includes(wild)) return column;
    expandedReels.push(reel);
    return column.map((s) => (s === scatter ? s : wild));
  });
  return { grid: out, expandedReels };
}

function countSymbol(grid: Grid, symbol: SymbolId | undefined): number {
  let n = 0;
  if (symbol === undefined) return n;
  for (const column of grid) for (const s of column) if (s === symbol) n++;
  return n;
}

/**
 * Valuta uno spin già estratto. Ordine: upgrade dei simboli, espansione dei
 * wild, vincite su linea e scatter.
 */
export function evaluateSpin(math: SlotMath, mode: Mode, stops: number[], upgradeLevel = 0): SpinResult {
  const reelGrid = gridFromStops(math, stops, mode);
  const ladder = math.freeSpins?.upgradeLadder ?? [];
  const upgraded = upgradeGrid(reelGrid, ladder, upgradeLevel);
  const { grid, expandedReels } = expandWilds(math, upgraded);
  const scatterCount = countSymbol(grid, math.scatter?.symbol);
  const lineWins = evaluateLines(math, grid);
  const scatterWin = evaluateScatter(math, grid);
  const lineTotal = lineWins.reduce((sum, w) => sum + w.pay, 0);
  const win = lineTotal / math.lines.length + (scatterWin?.pay ?? 0);
  return { mode, upgradeLevel, stops, reelGrid, grid, expandedReels, scatterCount, lineWins, scatterWin, win };
}

export function spin(math: SlotMath, rng: Rng, mode: Mode = "base", upgradeLevel = 0): SpinResult {
  const stops = math.reels[mode].map((strip) => rng.int(strip.length));
  return evaluateSpin(math, mode, stops, upgradeLevel);
}

function scatterAward(math: SlotMath, count: number): number {
  const fs = math.freeSpins;
  if (!fs || count < fs.minScatters) return 0;
  return fs.awards[Math.min(count, fs.awards.length - 1)]!;
}

/** Gioca un round completo: lo spin base e, se attivati, i free spin. */
export function playRound(math: SlotMath, rng: Rng): RoundResult {
  const base = spin(math, rng, "base");
  let total = base.win;
  let freeSpins: FreeSpinsResult | null = null;
  const fs = math.freeSpins;
  const initial = scatterAward(math, base.scatterCount);

  if (fs && initial > 0 && total < math.maxWin) {
    let remaining = initial;
    let awarded = initial;
    let level = 0;
    const maxLevel = Math.max(0, fs.upgradeLadder.length - 1);
    const spins: SpinResult[] = [];
    const awardedAfter: number[] = [];
    let win = 0;

    while (remaining > 0 && spins.length < fs.maxSpins && total < math.maxWin) {
      remaining--;
      const result = spin(math, rng, "free", level);
      spins.push(result);
      win += result.win;
      total += result.win;

      const wilds = result.expandedReels.length;
      if (wilds > 0) {
        remaining += wilds * fs.extraSpinsPerExpandedWild;
        awarded += wilds * fs.extraSpinsPerExpandedWild;
        if (fs.upgradeOnExpandedWild) level = Math.min(maxLevel, level + wilds);
      }
      if (fs.retrigger) {
        const again = scatterAward(math, result.scatterCount);
        remaining += again;
        awarded += again;
      }
      awardedAfter.push(awarded);
    }
    freeSpins = { initial, awarded, spins, awardedAfter, upgradeLevel: level, win };
  }

  const capped = total >= math.maxWin;
  return { base, freeSpins, totalWin: Math.min(total, math.maxWin), capped };
}
