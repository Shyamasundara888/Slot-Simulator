import { playRound } from "../core/engine.js";
import { createRng } from "../core/rng.js";
import type { SlotMath } from "../core/types.js";
import { ModuleError } from "../module/build.js";
import { ScriptRuntime, type ScriptOptions } from "./runtime.js";

/** Esito della prova di uno script: caricamento e qualche migliaio di round. */
export interface ScriptTrial {
  /** Errori del caricamento, come `npm run mod -- check`. */
  problems: string[];
  /** Hook definiti dallo script. */
  hooks: string[];
  /** Round giocati senza errori. */
  rounds: number;
  /** Round in cui lo script ha chiesto almeno una sequenza. */
  extraRounds: number;
  /** Primo errore durante un round, con il seed che lo rigioca. */
  failure: { message: string; seed: string } | null;
}

/**
 * Carica lo script e gioca i round con i seed "e0", "e1"...: gli errori che
 * dipendono dai dati del round emergono solo giocando. Il round con seed "eN"
 * è il primo che il client gioca con ?seed=eN.
 */
export async function trialScript(math: SlotMath, source: string, rounds: number, options: ScriptOptions = {}): Promise<ScriptTrial> {
  let runtime: ScriptRuntime;
  try {
    runtime = await ScriptRuntime.create(math, source, options);
  } catch (err) {
    if (!(err instanceof ModuleError)) throw err;
    return { problems: err.problems, hooks: [], rounds: 0, extraRounds: 0, failure: null };
  }
  let extraRounds = 0;
  for (let i = 0; i < rounds; i++) {
    const seed = `e${i}`;
    try {
      if (playRound(math, createRng(seed), runtime).extra.length > 0) extraRounds++;
    } catch (err) {
      return { problems: [], hooks: runtime.hooks, rounds: i, extraRounds, failure: { message: (err as Error).message, seed } };
    }
  }
  return { problems: [], hooks: runtime.hooks, rounds, extraRounds, failure: null };
}
