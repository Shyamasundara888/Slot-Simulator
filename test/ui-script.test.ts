import { describe, expect, it } from "vitest";
import { playRound } from "../src/core/engine.js";
import { createRng } from "../src/core/rng.js";
import { loadSlotModule } from "../src/module/load.js";
import { ScriptRuntime, spinCells } from "../src/script/runtime.js";
import { simulate } from "../src/sim/simulate.js";
import { scriptedRng, tinyMath } from "./helpers.js";

const strips = [["A", "B", "S"], ["A", "B", "S"], ["A", "B", "S"]];
const gold = [["A"], ["A"], ["A"]];
const math = tinyMath(strips, 1, [[0, 0, 0]], {}, undefined, { gold });
const create = (source: string, recordUi = true) => ScriptRuntime.create(math, source, { elements: ["barra", "intro"], recordUi });

describe("API ui degli script", () => {
  it("annota le richieste sullo spin e sulla fine della sequenza", async () => {
    const script = await create(`
      function onSpin(spin)
        ui.add("raccolta", 2, { from = { reel = 3, row = 1 } })
        ui.add("raccolta", 1)
        if spin.mode == "base" then
          ui.show("intro"); ui.fx("barra", "shake"); ui.message("Via!")
          return { mode = "gold", spins = 1 }
        end
        ui.hide("intro")
      end
      function onFeatureEnd(f) ui.set("fine", ui.get("raccolta") * 10) end
    `);
    const round = playRound(math, scriptedRng([0, 0, 0, 0, 0, 0]), script);
    expect(round.base.ui).toEqual([
      { kind: "set", name: "raccolta", value: 2, from: { reel: 2, row: 0 } },
      { kind: "set", name: "raccolta", value: 3, from: null },
      { kind: "show", id: "intro" },
      { kind: "fx", id: "barra", effect: "shake" },
      { kind: "message", text: "Via!" },
    ]);
    expect(round.extra[0]!.spins[0]!.ui).toEqual([
      { kind: "set", name: "raccolta", value: 5, from: { reel: 2, row: 0 } },
      { kind: "set", name: "raccolta", value: 6, from: null },
      { kind: "hide", id: "intro" },
    ]);
    expect(round.extra[0]!.endUi).toEqual([{ kind: "set", name: "fine", value: 60, from: null }]);
  });

  it("i valori ripartono da zero a ogni round", async () => {
    const script = await create(`function onSpin(spin) ui.add("n", 1) end`);
    const rng = createRng(1);
    expect(playRound(math, rng, script).base.ui).toEqual([{ kind: "set", name: "n", value: 1, from: null }]);
    expect(playRound(math, rng, script).base.ui).toEqual([{ kind: "set", name: "n", value: 1, from: null }]);
  });

  it("senza richieste lo spin resta com'era, e il simulatore può non registrarle", async () => {
    const quiet = await create(`function onSpin(spin) end`);
    expect(playRound(math, createRng(1), quiet).base).not.toHaveProperty("ui");
    const unrecorded = await create(`function onSpin(spin) ui.add("n", 1) end`, false);
    expect(playRound(math, createRng(1), unrecorded).base).not.toHaveProperty("ui");
  });

  it("non cambia l'esito dei round", async () => {
    const plain = await create(`function onSpin(spin) if math.random(4) == 1 then return { mode = "gold", spins = 1 } end end`);
    const withUi = await create(`function onSpin(spin) if math.random(4) == 1 then ui.message("bonus") return { mode = "gold", spins = 1 } end end`);
    const a = simulate(math, { spins: 2_000, seed: 3, hooks: plain });
    const b = simulate(math, { spins: 2_000, seed: 3, hooks: withUi });
    expect(b.rtp).toBe(a.rtp);
  });

  it.each([
    [`function onSpin(s) ui.show("boh") end`, /scripts\/main\.lua:1: ui\.show: elemento sconosciuto boh/],
    [`function onSpin(s) ui.fx("barra", "esplodi") end`, /ui\.fx: effetto sconosciuto esplodi/],
    [`function onSpin(s) ui.set("Oro", 1) end`, /ui\.set: nome non valido Oro/],
    [`function onSpin(s) ui.add("oro", "uno") end`, /ui\.add: serve un numero/],
    [`function onSpin(s) ui.set("oro", 1, { from = { reel = 4, row = 1 } }) end`, /scripts\/main\.lua:1: ui\.set: from deve essere una cella \{ reel = 1\.\.3, row = 1\.\.1 \}/],
    [`function onSpin(s) ui.message("") end`, /ui\.message: serve un testo/],
  ])("segnala gli usi sbagliati con la riga: %s", async (source, error) => {
    const script = await create(source);
    expect(() => playRound(math, createRng(1), script)).toThrow(error);
  });

  it("non si usa fuori dagli hook", async () => {
    await expect(create(`ui.set("a", 1) function onSpin() end`)).rejects.toThrow(/ui\.set si può usare solo dentro gli hook/);
  });

  it("passa agli script le celle di wild, wild espansi e scatter", async () => {
    const wildMath = tinyMath(
      [["A", "W", "B"], ["W", "B", "A"], ["S", "A", "B"]],
      2,
      [[0, 0, 0]],
      { expandingWild: { reels: [2] } },
    );
    const spin = playRound(wildMath, scriptedRng([0, 0, 0])).base;
    expect(spinCells(wildMath, spin)).toEqual({
      wild: [{ reel: 0, row: 1 }, { reel: 1, row: 0 }],
      expanded: [{ reel: 1, row: 0 }],
      scatter: [{ reel: 2, row: 0 }],
    });
    const script = await ScriptRuntime.create(
      wildMath,
      `function onSpin(s) local c = s.expandedCells[1] ui.set("x", c.reel * 10 + c.row) ui.set("w", #s.wildCells) ui.set("s", #s.scatterCells) end`,
    );
    expect(playRound(wildMath, scriptedRng([0, 0, 0]), script).base.ui?.map((e) => e.kind === "set" && e.value)).toEqual([21, 2, 1]);
  });

  it("le slot di esempio usano solo elementi che esistono", async () => {
    for (const dir of ["slots/tempio-del-sole", "slots/pixel-quest"]) {
      const module = await loadSlotModule(dir);
      const hooks = await ScriptRuntime.create(module.math, module.script!, { elements: module.ui.elements.map((e) => e.id) });
      const rng = createRng(7);
      for (let i = 0; i < 3_000; i++) playRound(module.math, rng, hooks);
    }
  });
});
