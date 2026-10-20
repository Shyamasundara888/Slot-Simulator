/// <reference lib="webworker" />
// Calcoli lunghi dell'editor, fuori dal thread della pagina: simulazione, ricerca di un seed, prova dello script.
import { playRound } from "../../../src/core/engine.js";
import { createRng } from "../../../src/core/rng.js";
import type { RoundHooks } from "../../../src/core/types.js";
import { ModuleError } from "../../../src/module/build.js";
import { parseSlotModule } from "../../../src/module/parse.js";
import { ScriptRuntime } from "../../../src/script/runtime.js";
import { type ScriptTrial, trialScript } from "../../../src/script/trial.js";
import { simulate, type SimulationResult } from "../../../src/sim/simulate.js";
import wasmUri from "wasmoon/dist/glue.wasm?url";

export type WorkerRequest =
  | { kind: "simulate"; files: Record<string, unknown>; spins: number; seed: string }
  | { kind: "findSeed"; files: Record<string, unknown>; feature: "free" | "extra"; limit: number }
  | { kind: "checkScript"; files: Record<string, unknown>; rounds: number };

export type WorkerResponse =
  | { kind: "simulated"; result: SimulationResult }
  | { kind: "seed"; seed: string | null }
  | { kind: "scriptChecked"; trial: ScriptTrial }
  | { kind: "error"; message: string };

async function prepare(files: Record<string, unknown>) {
  const module = parseSlotModule(files);
  const hooks: RoundHooks | undefined =
    module.script === null ? undefined : await ScriptRuntime.create(module.math, module.script, { wasmUri });
  return { math: module.math, hooks };
}

async function handle(request: WorkerRequest): Promise<WorkerResponse> {
  if (request.kind === "checkScript") {
    const module = parseSlotModule(request.files);
    if (module.script === null) return { kind: "scriptChecked", trial: { problems: [], hooks: [], rounds: 0, extraRounds: 0, failure: null } };
    return { kind: "scriptChecked", trial: await trialScript(module.math, module.script, request.rounds, { wasmUri }) };
  }
  const { math, hooks } = await prepare(request.files);
  if (request.kind === "simulate") {
    return { kind: "simulated", result: simulate(math, { spins: request.spins, seed: request.seed, hooks }) };
  }
  // Stessi seed del client: il primo round giocato con ?seed=<seed> è quello trovato qui.
  for (let i = 0; i < request.limit; i++) {
    const seed = `e${i}`;
    const round = playRound(math, createRng(seed), hooks);
    if (request.feature === "free" ? round.freeSpins !== null : round.extra.length > 0) return { kind: "seed", seed };
  }
  return { kind: "seed", seed: null };
}

self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  let response: WorkerResponse;
  try {
    response = await handle(data);
  } catch (err) {
    response = { kind: "error", message: err instanceof ModuleError ? err.problems.join("\n") : String(err) };
  }
  self.postMessage(response);
};
