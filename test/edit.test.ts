import { describe, expect, it } from "vitest";
import {
  addLine,
  addMode,
  addSymbol,
  checkDraft,
  draftFromFiles,
  draftZip,
  duplicateLines,
  freeSymbolId,
  moveSymbol,
  removeLine,
  removeMode,
  removeSymbol,
  renameSymbol,
  resizeGrid,
  setExpandingWild,
  setFreeSpins,
  setFreeSpinsAward,
  setLinePay,
  setLineRow,
  setMaxWin,
  setScatterPay,
  setStrip,
  setSymbolCount,
  setSymbolKind,
  spreadStrip,
  stripCounts,
  toggleExpandingReel,
  updateFreeSpins,
} from "../src/edit/draft.js";
import { exactRtp } from "../src/sim/exact.js";
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
    const text = JSON.stringify([draft.paytable, draft.reels, draft.features, draft.scene, draft.ui, draft.extra]);
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

  it("aggiunge, modifica e toglie linee, segnalando i doppioni", async () => {
    const { draft } = await open("templates/slot-base");
    const lines = draft.lines.lines.length;
    addLine(draft);
    expect(draft.lines.lines.at(-1)).toEqual([1, 1, 1, 1, 1]);
    expect(duplicateLines(draft).get(lines)).toBe(draft.lines.lines.findIndex((l) => l.join() === "1,1,1,1,1"));
    setLineRow(draft, lines, 4, 2);
    setLineRow(draft, lines, 0, 9);
    expect(draft.lines.lines.at(-1)).toEqual([1, 1, 1, 1, 2]);
    removeLine(draft, lines);
    expect(draft.lines.lines).toHaveLength(lines);
    expect(checkDraft(draft).problems).toEqual([]);
  });

  it("distribuisce i simboli sulla striscia senza ammassarli", () => {
    const strip = spreadStrip(new Map([["A", 6], ["B", 3], ["W", 1], ["S", 2]]));
    expect(strip).toHaveLength(12);
    expect(Object.fromEntries(stripCounts(strip))).toEqual({ A: 6, B: 3, W: 1, S: 2 });
    const neighbours = strip.filter((s, i) => s === strip[(i + 1) % strip.length]);
    expect(neighbours).toEqual([]);
    expect(spreadStrip(new Map([["A", 6], ["B", 3], ["W", 1], ["S", 2]]))).toEqual(strip);
  });

  it("cambia i conteggi dei simboli su un rullo e le strisce a mano", async () => {
    const { draft } = await open("templates/slot-base");
    const before = exactRtp(checkDraft(draft).module!.math).baseRtp;
    const counts = stripCounts(draft.reels.modes.base[0]!);
    setSymbolCount(draft, "base", 0, "H1", counts.get("H1")! + 3);
    const after = stripCounts(draft.reels.modes.base[0]!);
    expect(after.get("H1")).toBe(counts.get("H1")! + 3);
    expect(after.get("L4")).toBe(counts.get("L4"));
    expect(exactRtp(checkDraft(draft).module!.math).baseRtp).toBeGreaterThan(before);
    setSymbolCount(draft, "base", 1, "WILD", 0);
    expect(draft.reels.modes.base[1]).not.toContain("WILD");
    setStrip(draft, "base", 2, ["H1", "L1", "DRAG0"]);
    expect(checkDraft(draft).problems).toEqual(["reels: modalità base, il rullo 3 usa il simbolo non definito DRAG0"]);
  });

  it("aggiunge e toglie modalità dei rulli", async () => {
    const { draft } = await open("templates/slot-base");
    addMode(draft, "bonus", "free", "Giri bonus");
    expect(draft.reels.modes.bonus).toEqual(draft.reels.modes.free);
    expect(checkDraft(draft).module?.scene.modes.get("bonus")?.label).toBe("Giri bonus");
    removeMode(draft, "bonus");
    removeMode(draft, "base");
    expect(Object.keys(draft.reels.modes)).toEqual(["base", "free"]);
    expect(checkDraft(draft).problems).toEqual([]);
  });

  it("attiva e cambia le funzioni", async () => {
    const { draft } = await open("templates/slot-base");
    setFreeSpins(draft, false);
    expect(draft.reels.modes.free).toBeUndefined();
    expect(checkDraft(draft).problems).toEqual([]);
    setFreeSpins(draft, true);
    setFreeSpinsAward(draft, 5, 20);
    setFreeSpinsAward(draft, 3, 0);
    expect(draft.features.freeSpins!.trigger.spins).toEqual({ "5": 20 });
    updateFreeSpins(draft, (fs) => (fs.perExpandedWild = { multiplier: 1 }));
    expect(checkDraft(draft).problems).toEqual(["features.freeSpins: il moltiplicatore per wild espanso richiede expandingWild"]);
    setExpandingWild(draft, true);
    expect(draft.features.expandingWild!.reels).toEqual([2, 3, 4]);
    toggleExpandingReel(draft, 3, false);
    expect(draft.features.expandingWild!.reels).toEqual([2, 4]);
    setMaxWin(draft, 2500);
    expect(checkDraft(draft).module?.math.maxWin).toBe(2500);
    updateFreeSpins(draft, (fs) => (fs.perExpandedWild = { multiplier: 0 }));
    expect(draft.features.freeSpins!.perExpandedWild).toBeUndefined();
    setMaxWin(draft, null);
    expect(checkDraft(draft).problems).toEqual([]);
  });
});
