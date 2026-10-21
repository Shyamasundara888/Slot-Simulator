import { describe, expect, it } from "vitest";
import { attemptRound, playRound } from "../src/core/engine.js";
import { createReplayableRng, createRng } from "../src/core/rng.js";
import { ChoiceNeeded } from "../src/core/types.js";
import { buildUi } from "../src/module/ui.js";
import { loadSlotModule } from "../src/module/load.js";
import { uiElementSchema, uiSchema } from "../src/module/schema.js";
import { ScriptRuntime, spinCells } from "../src/script/runtime.js";
import { simulate } from "../src/sim/simulate.js";
import { scriptedRng, tinyMath } from "./helpers.js";

const strips = [["A", "B", "S"], ["A", "B", "S"], ["A", "B", "S"]];
const gold = [["A"], ["A"], ["A"]];
const math = tinyMath(strips, 1, [[0, 0, 0]], {}, undefined, { gold });
const box = { x: 0, y: 0, width: 10, height: 10 };
const elements = [
  { id: "barra", type: "meter", ...box, value: "script.x", max: 5 },
  { id: "intro", type: "panel", ...box, title: "Intro" },
  { id: "strada", type: "panel", ...box, options: [{ label: "A" }, { label: "B" }, { label: "C" }] },
  { id: "forzieri", type: "picker", ...box, count: 3 },
].map((e) => uiElementSchema.parse(e));
const create = (source: string, recordUi = true, choice?: "random" | number) =>
  ScriptRuntime.create(math, source, { elements, recordUi, ...(choice === undefined ? {} : { choice }) });

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
      const hooks = await ScriptRuntime.create(module.math, module.script!, { elements: module.ui.elements, choice: "random" });
      const rng = createRng(7);
      for (let i = 0; i < 3_000; i++) playRound(module.math, rng, hooks);
    }
  });
});

describe("scelte del giocatore e pick-em", () => {
  // Lo spin base chiede la strada; la risposta decide quanti spin gold seguono.
  const source = `
    function onSpin(spin)
      if spin.mode ~= "base" then return end
      ui.add("prima", math.random(100))
      local c = choose("strada")
      ui.set("scelta", c)
      return { mode = "gold", spins = c }
    end`;

  it("createReplayableRng ripete i valori dopo rewind e poi prosegue", () => {
    const rng = createReplayableRng(createRng(5));
    const first = [rng.int(1000), rng.int(1000), rng.float()];
    rng.rewind();
    expect([rng.int(1000), rng.int(1000), rng.float()]).toEqual(first);
    const reference = createRng(5);
    for (let i = 0; i < 3; i++) reference.nextUint32();
    expect(rng.nextUint32()).toBe(reference.nextUint32());
  });

  it("senza risposta il round si ferma sulla scelta; con la risposta si rigioca uguale fino a lì", async () => {
    const script = await create(source);
    const rng = createReplayableRng(createRng(9));
    const stopped = attemptRound(math, rng, script);
    expect(stopped.choice).toEqual({ id: "strada", options: 3, at: "spin" });
    expect(stopped.round.extra).toEqual([]);
    expect(stopped.round.base).not.toHaveProperty("ui");

    rng.rewind();
    script.setAnswers([3]);
    const done = attemptRound(math, rng, script);
    expect(done.choice).toBeNull();
    expect(done.round.base.reelGrid).toEqual(stopped.round.base.reelGrid);
    expect(done.round.extra[0]!.spins).toHaveLength(3);
    expect(done.round.base.ui?.[1]).toEqual({ kind: "set", name: "scelta", value: 3, from: null });

    // La stessa risposta dà lo stesso round, compreso il valore estratto dallo script prima della scelta.
    rng.rewind();
    script.setAnswers([3]);
    expect(attemptRound(math, rng, script).round).toEqual(done.round);
  });

  it("playRound segnala la scelta in attesa; con la regola choice risponde da solo", async () => {
    expect(() => playRound(math, createRng(1), undefined)).not.toThrow();
    const waiting = await create(source);
    expect(() => playRound(math, createRng(1), waiting)).toThrow(ChoiceNeeded);
    const second = await create(source, true, 2);
    expect(playRound(math, createRng(1), second).extra[0]!.spins).toHaveLength(2);
    const random = await create(source, false, "random");
    const { averageSpins } = simulate(math, { spins: 3_000, seed: 2, hooks: random }).extra.gold!;
    expect(averageSpins).toBeGreaterThan(1.8);
    expect(averageSpins).toBeLessThan(2.2);
  });

  it("anche con pcall la scelta in attesa ferma il round", async () => {
    const script = await create(`function onSpin(s) pcall(choose, "strada") end`);
    expect(attemptRound(math, createRng(1), script).choice?.id).toBe("strada");
  });

  it("le scelte possono arrivare anche a fine feature", async () => {
    const script = await create(`
      function onSpin(s) if s.mode == "base" then return { mode = "gold", spins = 1 } end end
      function onFeatureEnd(f) if choose("strada") == 1 then return { mode = "gold", spins = 2 } end end`);
    const rng = createReplayableRng(createRng(4));
    const stopped = attemptRound(math, rng, script);
    expect(stopped.choice?.at).toBe("featureEnd");
    expect(stopped.round.extra).toHaveLength(1);
    rng.rewind();
    script.setAnswers([1, 2]);
    expect(attemptRound(math, rng, script).round.extra.map((e) => e.spins.length)).toEqual([1, 2]);
  });

  it("ui.pick annota i premi da scoprire", async () => {
    const script = await create(`function onSpin(s) ui.pick("forzieri", { "×2", 50 }) end`);
    expect(playRound(math, createRng(1), script).base.ui).toEqual([{ kind: "pick", id: "forzieri", prizes: ["×2", "50"] }]);
  });

  it.each([
    [`function onSpin(s) choose("intro") end`, /choose: intro non è un pannello con options/],
    [`function onSpin(s) ui.pick("barra", { 1 }) end`, /ui\.pick: barra non è un elemento picker/],
    [`function onSpin(s) ui.pick("forzieri", { 1, 2, 3, 4 }) end`, /ui\.pick: servono da 1 a 3 premi/],
    [`function onSpin(s) ui.pick("forzieri", {}) end`, /ui\.pick: servono da 1 a 3 premi/],
  ])("segnala gli usi sbagliati: %s", async (src, error) => {
    const script = await create(src);
    expect(() => playRound(math, createRng(1), script)).toThrow(error);
  });

  it("rifiuta una risposta fuori dalle opzioni", async () => {
    const script = await create(source);
    script.setAnswers([4]);
    expect(() => playRound(math, createRng(1), script)).toThrow(/choose: risposta 4 fuori da 1\.\.3/);
  });

  it("controlla pannelli e pick-em di scenes/ui.json", () => {
    const problems = (elements: unknown[]) => buildUi(uiSchema.parse({ elements }), math).problems;
    expect(problems([{ id: "p", type: "panel", ...box, options: [{ label: "A" }, { label: "B" }], button: "OK" }])).toEqual([
      "elemento p: un pannello ha options oppure button, non tutti e due",
    ]);
    expect(problems([{ id: "p", type: "panel", ...box, text: "{value} {boh}" }])).toEqual([
      "elemento p: text usa un segnaposto sconosciuto {value}",
      "elemento p: text usa un segnaposto sconosciuto {boh}",
    ]);
    expect(() => uiSchema.parse({ elements: [{ id: "p", type: "panel", ...box, options: [{ label: "A" }] }] })).toThrow();
    expect(() => uiSchema.parse({ elements: [{ id: "f", type: "picker", ...box, count: 1 }] })).toThrow();
  });
});

