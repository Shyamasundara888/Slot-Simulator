import { describe, expect, it } from "vitest";
import {
  addSymbol,
  checkDraft,
  draftFromFiles,
  draftZip,
  freeSymbolId,
  moveSymbol,
  removeSymbol,
  renameSymbol,
  resizeGrid,
  setLinePay,
  setScatterPay,
  setSymbolKind,
} from "../src/edit/draft.js";
import { readModuleDir } from "../src/module/load.js";
import { assetPaths, decodeModuleFiles, parseModuleZip } from "../src/module/zip.js";

async function open(dir: string) {
  const raw = await readModuleDir(dir);
  return { draft: draftFromFiles(decodeModuleFiles(raw)), assets: assetPaths(raw) };
}

describe("bozza di un modulo", () => {
  it("si apre e si valida come il modulo da cui parte", async () => {
    const { draft, assets } = await open("slots/tempio-del-sole");
    const { module, problems } = checkDraft(draft, assets);
    expect(problems).toEqual([]);
    expect(module?.manifest.id).toBe("tempio-del-sole");
    expect(draft.script).toContain("onSpin");
  });

  it("rinomina un simbolo in tutti i file", async () => {
    const { draft, assets } = await open("slots/tempio-del-sole");
    renameSymbol(draft, "GATTO", "MICIO");
    expect(checkDraft(draft, assets).problems).toEqual([]);
    const text = JSON.stringify([draft.paytable, draft.reels, draft.features, draft.scene, draft.extra]);
    expect(text).not.toContain("GATTO");
    expect(Object.keys(draft.paytable.linePays)).toContain("MICIO");
    expect(Object.keys(draft.scene.symbols!).indexOf("MICIO")).toBeGreaterThan(0);
  });

  it("aggiunge, sposta e toglie simboli", async () => {
    const { draft } = await open("templates/slot-base");
    const id = freeSymbolId(draft);
    expect(id).toBe("S1");
    addSymbol(draft, id);
    moveSymbol(draft, id, -1);
    expect(draft.paytable.symbols.at(-2)!.id).toBe("S1");
    expect(checkDraft(draft).problems).toEqual([]);
    removeSymbol(draft, "L4");
    expect(checkDraft(draft).problems).toEqual([]);
    expect(draft.reels.modes.base.flat()).not.toContain("L4");
    expect(draft.scene.symbols!.L4).toBeUndefined();
  });

  it("cambia i pagamenti", async () => {
    const { draft } = await open("templates/slot-base");
    const before = checkDraft(draft).module!.math.linePays.get("H1")![5];
    setLinePay(draft, "H1", 5, before! * 2);
    setLinePay(draft, "H1", 2, 1);
    setLinePay(draft, "L4", 3, null);
    expect(draft.paytable.linePays.H1).toEqual({ "2": 1, "3": 40, "4": 150, "5": 1000 });
    expect(draft.paytable.linePays.L4).toEqual({ "4": 15, "5": 50 });
    setScatterPay(draft, 3, 0);
    expect(draft.paytable.scatterPays).toEqual({ "4": 10, "5": 50 });
    expect(checkDraft(draft).problems).toEqual([]);
  });

  it("uno scatter perde i pagamenti su linea, e i problemi arrivano dal motore", async () => {
    const { draft } = await open("templates/slot-base");
    setSymbolKind(draft, "H1", "scatter");
    expect(draft.paytable.linePays.H1).toBeUndefined();
    expect(checkDraft(draft).problems).toEqual(["paytable: al massimo uno scatter, trovati SCATTER, H1"]);
  });

  it("cambia la griglia restando valida", async () => {
    const { draft } = await open("templates/slot-base");
    resizeGrid(draft, 6, 4);
    expect(checkDraft(draft).problems).toEqual([]);
    expect(draft.lines.lines.every((line) => line.length === 6)).toBe(true);
    resizeGrid(draft, 3, 1);
    expect(checkDraft(draft).problems).toEqual([]);
    expect(Object.keys(draft.paytable.linePays.H1!)).toEqual(["3"]);
    expect(draft.features.expandingWild).toBeUndefined();
  });

  it("crea uno zip che il motore accetta", async () => {
    const raw = await readModuleDir("slots/pixel-quest");
    const draft = draftFromFiles(decodeModuleFiles(raw));
    draft.manifest.name = "Pixel Quest modificata";
    const assets = Object.fromEntries(Object.entries(raw).filter(([path]) => path.startsWith("assets/")));
    const { module, raw: unzipped } = parseModuleZip(draftZip(draft, assets));
    expect(module.manifest.name).toBe("Pixel Quest modificata");
    expect(Object.keys(unzipped).some((path) => path.startsWith("art/"))).toBe(false);
    expect(unzipped["scripts/main.lua"]).toBeDefined();
  });
});
