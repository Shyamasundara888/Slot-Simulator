import { describe, expect, it } from "vitest";
import { evaluateSpin } from "../src/core/engine.js";
import { loadSlotModule } from "../src/module/load.js";
import { ScriptRuntime } from "../src/script/runtime.js";
import { exactRtp } from "../src/sim/exact.js";
import { simulate } from "../src/sim/simulate.js";
import { tinyMath } from "./helpers.js";

/** RTP dello spin base per enumerazione completa delle posizioni di arresto: il riferimento più semplice. */
function bruteForceRtp(math: ReturnType<typeof tinyMath>): number {
  const lengths = math.reels.base.map((s) => s.length);
  const total = lengths.reduce((a, b) => a * b, 1);
  let sum = 0;
  const stops = new Array(lengths.length).fill(0);
  for (let i = 0; i < total; i++) {
    let rest = i;
    for (let r = 0; r < lengths.length; r++) {
      stops[r] = rest % lengths[r]!;
      rest = Math.floor(rest / lengths[r]!);
    }
    sum += evaluateSpin(math, "base", [...stops]).win;
  }
  return sum / total;
}

describe("RTP", () => {
  const math = tinyMath(
    [
      ["A", "B", "W", "S", "A", "B"],
      ["A", "W", "B", "A", "S"],
      ["B", "A", "S", "A", "W", "B", "A"],
    ],
    2,
    [
      [0, 0, 0],
      [1, 1, 1],
      [0, 1, 0],
    ],
  );

  it("il calcolo esatto coincide con l'enumerazione completa", () => {
    expect(exactRtp(math).baseRtp).toBeCloseTo(bruteForceRtp(math), 10);
  });

  it("il calcolo esatto resta corretto con i wild espandenti", () => {
    const expanding = tinyMath(math.reels.base, 2, math.lines, { expandingWild: { reels: [2, 3] } });
    expect(exactRtp(expanding).baseRtp).toBeCloseTo(bruteForceRtp(expanding), 10);
    expect(exactRtp(expanding).baseRtp).not.toBeCloseTo(exactRtp(math).baseRtp, 3);
  });

  it("le probabilità del numero di scatter sommano a 1", () => {
    const sum = exactRtp(math).scatterCountProbability.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 12);
  });

  it("la simulazione converge all'RTP esatto", () => {
    const result = simulate(math, { spins: 200_000, seed: 3 });
    expect(Math.abs(result.rtp - exactRtp(math).baseRtp)).toBeLessThan(result.rtpConfidence95 * 1.5);
  });

  it("la simulazione è riproducibile con lo stesso seed", () => {
    expect(simulate(math, { spins: 5_000, seed: "abc" })).toEqual(simulate(math, { spins: 5_000, seed: "abc" }));
  });

  it("la frequenza dei free spin simulata converge a quella esatta", () => {
    const withFree = tinyMath(math.reels.base, 2, math.lines, {
      freeSpins: { trigger: { minScatters: 2, spins: { "2": 3 } } },
    });
    const n = 100_000;
    const result = simulate(withFree, { spins: n, seed: 9 });
    const p = exactRtp(withFree).freeSpinsProbability;
    const sigma = Math.sqrt(n * p * (1 - p));
    expect(Math.abs(result.freeSpins!.triggers - n * p)).toBeLessThan(4 * sigma);
  });

  it("il modulo di esempio resta intorno al 95% di RTP, Gold Spins compresi, ed è molto volatile", async () => {
    const { math: demo, script } = await loadSlotModule("slots/tempio-del-sole");
    expect(exactRtp(demo).baseRtp).toBeCloseTo(0.6517, 3);
    const hooks = await ScriptRuntime.create(demo, script!);
    const result = simulate(demo, { spins: 300_000, seed: 5, hooks });
    // Con una deviazione standard di 11x, su 300.000 round l'RTP simulato oscilla di circa ±4%.
    expect(result.rtp).toBeGreaterThan(0.88);
    expect(result.rtp).toBeLessThan(1.03);
    expect(result.stdDev).toBeGreaterThan(8);
  });
});
