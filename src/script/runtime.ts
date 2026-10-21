import { LuaFactory } from "wasmoon";
import type { Rng } from "../core/rng.js";
import {
  type Cell,
  ChoiceNeeded,
  type FeatureSummary,
  type PlayRequest,
  type RoundHooks,
  type SessionState,
  type SlotMath,
  type SpinResult,
  UI_EFFECTS,
  type UiEffect,
  type UiEvent,
} from "../core/types.js";
import { ModuleError } from "../module/build.js";
import { MODULE_FILES } from "../module/parse.js";
import type { UiElement } from "../module/schema.js";

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
/** Voci al massimo nella tabella session. */
export const MAX_SESSION_KEYS = 50;
/** Lunghezza massima di un testo in session. */
export const MAX_SESSION_TEXT = 200;

/**
 * Preambolo eseguito prima dello script del modulo. Toglie le librerie che
 * toccano il mondo esterno (e le coroutine, che sfuggirebbero al limite di
 * istruzioni), sostituisce math.random con l'RNG del round, definisce la
 * tabella ui per l'interfaccia e il dispatcher che chiama gli hook con un
 * limite di istruzioni.
 *
 * `elements` sono gli elementi di scenes/ui.json (null = non controllare gli
 * id); con `record` falso le richieste a ui vengono controllate ma non
 * registrate, come serve al simulatore.
 */
