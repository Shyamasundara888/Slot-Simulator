import { LuaFactory } from "wasmoon";
import type { Rng } from "../core/rng.js";
import type { FeatureSummary, PlayRequest, RoundHooks, SlotMath, SpinResult } from "../core/types.js";
import { ModuleError } from "../module/build.js";
import { MODULE_FILES } from "../module/parse.js";

/** Istruzioni Lua concesse a ogni chiamata di uno hook (e al caricamento). */
export const INSTRUCTION_LIMIT = 1_000_000;
/** Memoria massima dello stato Lua di un modulo. */
export const MEMORY_LIMIT = 16 * 1024 * 1024;

/** Errore sollevato da uno script mentre il motore gioca un round. */
export class ScriptError extends Error {
  constructor(message: string) {
    super(`${MODULE_FILES.script}: ${message}`);
    this.name = "ScriptError";
  }
}

/**
 * Preambolo eseguito prima dello script del modulo. Toglie le librerie che
 * toccano il mondo esterno (e le coroutine, che sfuggirebbero al limite di
 * istruzioni), sostituisce math.random con l'RNG del round e
 * definisce il dispatcher che chiama gli hook con un limite di istruzioni.
 */
const PRELUDE = `
local sethook, load, pcall, error, type = debug.sethook, load, pcall, error, type
_G.debug, _G.load, _G.loadfile, _G.dofile, _G.require, _G.collectgarbage = nil, nil, nil, nil, nil, nil
string.dump = nil

local rng_int, rng_float = __rng_int, __rng_float
__rng_int, __rng_float = nil, nil
math.randomseed = nil
math.random = function(m, n)
  if m == nil then return rng_float() end
  if n == nil then m, n = 1, m end
  if math.type(m) ~= "integer" or math.type(n) ~= "integer" or n < m then
    error("math.random: intervallo non valido", 2)
  end
  return m + rng_int(n - m + 1)
end

local function limit() error("troppe istruzioni, lo script è in un ciclo infinito?", 2) end

local function guarded(f, ...)
  sethook(limit, "", ${INSTRUCTION_LIMIT})
  local ok, res = pcall(f, ...)
  sethook()
  if not ok then error(res, 0) end
  return res
end

local current_round = nil
local function begin(id)
  if id ~= current_round then
    current_round = id
    round = {}
  end
end

local dispatch = {}
function dispatch.load(source)
  local chunk, err = load(source, "=${MODULE_FILES.script}", "t")
  if not chunk then error(err, 0) end
  guarded(chunk)
  local modes = nil
  if type(spinModes) == "table" then
    modes = {}
    for i, mode in ipairs(spinModes) do modes[i] = tostring(mode) end
  end
  return {
    onSpin = type(onSpin) == "function",
    onFeatureEnd = type(onFeatureEnd) == "function",
    spinModes = modes,
  }
end
function dispatch.spin(id, mode, index, win, wilds, scatters, level)
  begin(id)
  return guarded(onSpin, { mode = mode, index = index, win = win, wilds = wilds, scatters = scatters, level = level })
end
function dispatch.featureEnd(id, mode, spins, win, level)
  begin(id)
  return guarded(onFeatureEnd, { mode = mode, spins = spins, win = win, level = level })
end
return dispatch
`;

interface LoadInfo {
  onSpin: boolean;
  onFeatureEnd: boolean;
  spinModes: string[] | null;
}

type Dispatch = {
  load(source: string): LoadInfo;
  spin(id: number, mode: string, index: number, win: number, wilds: number, scatters: number, level: number): unknown;
  featureEnd(id: number, mode: string, spins: number, win: number, level: number): unknown;
};

export interface ScriptOptions {
  /** URL di glue.wasm di wasmoon: serve nel browser, in Node si trova da solo. */
  wasmUri?: string;
}

/**
 * Esegue lo script Lua di un modulo in uno stato isolato e lo collega al
 * motore come RoundHooks. Lo script vede solo i dati che il motore gli passa
 * e l'RNG del round, quindi lo stesso seed dà sempre lo stesso round.
 */
export class ScriptRuntime implements RoundHooks {
  private rng: Rng | null = null;
  private round = 0;

  private constructor(
    private readonly math: SlotMath,
    private readonly dispatch: Dispatch,
    private readonly info: LoadInfo,
    private readonly spinModes: ReadonlySet<string> | null,
  ) {}

