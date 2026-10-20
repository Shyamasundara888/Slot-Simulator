import { describe, expect, it } from "vitest";
import { evaluateSpin, expandWilds, playRound, upgradeGrid } from "../src/core/engine.js";
import { ModuleError } from "../src/module/build.js";
import { scriptedRng, tinyMath } from "./helpers.js";

const strips = [
  ["A", "S", "B"],
  ["W", "S", "B"],
  ["A", "S", "B"],
];

describe("wild espandenti", () => {
  const math = tinyMath(strips, 2, [[0, 0, 0], [1, 1, 1]], { expandingWild: { reels: [2] } });

  it("coprono tutta la colonna solo sui rulli abilitati", () => {
    const { grid, expandedReels } = expandWilds(math, [["W", "A"], ["B", "W"], ["A", "B"]]);
    expect(grid).toEqual([["W", "A"], ["W", "W"], ["A", "B"]]);
    expect(expandWilds(math, [["A"], ["W", "S"], ["B"]]).grid[1]).toEqual(["W", "S"]);
    expect(expandedReels).toEqual([1]);
  });

  it("non coprono lo scatter, che resta visibile e paga", () => {
    // Stop [1, 0, 1]: S,B | W,S | S,B → il W si espande ma lo S del rullo 2 resta.
    const result = evaluateSpin(math, "base", [1, 0, 1]);
    expect(result.grid[1]).toEqual(["W", "S"]);
    expect(result.expandedReels).toEqual([1]);
    expect(result.scatterCount).toBe(3);
    expect(result.scatterWin?.pay).toBe(4);
    // Riga 2: B S B non paga: lo scatter interrompe la linea.
    expect(result.lineWins).toEqual([]);
  });
});

describe("upgrade dei simboli", () => {
  it("al livello L i primi L simboli della scala diventano il simbolo di livello L", () => {
    expect(upgradeGrid([["A", "B", "S"]], ["A", "B"], 1)).toEqual([["B", "B", "S"]]);
    expect(upgradeGrid([["A", "B", "S"]], ["A", "B"], 0)).toEqual([["A", "B", "S"]]);
  });
});

describe("free spin", () => {
  const features = {
    expandingWild: { reels: [2] },
    freeSpins: {
      trigger: { minScatters: 3, spins: { "3": 2 } },
      retrigger: true,
      perExpandedWild: { extraSpins: 1, upgrade: true },
      upgradeLadder: ["B", "A"],
    },
  };
  const free = [
    ["B", "S", "A"],
    ["W", "B", "S"],
    ["B", "S", "A"],
  ];
  const math = tinyMath(strips, 1, [[0, 0, 0]], features, free);

  it("partono con 3 scatter e usano le strisce free", () => {
    // Base: S S S. Free: [0,1,0] = B B B; [1,2,1] = S S S (retrigger +2); poi due spin senza vincite.
    const rng = scriptedRng([1, 1, 1, 0, 1, 0, 1, 2, 1, 2, 1, 2, 2, 1, 2]);
    const round = playRound(math, rng);
    expect(round.base.scatterCount).toBe(3);
    expect(round.freeSpins!.awarded).toBe(4);
    expect(round.freeSpins!.initial).toBe(2);
    expect(round.freeSpins!.awardedAfter).toEqual([2, 4, 4, 4]);
    expect(round.freeSpins!.spins.map((s) => s.mode)).toEqual(["free", "free", "free", "free"]);
    expect(round.freeSpins!.spins[0]!.lineWins[0]).toMatchObject({ symbol: "B", count: 3 });
  });

  it("ogni wild espanso aggiunge un free spin e fa salire il livello", () => {
    // Base: S S S. Free 1: [0,0,0] = B W B → +1 spin, livello 1 (B diventa A).
    // Free 2: [0,1,0] = B B B, valutato come A A A. Free 3: senza vincite.
    const rng = scriptedRng([1, 1, 1, 0, 0, 0, 0, 1, 0, 2, 1, 2]);
    const round = playRound(math, rng);
    const [first, second] = round.freeSpins!.spins;
    expect(first!.expandedReels).toEqual([1]);
    expect(round.freeSpins!.awarded).toBe(3);
    expect(second!.reelGrid).toEqual([["B"], ["B"], ["B"]]);
    expect(second!.grid).toEqual([["A"], ["A"], ["A"]]);
    expect(second!.lineWins[0]).toMatchObject({ symbol: "A", count: 3, pay: 10 });
    expect(round.freeSpins!.upgradeLevel).toBe(1);
    expect(round.freeSpins!.spins.map((s) => s.upgradeLevel)).toEqual([0, 1, 1]);
  });

  it("ogni wild espanso fa salire il moltiplicatore, già nello spin in cui compare", () => {
    const multiplied = tinyMath(
      strips,
      1,
      [[0, 0, 0]],
      {
        expandingWild: { reels: [2] },
        freeSpins: {
          trigger: { minScatters: 3, spins: { "3": 2 } },
          perExpandedWild: { extraSpins: 1, multiplier: 2 },
          maxMultiplier: 4,
        },
      },
      free,
    );
    // Base: S S S paga 4. Free: B W B (×3, +1 spin), B B B (×3), B W B (×4 per il tetto, +1 spin), A B A senza vincite.
    const round = playRound(multiplied, scriptedRng([1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 1, 2]));
    const spins = round.freeSpins!.spins;
    expect(spins.map((s) => s.multiplier)).toEqual([3, 3, 4, 4]);
    expect(spins.map((s) => s.win)).toEqual([15, 15, 20, 0]);
    expect(round.freeSpins!.multiplier).toBe(4);
    expect(round.totalWin).toBe(54);
  });

  it("il tetto di vincita ferma il round", () => {
    const capped = tinyMath(strips, 1, [[0, 0, 0]], { ...features, maxWin: 5 }, free);
    // Base: S S S paga 4; il primo free spin B B B paga 5 → 9, limitato a 5.
    const round = playRound(capped, scriptedRng([1, 1, 1, 0, 1, 0]));
    expect(round.totalWin).toBe(5);
    expect(round.capped).toBe(true);
    expect(round.freeSpins!.spins).toHaveLength(1);
  });

  it("con più scatter del massimo indicato vale l'ultimo valore", () => {
    const m = tinyMath(strips, 3, [[0, 0, 0]], { freeSpins: { trigger: { minScatters: 3, spins: { "3": 7 } } } });
    expect(m.freeSpins!.awards.slice(0, 6)).toEqual([0, 0, 0, 7, 7, 7]);
  });
});

describe("validazione delle funzioni", () => {
  it("segnala configurazioni incoerenti", () => {
    try {
      tinyMath(strips, 1, [[0, 0, 0]], {
        expandingWild: { reels: [4] },
        freeSpins: {
          trigger: { minScatters: 3, spins: { "3": 5 } },
          perExpandedWild: { upgrade: true },
          upgradeLadder: ["A", "S"],
        },
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ModuleError);
      const problems = (err as ModuleError).problems.join("\n");
      expect(problems).toContain("il rullo 4 non esiste");
      expect(problems).toContain("S non è un simbolo normale");
    }
    try {
      tinyMath(strips, 1, [[0, 0, 0]], {
        freeSpins: { trigger: { minScatters: 3, spins: { "3": 5 } }, perExpandedWild: { multiplier: 1 } },
      });
      expect.unreachable();
    } catch (err) {
      expect((err as ModuleError).problems.join("\n")).toContain("il moltiplicatore per wild espanso richiede expandingWild");
    }
  });
});
