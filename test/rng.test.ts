import { describe, expect, it } from "vitest";
import { createRng } from "../src/core/rng.js";

describe("rng", () => {
  it("lo stesso seed produce la stessa sequenza", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 1000; i++) expect(a.nextUint32()).toBe(b.nextUint32());
  });

  it("seed diversi producono sequenze diverse", () => {
    expect(createRng("uno").nextUint32()).not.toBe(createRng("due").nextUint32());
  });

  it("int() resta nei limiti ed è circa uniforme", () => {
    const rng = createRng(7);
    const counts = new Array(6).fill(0);
    const n = 60_000;
    for (let i = 0; i < n; i++) counts[rng.int(6)]++;
    for (const c of counts) expect(Math.abs(c - n / 6)).toBeLessThan(400);
  });

  it("int() rifiuta limiti non validi", () => {
    const rng = createRng(1);
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(2.5)).toThrow(RangeError);
  });
});