const prelude = (math: SlotMath, elements: readonly UiElement[] | null, record: boolean) => `
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
-- session: stato che resta tra un round e l'altro. saved è quello dell'ultimo round finito,
-- shown i valori numerici già comunicati all'interfaccia nel round in corso.
local saved, shown = {}, {}
local changed, session_changed = false, __session_changed
__session_changed = nil
local function copy(t)
  local out = {}
  for k, v in pairs(t) do out[k] = v end
  return out
end
local function same(a, b)
  if type(a) ~= "table" then return false end
  for k, v in pairs(a) do if b[k] ~= v then return false end end
  for k in pairs(b) do if a[k] == nil then return false end end
  return true
end
local function begin(id)
  if id ~= current_round then
    current_round = id
    round = {}
    ui_values = {}
    session = copy(saved)
    changed = false
    shown = {}
    for k, v in pairs(session) do if type(v) == "number" then shown[k] = v end end
  end
  ui_events = {}
end

-- Interfaccia: lo script dice cosa è cambiato, il client lo mette in scena.
local REELS, ROWS, RECORD = ${math.reelCount}, ${math.rows}, ${record}
local ELEMENTS = ${elements === null ? "nil" : luaMap(elements.map((e) => [e.id, "true"]))}
local PANELS = ${luaMap((elements ?? []).flatMap((e) => (e.type === "panel" && e.options ? [[e.id, String(e.options.length)]] : [])))}
local PICKERS = ${luaMap((elements ?? []).flatMap((e) => (e.type === "picker" ? [[e.id, String(e.count)]] : [])))}
local choose_answer = __choose
__choose = nil
local EFFECTS = { ${UI_EFFECTS.map((e) => `${e} = true`).join(", ")} }
local function check_hook(fname)
  if not in_hook then error(fname .. " si può usare solo dentro gli hook", 3) end
end
local function check_name(name, fname)
  if type(name) ~= "string" or not (name:match("^[a-z][a-z0-9_]*$") or name:match("^session%.[a-z][a-z0-9_]*$")) then
    error(fname .. ": nome non valido " .. tostring(name) .. " (usa lettere minuscole, cifre e _, oppure session.<nome>)", 3)
  end
end
-- Valore attuale di un nome: quelli che iniziano con session. stanno nella tabella session.
local function get_value(name)
  local key = name:match("^session%.(.+)$")
  if key then
    local v = type(session) == "table" and session[key] or nil
    return type(v) == "number" and v or 0
  end
  return ui_values[name] or 0
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
  local key = name:match("^session%.(.+)$")
  if key then
    if type(session) ~= "table" then session = {} end
    session[key] = value
    shown[key] = value
  else
    ui_values[name] = value
  end
  push({ kind = "set", name = name, value = value, reel = reel, row = row })
end
-- Comunica all'interfaccia i valori numerici di session cambiati direttamente dallo script.
local function push_session()
  if type(session) ~= "table" then return end
  local keys = {}
  for k, v in pairs(session) do
    if type(k) == "string" and type(v) == "number" and shown[k] ~= v then keys[#keys + 1] = k end
  end
  for k in pairs(shown) do
    if session[k] == nil or type(session[k]) ~= "number" then keys[#keys + 1] = k end
  end
  table.sort(keys)
  for _, k in ipairs(keys) do
    local v = type(session[k]) == "number" and session[k] or 0
    shown[k] = type(session[k]) == "number" and session[k] or nil
    push({ kind = "set", name = "session." .. k, value = v })
  end
end
ui = {}
function ui.set(name, value, opts)
  check_hook("ui.set"); check_name(name, "ui.set"); check_number(value, "ui.set")
  set_value(name, value, check_cell(opts, "ui.set"))
end
function ui.add(name, delta, opts)
  check_hook("ui.add"); check_name(name, "ui.add"); check_number(delta, "ui.add")
  set_value(name, get_value(name) + delta, check_cell(opts, "ui.add"))
end
function ui.get(name)
  check_name(name, "ui.get")
  return get_value(name)
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

function ui.pick(id, prizes)
  check_hook("ui.pick")
  if ELEMENTS ~= nil and not PICKERS[id] then
    error("ui.pick: " .. tostring(id) .. " non è un elemento picker di scenes/ui.json", 2)
  end
  if type(prizes) ~= "table" or #prizes == 0 or (PICKERS[id] and #prizes > PICKERS[id]) then
    error("ui.pick: servono da 1 a " .. tostring(PICKERS[id] or "count") .. " premi", 2)
  end
  local list = {}
  for i, prize in ipairs(prizes) do
    if type(prize) ~= "string" and type(prize) ~= "number" then error("ui.pick: il premio " .. i .. " deve essere un testo o un numero", 2) end
    list[i] = tostring(prize)
  end
  push({ kind = "pick", id = id, prizes = table.concat(list, "\\31") })
end

-- Scelta del giocatore: restituisce il numero dell'opzione scelta, da 1.
function choose(id)
  check_hook("choose")
  if not PANELS[id] then
    error("choose: " .. tostring(id) .. " non è un pannello con options in scenes/ui.json", 2)
  end
  local answer = choose_answer(id, PANELS[id])
  if answer == nil then error("scelta in attesa", 0) end
  return answer
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
  push_session()
  -- Avvisa il motore una volta per round se session è cambiata: solo allora va salvata.
  if not changed and not same(session, saved) then
    changed = true
    session_changed()
  end
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
-- Fine del round: controlla session e la salva per il round dopo. Restituisce il testo "chiave tipo valore" per voce.
function dispatch.commit(id)
  begin(id)
  if type(session) ~= "table" then error("session deve restare una tabella", 0) end
  -- Niente di cambiato: il motore tiene quella che ha già.
  if same(session, saved) then return nil end
  local out, n = {}, 0
  for k, v in pairs(session) do
    n = n + 1
    if type(k) ~= "string" or not k:match("^[a-z][a-z0-9_]*$") then
      error("session: chiave non valida " .. tostring(k) .. " (usa lettere minuscole, cifre e _)", 0)
    end
    local t = type(v)
    if t == "number" then
      if v ~= v or v == math.huge or v == -math.huge then error("session." .. k .. ": numero non valido", 0) end
      out[#out + 1] = k .. "\\31" .. (math.type(v) == "integer" and ("i\\31" .. v) or ("n\\31" .. string.format("%.17g", v)))
    elseif t == "boolean" then
      out[#out + 1] = k .. "\\31b\\31" .. (v and "1" or "0")
    elseif t == "string" then
      if #v > ${MAX_SESSION_TEXT} or v:find("[\\30\\31]") then error("session." .. k .. ": testo non valido (al massimo ${MAX_SESSION_TEXT} caratteri)", 0) end
      out[#out + 1] = k .. "\\31s\\31" .. v
    else
      error("session." .. k .. ": vale " .. t .. ", ma session tiene solo numeri, testi e true/false", 0)
    end
  end
  if n > ${MAX_SESSION_KEYS} then error("session: troppe voci (" .. n .. ", al massimo ${MAX_SESSION_KEYS})", 0) end
  saved = copy(session)
  table.sort(out)
  return table.concat(out, "\\30")
end
-- Riprende una session salvata (testo di commit); il prossimo round parte da qui.
function dispatch.restore(text)
  saved = {}
  for entry in text:gmatch("[^\\30]+") do
    local k, t, v = entry:match("^([^\\31]*)\\31(.)\\31(.*)$")
    if k then
      if t == "i" then saved[k] = math.tointeger(tonumber(v))
      elseif t == "n" then saved[k] = tonumber(v)
      elseif t == "b" then saved[k] = v == "1"
      else saved[k] = v end
    end
  end
  current_round = nil
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
  commit(id: number): string | null;
  restore(text: string): void;
};

export interface ScriptOptions {
  /** URL di glue.wasm di wasmoon: serve nel browser, in Node si trova da solo. */
  wasmUri?: string;
  /** Elementi di scenes/ui.json: ui.show, ui.hide e ui.fx accettano solo questi id, choose e ui.pick solo i loro pannelli. Senza, gli id non si controllano. */
  elements?: readonly UiElement[];
  /** Falso per non registrare le richieste all'interfaccia (il simulatore non le usa). Predefinito vero. */
  recordUi?: boolean;
  /**
   * Chi risponde alle scelte (choose) senza una risposta data con setAnswers:
   * "random" sceglie a caso con l'RNG del round, un numero sceglie sempre
   * quell'opzione (o l'ultima, se sono meno). Senza, il round si ferma sulla
   * scelta (ChoiceNeeded), come serve al client.
   */
  choice?: "random" | number;
}

/** Tabella Lua da coppie chiave-valore già sicure (id validati dallo schema). */
const luaMap = (pairs: readonly (readonly [string, string])[]) => `{ ${pairs.map(([k, v]) => `["${k}"] = ${v}`).join(", ")} }`;

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
  /** Risposte alle scelte del round, nell'ordine in cui lo script le chiede. */
  private answers: readonly number[] = [];
  private answered = 0;
  /** Se nel round in corso uno hook ha cambiato session (altrimenti non serve salvarla). */
  private changed = false;
  /** Ultima session salvata, restituita senza chiamare Lua nei round che non la cambiano. */
  private session: SessionState = {};
  /** Scelta chiesta dallo script senza risposta, durante l'hook in corso. */
  private waiting: { id: string; options: number } | null = null;

  private constructor(
    private readonly math: SlotMath,
    private readonly dispatch: Dispatch,
    private readonly info: LoadInfo,
    private readonly spinModes: ReadonlySet<string> | null,
  ) {}

  static async create(math: SlotMath, source: string, options: ScriptOptions = {}): Promise<ScriptRuntime> {
    const options_ = options;
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
    lua.global.set("__session_changed", () => {
      if (runtime) runtime.changed = true;
    });
    lua.global.set("__choose", (id: string, options: number) => runtime?.answer(id, options, options_.choice) ?? undefined);

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
    this.answered = 0;
    this.waiting = null;
    this.changed = false;
  }

  /** Risposte (da 1) alle scelte del prossimo round, nell'ordine in cui lo script le chiede. */
  setAnswers(answers: readonly number[]): void {
    this.answers = [...answers];
  }

  /** Risposta a una choose: quella data con setAnswers, quella della regola `choice` o nessuna (il round si ferma). */
  private answer(id: string, options: number, policy: ScriptOptions["choice"]): number | null {
    if (this.answered < this.answers.length) {
      const given = this.answers[this.answered++]!;
      if (!Number.isInteger(given) || given < 1 || given > options) throw new Error(`choose: risposta ${given} fuori da 1..${options}`);
      return given;
    }
    if (policy === "random") return 1 + this.rng!.int(options);
    if (typeof policy === "number") return Math.max(1, Math.min(options, Math.floor(policy)));
    this.waiting = { id, options };
    return null;
  }

  /** Fine di un round completo: salva session per il round dopo e la restituisce. */
  endRound(): SessionState {
    if (!this.changed) return this.session;
    const text = this.call("fine del round", () => this.dispatch.commit(this.round)) as string | null | undefined;
    if (typeof text === "string") this.session = parseSession(text);
    return this.session;
  }

  /** Riparte da una session salvata (per esempio quella di questa slot e di questa puntata); null la svuota. */
  setSession(state: SessionState | null): void {
    const text = serializeSession(state ?? {});
    this.dispatch.restore(text);
    this.session = parseSession(text);
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
    let result: unknown;
    try {
      result = fn();
    } catch (err) {
      this.raiseChoice();
      throw new ScriptError(`${hook}: ${(err as Error).message}`);
    }
    // Anche se lo script ha intercettato l'errore con pcall, la scelta resta in attesa.
    this.raiseChoice();
    return result;
  }

  private raiseChoice(): void {
    if (!this.waiting) return;
    const { id, options } = this.waiting;
    this.waiting = null;
    this.pending = [];
    throw new ChoiceNeeded(id, options);
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
/** Testo di dispatch.commit: voci separate da 0x1e, campi (chiave, tipo, valore) da 0x1f. */
function parseSession(text: string): SessionState {
  const state: SessionState = {};
  for (const entry of text.split("\u001e")) {
    const [key, type, value] = entry.split("\u001f");
    if (key === undefined || type === undefined || value === undefined) continue;
    state[key] = type === "i" || type === "n" ? Number(value) : type === "b" ? value === "1" : value;
  }
  return state;
}

const SESSION_KEY = /^[a-z][a-z0-9_]*$/;

/** Il contrario di parseSession; le voci non valide (per esempio da uno storage modificato a mano) si scartano. */
function serializeSession(state: SessionState): string {
  return Object.entries(state)
    .slice(0, MAX_SESSION_KEYS)
    .flatMap(([key, value]) => {
      if (!SESSION_KEY.test(key)) return [];
      if (typeof value === "number") {
        if (!Number.isFinite(value)) return [];
        return [`${key}\u001f${Number.isInteger(value) && Math.abs(value) < 2 ** 53 ? "i" : "n"}\u001f${value}`];
      }
      if (typeof value === "boolean") return [`${key}\u001fb\u001f${value ? 1 : 0}`];
      if (typeof value === "string" && value.length <= MAX_SESSION_TEXT && !/[\u001e\u001f]/.test(value)) return [`${key}\u001fs\u001f${value}`];
      return [];
    })
    .join("\u001e");
}

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
    case "pick":
      return { kind: "pick", id: String(raw.id), prizes: String(raw.prizes).split("\u001f") };
    default:
      return { kind: "message", text: String(raw.text) };
  }
}
