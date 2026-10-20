import { describe, expect, it } from "vitest";
import { playRound } from "../src/core/engine.js";
import { createRng } from "../src/core/rng.js";
import { ModuleError } from "../src/module/build.js";
import { loadSlotModule } from "../src/module/load.js";
import { ScriptError, ScriptRuntime } from "../src/script/runtime.js";
import { simulate } from "../src/sim/simulate.js";
import { scriptedRng, tinyMath } from "./helpers.js";

const strips = [["A", "B", "S"], ["A", "B", "S"], ["A", "B", "S"]];
// Modalità "gold": vince sempre con tre A.
const gold = [["A"], ["A"], ["A"]];
const math = tinyMath(strips, 1, [[0, 0, 0]], {}, undefined, { gold });

const create = (source: string) => ScriptRuntime.create(math, source);

describe("sandbox degli script", () => {
  it("non espone librerie che toccano il mondo esterno", async () => {
    const script = await create(`
      function onSpin(spin)
        local found = {}
        for _, name in ipairs({ "io", "os", "package", "require", "load", "loadfile", "dofile", "debug", "coroutine" }) do
          if _G[name] ~= nil then found[#found + 1] = name end
        end
        if #found > 0 then error("visibili: " .. table.concat(found, ", ")) end
        if string.dump ~= nil or math.randomseed ~= nil then error("string.dump o math.randomseed visibili") end
      end
    `);
    expect(() => playRound(math, createRng(1), script)).not.toThrow();
  });

  it("ferma i cicli infiniti con un errore leggibile", async () => {
    const script = await create("function onSpin() while true do end end");
    expect(() => playRound(math, createRng(1), script)).toThrow(/onSpin: .*troppe istruzioni/);
  });

  it("segnala gli errori di sintassi e gli script senza hook al caricamento", async () => {
    await expect(create("function onSpin(")).rejects.toThrow(ModuleError);
    await expect(create("x = 1")).rejects.toThrow(/nessun hook/);
    await expect(create('spinModes = { "turbo" } function onSpin() end')).rejects.toThrow(/spinModes: .*turbo/);
  });

  it("math.random usa l'RNG del round, quindi è ripetibile", async () => {
    const source = `
      function onSpin(spin)
        if spin.mode == "base" then return { mode = "gold", spins = math.random(3) } end
      end
    `;
    const counts = async (seed: number) => {
      const script = await create(source);
      const rng = createRng(seed);
      return Array.from({ length: 20 }, () => playRound(math, rng, script).extra[0]!.spins.length);
    };
    const first = await counts(7);
    expect(await counts(7)).toEqual(first);
    expect(new Set(first).size).toBeGreaterThan(1);
    expect(first.every((n) => n >= 1 && n <= 3)).toBe(true);
  });

  it("non permette math.random fuori da un round", async () => {
    await expect(create("local x = math.random(2) function onSpin() end")).rejects.toThrow(/solo durante un round/);
  });
});

