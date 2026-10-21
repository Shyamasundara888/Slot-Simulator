import { artSvg, symbolSvg } from "../assets/build.js";
import type { SymbolArt } from "../assets/spec.js";
import type { Motion, SOUND_EVENTS } from "../module/schema.js";
import type { ModuleDraft } from "./draft.js";

/**
 * Operazioni della scheda Grafica e suoni: immagini, fotogrammi, movimento dei
 * simboli, sfondo e suoni della scena (scenes/main.json), più le tessere con
 * cornice create nel browser come fa npm run assets -- build.
 */

type SceneSymbol = NonNullable<ModuleDraft["scene"]["symbols"]>[string];
type SoundEvent = (typeof SOUND_EVENTS)[number];

/** Cartelle dei file creati o caricati dalla scheda: assets/symbols e assets/sounds li rifà il build da art.json. */
export const IMAGE_FOLDER = "assets/images/";
export const SOUND_FOLDER = "assets/audio/";

/** Stile di un simbolo nella scena, creato se manca. */
export function symbolStyle(draft: ModuleDraft, id: string, color = "#4dabf7"): SceneSymbol {
  draft.scene.symbols ??= {};
  return (draft.scene.symbols[id] ??= { color });
}

/** Cambia i campi grafici di un simbolo; undefined toglie il campo. */
export function setSymbolArt(
  draft: ModuleDraft,
  id: string,
  patch: Partial<Pick<SceneSymbol, "image" | "winFrames" | "fps" | "art" | "tile" | "motion">>,
): void {
  const style = symbolStyle(draft, id);
  for (const [key, value] of Object.entries(patch) as [keyof typeof patch, unknown][]) {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) delete style[key];
    else (style as Record<string, unknown>)[key] = value;
  }
}

export function setBackgroundImage(draft: ModuleDraft, path: string | undefined): void {
  if (path) draft.scene.backgroundImage = path;
  else delete draft.scene.backgroundImage;
}

export function setSound(draft: ModuleDraft, event: SoundEvent, path: string | undefined): void {
  const sounds = (draft.scene.sounds ??= {}) as Partial<Record<SoundEvent, string>>;
  if (path) sounds[event] = path;
  else delete sounds[event];
  if (Object.keys(sounds).length === 0) delete draft.scene.sounds;
}

export interface TileOptions {
  /** "smooth": cornice in rilievo; "pixel": bordo netto. */
  look: "smooth" | "pixel";
  /** Colore della cornice con look "smooth". */
  frame: string;
  /** Fotogrammi illuminati di vincita, da 1 a 8. */
  frames: number;
}

export interface BuiltTiles {
  files: Record<string, Uint8Array>;
  /** Campi della scena per il simbolo, con e senza movimento del disegno. */
  still: Pick<SceneSymbol, "image" | "winFrames">;
  moving: Pick<SceneSymbol, "image" | "winFrames" | "art" | "tile">;
}

const name = (id: string) => id.toLowerCase().replace(/_/g, "-");

/**
 * Tessere di un simbolo da un disegno (SVG o immagine): simbolo completo, fotogrammi
 * illuminati con e senza disegno, tessera vuota e disegno da solo, in assets/images/.
 */
export function buildTiles(id: string, drawing: { path: string; bytes: Uint8Array }, color: string, options: TileOptions): BuiltTiles {
  const ext = drawing.path.split(".").pop()!.toLowerCase();
  const source = ext === "svg" ? { svg: `art/disegno.svg` } : { image: `art/disegno.${ext}` };
  const art: SymbolArt = { tile: color, generate: true, ...source };
  const read = () => drawing.bytes;
  const encode = (text: string) => new TextEncoder().encode(text);
  const base = `${IMAGE_FOLDER}${name(id)}`;
  const files: Record<string, Uint8Array> = {};
  const frames = Math.max(1, Math.min(8, Math.round(options.frames)));
  const svg = (glow: number, frame: number, withArt: boolean) => encode(symbolSvg(id, art, options.look, read, glow, frame, options.frame, withArt));

  const image = `${base}.svg`;
  const tile = `${base}-tessera.svg`;
  const drawn = `${base}-disegno.svg`;
  files[image] = svg(0, 0, true);
  files[tile] = svg(0, 0, false);
  files[drawn] = encode(artSvg(id, art, options.look, read));
  const full: string[] = [];
  const empty: string[] = [];
  for (let k = 0; k < frames; k++) {
    const glow = (k + 1) / frames;
    full.push(`${base}-win-${k + 1}.svg`);
    empty.push(`${base}-tessera-win-${k + 1}.svg`);
    files[full[k]!] = svg(glow, k, true);
    files[empty[k]!] = svg(glow, k, false);
  }
  return {
    files,
    still: { image, winFrames: [...full, image] },
    moving: { image, winFrames: [...empty, tile], art: drawn, tile },
  };
}

/**
 * Accende, cambia o spegne il movimento del disegno. I fotogrammi di vincita fatti da
 * buildTiles passano da quelli con il disegno a quelli senza (e viceversa), perché con
 * il movimento il disegno lo aggiunge il client sopra la tessera.
 */
export function setMotion(draft: ModuleDraft, id: string, motion: Motion | undefined, assets: readonly string[]): void {
  const style = symbolStyle(draft, id);
  const frames = style.winFrames;
  if (frames && frames.length > 0) {
    const has = (path: string) => assets.includes(path);
    if (motion && !style.motion) {
      const swapped = frames.map((p) => (p === style.image && style.tile ? style.tile : p.replace(/-win-(\d+)\.svg$/, "-tessera-win-$1.svg")));
      if (swapped.every(has)) style.winFrames = swapped;
    } else if (!motion && style.motion) {
      const swapped = frames.map((p) => (p === style.tile && style.image ? style.image : p.replace(/-tessera-win-(\d+)\.svg$/, "-win-$1.svg")));
      if (swapped.every(has)) style.winFrames = swapped;
    }
  }
  if (motion) style.motion = motion;
  else delete style.motion;
}
