import { describe, expect, it } from "vitest";
import { evaluateGrid, gridFromStops } from "../src/core/engine.js";
import { evaluateScatter, evaluateSymbols } from "../src/core/evaluate.js";
import { tinyMath } from "./helpers.js";

const math = tinyMath([["A"], ["A"], ["A"]]);

describe("evaluateSymbols", () => {
  it.each([
    [["A", "A", "A"], { symbol: "A", count: 3, pay: 10 }],
    [["A", "A", "B"], { symbol: "A", count: 2, pay: 1 }],
    [["W", "A", "A"], { symbol: "A", count: 3, pay: 10 }],
    [["A", "W", "A"], { symbol: "A", count: 3, pay: 10 }],
    [["W", "W", "W"], { symbol: "W", count: 3, pay: 50 }],
    [["W", "W", "B"], { symbol: "B", count: 3, pay: 5 }],
    [["B", "A", "A"], null],
    [["S", "A", "A"], null],
    [["W", "S", "A"], null],
  ])("%j → %j", (symbols, expected) => {
    expect(evaluateSymbols(math, symbols)).toEqual(expected);
  });

  it("paga la corsa di wild quando vale più del simbolo sostituito", () => {
    const m = tinyMath([["A"], ["A"], ["A"]]);
    // W W A: A x3 paga 10, ma una corsa di W x2 non paga: vince A.
    expect(evaluateSymbols(m, ["W", "W", "A"])).toEqual({ symbol: "A", count: 3, pay: 10 });
  });
});

describe("griglia e scatter", () => {
  it("legge la griglia dalle posizioni di arresto, ripartendo dall'inizio della striscia", () => {
    const m = tinyMath([["A", "B", "S"], ["A", "B", "S"], ["A", "B", "S"]], 2, [[0, 0, 0], [1, 1, 1]]);
    expect(gridFromStops(m, [2, 0, 1])).toEqual([["S", "A"], ["A", "B"], ["B", "S"]]);
  });

  it("conta gli scatter ovunque e paga sulla puntata totale", () => {
    const m = tinyMath([["S"], ["A"], ["S"]]);
    expect(evaluateScatter(m, [["S"], ["A"], ["S"]])).toEqual({ symbol: "S", count: 2, pay: 1 });
  });

  it("divide le vincite su linea per il numero di linee", () => {
    const m = tinyMath([["A", "B"], ["A", "B"], ["A", "B"]], 2, [[0, 0, 0], [1, 1, 1]]);
    const result = evaluateGrid(m, [0, 0, 0], gridFromStops(m, [0, 0, 0]));
    expect(result.lineWins.map((w) => w.pay)).toEqual([10, 5]);
    expect(result.totalWin).toBe(7.5);
  });
});
