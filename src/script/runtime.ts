import { LuaFactory } from "wasmoon";
import type { Rng } from "../core/rng.js";
import {
  type Cell,
  type FeatureSummary,
  type PlayRequest,
  type RoundHooks,
  type SlotMath,
  type SpinResult,
  UI_EFFECTS,
  type UiEffect,
  type UiEvent,
} from "../core/types.js";
import { ModuleError } from "../module/build.js";
import { MODULE_FILES } from "../module/parse.js";

/** Istruzioni Lua concesse a ogni chiamata di uno hook (e al caricamento). */
export const INSTRUCTION_LIMIT = 1_000_000;
/** Memoria massima dello stato Lua di un modulo. */
export const MEMORY_LIMIT = 16 * 1024 * 1024;
/** Moltiplicatore massimo che uno script può chiedere per una sequenza. */
export const MAX_MULTIPLIER = 1_000;

/** Errore sollevato da uno script mentre il motore gioca un round. */
export class ScriptError extends Error {
  constructor(message: string) {
    super(`${MODULE_FILES.script}: ${message}`);
    this.name = "ScriptError";
  }
}

/** Testo massimo di ui.message. */
export const MAX_MESSAGE = 120;

/**
 * Preambolo eseguito prima dello script del modulo. Toglie le librerie che
 * toccano il mondo esterno (e le coroutine, che sfuggirebbero al limite di
 * istruzioni), sostituisce math.random con l'RNG del round, definisce la
 * tabella ui per l'interfaccia e il dispatcher che chiama gli hook con un
 * limite di istruzioni.
 *
 * `elements` sono gli id degli elementi di scenes/ui.json (null = non
 * controllarli); con `record` falso le richieste a ui vengono controllate ma
 * non registrate, come serve al simulatore.
 */