describe("hook nel round", () => {
  it("round è una tabella nuova a ogni round", async () => {
    const script = await create(`
      function onSpin(spin)
        round.n = (round.n or 0) + 1
        if round.n > 1 then error("stato rimasto dal round precedente") end
      end
    `);
    const rng = createRng(3);
    for (let i = 0; i < 5; i++) playRound(math, rng, script);
  });

  it("le sequenze richieste si giocano dopo lo spin base, con i dati di ogni spin", async () => {
    const script = await create(`
      function onSpin(spin)
        if spin.mode == "base" then return { mode = "gold", spins = 2 } end
        round.seen = (round.seen or "") .. spin.mode .. spin.index .. ":" .. spin.win .. " "
      end
      function onFeatureEnd(feature)
        if feature.mode == "gold" and feature.spins ~= 2 then error("riassunto sbagliato") end
        if round.seen ~= "gold1:10 gold2:10 " then error(round.seen) end
      end
    `);
    // Spin base A B S senza vincite, poi due spin gold.
    const round = playRound(math, scriptedRng([0, 1, 2, 0, 0, 0, 0, 0, 0]), script);
    expect(round.base.win).toBe(0);
    expect(round.extra).toHaveLength(1);
    expect(round.extra[0]!.mode).toBe("gold");
    expect(round.extra[0]!.win).toBe(20);
    expect(round.totalWin).toBe(20);
  });

  it("guaranteeWin rigioca gli spin finché non vincono", async () => {
    const script = await create(`
      function onSpin(spin)
        if not round.asked then
          round.asked = true
          return { mode = "base", spins = 1, guaranteeWin = true }
        end
      end
    `);
    // Base: A B S, nessuna vincita. Sequenza: A B S e B A S scartati, poi B B B che paga 5.
    const round = playRound(math, scriptedRng([0, 1, 2, 0, 1, 2, 1, 0, 2, 1, 1, 1]), script);
    expect(round.extra[0]!.spins).toHaveLength(1);
    expect(round.extra[0]!.spins[0]!.win).toBe(5);
  });

  it("il moltiplicatore della sequenza vale per ogni spin e arriva allo script", async () => {
    const script = await create(`
      function onSpin(spin)
        if spin.mode == "base" then return { mode = "gold", spins = 2, multiplier = 3 } end
        round.seen = (round.seen or "") .. spin.multiplier .. ":" .. spin.win .. " "
      end
      function onFeatureEnd(feature)
        if feature.multiplier ~= 3 or round.seen ~= "3:30 3:30 " then error(round.seen) end
      end
    `);
    const round = playRound(math, scriptedRng([0, 1, 2, 0, 0, 0, 0, 0, 0]), script);
    expect(round.extra[0]!.multiplier).toBe(3);
    expect(round.extra[0]!.spins.map((s) => s.win)).toEqual([30, 30]);
    expect(round.totalWin).toBe(60);
  });

  it("rifiuta le richieste non valide", async () => {
    const bad = async (ret: string) => {
      const script = await create(`function onSpin(spin) if spin.mode == "base" then return ${ret} end end`);
      return () => playRound(math, createRng(1), script);
    };
    expect(await bad('{ mode = "turbo", spins = 1 }')).toThrow(ScriptError);
    expect(await bad('{ mode = "gold", spins = 1.5 }')).toThrow(/spins non valido/);
    expect(await bad("42")).toThrow(/ha restituito number/);
    expect(await bad('{ mode = "gold", spins = 1, multiplier = 0 }')).toThrow(/multiplier deve essere un numero tra 1 e 1000/);
  });

  it("spinModes limita le chiamate di onSpin", async () => {
    const script = await create(`
      spinModes = { "gold" }
      function onSpin(spin)
        if spin.mode ~= "gold" then error("chiamato in " .. spin.mode) end
      end
    `);
    const rng = createRng(4);
    for (let i = 0; i < 20; i++) playRound(math, rng, script);
  });
});

describe("Gold Spins del Tempio del Sole", async () => {
  const module = await loadSlotModule("slots/tempio-del-sole");
  const script = await ScriptRuntime.create(module.math, module.script!);

  it("lo script c'è e definisce gli hook", () => {
    expect(script.hooks).toEqual(["onSpin", "onFeatureEnd"]);
  });

  it("i Gold Spin arrivano solo dopo i free spin, sui rulli gold, e vincono sempre", () => {
    const rng = createRng(11);
    let sequences = 0;
    for (let i = 0; i < 20_000; i++) {
      const round = playRound(module.math, rng, script);
      for (const sequence of round.extra) {
        sequences++;
        expect(round.freeSpins).not.toBeNull();
        expect(sequence.mode).toBe("gold");
        for (const spin of sequence.spins) {
          expect(spin.win).toBeGreaterThan(0);
          expect(spin.grid.flat().every((s) => ["FARAONE", "ANKH", "SCARABEO", "GATTO"].includes(s))).toBe(true);
        }
      }
    }
    expect(sequences).toBeGreaterThan(10);
  });

  it("la simulazione con lo script è ripetibile", () => {
    const a = simulate(module.math, { spins: 5_000, seed: 9, hooks: script });
    const b = simulate(module.math, { spins: 5_000, seed: 9, hooks: script });
    expect(a).toEqual(b);
  });
});
