import { evaluateSymbols } from "../core/evaluate.js";
import type { SlotMath, SymbolId } from "../core/types.js";

export interface ExactResult {
  /** RTP delle vincite su linea. */
  lineRtp: number;
  /** RTP delle vincite scatter. */
  scatterRtp: number;
  rtp: number;
  /** scatterCountProbability[n] = probabilità di vedere esattamente n scatter. */
  scatterCountProbability: number[];
}

/**
 * Calcola l'RTP esatto della modalità base, senza simulare.
 *
 * Su ogni linea il simbolo visto su un rullo ha la stessa distribuzione delle
 * frequenze della striscia, qualunque sia la riga, e i rulli sono indipendenti.
 * Quindi basta enumerare le combinazioni di simboli distinti per rullo,
 * invece di tutte le posizioni di arresto.
 */
export function exactRtp(math: SlotMath): ExactResult {
  const perReel = math.reels.map((strip) => {
    const counts = new Map<SymbolId, number>();
    for (const s of strip) counts.set(s, (counts.get(s) ?? 0) + 1);
    return [...counts].map(([symbol, n]) => ({ symbol, p: n / strip.length }));
  });

  let lineRtp = 0;
  const tuple: SymbolId[] = new Array(math.reelCount);
  const walk = (reel: number, p: number): void => {
    if (reel === math.reelCount) {
      const win = evaluateSymbols(math, tuple);
      if (win) lineRtp += p * win.pay;
      return;
    }
    for (const { symbol, p: ps } of perReel[reel]!) {
      tuple[reel] = symbol;
      walk(reel + 1, p * ps);
    }
  };
  walk(0, 1);

  // Distribuzione del numero di scatter: convoluzione dei rulli.
  let dist = [1];
  if (math.scatter) {
    const { symbol } = math.scatter;
    for (const strip of math.reels) {
      const reelDist = new Array<number>(math.rows + 1).fill(0);
      for (let stop = 0; stop < strip.length; stop++) {
        let n = 0;
        for (let row = 0; row < math.rows; row++) if (strip[(stop + row) % strip.length] === symbol) n++;
        reelDist[n]! += 1 / strip.length;
      }
      const next = new Array<number>(dist.length + math.rows).fill(0);
      dist.forEach((a, i) => reelDist.forEach((b, j) => (next[i + j]! += a * b)));
      dist = next;
    }
  }

  let scatterRtp = 0;
  if (math.scatter) {
    const { pays } = math.scatter;
    dist.forEach((p, n) => (scatterRtp += p * (pays[Math.min(n, pays.length - 1)] ?? 0)));
  }

  return { lineRtp, scatterRtp, rtp: lineRtp + scatterRtp, scatterCountProbability: dist };
}
