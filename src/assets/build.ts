import type { SoundEvent } from "../module/parse.js";
import { framePaths, type ArtSpec, type SoundArt, type SymbolArt } from "./spec.js";

/** Lato di una tessera in unità SVG; il disegno occupa il riquadro interno. */
const TILE = 100;
/** Margine tra il bordo della tessera e il disegno. */
const INSET = 10;
/** Lato in pixel delle immagini prodotte. */
const OUTPUT_SIZE = 320;
const SAMPLE_RATE = 22050;

const SOUND_FILES: Record<SoundEvent, string> = {
  spin: "spin.wav",
  stop: "stop.wav",
  win: "win.wav",
  bigWin: "big-win.wav",
  feature: "feature.wav",
};

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/** Legge un file della cartella del modulo (percorso relativo, per esempio art/raw/drago.png). */
export type ReadFile = (path: string) => Uint8Array;

export interface BuiltAssets {
  /** File da scrivere nel modulo, per percorso relativo (tutti dentro assets/). */
  files: Map<string, Uint8Array>;
  /** Campi da unire in scenes/main.json. */
  scene: {
    backgroundImage?: string;
    symbols: Record<string, { color: string; image: string; winFrames: string[]; fps: number }>;
    sounds: Partial<Record<SoundEvent, string>>;
  };
}

export function lighten(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (n >> shift) & 255;
    return Math.round(c + (255 - c) * amount);
  };
  return `#${[16, 8, 0].map((s) => channel(s).toString(16).padStart(2, "0")).join("")}`;
}

const base64 = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

/** Contenuto e viewBox di un file SVG, per annidarlo in un'altra immagine. */
export function parseSvg(text: string, path: string): { viewBox: string; body: string } {
  const open = /<svg\b[^>]*>/i.exec(text);
  const close = text.lastIndexOf("</svg>");
  if (!open || close < 0) throw new Error(`${path}: non è un file SVG`);
  const tag = open[0];
  let viewBox = /viewBox="([^"]+)"/i.exec(tag)?.[1];
  if (!viewBox) {
    const w = /\swidth="([\d.]+)/i.exec(tag)?.[1];
    const h = /\sheight="([\d.]+)/i.exec(tag)?.[1];
    if (!w || !h) throw new Error(`${path}: serve viewBox oppure width e height`);
    viewBox = `0 0 ${w} ${h}`;
  }
  return { viewBox, body: text.slice(open.index + tag.length, close) };
}