const prelude = (math: SlotMath, elements: readonly string[] | null, record: boolean) => `
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
local in_hook = false
local ui_values, ui_events = {}, {}
local function begin(id)
  if id ~= current_round then
    current_round = id
    round = {}
    ui_values = {}
  end
  ui_events = {}
end

-- Interfaccia: lo script dice cosa è cambiato, il client lo mette in scena.
local REELS, ROWS, RECORD = ${math.reelCount}, ${math.rows}, ${record}
local ELEMENTS = ${elements === null ? "nil" : `{ ${elements.map((id) => `["${id}"] = true`).join(", ")} }`}
local EFFECTS = { ${UI_EFFECTS.map((e) => `${e} = true`).join(", ")} }
local function check_hook(fname)
  if not in_hook then error(fname .. " si può usare solo dentro gli hook", 3) end
end
local function check_name(name, fname)
  if type(name) ~= "string" or not name:match("^[a-z][a-z0-9_]*$") then
    error(fname .. ": nome non valido " .. tostring(name) .. " (usa lettere minuscole, cifre e _)", 3)
  end
end
local function check_number(value, fname)
  if math.type(value) == nil or value ~= value or value == math.huge or value == -math.huge then
    error(fname .. ": serve un numero, non " .. tostring(value), 3)
  end
end
local function check_cell(opts, fname)
  if opts == nil then return nil, nil end
  if type(opts) ~= "table" then error(fname .. ": il terzo argomento è { from = cella }", 3) end
  local c = opts.from
  if c == nil then return nil, nil end
  if type(c) ~= "table" or math.type(c.reel) ~= "integer" or math.type(c.row) ~= "integer"
      or c.reel < 1 or c.reel > REELS or c.row < 1 or c.row > ROWS then
    error(fname .. ": from deve essere una cella { reel = 1.." .. REELS .. ", row = 1.." .. ROWS .. " }", 3)
  end
  return c.reel - 1, c.row - 1
end
local function check_id(id, fname)
  if type(id) ~= "string" or (ELEMENTS ~= nil and not ELEMENTS[id]) then
    error(fname .. ": elemento sconosciuto " .. tostring(id) .. " (non è in scenes/ui.json)", 3)
  end
end
local function push(event)
  if RECORD then ui_events[#ui_events + 1] = event end
end
local function set_value(name, value, reel, row)
  ui_values[name] = value
  push({ kind = "set", name = name, value = value, reel = reel, row = row })
end
ui = {}
function ui.set(name, value, opts)
  check_hook("ui.set"); check_name(name, "ui.set"); check_number(value, "ui.set")
  set_value(name, value, check_cell(opts, "ui.set"))
end
function ui.add(name, delta, opts)
  check_hook("ui.add"); check_name(name, "ui.add"); check_number(delta, "ui.add")
  set_value(name, (ui_values[name] or 0) + delta, check_cell(opts, "ui.add"))
end
function ui.get(name)
  check_name(name, "ui.get")
  return ui_values[name] or 0
end
function ui.show(id)
  check_hook("ui.show"); check_id(id, "ui.show")
  push({ kind = "show", id = id })
end
function ui.hide(id)
  check_hook("ui.hide"); check_id(id, "ui.hide")
  push({ kind = "hide", id = id })
end
function ui.fx(id, effect)
  check_hook("ui.fx"); check_id(id, "ui.fx")
  if not EFFECTS[effect] then error("ui.fx: effetto sconosciuto " .. tostring(effect) .. " (${UI_EFFECTS.join(", ")})", 2) end
  push({ kind = "fx", id = id, effect = effect })
end
function ui.message(text)
  check_hook("ui.message")
  if type(text) ~= "string" or #text == 0 or utf8.len(text) == nil or utf8.len(text) > ${MAX_MESSAGE} then
    error("ui.message: serve un testo da 1 a ${MAX_MESSAGE} caratteri", 2)
  end
  push({ kind = "message", text = text })
end

local function cells(text)
  local out = {}
  for reel, row in text:gmatch("(%d+),(%d+)") do out[#out + 1] = { reel = tonumber(reel), row = tonumber(row) } end
  return out
end
-- Chiama uno hook; se ha toccato l'interfaccia restituisce anche le richieste.
local function hook(f, arg)
  in_hook = true
  local ok, res = pcall(guarded, f, arg)
  in_hook = false
  if not ok then error(res, 0) end
  if #ui_events == 0 then return res end
  local events = ui_events
  ui_events = {}
  return { __ui = events, request = res }
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
function dispatch.spin(id, mode, index, win, wilds, scatters, level, multiplier, wildCells, expandedCells, scatterCells)
  begin(id)
  return hook(onSpin, {
    mode = mode, index = index, win = win, wilds = wilds, scatters = scatters, level = level, multiplier = multiplier,
    wildCells = cells(wildCells), expandedCells = cells(expandedCells), scatterCells = cells(scatterCells),
  })
end
function dispatch.featureEnd(id, mode, spins, win, level, multiplier)
  begin(id)
  return hook(onFeatureEnd, { mode = mode, spins = spins, win = win, level = level, multiplier = multiplier })
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
  spin(
    id: number,
    mode: string,
    index: number,
    win: number,
    wilds: number,
    scatters: number,
    level: number,
    multiplier: number,
    wildCells: string,
    expandedCells: string,
    scatterCells: string,
  ): unknown;
  featureEnd(id: number, mode: string, spins: number, win: number, level: number, multiplier: number): unknown;
};

export interface ScriptOptions {
  /** URL di glue.wasm di wasmoon: serve nel browser, in Node si trova da solo. */
  wasmUri?: string;
  /** Id degli elementi di scenes/ui.json: ui.show, ui.hide e ui.fx accettano solo questi. Senza, non si controllano. */
  elements?: readonly string[];
  /** Falso per non registrare le richieste all'interfaccia (il simulatore non le usa). Predefinito vero. */
  recordUi?: boolean;
}

/** Celle come testo "rullo,riga;...", contate da 1 come in Lua. */
const cellText = (cells: readonly Cell[]) => cells.map((c) => `${c.reel + 1},${c.row + 1}`).join(";");

/** Celle di uno spin che servono agli script per le animazioni: wild, wild espansi (dove sono atterrati) e scatter. */
export function spinCells(math: SlotMath, spin: SpinResult): { wild: Cell[]; expanded: Cell[]; scatter: Cell[] } {
  const wild: Cell[] = [];
  const scatter: Cell[] = [];
  spin.reelGrid.forEach((column, reel) =>
    column.forEach((symbol, row) => {
      if (symbol === math.wild) wild.push({ reel, row });
    }),
  );
  spin.grid.forEach((column, reel) =>
    column.forEach((symbol, row) => {
      if (symbol === math.scatter?.symbol) scatter.push({ reel, row });
    }),
  );
  const expanded = spin.expandedReels.map((reel) => wild.find((c) => c.reel === reel) ?? { reel, row: 0 });
  return { wild, expanded, scatter };
}

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : []);

/**
 * Esegue lo script Lua di un modulo in uno stato isolato e lo collega al
 * motore come RoundHooks. Lo script vede solo i dati che il motore gli passa
 * e l'RNG del round, quindi lo stesso seed dà sempre lo stesso round.
 */
export class ScriptRuntime implements RoundHooks {
  private rng: Rng | null = null;
  private round = 0;
  private pending: UiEvent[] = [];

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
      dispatch = lua.doStringSync(prelude(math, options.elements ?? null, options.recordUi ?? true)) as Dispatch;
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
    this.pending = [];
  }

  takeUiEvents(): UiEvent[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }

  onSpin(spin: SpinResult, index: number): PlayRequest | null {
    if (!this.info.onSpin || (this.spinModes && !this.spinModes.has(spin.mode))) return null;
    const cells = spinCells(this.math, spin);
    const raw = this.call("onSpin", () =>
      this.dispatch.spin(
        this.round,
        spin.mode,
        index + 1,
        spin.win,
        spin.expandedReels.length,
        spin.scatterCount,
        spin.upgradeLevel,
        spin.multiplier,
        cellText(cells.wild),
        cellText(cells.expanded),
        cellText(cells.scatter),
      ),
    );
    return this.toRequest("onSpin", this.collectUi(raw));
  }

  onFeatureEnd(feature: FeatureSummary): PlayRequest | null {
    if (!this.info.onFeatureEnd) return null;
    const { mode, spins, win, upgradeLevel, multiplier } = feature;
    const raw = this.call("onFeatureEnd", () => this.dispatch.featureEnd(this.round, mode, spins, win, upgradeLevel, multiplier));
    return this.toRequest("onFeatureEnd", this.collectUi(raw));
  }

  /** Se lo hook ha toccato l'interfaccia, mette da parte le richieste e restituisce il valore dello hook. */
  private collectUi(raw: unknown): unknown {
    if (raw === null || typeof raw !== "object" || !("__ui" in raw)) return raw;
    const { __ui, request } = raw as { __ui: unknown; request: unknown };
    this.pending = asList(__ui).map((item) => toUiEvent(item as Record<string, unknown>));
    return request;
  }

  private call(hook: string, fn: () => unknown): unknown {
    try {
      return fn();
    } catch (err) {
      throw new ScriptError(`${hook}: ${(err as Error).message}`);
    }
  }

  /** Lo hook può restituire nil o { mode = "...", spins = n, guaranteeWin = true, multiplier = m }. */
  private toRequest(hook: string, raw: unknown): PlayRequest | null {
    if (raw === null || raw === undefined) return null;
    const fail = (why: string): never => {
      throw new ScriptError(`${hook} deve restituire nil o { mode = "...", spins = n }: ${why}`);
    };
    if (typeof raw !== "object") fail(`ha restituito ${typeof raw}`);
    const { mode, spins, guaranteeWin = false, multiplier = 1 } = raw as Record<string, unknown>;
    if (typeof mode !== "string" || !this.math.reels[mode]) fail(`modalità senza strisce dei rulli ${String(mode)}`);
    if (typeof spins !== "number" || !Number.isInteger(spins) || spins < 0) fail(`spins non valido ${String(spins)}`);
    if (typeof guaranteeWin !== "boolean") fail("guaranteeWin deve essere true o false");
    if (typeof multiplier !== "number" || !Number.isFinite(multiplier) || multiplier < 1 || multiplier > MAX_MULTIPLIER) {
      fail(`multiplier deve essere un numero tra 1 e ${MAX_MULTIPLIER}, non ${String(multiplier)}`);
    }
    return { mode: mode as string, spins: spins as number, guaranteeWin: guaranteeWin as boolean, multiplier: multiplier as number };
  }
}

/** Una richiesta all'interfaccia come arriva da Lua, già controllata dal preambolo. */
function toUiEvent(raw: Record<string, unknown>): UiEvent {
  switch (raw.kind) {
    case "set": {
      const from = typeof raw.reel === "number" && typeof raw.row === "number" ? { reel: raw.reel, row: raw.row } : null;
      return { kind: "set", name: String(raw.name), value: Number(raw.value), from };
    }
    case "show":
    case "hide":
      return { kind: raw.kind, id: String(raw.id) };
    case "fx":
      return { kind: "fx", id: String(raw.id), effect: raw.effect as UiEffect };
    default:
      return { kind: "message", text: String(raw.text) };
  }
}
