import { describe, expect, it } from "vitest";
import { checkDraft, draftFromFiles, removeSymbol } from "../src/edit/draft.js";
import {
  addElement,
  duplicateElement,
  moveElement,
  reelsBoxOf,
  removeElement,
  scriptValues,
  setElementBox,
  setElementField,
  setReelsBox,
  setStage,
  stageOf,
  UI_TYPES,
  uiElements,
} from "../src/edit/ui.js";
import { readModuleDir } from "../src/module/load.js";
import { centeredReels, DEFAULT_STAGE } from "../src/module/ui.js";
import { assetPaths, decodeModuleFiles } from "../src/module/zip.js";

async function open(dir: string) {
  const raw = await readModuleDir(dir);
  return { draft: draftFromFiles(decodeModuleFiles(raw)), assets: assetPaths(raw) };
}

describe("elementi di interfaccia nella bozza", () => {
  it("aggiunge elementi validi di ogni tipo, anche a un modulo senza scenes/ui.json", async () => {
    const { draft, assets } = await open("templates/slot-base");
    expect(draft.ui).toBeNull();
    for (const type of UI_TYPES) addElement(draft, type, { image: "assets/ui/logo.png" });
    const { problems } = checkDraft(draft, [...assets, "assets/ui/logo.png"]);
    expect(problems).toEqual([]);
    const elements = uiElements(draft);
    expect(elements.map((e) => e.type)).toEqual([...UI_TYPES]);
    expect(new Set(elements.map((e) => e.id)).size).toBe(UI_TYPES.length);
    for (const e of elements) {
      expect(e.x + e.width).toBeLessThanOrEqual(DEFAULT_STAGE.width);
      expect(e.y + e.height).toBeLessThanOrEqual(DEFAULT_STAGE.height);
    }
  });

  it("un'immagine senza file viene segnalata", async () => {
    const { draft, assets } = await open("templates/slot-base");
    addElement(draft, "image");
    expect(checkDraft(draft, assets).problems).toEqual(["scenes/ui.json: elemento image: serve image oppure frames (uno solo dei due)"]);
  });

  it("duplica, sposta e toglie elementi", async () => {
    const { draft, assets } = await open("slots/pixel-quest");
    const before = uiElements(draft).map((e) => e.id);
    const index = duplicateElement(draft, 0);
    const [original, copy] = [uiElements(draft)[0]!, uiElements(draft)[index]!];
    expect(index).toBe(1);
    expect(copy.id).toBe(`${original.id}-2`);
    expect(copy.x).toBe(original.x + 16);
    expect(duplicateElement(draft, 1)).toBe(2);
    expect(uiElements(draft)[2]!.id).toBe(`${original.id}-3`);
    expect(checkDraft(draft, assets).problems).toEqual([]);
    moveElement(draft, 0, 1);
    expect(uiElements(draft)[1]!.id).toBe(original.id);
    moveElement(draft, 0, -1);
    expect(uiElements(draft)[0]!.id).toBe(copy.id);
    removeElement(draft, 0);
    removeElement(draft, 1);
    expect(uiElements(draft).map((e) => e.id)).toEqual(before);
  });

  it("tiene posizione e misura dentro lo stage", async () => {
    const { draft } = await open("slots/pixel-quest");
    const stage = stageOf(draft);
    setElementBox(draft, 0, { x: stage.width - 10.4, y: -30, width: 120.6, height: 2 });
    expect(uiElements(draft)[0]).toMatchObject({ x: stage.width - 121, y: 0, width: 121, height: 8 });
  });

  it("cambia lo stage, con o senza ridimensionare il resto", async () => {
    const { draft, assets } = await open("slots/pixel-quest");
    const { width, height } = stageOf(draft);
    const reels = reelsBoxOf(draft);
    setStage(draft, width / 2, height / 2, true);
    expect(stageOf(draft)).toEqual({ width: width / 2, height: height / 2 });
    expect(reelsBoxOf(draft).width).toBe(Math.round(reels.width / 2));
    expect(checkDraft(draft, assets).problems).toEqual([]);
    setStage(draft, 400, 300);
    expect(checkDraft(draft, assets).problems.some((p) => p.includes("esce dallo stage"))).toBe(true);
  });

  it("mette i rulli in un riquadro o al centro", async () => {
    const { draft, assets } = await open("slots/pixel-quest");
    setReelsBox(draft, null);
    expect(draft.ui?.reels).toBeUndefined();
    expect(reelsBoxOf(draft)).toEqual(centeredReels(stageOf(draft), 5, 4));
    setReelsBox(draft, { x: 100.2, y: 40, width: 700, height: 460 });
    expect(draft.ui?.reels).toEqual({ x: 100, y: 40, width: 700, height: 460 });
    expect(checkDraft(draft, assets).problems).toEqual([]);
  });

  it("toglie dal file i campi facoltativi lasciati vuoti", async () => {
    const { draft } = await open("slots/pixel-quest");
    setElementField(draft, 0, "label", "");
    setElementField(draft, 0, "visibleIn", []);
    setElementField(draft, 0, "border", undefined);
    expect(uiElements(draft)[0]).not.toHaveProperty("label");
    expect(uiElements(draft)[0]).not.toHaveProperty("visibleIn");
    expect(uiElements(draft)[0]).not.toHaveProperty("border");
    setElementField(draft, 0, "onChange", "shake");
    expect(uiElements(draft)[0]).toMatchObject({ onChange: "shake" });
  });

  it("toglie un simbolo anche dai gradini delle scale", async () => {
    const { draft } = await open("slots/tempio-del-sole");
    removeSymbol(draft, "GATTO");
    const ladder = uiElements(draft).find((e) => e.type === "ladder");
    expect(ladder).toMatchObject({ steps: ["SCARABEO", "ANKH", "FARAONE"] });
  });

  it("trova i valori pubblicati dallo script", async () => {
    const { draft } = await open("slots/pixel-quest");
    const values = scriptValues(draft.script);
    expect(values).toEqual(expect.arrayContaining(["script.combo", "script.boss", "session.forzieri"]));
    expect(scriptValues(null)).toEqual([]);
  });
});
