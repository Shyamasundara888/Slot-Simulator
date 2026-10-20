import type { Rng } from "../src/core/rng.js";
import { buildSlotMath } from "../src/module/build.js";
import type { FeaturesFile, PaytableFile } from "../src/module/schema.js";

/** Slot minima a 3 rulli con wild e scatter, utile per i test. */
export function tinyMath(
  strips: string[][],
  rows = 1,
  lines: number[][] = [[0, 0, 0]],
  features: FeaturesFile = {},
  freeStrips?: string[][],
) {
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
  const modes = freeStrips ? { base: strips, free: freeStrips } : { base: strips };
  return buildSlotMath({ rows, modes }, { lines }, paytable, features);
}

/** RNG che restituisce posizioni di arresto prestabilite, nell'ordine dato. */
export function scriptedRng(values: number[]): Rng {
  let i = 0;
  const next = () => {
    if (i >= values.length) throw new Error("scriptedRng: valori finiti");
    return values[i++]!;
  };
  return { int: next, nextUint32: next, float: () => next() / 2 ** 32 };
}
