/** Identificatore di un simbolo, ad esempio "WILD" o "A". */
export type SymbolId = string;

export type SymbolKind = "normal" | "wild" | "scatter";

/** Modalità di gioco: ognuna può avere strisce dei rulli proprie. */
export type Mode = "base" | "free";

export interface FreeSpinsConfig {
  minScatters: number;
  /** awards[n] = free spin assegnati con n scatter (0 se n < minScatters). */
  awards: number[];
  retrigger: boolean;
  /** Free spin aggiunti per ogni wild espanso durante i free spin. */
  extraSpinsPerExpandedWild: number;
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
  /** Strisce dei rulli per modalità: reels[modo][rullo][posizione]. */
  reels: Record<Mode, SymbolId[][]>;
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
  /** Vincita dello spin in multipli della puntata totale. */
  win: number;
}

export interface FreeSpinsResult {
  /** Free spin assegnati in totale, riattivazioni ed extra compresi. */
  awarded: number;
  spins: SpinResult[];
  /** Livello di upgrade raggiunto alla fine. */
  upgradeLevel: number;
  win: number;
}

export interface RoundResult {
  base: SpinResult;
  freeSpins: FreeSpinsResult | null;
  /** Vincita totale del round, già limitata a maxWin. */
  totalWin: number;
  /** Se il round si è fermato perché ha raggiunto maxWin. */
  capped: boolean;
}
