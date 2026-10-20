import type { Rng } from "./rng.js";

/** Identificatore di un simbolo, ad esempio "WILD" o "A". */
export type SymbolId = string;

export type SymbolKind = "normal" | "wild" | "scatter";

/**
 * Modalità di gioco: ognuna può avere strisce dei rulli proprie. "base" e
 * "free" ci sono sempre; i moduli possono aggiungerne altre (per esempio
 * "gold") che gli script fanno giocare.
 */
export type Mode = string;

type Strips = SymbolId[][];

/** Strisce dei rulli per modalità: reels[modo][rullo][posizione]. */
export interface Reels {
  base: Strips;
  free: Strips;
  [mode: string]: Strips | undefined;
}

export interface FreeSpinsConfig {
  minScatters: number;
  /** awards[n] = free spin assegnati con n scatter (0 se n < minScatters). */
  awards: number[];
  retrigger: boolean;
  /** Free spin aggiunti per ogni wild espanso durante i free spin. */
  extraSpinsPerExpandedWild: number;
  /** Quanto sale il moltiplicatore dei free spin per ogni wild espanso (0 = nessun moltiplicatore). */
  multiplierPerExpandedWild: number;
  /** Moltiplicatore massimo dei free spin. */
  maxMultiplier: number;
  /** Se ogni wild espanso durante i free spin fa salire di livello i simboli. */
  upgradeOnExpandedWild: boolean;
  /** Simboli dal meno al più pagante: al livello L i primi L diventano upgradeLadder[L]. */
  upgradeLadder: SymbolId[];
  /** Limite di sicurezza ai free spin giocati in un round. */
  maxSpins: number;
}

/**
 * Matematica di una slot già validata, nella forma usata dal motore.
 * Le vincite su linea sono multipli della puntata per linea;
 * le vincite scatter e quelle totali sono multipli della puntata totale.
 */
export interface SlotMath {
  reelCount: number;
  rows: number;
  symbols: ReadonlyMap<SymbolId, SymbolKind>;
  reels: Reels;
  /** Per ogni linea, la riga (0 = in alto) toccata su ciascun rullo. */
  lines: number[][];
  /** linePays.get(simbolo)[n] = pagamento per n simboli consecutivi da sinistra. */
  linePays: ReadonlyMap<SymbolId, number[]>;
  wild: SymbolId | null;
  scatter: { symbol: SymbolId; pays: number[] } | null;
  /** Rulli (da 0) su cui un wild si espande a coprire tutta la colonna. */
  expandingWildReels: ReadonlySet<number>;
  freeSpins: FreeSpinsConfig | null;
  /** Vincita massima di un round, in multipli della puntata totale. */
  maxWin: number;
}

/** grid[rullo][riga] */
export type Grid = SymbolId[][];

export interface LineWin {
  line: number;
  symbol: SymbolId;
  count: number;
  /** In multipli della puntata per linea. */
  pay: number;
}

export interface ScatterWin {
  symbol: SymbolId;
  count: number;
  /** In multipli della puntata totale. */
  pay: number;
}

export interface SpinResult {
  mode: Mode;
  /** Livello di upgrade con cui è stato valutato lo spin. */
  upgradeLevel: number;
  stops: number[];
  /** Griglia estratta dai rulli, prima di upgrade ed espansioni. */
  reelGrid: Grid;
  /** Griglia valutata, dopo upgrade ed espansioni. */
  grid: Grid;
  /** Rulli (da 0) su cui un wild si è espanso. */
  expandedReels: number[];
  scatterCount: number;
  lineWins: LineWin[];
  scatterWin: ScatterWin | null;
  /** Moltiplicatore applicato alla vincita dello spin (1 se non c'è). */
  multiplier: number;
  /** Vincita dello spin in multipli della puntata totale, moltiplicatore compreso. */
  win: number;
}

export interface FreeSpinsResult {
  /** Free spin assegnati dallo spin base. */
  initial: number;
  /** Free spin assegnati in totale, riattivazioni ed extra compresi. */
  awarded: number;
  spins: SpinResult[];
  /** awardedAfter[i] = free spin assegnati in totale dopo lo spin i: serve per mostrare il contatore. */
  awardedAfter: number[];
  /** Livello di upgrade raggiunto alla fine. */
  upgradeLevel: number;
  /** Moltiplicatore raggiunto alla fine. */
  multiplier: number;
  win: number;
}

/** Sequenza di spin richiesta da uno script, giocata dopo i free spin. */
export interface PlayRequest {
  mode: Mode;
  spins: number;
  /** Se vero, ogni spin della sequenza ha una vincita. */
  guaranteeWin: boolean;
  /** Moltiplicatore delle vincite di ogni spin della sequenza. */
  multiplier: number;
}

export interface ExtraSpinsResult {
  mode: Mode;
  multiplier: number;
  spins: SpinResult[];
  win: number;
}

/** Riassunto di una feature appena finita, passato agli script. */
export interface FeatureSummary {
  mode: Mode;
  spins: number;
  win: number;
  upgradeLevel: number;
  multiplier: number;
}

/**
 * Regole aggiuntive di un modulo, chiamate dal motore durante il round (in
 * pratica uno script Lua, vedi src/script). Le chiamate sono sincrone e
 * l'unica fonte di casualità è l'RNG del round.
 */
export interface RoundHooks {
  beginRound(rng: Rng): void;
  onSpin(spin: SpinResult, index: number): PlayRequest | null;
  onFeatureEnd(feature: FeatureSummary): PlayRequest | null;
}

export interface RoundResult {
  base: SpinResult;
  freeSpins: FreeSpinsResult | null;
  /** Sequenze richieste dagli script, nell'ordine in cui sono state giocate. */
  extra: ExtraSpinsResult[];
  /** Vincita totale del round, già limitata a maxWin. */
  totalWin: number;
  /** Se il round si è fermato perché ha raggiunto maxWin. */
  capped: boolean;
}
