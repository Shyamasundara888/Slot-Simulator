import { evaluateLines, evaluateScatter } from "./evaluate.js";
import type { Rng } from "./rng.js";
import type {
  ExtraSpinsResult,
  FreeSpinsResult,
  Grid,
  Mode,
  PlayRequest,
  RoundHooks,
  RoundResult,
  SlotMath,
  SpinResult,
  SymbolId,
} from "./types.js";

/** Spin giocabili in un round tra tutte le sequenze richieste dagli script. */
export const MAX_EXTRA_SPINS = 1_000;
/** Tentativi per trovare uno spin vincente quando la sequenza lo garantisce. */
export const MAX_WIN_RESAMPLES = 1_000;

function stripsFor(math: SlotMath, mode: Mode): SymbolId[][] {
  const strips = math.reels[mode];
  if (!strips) throw new RangeError(`modalità senza strisce dei rulli: ${mode}`);
  return strips;
}

/** Costruisce la griglia visibile a partire dalle posizioni di arresto. */
export function gridFromStops(math: SlotMath, stops: readonly number[], mode: Mode = "base"): Grid {
  return stripsFor(math, mode).map((strip, reel) => {
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
  const stops = stripsFor(math, mode).map((strip) => rng.int(strip.length));
  return evaluateSpin(math, mode, stops, upgradeLevel);
}

function scatterAward(math: SlotMath, count: number): number {
  const fs = math.freeSpins;
  if (!fs || count < fs.minScatters) return 0;
  return fs.awards[Math.min(count, fs.awards.length - 1)]!;
}

/**
 * Gioca un round completo: lo spin base, i free spin se attivati e poi le
 * sequenze che gli script chiedono (per esempio i Gold Spins).
 */
export function playRound(math: SlotMath, rng: Rng, hooks?: RoundHooks): RoundResult {
  hooks?.beginRound(rng);
  const queue: PlayRequest[] = [];
  const request = (req: PlayRequest | null | undefined) => {
    if (req && req.spins > 0) queue.push(req);
  };

  const base = spin(math, rng, "base");
  request(hooks?.onSpin(base, 0));
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
      request(hooks?.onSpin(result, spins.length - 1));
    }
    freeSpins = { initial, awarded, spins, awardedAfter, upgradeLevel: level, win };
    request(hooks?.onFeatureEnd({ mode: "free", spins: spins.length, win, upgradeLevel: level }));
  }

  const extra: ExtraSpinsResult[] = [];
  let extraSpins = 0;
  while (queue.length > 0 && extraSpins < MAX_EXTRA_SPINS && total < math.maxWin) {
    const { mode, spins: count, guaranteeWin } = queue.shift()!;
    const spins: SpinResult[] = [];
    let win = 0;
    while (spins.length < count && extraSpins < MAX_EXTRA_SPINS && total < math.maxWin) {
      let result = spin(math, rng, mode);
      for (let tries = 1; guaranteeWin && result.win === 0 && tries < MAX_WIN_RESAMPLES; tries++) {
        result = spin(math, rng, mode);
      }
      spins.push(result);
      extraSpins++;
      win += result.win;
      total += result.win;
      request(hooks?.onSpin(result, spins.length - 1));
    }
    extra.push({ mode, spins, win });
    request(hooks?.onFeatureEnd({ mode, spins: spins.length, win, upgradeLevel: 0 }));
  }

  const capped = total >= math.maxWin;
  return { base, freeSpins, extra, totalWin: Math.min(total, math.maxWin), capped };
}
