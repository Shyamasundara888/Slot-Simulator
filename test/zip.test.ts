import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { ModuleError } from "../src/module/build.js";
import { loadSlotModule, readModuleDir } from "../src/module/load.js";
import { parseSlotModule } from "../src/module/parse.js";
import { readModuleZip, unpackModuleZip, writeModuleZip, ZIP_LIMITS } from "../src/module/zip.js";
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
    expect(unpackModuleZip(zip)).toEqual(raw);
    // Stesso modulo, stesso zip byte per byte.
    expect(writeModuleZip(raw)).toEqual(zip);
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
  const hooks = await ScriptRuntime.create(module.math, module.script!);

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
