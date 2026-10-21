import { describe, expect, it } from "vitest";
import { draftFromFiles, draftToFiles } from "../src/edit/draft.js";
import { ModuleError } from "../src/module/build.js";
import { loadSlotModule, readModuleDir } from "../src/module/load.js";
import { parseSlotModule } from "../src/module/parse.js";
import { DEFAULT_STAGE, uiAssets } from "../src/module/ui.js";
import { decodeModuleFiles } from "../src/module/zip.js";
import { formatTemplate, initialValues, ladderIndex, unknownPlaceholders } from "../src/ui/values.js";

const base = {
  "manifest.json": { id: "prova", name: "Prova", version: "1", engineApi: 1 },
  "math/reels.json": { rows: 1, modes: { base: [["A"], ["A"], ["A"]], gold: [["A"], ["A"], ["A"]] } },
  "math/lines.json": { lines: [[0, 0, 0]] },
  "math/paytable.json": { symbols: [{ id: "A", kind: "normal" }], linePays: { A: { "3": 1 } } },
};

const problems = (ui: unknown, assets: string[] = []) => {
  try {
    parseSlotModule({ ...base, "scenes/ui.json": ui }, assets);
    return [];
  } catch (err) {
    expect(err).toBeInstanceOf(ModuleError);
    return (err as ModuleError).problems;
  }
};

describe("valori dell'interfaccia", () => {
  it("sostituisce i segnaposto e lascia quelli sconosciuti", () => {
    const values = { ...initialValues(2, 5000), "free.remaining": 7, "free.total": 10 };
    const show = (_: string, n: number) => String(n);
    expect(formatTemplate("{value} / {free.total}", values, "free.remaining", show)).toBe("7 / 10");
    expect(formatTemplate("fino a {maxWin}× {boh}", values, null, show)).toBe("fino a 5000× {boh}");
    expect(unknownPlaceholders("{value} {bet} {boh}", true)).toEqual(["boh"]);
    expect(unknownPlaceholders("{value}", false)).toEqual(["value"]);
  });

  it("parte senza bonus, con moltiplicatore 1 e senza tetto se manca maxWin", () => {
    const values = initialValues(1, Number.POSITIVE_INFINITY);
    expect(values).toMatchObject({ multiplier: 1, bet: 1, maxWin: 0, "free.remaining": 0, "win.round": 0 });
  });

  it("accende il gradino giusto di una scala", () => {
    expect(ladderIndex(["GATTO", "SCARABEO", "ANKH", "FARAONE"], 0)).toBe(0);
    expect(ladderIndex(["GATTO", "SCARABEO", "ANKH", "FARAONE"], 2)).toBe(2);
    expect(ladderIndex(["GATTO", "SCARABEO"], 9)).toBe(1);
    expect(ladderIndex(["×1", "×2", "×5", "×10"], 7)).toBe(2);
    expect(ladderIndex(["2", "5"], 1)).toBe(-1);
  });
});

describe("scenes/ui.json", () => {
  it("senza file lo stage resta quello delle prime slot", () => {
    const module = parseSlotModule(base);
    expect(module.ui).toEqual({ stage: DEFAULT_STAGE, reels: null, elements: [] });
  });

  it("carica layout ed elementi del Tempio del Sole", async () => {
    const { ui } = await loadSlotModule("slots/tempio-del-sole");
    expect(ui.stage).toEqual({ width: 1060, height: 568 });
    expect(ui.reels).toEqual({ x: 150, y: 92, width: 760, height: 448 });
    expect(ui.elements.map((e) => e.id)).toContain("moltiplicatore");
    expect(ui.elements.find((e) => e.id === "giri")).toMatchObject({ layer: "above", onChange: "pop" });
  });

  it("elenca tutti i problemi di coerenza", () => {
    const found = problems({
      stage: { width: 400, height: 300 },
      reels: { x: 0, y: 0, width: 500, height: 100 },
      elements: [
        { id: "a", type: "counter", x: 0, y: 0, width: 50, height: 50, value: "bet", format: "{boh}" },
        { id: "a", type: "text", x: 380, y: 0, width: 50, height: 50, text: "{value}" },
        { id: "b", type: "meter", x: 0, y: 0, width: 50, height: 50, value: "level", max: 80, style: "segments", visibleIn: ["boss"] },
        { id: "c", type: "image", x: 0, y: 0, width: 50, height: 50 },
      ],
    }).join("\n");
    expect(found).toContain("scenes/ui.json: reels: il riquadro dei rulli esce dallo stage 400x300");
    expect(found).toContain("elemento a: format usa un segnaposto sconosciuto {boh}");
    expect(found).toContain("elemento a: id ripetuto");
    expect(found).toContain("elemento a: esce dallo stage");
    expect(found).toContain("elemento a: text usa un segnaposto sconosciuto {value}");
    expect(found).toContain("elemento b: visibleIn cita una modalità senza strisce dei rulli boss");
    expect(found).toContain("max può arrivare al più a 50");
    expect(found).toContain("elemento c: serve image oppure frames");
  });

  it("rifiuta valori e campi sconosciuti", () => {
    const found = problems({
      elements: [{ id: "a", type: "counter", x: 0, y: 0, width: 50, height: 50, value: "soldi", colour: "#fff" }],
    }).join("\n");
    expect(found).toContain("valore sconosciuto");
    expect(found).toContain("colour");
  });

  it("controlla che gli asset degli elementi esistano", () => {
    const ui = {
      elements: [
        { id: "logo", type: "image", x: 0, y: 0, width: 50, height: 50, image: "assets/ui/logo.webp", sound: "assets/ui/ding.wav" },
      ],
    };
    expect(problems(ui, ["assets/ui/logo.webp"])).toEqual(["scenes/ui.json: asset mancante assets/ui/ding.wav"]);
    expect(problems(ui, ["assets/ui/logo.webp", "assets/ui/ding.wav"])).toEqual([]);
    expect(uiAssets(parseSlotModule({ ...base, "scenes/ui.json": ui }).ui)).toEqual(["assets/ui/ding.wav", "assets/ui/logo.webp"]);
  });

  it("la bozza dell'editor conserva scenes/ui.json", async () => {
    const files = decodeModuleFiles(await readModuleDir("slots/tempio-del-sole"));
    const out = draftToFiles(draftFromFiles(files));
    expect(out["scenes/ui.json"]).toEqual(files["scenes/ui.json"]);
    expect(draftToFiles(draftFromFiles(base))["scenes/ui.json"]).toBeUndefined();
  });
});
