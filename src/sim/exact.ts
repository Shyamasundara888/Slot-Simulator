import { evaluateSymbols } from "../core/evaluate.js";
import type { SlotMath, SymbolId } from "../core/types.js";

export interface ExactResult {
  /** RTP delle vincite su linea dello spin base. */
  lineRtp: number;
  /** RTP delle vincite scatter dello spin base. */
  scatterRtp: number;
  /** RTP dello spin base, free spin esclusi. */
  baseRtp: number;
  /** scatterCountProbability[n] = probabilità di vedere esattamente n scatter. */
  scatterCountProbability: number[];
  /** Probabilità che uno spin base attivi i free spin (0 se non ci sono). */
  freeSpinsProbability: number;
}

type Dist = { symbol: SymbolId; p: number }[];

/**
 * Distribuzione del simbolo valutato su un rullo, a una data riga.
 * Senza wild espandenti coincide con le frequenze della striscia; con
 * l'espansione, ogni finestra che contiene un wild diventa tutta wild.
 */
function cellDistribution(math: SlotMath, reel: number, row: number): Dist {
  const strip = math.reels.base[reel]!;
  const expands = math.wild !== null && math.expandingWildReels.has(reel);
  const counts = new Map<SymbolId, number>();
  for (let stop = 0; stop < strip.length; stop++) {
    let symbol = strip[(stop + row) % strip.length]!;
    if (expands) {
      for (let r = 0; r < math.rows; r++) if (strip[(stop + r) % strip.length] === math.wild) symbol = math.wild!;
    }
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
  }
  return [...counts].map(([symbol, n]) => ({ symbol, p: n / strip.length }));
}

/**
 * Calcola l'RTP esatto dello spin base, senza simulare.
 *
 * Su una linea i rulli sono indipendenti, quindi basta enumerare le
 * combinazioni di simboli distinti per rullo invece di tutte le posizioni di
 * arresto. I free spin dipendono dallo stato del round e vanno simulati.
 */
export function exactRtp(math: SlotMath): ExactResult {
  const cache = new Map<string, Dist>();
  const dist = (reel: number, row: number): Dist => {
    const key = `${reel}:${row}`;
    let d = cache.get(key);
    if (!d) cache.set(key, (d = cellDistribution(math, reel, row)));
    return d;
  };

  let lineTotal = 0;
  const tuple: SymbolId[] = new Array(math.reelCount);
  for (const line of math.lines) {
    const perReel = line.map((row, reel) => dist(reel, row));
    const walk = (reel: number, p: number): void => {
      if (reel === math.reelCount) {
        const win = evaluateSymbols(math, tuple);
        if (win) lineTotal += p * win.pay;
        return;
      }
      for (const { symbol, p: ps } of perReel[reel]!) {
        tuple[reel] = symbol;
        walk(reel + 1, p * ps);
      }
    };
    walk(0, 1);
  }
  const lineRtp = lineTotal / math.lines.length;

  // Distribuzione del numero di scatter: convoluzione dei rulli.
  let scatterDist = [1];
  if (math.scatter) {
    const { symbol } = math.scatter;
    for (const strip of math.reels.base) {
      const reelDist = new Array<number>(math.rows + 1).fill(0);
      for (let stop = 0; stop < strip.length; stop++) {
        let n = 0;
        for (let row = 0; row < math.rows; row++) if (strip[(stop + row) % strip.length] === symbol) n++;
        reelDist[n]! += 1 / strip.length;
      }
      const next = new Array<number>(scatterDist.length + math.rows).fill(0);
      scatterDist.forEach((a, i) => reelDist.forEach((b, j) => (next[i + j]! += a * b)));
      scatterDist = next;
    }
  }

  let scatterRtp = 0;
  let freeSpinsProbability = 0;
  scatterDist.forEach((p, n) => {
    if (math.scatter) scatterRtp += p * (math.scatter.pays[Math.min(n, math.scatter.pays.length - 1)] ?? 0);
    if (math.freeSpins && n >= math.freeSpins.minScatters) freeSpinsProbability += p;
  });

  return {
    lineRtp,
    scatterRtp,
    baseRtp: lineRtp + scatterRtp,
    scatterCountProbability: scatterDist,
    freeSpinsProbability,
  };
}