/** Il disegno di un simbolo, già posizionato nel riquadro interno della tessera. */
function artwork(id: string, art: SymbolArt, read: ReadFile): string {
  const inner = TILE - 2 * INSET;
  if (art.image) {
    const ext = art.image.split(".").pop()!.toLowerCase();
    const href = `data:${MIME[ext]};base64,${base64(read(art.image))}`;
    return `<image x="${INSET}" y="${INSET}" width="${inner}" height="${inner}" preserveAspectRatio="xMidYMid meet" href="${href}"/>`;
  }
  if (art.svg) {
    const { viewBox, body } = parseSvg(new TextDecoder().decode(read(art.svg)), art.svg);
    return `<svg x="${INSET}" y="${INSET}" width="${inner}" height="${inner}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${body}</svg>`;
  }
  const { palette, rows } = art.pixels!;
  const cols = rows[0]!.length;
  const rects: string[] = [];
  rows.forEach((row, y) => {
    // Pixel uguali e consecutivi diventano un solo rettangolo: file più piccoli.
    for (let x = 0; x < cols; ) {
      const c = row[x]!;
      let run = 1;
      while (x + run < cols && row[x + run] === c) run++;
      if (c !== ".") rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${palette[c]}"/>`);
      x += run;
    }
  });
  if (rects.length === 0) throw new Error(`${id}: la pixel art è vuota`);
  return `<svg x="${INSET}" y="${INSET}" width="${inner}" height="${inner}" viewBox="0 0 ${cols} ${rows.length}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
}

/** Scurisce un colore verso il nero di `amount` (0-1). */
export function darken(hex: string, amount: number): string {
  return mix(hex, "#000000", amount);
}

/** Mescola due colori: 0 dà `a`, 1 dà `b`. */
function mix(a: string, b: string, amount: number): string {
  const x = Number.parseInt(a.slice(1), 16);
  const y = Number.parseInt(b.slice(1), 16);
  const channel = (shift: number) => Math.round(((x >> shift) & 255) * (1 - amount) + ((y >> shift) & 255) * amount);
  return `#${[16, 8, 0].map((s) => channel(s).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Tessera "smooth": cornice metallica in rilievo, pannello incassato del colore del simbolo
 * con luce dall'alto, ombra interna e una grana leggera da pietra.
 */
function smoothTile(fill: string, frame: string, seed: number): string[] {
  return [
    "<defs>",
    `<linearGradient id="cornice" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${lighten(frame, 0.55)}"/><stop offset="0.35" stop-color="${frame}"/><stop offset="0.7" stop-color="${darken(frame, 0.35)}"/><stop offset="1" stop-color="${lighten(frame, 0.2)}"/></linearGradient>`,
    `<radialGradient id="pannello" cx="50%" cy="38%" r="72%"><stop offset="0" stop-color="${lighten(fill, 0.22)}"/><stop offset="0.6" stop-color="${fill}"/><stop offset="1" stop-color="${darken(fill, 0.5)}"/></radialGradient>`,
    `<linearGradient id="ombra" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="0.18" stop-color="#000" stop-opacity="0"/><stop offset="0.9" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.12"/></linearGradient>`,
    `<filter id="grana" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${seed + 1}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.09 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>`,
    "</defs>",
    `<rect width="${TILE}" height="${TILE}" rx="14" fill="url(#cornice)"/>`,
    `<rect x="0.75" y="0.75" width="${TILE - 1.5}" height="${TILE - 1.5}" rx="13.4" fill="none" stroke="${lighten(frame, 0.75)}" stroke-width="0.8" opacity="0.6"/>`,
    `<rect x="5" y="5" width="${TILE - 10}" height="${TILE - 10}" rx="10" fill="url(#pannello)"/>`,
    `<rect x="5" y="5" width="${TILE - 10}" height="${TILE - 10}" rx="10" fill="#fff" filter="url(#grana)"/>`,
    `<rect x="5" y="5" width="${TILE - 10}" height="${TILE - 10}" rx="10" fill="url(#ombra)"/>`,
    `<rect x="5.4" y="5.4" width="${TILE - 10.8}" height="${TILE - 10.8}" rx="9.6" fill="none" stroke="${darken(frame, 0.6)}" stroke-width="0.8"/>`,
  ];
}

/** Scintille dei fotogrammi di vincita: cambiano posizione da un fotogramma all'altro. */
const SPARKLES = [
  [8, 8], [90, 12], [12, 86], [86, 90], [50, 3], [3, 50], [97, 52], [48, 97],
] as const;

/**
 * Immagine di un simbolo: la tessera, il disegno e, per `glow` > 0, il
 * bagliore di un fotogramma di vincita (da 0 a 1).
 */
export function symbolSvg(id: string, art: SymbolArt, look: ArtSpec["look"], read: ReadFile, glow = 0, frame = 0, frameColor = "#c9a227"): string {
  const pixel = look === "pixel";
  const glowColor = art.glow ?? lighten(art.tile, 0.6);
  const parts: string[] = [];
  const fill = glow > 0 ? lighten(art.tile, (pixel ? 0.15 : 0.08) + (pixel ? 0.3 : 0.17) * glow) : art.tile;
  if (pixel) {
    parts.push(`<rect width="${TILE}" height="${TILE}" fill="${fill}"/>`);
    const border = glow > 0 ? glowColor : lighten(art.tile, 0.3);
    parts.push(`<rect x="2.5" y="2.5" width="${TILE - 5}" height="${TILE - 5}" rx="0" fill="none" stroke="${border}" stroke-width="${glow > 0 ? 5 : 3}"/>`);
  } else {
    parts.push(...smoothTile(fill, glow > 0 ? mix(frameColor, glowColor, 0.5 * glow) : frameColor, frame));
    if (glow > 0) parts.push(`<rect x="1.5" y="1.5" width="${TILE - 3}" height="${TILE - 3}" rx="13" fill="none" stroke="${glowColor}" stroke-width="${2 + 2 * glow}" opacity="${0.5 + 0.4 * glow}"/>`);
    if (glow > 0) parts.push(`<circle cx="50" cy="50" r="${30 + 12 * glow}" fill="${glowColor}" opacity="${0.18 + 0.2 * glow}"/>`);
  }
  parts.push(artwork(id, art, read));
  if (glow > 0) {
    const size = pixel ? 5 : 4;
    SPARKLES.forEach(([x, y], i) => {
      if ((i + frame) % 2 !== 0) return;
      parts.push(
        pixel
          ? `<rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" fill="#ffffff"/>`
          : `<path d="M${x} ${y - 2 * size}L${x + size / 2} ${y - size / 2}L${x + 2 * size} ${y}L${x + size / 2} ${y + size / 2}L${x} ${y + 2 * size}L${x - size / 2} ${y + size / 2}L${x - 2 * size} ${y}L${x - size / 2} ${y - size / 2}Z" fill="#ffffff"/>`,
      );
    });
  }
  const rendering = pixel ? ` shape-rendering="crispEdges"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" viewBox="0 0 ${TILE} ${TILE}"${rendering}>${parts.join("")}</svg>\n`;
}

/** Sfondo: un SVG di art/ copiato così com'è, oppure un'immagine raster avvolta in un SVG. */
function backgroundSvg(bg: NonNullable<ArtSpec["background"]>, read: ReadFile): string {
  if (bg.image) {
    const ext = bg.image.split(".").pop()!.toLowerCase();
    const href = `data:${MIME[ext]};base64,${base64(read(bg.image))}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520"><image width="900" height="520" preserveAspectRatio="xMidYMid slice" href="${href}"/></svg>\n`;
  }
  const text = new TextDecoder().decode(read(bg.svg!));
  parseSvg(text, bg.svg!);
  return text.endsWith("\n") ? text : `${text}\n`;
}

/** Sintetizza un suono a 8 bit, mono, come file WAV. */
export function synthWav({ wave, notes, volume }: SoundArt): Uint8Array {
  const samples: number[] = [];
  let noise = 0x1234;
  for (const [freq, duration] of notes) {
    const [f0, f1] = Array.isArray(freq) ? freq : [freq, freq];
    const n = Math.round(duration * SAMPLE_RATE);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      phase += (f0 + (f1 - f0) * (i / n)) / SAMPLE_RATE;
      const p = phase % 1;
      let v: number;
      if (wave === "square") v = p < 0.5 ? 1 : -1;
      else if (wave === "triangle") v = 4 * Math.abs(p - 0.5) - 1;
      else if (wave === "sine") v = Math.sin(2 * Math.PI * p);
      else {
        noise ^= noise << 7;
        noise ^= noise >> 9;
        noise &= 0xffff;
        v = (noise / 0x8000) - 1;
      }
      // Attacco e rilascio di 10-20 ms per evitare i click.
      const env = Math.min(1, i / (SAMPLE_RATE * 0.01), (n - i) / (SAMPLE_RATE * 0.02));
      samples.push(v * env * volume);
    }
  }
  const out = new Uint8Array(44 + samples.length);
  const view = new DataView(out.buffer);
  const text = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples.length, true);
  samples.forEach((v, i) => out[44 + i] = Math.max(0, Math.min(255, Math.round(128 + v * 127))));
  return out;
}

