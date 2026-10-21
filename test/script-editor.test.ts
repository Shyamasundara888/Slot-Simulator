import { describe, expect, it } from "vitest";
import { errorLines, nextIndent, tokenize, tokenLines } from "../app/src/editor/lua.js";
import { en } from "../app/src/i18n/en.js";
import { it as itText } from "../app/src/i18n/it.js";
import { loadSlotModule } from "../src/module/load.js";
import { trialScript } from "../src/script/trial.js";

describe("evidenziazione del Lua", () => {
  it("riconosce parole chiave, hook, stringhe, numeri e commenti senza perdere testo", () => {
    const source = 'spinModes = { "free" } -- solo free\nfunction onSpin(spin)\n  if math.random(5) == 1 then round.gold = 0.5 end\nend\n--[[ lungo\ncommento ]] local s = [[a]]';
    const tokens = tokenize(source);
    expect(tokens.map((t) => t.text).join("")).toBe(source);
    const kinds = (kind: string) => tokens.filter((t) => t.kind === kind).map((t) => t.text);
    expect(kinds("hook")).toEqual(["spinModes", "onSpin", "round"]);
    expect(kinds("keyword")).toEqual(["function", "if", "then", "end", "end", "local"]);
    expect(kinds("string")).toEqual(['"free"', "[[a]]"]);
    expect(kinds("number")).toEqual(["5", "1", "0.5"]);
    expect(kinds("builtin")).toEqual(["math"]);
    expect(kinds("comment")).toEqual(["-- solo free", "--[[ lungo\ncommento ]]"]);
    // round.gold: "gold" è un campo, non una parola chiave; "end" dopo un punto neanche.
    expect(tokenize("x.end").map((t) => t.kind)).toEqual(["text"]);
    const lines = tokenLines(source);
    expect(lines).toHaveLength(source.split("\n").length);
    expect(lines[4]!.map((t) => t.kind)).toEqual(["comment"]);
  });

  it("trova le righe negli errori dello script", () => {
    expect(
      errorLines([
        "scripts/main.lua: scripts/main.lua:3: 'end' expected (to close 'function' at line 1) near <eof>",
        "scripts/main.lua: onSpin: scripts/main.lua:12: attempt to perform arithmetic on a nil value",
        "math/reels.json: modes.base: vuoto",
      ]),
    ).toEqual([
      { line: 3, message: "'end' expected (to close 'function' at line 1) near <eof>" },
      { line: 12, message: "attempt to perform arithmetic on a nil value" },
    ]);
  });

  it("rientra dopo l'apertura di un blocco", () => {
    expect(nextIndent("  if x then")).toBe("    ");
    expect(nextIndent("function onSpin(spin)")).toBe("  ");
    expect(nextIndent("  return { mode = \"gold\", spins = 1 }")).toBe("  ");
    expect(nextIndent("  if x then y() end")).toBe("  ");
    expect(nextIndent("    x = 1 -- then")).toBe("    ");
  });
});

describe("prova di uno script", () => {
  it("gioca i round di Pixel Quest e conta le sequenze dello script", async () => {
    const module = await loadSlotModule("slots/pixel-quest");
    const trial = await trialScript(module.math, module.script!, 3000, { elements: module.ui.elements });
    expect(trial.problems).toEqual([]);
    expect(trial.failure).toBeNull();
    expect(trial.hooks).toEqual(["onSpin", "onFeatureEnd"]);
    expect(trial.rounds).toBe(3000);
    expect(trial.extraRounds).toBeGreaterThan(0);
  });

  it("dà gli errori di caricamento con la riga", async () => {
    const module = await loadSlotModule("templates/slot-base");
    const trial = await trialScript(module.math, "function onSpin(spin)\n  if spin.win > 0 then\nend", 10);
    expect(errorLines(trial.problems).map((e) => e.line)).toEqual([3]);
    expect(trial.rounds).toBe(0);
  });

  it("trova il primo round che sbaglia e il suo seed", async () => {
    const module = await loadSlotModule("templates/slot-base");
    const source = "function onSpin(spin)\n  if spin.win > 0 then\n    return round.missing + 1\n  end\nend";
    const trial = await trialScript(module.math, source, 1000);
    expect(trial.failure?.seed).toMatch(/^e\d+$/);
    expect(errorLines([trial.failure!.message])).toEqual([{ line: 3, message: expect.stringContaining("nil") }]);
    // Lo stesso seed dà lo stesso errore.
    const again = await trialScript(module.math, source, 1000);
    expect(again.failure).toEqual(trial.failure);
  });

  it("lo script di partenza dell'editor si carica e non chiede sequenze", async () => {
    const module = await loadSlotModule("templates/slot-base");
    for (const starter of [itText["editor.script.starter"], en["editor.script.starter"]]) {
      const trial = await trialScript(module.math, starter, 500);
      expect(trial).toMatchObject({ problems: [], failure: null, hooks: ["onSpin", "onFeatureEnd"], rounds: 500, extraRounds: 0 });
    }
  });
});
