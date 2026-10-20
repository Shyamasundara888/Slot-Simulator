import { describe, expect, it } from "vitest";
import { gridFromStops, evaluateGrid } from "../src/core/engine.js";
import { loadSlotModule } from "../src/module/load.js";
import { exactRtp } from "../src/sim/exact.js";
import { simulate } from "../src/sim/simulate.js";
import { tinyMath } from "./helpers.js";

/** RTP per enumerazione completa delle posizioni di arresto: il riferimento più semplice. */
function bruteForceRtp(math: ReturnType<typeof tinyMath>): number {
  const lengths = math.reels.map((s) => s.length);
  const total = lengths.reduce((a, b) => a * b, 1);
  let sum = 0;
  const stops = new Array(lengths.length).fill(0);
  for (let i = 0; i < total; i++) {
    let rest = i;
    for (let r = 0; r < lengths.length; r++) {
      stops[r] = rest % lengths[r]!;
      rest = Math.floor(rest / lengths[r]!);
    }
    sum += evaluateGrid(math, [...stops], gridFromStops(math, stops)).totalWin;
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
    expect(exactRtp(math).rtp).toBeCloseTo(bruteForceRtp(math), 10);
  });

  it("le probabilità del numero di scatter sommano a 1", () => {
    const sum = exactRtp(math).scatterCountProbability.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 12);
  });

  it("la simulazione converge all'RTP esatto", () => {
    const result = simulate(math, { spins: 200_000, seed: 3 });
    expect(Math.abs(result.rtp - exactRtp(math).rtp)).toBeLessThan(result.rtpConfidence95 * 1.5);
  });

  it("la simulazione è riproducibile con lo stesso seed", () => {
    expect(simulate(math, { spins: 5_000, seed: "abc" })).toEqual(simulate(math, { spins: 5_000, seed: "abc" }));
  });

  it("il modulo di esempio resta vicino al 95% di RTP", async () => {
    const { math: demo } = await loadSlotModule("slots/tempio-del-sole");
    const { rtp } = exactRtp(demo);
    expect(rtp).toBeGreaterThan(0.94);
    expect(rtp).toBeLessThan(0.96);
  });
});
