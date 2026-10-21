import { evaluateLines, evaluateScatter } from "./evaluate.js";
import type { Rng } from "./rng.js";
import {
  ChoiceNeeded,
  type ExtraSpinsResult,
  type FreeSpinsResult,
  type Grid,
  type Mode,
  type PendingChoice,
  type PlayRequest,
  type RoundAttempt,
  type RoundHooks,
  type RoundResult,
  type SlotMath,
  type SpinResult,
  type SymbolId,
  type UiEvent,
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
  return { mode, upgradeLevel, stops, reelGrid, grid, expandedReels, scatterCount, lineWins, scatterWin, multiplier: 1, win };
}

/** Applica un moltiplicatore alla vincita di uno spin. */
function multiply(result: SpinResult, multiplier: number): SpinResult {
  return multiplier === 1 ? result : { ...result, multiplier, win: result.win * multiplier };
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
 * sequenze che gli script chiedono (per esempio i Gold Spins). Se uno script
 * chiede una scelta al giocatore senza risposta, solleva ChoiceNeeded: per
 * le scelte usa attemptRound.
 */
export function playRound(math: SlotMath, rng: Rng, hooks?: RoundHooks): RoundResult {
  const { round, choice } = attemptRound(math, rng, hooks);
  if (choice) throw new ChoiceNeeded(choice.id, choice.options);
  return round;
}

/**
 * Come playRound, ma se uno script chiede una scelta al giocatore e non ha
 * ancora la risposta si ferma lì: restituisce il round giocato fino a quel
 * punto e la scelta in attesa. Il round si rigioca poi dallo stesso stato
 * dell'RNG (vedi createReplayableRng) dopo aver dato la risposta allo script:
 * tutto ciò che viene prima della scelta esce identico.
 *
 * Nel round parziale lo spin o la feature che ha chiesto la scelta è
 * l'ultimo elemento, senza le sue richieste all'interfaccia.
 */
export function attemptRound(math: SlotMath, rng: Rng, hooks?: RoundHooks): RoundAttempt {
  hooks?.beginRound(rng);
  const queue: PlayRequest[] = [];
  const request = (req: PlayRequest | null | undefined) => {
    if (req && req.spins > 0) queue.push(req);
  };
  /** Richieste all'interfaccia dell'ultimo hook, o undefined se non ce ne sono. */
  const uiEvents = (): UiEvent[] | undefined => {
    const events = hooks?.takeUiEvents?.();
    return events && events.length > 0 ? events : undefined;
  };
  const withUi = (result: SpinResult): SpinResult => {
    const ui = uiEvents();
    return ui ? { ...result, ui } : result;
  };

  // Lo stato del round cresce passo per passo, così una scelta in attesa può restituirne la parte già giocata.
  let base: SpinResult | null = null;
  let freeSpins: FreeSpinsResult | null = null;
  const extra: ExtraSpinsResult[] = [];
  let total = 0;
  const result = (): RoundResult => ({ base: base!, freeSpins, extra, totalWin: Math.min(total, math.maxWin), capped: total >= math.maxWin });
  /** Chiama uno hook; se chiede una scelta senza risposta, segna dove si è fermato il round. */
  const call = <T>(at: PendingChoice["at"], hook: () => T): T => {
    try {
      return hook();
    } catch (err) {
      if (err instanceof ChoiceNeeded) throw new Interrupted({ id: err.id, options: err.options, at });
      throw err;
    }
  };

  try {
    base = spin(math, rng, "base");
    total = base.win;
    request(call("spin", () => hooks?.onSpin(base!, 0)));
    base = withUi(base);
    const fs = math.freeSpins;
    const initial = scatterAward(math, base.scatterCount);

    if (fs && initial > 0 && total < math.maxWin) {
      let remaining = initial;
      let level = 0;
      const maxLevel = Math.max(0, fs.upgradeLadder.length - 1);
      const free: FreeSpinsResult = { initial, awarded: initial, spins: [], awardedAfter: [], upgradeLevel: 0, multiplier: 1, win: 0 };
      freeSpins = free;

      while (remaining > 0 && free.spins.length < fs.maxSpins && total < math.maxWin) {
        remaining--;
        const drawn = spin(math, rng, "free", level);
        const wilds = drawn.expandedReels.length;
        // I wild espansi fanno salire il moltiplicatore già per lo spin in cui compaiono.
        free.multiplier = Math.min(fs.maxMultiplier, free.multiplier + wilds * fs.multiplierPerExpandedWild);
        const result = multiply(drawn, free.multiplier);
        free.spins.push(result);
        free.win += result.win;
        total += result.win;

        if (wilds > 0) {
          remaining += wilds * fs.extraSpinsPerExpandedWild;
          free.awarded += wilds * fs.extraSpinsPerExpandedWild;
          if (fs.upgradeOnExpandedWild) level = Math.min(maxLevel, level + wilds);
        }
        if (fs.retrigger) {
          const again = scatterAward(math, result.scatterCount);
          remaining += again;
          free.awarded += again;
        }
        free.upgradeLevel = level;
        free.awardedAfter.push(free.awarded);
        request(call("spin", () => hooks?.onSpin(result, free.spins.length - 1)));
        free.spins[free.spins.length - 1] = withUi(result);
      }
      const summary = { mode: "free", spins: free.spins.length, win: free.win, upgradeLevel: level, multiplier: free.multiplier };
      request(call("featureEnd", () => hooks?.onFeatureEnd(summary)));
      free.endUi = uiEvents();
    }

    let extraSpins = 0;
    while (queue.length > 0 && extraSpins < MAX_EXTRA_SPINS && total < math.maxWin) {
      const { mode, spins: count, guaranteeWin, multiplier } = queue.shift()!;
      const sequence: ExtraSpinsResult = { mode, multiplier, spins: [], win: 0 };
      extra.push(sequence);
      while (sequence.spins.length < count && extraSpins < MAX_EXTRA_SPINS && total < math.maxWin) {
        let result = spin(math, rng, mode);
        for (let tries = 1; guaranteeWin && result.win === 0 && tries < MAX_WIN_RESAMPLES; tries++) {
          result = spin(math, rng, mode);
        }
        result = multiply(result, multiplier);
        sequence.spins.push(result);
        extraSpins++;
        sequence.win += result.win;
        total += result.win;
        request(call("spin", () => hooks?.onSpin(result, sequence.spins.length - 1)));
        sequence.spins[sequence.spins.length - 1] = withUi(result);
      }
      const summary = { mode, spins: sequence.spins.length, win: sequence.win, upgradeLevel: 0, multiplier };
      request(call("featureEnd", () => hooks?.onFeatureEnd(summary)));
      sequence.endUi = uiEvents();
    }
  } catch (err) {
    if (err instanceof Interrupted) return { round: result(), choice: err.choice };
    throw err;
  }
  return { round: result(), choice: null };
}

/** Segnale interno: il round si è fermato su una scelta. */
class Interrupted extends Error {
  constructor(readonly choice: PendingChoice) {
    super(`scelta in attesa: ${choice.id}`);
  }
}
