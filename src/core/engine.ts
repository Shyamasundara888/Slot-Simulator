import { evaluateLines, evaluateScatter } from "./evaluate.js";
import type { Rng } from "./rng.js";
import type { Grid, SlotMath, SpinResult } from "./types.js";

/** Costruisce la griglia visibile a partire dalle posizioni di arresto. */
export function gridFromStops(math: SlotMath, stops: readonly number[]): Grid {
  return math.reels.map((strip, reel) => {
    const stop = stops[reel]!;
    const column = new Array<string>(math.rows);
    for (let row = 0; row < math.rows; row++) column[row] = strip[(stop + row) % strip.length]!;
    return column;
  });
}

export function evaluateGrid(math: SlotMath, stops: number[], grid: Grid): SpinResult {
  const lineWins = evaluateLines(math, grid);
  const scatterWin = evaluateScatter(math, grid);
  const lineTotal = lineWins.reduce((sum, w) => sum + w.pay, 0);
  const totalWin = lineTotal / math.lines.length + (scatterWin?.pay ?? 0);
  return { stops, grid, lineWins, scatterWin, totalWin };
}

/** Esegue uno spin della modalità base. */
export function spin(math: SlotMath, rng: Rng): SpinResult {
  const stops = math.reels.map((strip) => rng.int(strip.length));
  return evaluateGrid(math, stops, gridFromStops(math, stops));
}
