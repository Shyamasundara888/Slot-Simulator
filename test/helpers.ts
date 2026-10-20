import { buildSlotMath } from "../src/module/build.js";
import type { PaytableFile } from "../src/module/schema.js";

/** Slot minima 3x1 con wild e scatter, utile per i test. */
export function tinyMath(strips: string[][], rows = 1, lines: number[][] = [[0, 0, 0]]) {
  const paytable: PaytableFile = {
    symbols: [
      { id: "W", kind: "wild" },
      { id: "S", kind: "scatter" },
      { id: "A", kind: "normal" },
      { id: "B", kind: "normal" },
    ],
    linePays: {
      W: { "3": 50 },
      A: { "2": 1, "3": 10 },
      B: { "3": 5 },
    },
    scatterPays: { "2": 1, "3": 4 },
  };
  return buildSlotMath({ rows, modes: { base: strips } }, { lines }, paytable);
}