  static async create(math: SlotMath, source: string, options: ScriptOptions = {}): Promise<ScriptRuntime> {
    const factory = new LuaFactory(options.wasmUri);
    const lua = await factory.createEngine({
      openStandardLibs: false,
      injectObjects: false,
      enableProxy: false,
      traceAllocations: true,
    });
    for (const lib of ["_G", "table", "string", "math", "utf8", "debug"] as const) {
      lua.global.loadLibrary(lib as Parameters<typeof lua.global.loadLibrary>[0]);
    }
    lua.global.setMemoryMax(MEMORY_LIMIT);

    let runtime: ScriptRuntime | null = null;
    const rng = () => {
      if (!runtime?.rng) throw new Error("math.random si può usare solo durante un round");
      return runtime.rng;
    };
    lua.global.set("__rng_int", (n: number) => rng().int(n));
    lua.global.set("__rng_float", () => rng().float());

    let info: LoadInfo;
    let dispatch: Dispatch;
    try {
      dispatch = lua.doStringSync(PRELUDE) as Dispatch;
      info = dispatch.load(source);
    } catch (err) {
      lua.global.close();
      throw new ModuleError([`${MODULE_FILES.script}: ${(err as Error).message}`]);
    }

    const problems: string[] = [];
    if (!info.onSpin && !info.onFeatureEnd) problems.push("nessun hook definito (onSpin, onFeatureEnd)");
    for (const mode of info.spinModes ?? []) {
      if (!math.reels[mode]) problems.push(`spinModes: modalità senza strisce dei rulli ${mode}`);
    }
    if (problems.length > 0) {
      lua.global.close();
      throw new ModuleError(problems.map((p) => `${MODULE_FILES.script}: ${p}`));
    }

    runtime = new ScriptRuntime(math, dispatch, info, info.spinModes ? new Set(info.spinModes) : null);
    return runtime;
  }

  /** Hook definiti dallo script. */
  get hooks(): string[] {
    return (["onSpin", "onFeatureEnd"] as const).filter((h) => this.info[h]);
  }

  beginRound(rng: Rng): void {
    this.rng = rng;
    this.round++;
  }

  onSpin(spin: SpinResult, index: number): PlayRequest | null {
    if (!this.info.onSpin || (this.spinModes && !this.spinModes.has(spin.mode))) return null;
    const raw = this.call("onSpin", () =>
      this.dispatch.spin(this.round, spin.mode, index + 1, spin.win, spin.expandedReels.length, spin.scatterCount, spin.upgradeLevel),
    );
    return this.toRequest("onSpin", raw);
  }

  onFeatureEnd(feature: FeatureSummary): PlayRequest | null {
    if (!this.info.onFeatureEnd) return null;
    const { mode, spins, win, upgradeLevel } = feature;
    const raw = this.call("onFeatureEnd", () => this.dispatch.featureEnd(this.round, mode, spins, win, upgradeLevel));
    return this.toRequest("onFeatureEnd", raw);
  }

  private call(hook: string, fn: () => unknown): unknown {
    try {
      return fn();
    } catch (err) {
      throw new ScriptError(`${hook}: ${(err as Error).message}`);
    }
  }

  /** Lo hook può restituire nil o { mode = "...", spins = n, guaranteeWin = true }. */
  private toRequest(hook: string, raw: unknown): PlayRequest | null {
    if (raw === null || raw === undefined) return null;
    const fail = (why: string): never => {
      throw new ScriptError(`${hook} deve restituire nil o { mode = "...", spins = n }: ${why}`);
    };
    if (typeof raw !== "object") fail(`ha restituito ${typeof raw}`);
    const { mode, spins, guaranteeWin = false } = raw as Record<string, unknown>;
    if (typeof mode !== "string" || !this.math.reels[mode]) fail(`modalità senza strisce dei rulli ${String(mode)}`);
    if (typeof spins !== "number" || !Number.isInteger(spins) || spins < 0) fail(`spins non valido ${String(spins)}`);
    if (typeof guaranteeWin !== "boolean") fail("guaranteeWin deve essere true o false");
    return { mode: mode as string, spins: spins as number, guaranteeWin: guaranteeWin as boolean };
  }
}
