import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ModuleError } from "../src/module/build.js";
import { loadSlotModule, readModuleDir } from "../src/module/load.js";
import { parseSlotModule, sceneAssets } from "../src/module/parse.js";
import { assetPaths, parseModuleZip, readModuleZip, unpackModuleZip, writeModuleZip, ZIP_LIMITS } from "../src/module/zip.js";
import { ScriptRuntime } from "../src/script/runtime.js";
import { simulate } from "../src/sim/simulate.js";

const json = (value: unknown) => strToU8(JSON.stringify(value));
const tiny = {
  "manifest.json": json({ id: "prova", name: "Prova", version: "1", engineApi: 1 }),
  "math/reels.json": json({ rows: 1, modes: { base: [["A"], ["A"], ["A"]] } }),
  "math/lines.json": json({ lines: [[0, 0, 0]] }),
  "math/paytable.json": json({ symbols: [{ id: "A", kind: "normal" }], linePays: { A: { "3": 1 } } }),
};

describe("mod in zip", () => {
  it("lo zip creato da un modulo si rilegge identico", async () => {
    const fromDisk = await readModuleDir("slots/tempio-del-sole");
    // readFile restituisce Buffer: per il confronto servono Uint8Array semplici.
    const raw = Object.fromEntries(Object.entries(fromDisk).map(([name, bytes]) => [name, new Uint8Array(bytes)]));
    const zip = writeModuleZip(raw);
    // Confronto per impronta: un toEqual byte per byte sulle immagini è molto lento.
    const digest = (files: Record<string, Uint8Array>) =>
      Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, createHash("sha256").update(bytes).digest("hex")]));
    expect(digest(unpackModuleZip(zip))).toEqual(digest(raw));
    // Stesso modulo, stesso zip byte per byte.
    expect(Buffer.from(writeModuleZip(raw)).equals(zip)).toBe(true);
    const module = parseSlotModule(readModuleZip(zip));
    expect(module.manifest.id).toBe("tempio-del-sole");
    expect(module.script).toContain("onFeatureEnd");
  });

  it("accetta i file dentro una sola cartella e ignora i file di sistema", () => {
    const nested = Object.fromEntries(Object.entries(tiny).map(([name, bytes]) => [`prova/${name}`, bytes]));
    const zip = zipSync({ ...nested, "prova/readme.txt": strToU8("ciao"), "__MACOSX/prova/._manifest.json": strToU8("x") });
    const files = readModuleZip(zip);
    expect(Object.keys(files).sort()).toEqual(Object.keys(tiny).sort());
    expect(parseSlotModule(files).manifest.name).toBe("Prova");
  });

  it("rifiuta percorsi che escono dalla cartella del modulo", () => {
    const zip = zipSync({ ...tiny, "../fuori.json": strToU8("{}") });
    expect(() => readModuleZip(zip)).toThrow(/percorso non ammesso \.\.\/fuori.json/);
  });

  it("spiega cosa non va negli zip sbagliati", () => {
    expect(() => readModuleZip(strToU8("non sono uno zip"))).toThrow(ModuleError);
    expect(() => readModuleZip(zipSync({ "math/lines.json": tiny["math/lines.json"] }))).toThrow(/manca manifest.json/);
    expect(() => readModuleZip(zipSync({ ...tiny, "math/lines.json": strToU8("{ rotto") }))).toThrow(
      /math\/lines.json: JSON non valido/,
    );
    const many = Object.fromEntries(Array.from({ length: ZIP_LIMITS.entries + 1 }, (_, i) => [`f${i}.txt`, strToU8("")]));
    expect(() => readModuleZip(zipSync({ ...tiny, ...many }))).toThrow(/più di 500 file/);
  });
});

describe("Pixel Quest", async () => {
  const module = await loadSlotModule("slots/pixel-quest");
  const hooks = await ScriptRuntime.create(module.math, module.script!, { elements: module.ui.elements, choice: "random" });

  it("è una 5x4 a 20 linee con modalità boss", () => {
    expect(module.math.reelCount).toBe(5);
    expect(module.math.rows).toBe(4);
    expect(module.math.lines).toHaveLength(20);
    expect(module.math.reels.boss).toHaveLength(5);
  });

  it("i Boss Spin arrivano dopo i free spin e vincono sempre", () => {
    const result = simulate(module.math, { spins: 20_000, seed: 4, hooks });
    expect(result.extra.boss?.sequences).toBeGreaterThan(10);
    expect(result.rtp).toBeGreaterThan(0.8);
    expect(result.rtp).toBeLessThan(1.1);
  });
});

describe("asset dei moduli", () => {
  const scene = (value: unknown) => ({ ...tiny, "scenes/main.json": json(value) });
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const symbolA = (style: object) => ({ A: { label: "A", color: "#888888", ...style } });

  it("lo zip porta con sé gli asset usati dalla scena", () => {
    const zip = zipSync({
      ...scene({ backgroundImage: "assets/sfondo.png", symbols: symbolA({ image: "assets/a.png", winFrames: ["assets/a.png"] }) }),
      "assets/sfondo.png": png,
      "assets/a.png": png,
    });
    const { module, raw } = parseModuleZip(zip);
    expect(assetPaths(raw).sort()).toEqual(["assets/a.png", "assets/sfondo.png"]);
    expect(raw["assets/a.png"]).toEqual(png);
    expect(sceneAssets(module.scene).sort()).toEqual(["assets/a.png", "assets/sfondo.png"]);
    expect(module.scene.symbols.get("A")).toMatchObject({ image: "assets/a.png", fps: 8 });
  });

  it("segnala gli asset che mancano", () => {
    const zip = zipSync({
      ...scene({ sounds: { win: "assets/vinci.wav" }, symbols: symbolA({ image: "assets/a.png" }) }),
      "assets/a.png": png,
    });
    expect(() => parseModuleZip(zip)).toThrow(/asset mancante assets\/vinci.wav/);
  });

  it("accetta solo percorsi in assets/ con un formato conosciuto", () => {
    for (const image of ["sfondo.png", "assets/../manifest.json", "assets/a.exe", "assets/a b.png"]) {
      expect(() => parseModuleZip(zipSync(scene({ symbols: symbolA({ image }) })))).toThrow(ModuleError);
    }
    expect(() => parseModuleZip(zipSync(scene({ sounds: { jackpot: "assets/a.wav" } })))).toThrow(ModuleError);
  });

  it("Pixel Quest ha immagini, frame di vincita e suoni", async () => {
    const raw = await readModuleDir("slots/pixel-quest");
    const module = await loadSlotModule("slots/pixel-quest");
    const used = sceneAssets(module.scene);
    expect(used.every((path) => path in raw)).toBe(true);
    expect(module.scene.backgroundImage).toBe("assets/background.svg");
    expect(Object.keys(module.scene.sounds).sort()).toEqual(["bigWin", "feature", "spin", "stop", "win"]);
    for (const [, style] of module.scene.symbols) expect(style.winFrames).toHaveLength(3);
  });
});