/** Ricava dalla sorgente tutti gli asset del modulo e i campi della scena che li usano. */
export function buildAssets(spec: ArtSpec, read: ReadFile): BuiltAssets {
  const encode = (s: string) => new TextEncoder().encode(s);
  const files = new Map<string, Uint8Array>();
  const scene: BuiltAssets["scene"] = { symbols: {}, sounds: {} };
  const { frames, fps } = spec.win;

  for (const [id, art] of Object.entries(spec.symbols)) {
    const name = id.toLowerCase();
    const image = `assets/symbols/${name}.svg`;
    files.set(image, encode(symbolSvg(id, art, spec.look, read, 0, 0, spec.frame)));
    if (art.animation) {
      const { count, fps: speed, loop } = art.animation;
      const paths = framePaths(art.animation.frames, count).map((frame, k) => {
        const path = `assets/symbols/${name}-anim-${String(k + 1).padStart(String(count).length, "0")}.svg`;
        files.set(path, encode(symbolSvg(id, { ...art, image: frame }, spec.look, read, 0, 0, spec.frame)));
        return path;
      });
      // Nel ping-pong il primo e l'ultimo fotogramma non si ripetono, così non resta fermo sui capi.
      const winFrames = loop === "pingpong" ? [...paths, ...paths.slice(1, -1).reverse()] : paths;
      scene.symbols[id] = { color: art.tile, image, winFrames, fps: speed };
      continue;
    }
    const winFrames: string[] = [];
    for (let k = 0; k < frames; k++) {
      // Il bagliore cresce fotogramma dopo fotogramma, poi si torna al simbolo normale.
      const glow = (k + 1) / frames;
      const path = `assets/symbols/${name}-win-${k + 1}.svg`;
      files.set(path, encode(symbolSvg(id, art, spec.look, read, glow, k, spec.frame)));
      winFrames.push(path);
    }
    winFrames.push(image);
    scene.symbols[id] = { color: art.tile, image, winFrames, fps };
  }

  if (spec.background) {
    files.set("assets/background.svg", encode(backgroundSvg(spec.background, read)));
    scene.backgroundImage = "assets/background.svg";
  }

  for (const [event, sound] of Object.entries(spec.sounds) as [SoundEvent, SoundArt][]) {
    const path = `assets/sounds/${SOUND_FILES[event]}`;
    files.set(path, synthWav(sound));
    scene.sounds[event] = path;
  }
  return { files, scene };
}

