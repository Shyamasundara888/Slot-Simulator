import { spin } from "../core/engine.js";
import { createRng } from "../core/rng.js";
import type { SlotMath } from "../core/types.js";

/** Fasce di vincita, in multipli della puntata totale: [min, max). */
export const WIN_BUCKETS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 5],
  [5, 20],
  [20, 100],
  [100, Infinity],
];

export interface SimulationOptions {
  spins: number;
  seed: number | string;
}

export interface SimulationResult {
  spins: number;
  seed: number | string;
  rtp: number;
  lineRtp: number;
  scatterRtp: number;
  /** Intervallo di confidenza al 95% sull'RTP. */
  rtpConfidence95: number;
  /** Quota di spin con una vincita qualsiasi. */
  hitFrequency: number;
  /** Deviazione standard della vincita per spin: indice di volatilità. */
  stdDev: number;
  maxWin: number;
  maxWinSpin: number;
  /** Spin con vincita, divisi per fascia (vedi WIN_BUCKETS). */
  winBuckets: number[];
  /** scatterCounts[n] = spin con esattamente n scatter. */
  scatterCounts: number[];
}

export function simulate(math: SlotMath, { spins, seed }: SimulationOptions): SimulationResult {
  if (!Number.isInteger(spins) || spins <= 0) throw new RangeError("spins deve essere un intero positivo");
  const rng = createRng(seed);

  let total = 0;
  let totalSq = 0;
  let lineTotal = 0;
  let scatterTotal = 0;
  let hits = 0;
  let maxWin = 0;
  let maxWinSpin = -1;
  const winBuckets = new Array<number>(WIN_BUCKETS.length).fill(0);
  const scatterCounts = new Array<number>(math.reelCount * math.rows + 1).fill(0);
  const scatterSymbol = math.scatter?.symbol;

  for (let i = 0; i < spins; i++) {
    const result = spin(math, rng);
    const win = result.totalWin;
    total += win;
    totalSq += win * win;
    scatterTotal += result.scatterWin?.pay ?? 0;
    lineTotal += win - (result.scatterWin?.pay ?? 0);

    if (win > 0) {
      hits++;
      const bucket = WIN_BUCKETS.findIndex(([lo, hi]) => win >= lo && win < hi);
      winBuckets[bucket]!++;
    }
    if (win > maxWin) {
      maxWin = win;
      maxWinSpin = i;
    }
    if (scatterSymbol !== undefined) {
      let n = 0;
      for (const column of result.grid) for (const s of column) if (s === scatterSymbol) n++;
      scatterCounts[n]!++;
    }
  }

  const rtp = total / spins;
  const variance = Math.max(0, totalSq / spins - rtp * rtp);
  const stdDev = Math.sqrt(variance);

  return {
    spins,
    seed,
    rtp,
    lineRtp: lineTotal / spins,
    scatterRtp: scatterTotal / spins,
    rtpConfidence95: (1.96 * stdDev) / Math.sqrt(spins),
    hitFrequency: hits / spins,
    stdDev,
    maxWin,
    maxWinSpin,
    winBuckets,
    scatterCounts,
  };
}
