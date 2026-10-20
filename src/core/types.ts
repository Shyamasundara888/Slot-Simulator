/** Identificatore di un simbolo, ad esempio "WILD" o "A". */
export type SymbolId = string;

export type SymbolKind = "normal" | "wild" | "scatter";

/**
 * Matematica di una slot già validata, nella forma usata dal motore.
 * Le vincite su linea sono multipli della puntata per linea;
 * le vincite scatter sono multipli della puntata totale.
 */
export interface SlotMath {
  reelCount: number;
  rows: number;
  symbols: ReadonlyMap<SymbolId, SymbolKind>;
  /** Strisce dei rulli della modalità base: reels[rullo][posizione]. */
  reels: SymbolId[][];
  /** Per ogni linea, la riga (0 = in alto) toccata su ciascun rullo. */
  lines: number[][];
  /** linePays.get(simbolo)[n] = pagamento per n simboli consecutivi da sinistra. */
  linePays: ReadonlyMap<SymbolId, number[]>;
  wild: SymbolId | null;
  scatter: { symbol: SymbolId; pays: number[] } | null;
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
  stops: number[];
  grid: Grid;
  lineWins: LineWin[];
  scatterWin: ScatterWin | null;
  /** Vincita totale in multipli della puntata totale. */
  totalWin: number;
}