describe("session: stato che resta tra i round", () => {
  const counter = `
    function onSpin(spin)
      if spin.mode ~= "base" then return end
      session.giri = (session.giri or 0) + 1
      if session.giri % 3 == 0 then ui.add("session.monete", 10) end
    end`;

  it("prosegue tra i round, si salva sul risultato e si riprende con setSession", async () => {
    const script = await create(counter);
    const rng = createRng(1);
    const rounds = [1, 2, 3].map(() => playRound(math, rng, script));
    expect(rounds.map((r) => r.session)).toEqual([{ giri: 1 }, { giri: 2 }, { giri: 3, monete: 10 }]);
    expect(rounds[2]!.base.ui).toEqual([
      { kind: "set", name: "session.monete", value: 10, from: null },
      { kind: "set", name: "session.giri", value: 3, from: null },
    ]);
    script.setSession({ giri: 8, monete: 1, nome: "Ada", vip: true });
    expect(playRound(math, rng, script).session).toEqual({ giri: 9, monete: 11, nome: "Ada", vip: true });
    script.setSession(null);
    expect(playRound(math, rng, script).session).toEqual({ giri: 1 });
  });

  it("un round fermato su una scelta non salva niente: il round rigiocato riparte dalla stessa session", async () => {
    const script = await create(`
      function onSpin(spin)
        if spin.mode ~= "base" then return end
        session.n = (session.n or 0) + 1
        session.scelta = choose("strada")
      end`);
    script.setSession({ n: 5 });
    const rng = createReplayableRng(createRng(2));
    expect(attemptRound(math, rng, script).choice).not.toBeNull();
    rng.rewind();
    script.setAnswers([2]);
    expect(attemptRound(math, rng, script).round.session).toEqual({ n: 6, scelta: 2 });
  });

  it("nel simulatore prosegue, oppure riparte da zero ogni N round", async () => {
    // Ogni 10 round lo script regala una sequenza gold: con la session azzerata ogni 5 non arriva mai.
    const script = await create(`
      function onSpin(spin)
        if spin.mode ~= "base" then return end
        session.n = (session.n or 0) + 1
        if session.n == 10 then session.n = 0 return { mode = "gold", spins = 1 } end
      end`, false);
    expect(simulate(math, { spins: 1_000, seed: 1, hooks: script }).extra.gold?.sequences).toBe(100);
    expect(simulate(math, { spins: 1_000, seed: 1, hooks: script, sessionReset: 5 }).extra.gold).toBeUndefined();
  });

  it.each([
    [`function onSpin(s) session.x = {} end`, /session\.x: vale table, ma session tiene solo numeri, testi e true\/false/],
    [`function onSpin(s) session.Oro = 1 end`, /session: chiave non valida Oro/],
    [`function onSpin(s) session = 3 end`, /session deve restare una tabella/],
    [`function onSpin(s) for i = 1, 51 do session["k" .. i] = i end end`, /session: troppe voci \(51, al massimo 50\)/],
    [`function onSpin(s) session.t = string.rep("a", 201) end`, /session\.t: testo non valido/],
  ])("segnala le session non valide alla fine del round: %s", async (source, error) => {
    const script = await create(source);
    expect(() => playRound(math, createRng(1), script)).toThrow(error);
  });

  it("gli elementi possono mostrare session.<nome>", () => {
    expect(uiElementSchema.parse({ id: "t", type: "meter", ...box, value: "session.monete", max: 100 })).toMatchObject({ value: "session.monete" });
    expect(() => uiElementSchema.parse({ id: "t", type: "meter", ...box, value: "sessione.monete", max: 100 })).toThrow(/session\.<nome>/);
  });
});
