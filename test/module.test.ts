import { describe, expect, it } from "vitest";
import { buildSlotMath, ModuleError } from "../src/module/build.js";
import { loadSlotModule } from "../src/module/load.js";
import { parseSlotModule } from "../src/module/parse.js";

describe("moduli", () => {
  it("carica il modulo di esempio", async () => {
    const { manifest, math } = await loadSlotModule("slots/tempio-del-sole");
    expect(manifest.id).toBe("tempio-del-sole");
    expect(math.reelCount).toBe(5);
    expect(math.rows).toBe(3);
    expect(math.lines).toHaveLength(10);
    expect(math.wild).toBe("SOLE");
    expect(math.scatter?.symbol).toBe("PORTALE");
  });

  it("elenca tutti i problemi di coerenza in un solo errore", () => {
    try {
      buildSlotMath(
        { rows: 3, modes: { base: [["A", "X"], ["A", "A", "A"]] } },
        { lines: [[0, 5]] },
        { symbols: [{ id: "A", kind: "normal" }], linePays: { A: { "3": 1 }, Z: { "2": 1 } } },
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ModuleError);
      const problems = (err as ModuleError).problems.join("\n");
      expect(problems).toContain("meno delle 3 righe");
      expect(problems).toContain("simbolo non definito X");
      expect(problems).toContain("riga oltre");
      expect(problems).toContain("fuori da 1..2");
      expect(problems).toContain("linePays: simbolo non definito Z");
    }
  });
});

describe("scena", () => {
  it("usa colori ed etichette della scena e completa i simboli mancanti", async () => {
    const { scene } = await loadSlotModule("slots/tempio-del-sole");
    expect(scene.symbols.get("SOLE")).toMatchObject({ label: "Sole", color: "#f5b301" });
    expect(scene.symbols.get("A")).toMatchObject({ label: "A", color: "#5f3dc4" });
    expect(scene.symbols.size).toBe(11);
  });

  it("senza scena assegna colori predefiniti e segnala i simboli sconosciuti", async () => {
    const files = {
      "manifest.json": { id: "prova", name: "Prova", version: "1", engineApi: 1 },
      "math/reels.json": { rows: 1, modes: { base: [["A"], ["A"], ["A"]] } },
      "math/lines.json": { lines: [[0, 0, 0]] },
      "math/paytable.json": { symbols: [{ id: "A", kind: "normal" }], linePays: { A: { "3": 1 } } },
    };
    const { scene } = parseSlotModule(files);
    expect(scene.symbols.get("A")?.label).toBe("A");
    expect(scene.background).toMatch(/^#/);
    expect(() => parseSlotModule({ ...files, "scenes/main.json": { symbols: { Z: { color: "#000000" } } } })).toThrow(
      /simbolo non definito Z/,
    );
    expect(() => parseSlotModule({ ...files, "math/lines.json": undefined })).toThrow(/math\/lines.json: file mancante/);
  });

  it("accetta modalità aggiunte dal modulo, con nome ed etichetta, e lo script come testo", async () => {
    const { math, scene, script } = await loadSlotModule("slots/tempio-del-sole");
    expect(math.reels.gold).toHaveLength(5);
    expect(scene.modes.get("gold")?.label).toBe("Gold Spin");
    expect(script).toContain("function onFeatureEnd");

    const files = {
      "manifest.json": { id: "prova", name: "Prova", version: "1", engineApi: 1 },
      "math/reels.json": { rows: 1, modes: { base: [["A"], ["A"], ["A"]], bonus: [["A"], ["A"], ["X"]] } },
      "math/lines.json": { lines: [[0, 0, 0]] },
      "math/paytable.json": { symbols: [{ id: "A", kind: "normal" }], linePays: { A: { "3": 1 } } },
    };
    expect(() => parseSlotModule(files)).toThrow(/modalità bonus, il rullo 3 usa il simbolo non definito X/);
    const reels = { rows: 1, modes: { base: [["A"], ["A"], ["A"]], Bonus: [["A"], ["A"], ["A"]] } };
    expect(() => parseSlotModule({ ...files, "math/reels.json": reels })).toThrow(/modes.Bonus: usa lettere minuscole/);
    const scene2 = { modes: { turbo: { label: "Turbo" } } };
    expect(() => parseSlotModule({ ...files, "math/reels.json": { rows: 1, modes: { base: [["A"], ["A"], ["A"]] } }, "scenes/main.json": scene2 })).toThrow(
      /modalità senza strisce dei rulli turbo/,
    );
  });
});
