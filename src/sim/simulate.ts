import { playRound } from "../core/engine.js";
import { createRng } from "../core/rng.js";
import type { Mode, RoundHooks, SlotMath } from "../core/types.js";

/** Fasce di vincita, in multipli della puntata totale: [min, max). */
export const WIN_BUCKETS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 5],
  [5, 20],
  [20, 100],
  [100, 1000],
  [1000, Infinity],
];

export interface SimulationOptions {
  /** Numero di round: uno spin base più gli eventuali free spin. */
  spins: number;
  seed: number | string;
  /** Regole aggiuntive del modulo, in pratica il suo script Lua. */
  hooks?: RoundHooks | undefined;
}

export interface FreeSpinsStats {
  /** Round in cui sono partiti i free spin. */
  triggers: number;
  /** Free spin giocati in media per attivazione. */
  averageSpins: number;
  /** Vincita media dei free spin per attivazione, in multipli della puntata totale. */
  averageWin: number;
  /** Livello di upgrade medio raggiunto a fine free spin. */
  averageUpgradeLevel: number;
}

export interface ExtraModeStats {
  /** Sequenze giocate in questa modalità. */
  sequences: number;
  /** Round con almeno una sequenza in questa modalità. */
  rounds: number;
  averageSpins: number;
  /** Vincita media per sequenza, in multipli della puntata totale. */
  averageWin: number;
  /** Parte dell'RTP che viene da questa modalità. */
  rtp: number;
}

export interface SimulationResult {
  spins: number;
  seed: number | string;
  rtp: number;
  /** Parte dell'RTP che viene dallo spin base. */
  baseRtp: number;
  /** Parte dell'RTP che viene dai free spin. */
  freeSpinsRtp: number;
  /** Intervallo di confidenza al 95% sull'RTP. */
  rtpConfidence95: number;
  /** Quota di round con una vincita qualsiasi. */
  hitFrequency: number;
  /** Deviazione standard della vincita per round: indice di volatilità. */
  stdDev: number;
  maxWin: number;
  maxWinSpin: number;
  /** Round fermati dal tetto di vincita. */
  cappedRounds: number;
  /** Round con vincita, divisi per fascia (vedi WIN_BUCKETS). */
  winBuckets: number[];
  /** scatterCounts[n] = spin base con esattamente n scatter. */
  scatterCounts: number[];
  freeSpins: FreeSpinsStats | null;
  /** Modalità giocate su richiesta degli script, come i Gold Spins. */
  extra: Record<Mode, ExtraModeStats>;
}

export function simulate(math: SlotMath, { spins, seed, hooks }: SimulationOptions): SimulationResult {
  if (!Number.isInteger(spins) || spins <= 0) throw new RangeError("spins deve essere un intero positivo");
  const rng = createRng(seed);

  let total = 0;
  let totalSq = 0;
  let baseTotal = 0;
  let hits = 0;
  let maxWin = 0;
  let maxWinSpin = -1;
  let cappedRounds = 0;
  let triggers = 0;
  let freeSpinsPlayed = 0;
  let freeSpinsWin = 0;
  let upgradeLevels = 0;
  const winBuckets = new Array<number>(WIN_BUCKETS.length).fill(0);
  const scatterCounts = new Array<number>(math.reelCount * math.rows + 1).fill(0);
  const extra = new Map<Mode, { sequences: number; rounds: number; spins: number; win: number }>();

  for (let i = 0; i < spins; i++) {
    const round = playRound(math, rng, hooks);
    const win = round.totalWin;
    const baseWin = Math.min(round.base.win, math.maxWin);
    // Il tetto taglia l'ultima parte del round: ogni parte conta fino al tetto.
    let counted = baseWin;
    const count = (part: number) => {
      const before = counted;
      counted = Math.min(math.maxWin, counted + part);
      return counted - before;
    };
    const freeWin = round.freeSpins ? count(round.freeSpins.win) : 0;
    const seen = new Set<Mode>();
    for (const sequence of round.extra) {
      let stats = extra.get(sequence.mode);
      if (!stats) extra.set(sequence.mode, (stats = { sequences: 0, rounds: 0, spins: 0, win: 0 }));
      stats.sequences++;
      stats.spins += sequence.spins.length;
      stats.win += count(sequence.win);
      if (!seen.has(sequence.mode)) {
        seen.add(sequence.mode);
        stats.rounds++;
      }
    }
    total += win;
    totalSq += win * win;
    baseTotal += baseWin;
    scatterCounts[round.base.scatterCount]!++;
    if (round.capped) cappedRounds++;

    if (round.freeSpins) {
      triggers++;
      freeSpinsPlayed += round.freeSpins.spins.length;
      freeSpinsWin += freeWin;
      upgradeLevels += round.freeSpins.upgradeLevel;
    }
    if (win > 0) {
      hits++;
      winBuckets[WIN_BUCKETS.findIndex(([lo, hi]) => win >= lo && win < hi)]!++;
    }
    if (win > maxWin) {
      maxWin = win;
      maxWinSpin = i;
    }
  }

  const rtp = total / spins;
  const stdDev = Math.sqrt(Math.max(0, totalSq / spins - rtp * rtp));

  return {
    spins,
    seed,
    rtp,
    baseRtp: baseTotal / spins,
    freeSpinsRtp: freeSpinsWin / spins,
    rtpConfidence95: (1.96 * stdDev) / Math.sqrt(spins),
    hitFrequency: hits / spins,
    stdDev,
    maxWin,
    maxWinSpin,
    cappedRounds,
    winBuckets,
    scatterCounts,
    freeSpins: math.freeSpins
      ? {
          triggers,
          averageSpins: triggers ? freeSpinsPlayed / triggers : 0,
          averageWin: triggers ? freeSpinsWin / triggers : 0,
          averageUpgradeLevel: triggers ? upgradeLevels / triggers : 0,
        }
      : null,
    extra: Object.fromEntries(
      [...extra].map(([mode, e]) => [
        mode,
        {
          sequences: e.sequences,
          rounds: e.rounds,
          averageSpins: e.spins / e.sequences,
          averageWin: e.win / e.sequences,
          rtp: e.win / spins,
        },
      ]),
    ),
  };
}
