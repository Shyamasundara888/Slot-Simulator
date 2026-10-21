import { describe, expect, it } from "vitest";
import { buildTiles, IMAGE_FOLDER, setBackgroundImage, setMotion, setSound, setSymbolArt, symbolStyle } from "../src/edit/art.js";
import { checkDraft, draftFromFiles } from "../src/edit/draft.js";
import { readModuleDir } from "../src/module/load.js";
import { assetPaths, decodeModuleFiles } from "../src/module/zip.js";

async function open(dir: string) {
  const raw = await readModuleDir(dir);
  return { draft: draftFromFiles(decodeModuleFiles(raw)), assets: assetPaths(raw) };
}

const drawing = {
  path: "assets/images/drago.svg",
  bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#c00"/></svg>'),
};

describe("grafica e suoni nella bozza", () => {
  it("crea le tessere da un disegno, con e senza il disegno nei fotogrammi", () => {
    const built = buildTiles("H1", drawing, "#336699", { look: "smooth", frame: "#c9a227", frames: 2 });
    const base = `${IMAGE_FOLDER}h1`;
    expect(Object.keys(built.files).sort()).toEqual(
      ["", "-disegno", "-tessera", "-tessera-win-1", "-tessera-win-2", "-win-1", "-win-2"].map((s) => `${base}${s}.svg`).sort(),
    );
    expect(built.still).toEqual({ image: `${base}.svg`, winFrames: [`${base}-win-1.svg`, `${base}-win-2.svg`, `${base}.svg`] });
    expect(built.moving).toEqual({
      image: `${base}.svg`,
      art: `${base}-disegno.svg`,
      tile: `${base}-tessera.svg`,
      winFrames: [`${base}-tessera-win-1.svg`, `${base}-tessera-win-2.svg`, `${base}-tessera.svg`],
    });
    const text = (path: string) => new TextDecoder().decode(built.files[path]);
    expect(text(`${base}.svg`)).toContain('<circle cx="5" cy="5" r="4"');
    expect(text(`${base}-disegno.svg`)).toContain('<circle cx="5" cy="5" r="4"');
    expect(text(`${base}-disegno.svg`)).not.toContain("cornice");
    expect(text(`${base}-tessera-win-2.svg`)).not.toContain("<circle cx=\"5\"");
    expect(text(`${base}-tessera.svg`)).toContain("#336699");
    // Un'immagine raster finisce incorporata.
    const png = buildTiles("H1", { path: "assets/images/x.png", bytes: new Uint8Array([1, 2, 3]) }, "#000000", { look: "pixel", frame: "#c9a227", frames: 1 });
    expect(new TextDecoder().decode(png.files[`${base}.svg`])).toContain("data:image/png;base64,AQID");
  });

  it("collega tessere e movimento a un simbolo e il modulo resta valido", async () => {
    const { draft, assets } = await open("templates/slot-base");
    const built = buildTiles("H1", drawing, "#336699", { look: "smooth", frame: "#c9a227", frames: 3 });
    const all = [...assets, ...Object.keys(built.files)];
    setSymbolArt(draft, "H1", built.still);
    expect(checkDraft(draft, all).problems).toEqual([]);

    // Accendere il movimento senza disegno e tessera è un errore del modulo.
    setMotion(draft, "H1", { win: "pop", shine: true, land: false, strength: 1 }, all);
    expect(checkDraft(draft, all).problems.join("\n")).toMatch(/motion richiede art e tile/);
    setMotion(draft, "H1", undefined, all);

    setSymbolArt(draft, "H1", { art: built.moving.art, tile: built.moving.tile });
    setMotion(draft, "H1", { win: "swing", shine: false, land: true, strength: 0.6 }, all);
    expect(symbolStyle(draft, "H1").winFrames).toEqual(built.moving.winFrames);
    const { module, problems } = checkDraft(draft, all);
    expect(problems).toEqual([]);
    expect(module!.scene.symbols.get("H1")).toMatchObject({ art: built.moving.art, tile: built.moving.tile, motion: { win: "swing", land: true } });

    // Spento il movimento tornano i fotogrammi con il disegno.
    setMotion(draft, "H1", undefined, all);
    expect(symbolStyle(draft, "H1").winFrames).toEqual(built.still.winFrames);
    expect(symbolStyle(draft, "H1").motion).toBeUndefined();

    // I fotogrammi scelti a mano restano dove sono.
    setSymbolArt(draft, "H1", { winFrames: ["assets/images/a.png"] });
    setMotion(draft, "H1", { win: "pulse", shine: true, land: false, strength: 1 }, all);
    expect(symbolStyle(draft, "H1").winFrames).toEqual(["assets/images/a.png"]);

    setSymbolArt(draft, "H1", { winFrames: [], art: undefined });
    expect(symbolStyle(draft, "H1").winFrames).toBeUndefined();
    expect(symbolStyle(draft, "H1").art).toBeUndefined();
  });

  it("imposta sfondo e suoni, e toglie i campi vuoti", async () => {
    const { draft, assets } = await open("templates/slot-base");
    setBackgroundImage(draft, "assets/images/sfondo.webp");
    setSound(draft, "music", "assets/audio/musica.ogg");
    setSound(draft, "win", "assets/audio/vinci.mp3");
    const all = [...assets, "assets/images/sfondo.webp", "assets/audio/musica.ogg", "assets/audio/vinci.mp3"];
    const { module, problems } = checkDraft(draft, all);
    expect(problems).toEqual([]);
    expect(module!.scene.backgroundImage).toBe("assets/images/sfondo.webp");
    expect(module!.scene.sounds).toMatchObject({ music: "assets/audio/musica.ogg", win: "assets/audio/vinci.mp3" });
    setSound(draft, "music", undefined);
    setSound(draft, "win", undefined);
    setBackgroundImage(draft, undefined);
    expect(draft.scene.sounds).toBeUndefined();
    expect(draft.scene.backgroundImage).toBeUndefined();
  });
});