const styleOf = (spec: ArtSpec) => (spec.prompt ? `${spec.prompt.trim().replace(/\.$/, "")}. ` : "");

/**
 * Prompt completo per il simbolo `id`: stile comune, soggetto e vincoli.
 * `backdrop` dice che fondo chiedere: un modello come SDXL non sa fare la trasparenza
 * e disegnerebbe una scacchiera, quindi npm run assets -- generate chiede una tinta unita e poi scontorna.
 */
export function symbolPrompt(spec: ArtSpec, id: string, labels: ReadonlyMap<string, string>, backdrop = "transparent or plain flat background"): string {
  const text = spec.symbols[id]?.prompt ?? labels.get(id) ?? id;
  const subject = text.charAt(0).toUpperCase() + text.slice(1);
  return `${styleOf(spec)}${subject}. Single game icon, centered, fills most of a square 1:1 frame, ${backdrop}, no text, no border, no frame.`;
}

/** Prompt completo per lo sfondo. */
export function backgroundPrompt(spec: ArtSpec): string {
  return `${styleOf(spec)}${spec.background?.prompt ?? "Background scene for a slot machine"}. Wide 16:9 landscape, calm and slightly dark so symbols stay readable, no text, no characters in the center.`;
}

/** Prompt per un generatore di immagini esterno, uno per simbolo e uno per lo sfondo, in Markdown. */
export function promptsMarkdown(spec: ArtSpec, labels: ReadonlyMap<string, string>, slotName: string): string {
  const lines = [
    `# Prompt per gli asset di ${slotName}`,
    "",
    "Genera ogni immagine con lo stesso modello e le stesse impostazioni, così lo stile resta coerente.",
    "Salva i file con il nome indicato, poi in `art/art.json` aggiungi `\"image\": \"art/raw/<nome>\"` al simbolo e lancia `npm run assets -- build <cartella>`.",
    "",
    "## Simboli",
    "",
  ];
  for (const id of Object.keys(spec.symbols)) {
    lines.push(`### ${labels.get(id) ?? id} → \`art/raw/${id.toLowerCase()}.png\``, "", "```", symbolPrompt(spec, id, labels), "```", "");
  }
  if (spec.background) {
    lines.push(
      "## Sfondo → `art/raw/background.png`",
      "",
      "```",
      backgroundPrompt(spec),
      "```",
      "",
      "Poi in `art/art.json` usa `\"background\": { \"image\": \"art/raw/background.png\" }`.",
      "",
    );
  }
  return lines.join("\n");
}
