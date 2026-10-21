import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAssets, parseSvg, promptsMarkdown, synthWav } from "../src/assets/build.js";
import { artSchema } from "../src/assets/spec.js";

const spec = (value: unknown) => artSchema.parse(value);
const noFiles = (path: string): Uint8Array => {
  throw new Error(`file inatteso ${path}`);
};

describe("pipeline degli asset", () => {
  it("crea simbolo, fotogrammi di vincita, suoni e campi della scena", () => {
    const art = spec({
      symbols: { A: { tile: "#336699", pixels: { palette: { X: "#ffffff" }, rows: ["X.", ".X"] } } },
      win: { frames: 2, fps: 5 },
      sounds: { win: { notes: [[440, 0.1]] } },
    });
    const { files, scene } = buildAssets(art, noFiles);
    expect([...files.keys()].sort()).toEqual([
      "assets/sounds/win.wav",
      "assets/symbols/a-win-1.svg",
      "assets/symbols/a-win-2.svg",
      "assets/symbols/a.svg",
    ]);
    expect(scene.symbols.A).toEqual({
      color: "#336699",
      image: "assets/symbols/a.svg",
      winFrames: ["assets/symbols/a-win-1.svg", "assets/symbols/a-win-2.svg", "assets/symbols/a.svg"],
      fps: 5,
    });
    expect(scene.sounds).toEqual({ win: "assets/sounds/win.wav" });
    const svg = new TextDecoder().decode(files.get("assets/symbols/a.svg"));
    expect(svg).toContain('viewBox="0 0 2 2"');
    expect(svg.match(/fill="#ffffff"/g)).toHaveLength(2);
  });

  it("annida gli SVG disegnati a mano e incorpora le immagini raster", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const read = (path: string) =>
      path.endsWith(".svg") ? new TextEncoder().encode('<svg width="10" height="20"><circle r="3"/></svg>') : png;
    const art = spec({
      look: "smooth",
      symbols: {
        A: { tile: "#000000", svg: "art/a.svg" },
        B: { tile: "#000000", svg: "art/b.svg", image: "art/raw/b.png" },
      },
    });
    const { files } = buildAssets(art, read);
    const a = new TextDecoder().decode(files.get("assets/symbols/a.svg"));
    expect(a).toContain('viewBox="0 0 10 20"');
    expect(a).toContain('<circle r="3"/>');
    // Se c'è un'immagine raster vince sull'SVG.
    expect(new TextDecoder().decode(files.get("assets/symbols/b.svg"))).toContain("data:image/png;base64,iVBORw==");
  });

  it("usa i fotogrammi raster di animation al posto di quelli illuminati, avanti e indietro", () => {
    const read = (path: string) => new TextEncoder().encode(path);
    const art = spec({
      symbols: {
        A: { tile: "#336699", image: "art/a.png", animation: { frames: "art/anim/a-##.webp", count: 3 } },
        B: { tile: "#336699", image: "art/b.png", animation: { frames: "art/anim/b-#.png", count: 3, fps: 20, loop: "loop" } },
      },
      win: { frames: 2 },
    });
    const { files, scene } = buildAssets(art, read);
    expect(scene.symbols.A!.winFrames).toEqual(["a-anim-1", "a-anim-2", "a-anim-3", "a-anim-2"].map((n) => `assets/symbols/${n}.svg`));
    expect(scene.symbols.A!.fps).toBe(12);
    expect(scene.symbols.B).toMatchObject({ winFrames: ["b-anim-1", "b-anim-2", "b-anim-3"].map((n) => `assets/symbols/${n}.svg`), fps: 20 });
    expect(files.has("assets/symbols/a-win-1.svg")).toBe(false);
    const frame = new TextDecoder().decode(files.get("assets/symbols/a-anim-3.svg"));
    expect(frame).toContain(`data:image/webp;base64,${btoa("art/anim/a-02.webp")}`);
    expect(() => spec({ symbols: { A: { tile: "#336699", image: "art/a.png", animation: { frames: "art/anim/a.webp", count: 3 } } } })).toThrow(/#/);
  });

  it("con look smooth disegna la tessera con la cornice del colore scelto", () => {
    const art = spec({ look: "smooth", frame: "#b0b0b0", symbols: { A: { tile: "#336699", pixels: { palette: { X: "#ffffff" }, rows: ["X"] } } } });
    const svg = new TextDecoder().decode(buildAssets(art, noFiles).files.get("assets/symbols/a.svg"));
    expect(svg).toContain('stop-color="#b0b0b0"');
    expect(svg).toContain('fill="url(#cornice)"');
    expect(svg).toContain("feTurbulence");
  });

  it("copia i suoni già pronti, musiche comprese, con la loro estensione", () => {
    const read = (path: string) => new TextEncoder().encode(path);
    const art = spec({
      symbols: {},
      sounds: { music: { file: "art/audio/musica.ogg" }, bonusMusic: { file: "art/audio/bonus.mp3" }, stop: { notes: [[200, 0.04]] } },
    });
    const { files, scene } = buildAssets(art, read);
    expect(scene.sounds).toEqual({ music: "assets/sounds/music.ogg", bonusMusic: "assets/sounds/bonus-music.mp3", stop: "assets/sounds/stop.wav" });
    expect(new TextDecoder().decode(files.get("assets/sounds/music.ogg"))).toBe("art/audio/musica.ogg");
    expect(() => spec({ symbols: {}, sounds: { music: { file: "suoni/musica.ogg" } } })).toThrow();
  });

  it("segnala sorgenti incomplete", () => {
    expect(() => spec({ symbols: { A: { tile: "#000000" } } })).toThrow(/serve almeno uno tra pixels, svg e image/);
    expect(() => spec({ symbols: { A: { tile: "#000000", pixels: { palette: {}, rows: ["X"] } } } })).toThrow(/carattere X senza colore/);
    expect(() => spec({ symbols: { A: { tile: "#000000", svg: "../fuori.svg" } } })).toThrow(/dentro art\//);
    expect(() => parseSvg("<svg><g/></svg>", "art/x.svg")).toThrow(/serve viewBox/);
  });

  it("sintetizza WAV a 8 bit della durata giusta", () => {
    const wav = synthWav({ wave: "triangle", notes: [[440, 0.5], [[200, 400], 0.5]], volume: 0.5 });
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(wav.length).toBe(44 + 22050);
  });

  it("scrive un prompt per simbolo con lo stile comune", () => {
    const art = spec({ prompt: "Pixel art.", symbols: { A: { tile: "#000000", svg: "art/a.svg", prompt: "una mela" } } });
    const md = promptsMarkdown(art, new Map([["A", "Mela"]]), "Prova");
    expect(md).toContain("### Mela → `art/raw/a.png`");
    expect(md).toContain("Pixel art. Una mela. Single game icon");
  });

  for (const slot of ["tempio-del-sole", "pixel-quest"]) {
    it(`gli asset di ${slot} sono aggiornati rispetto a art/art.json`, () => {
      const dir = join("slots", slot);
      const art = artSchema.parse(JSON.parse(readFileSync(join(dir, "art/art.json"), "utf8")));
      const { files } = buildAssets(art, (path) => readFileSync(join(dir, path)));
      // Buffer.equals e non toEqual: con le immagini incorporate gli SVG pesano centinaia di KB.
      for (const [path, bytes] of files) expect(readFileSync(join(dir, path)).equals(bytes), path).toBe(true);
    });
  }
});
