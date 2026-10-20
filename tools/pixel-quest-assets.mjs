// Genera gli asset originali di Pixel Quest: simboli in pixel art (SVG), sfondo
// e suoni a 8 bit (WAV). Uso: node tools/pixel-quest-assets.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = new URL("../slots/pixel-quest/assets/", import.meta.url).pathname;
mkdirSync(join(OUT, "symbols"), { recursive: true });
mkdirSync(join(OUT, "sounds"), { recursive: true });

// Ogni simbolo: disegno 16x16 ('.' = trasparente), colori del disegno, colore della tessera.
const SPRITES = {
  SPADA: {
    tile: "#3b4252",
    colors: { K: "#111111", W: "#f8f9fa", S: "#adb5bd", G: "#fcc419", B: "#8d5524" },
    rows: [
      "................",
      ".............KK.",
      "............KWWK",
      "...........KWSK.",
      "..........KWSK..",
      ".........KWSK...",
      "........KWSK....",
      ".......KWSK.....",
      "..K...KWSK......",
      "..KK.KWSK.......",
      "...KGGSK........",
      "....GGK.........",
      "...KBGGK........",
      "..KBK.KGK.......",
      ".KBK....K.......",
      ".KK.............",
    ],
  },
  FORZIERE: {
    tile: "#5c3d1e",
    colors: { K: "#111111", B: "#a0522d", D: "#6b3410", Y: "#ffd43b" },
    rows: [
      "................",
      "................",
      "...KKKKKKKKKK...",
      "..KBBBBBBBBBBK..",
      ".KBBBBBBBBBBBBK.",
      ".KDDDDDDDDDDDDK.",
      ".KYYYYYKKYYYYYK.",
      ".KBBBBKYYKBBBBK.",
      ".KBBBBKYYKBBBBK.",
      ".KBBBBBKKBBBBBK.",
      ".KBBBBBBBBBBBBK.",
      ".KYBBBBBBBBBBYK.",
      ".KYBBBBBBBBBBYK.",
      ".KKKKKKKKKKKKKK.",
      "................",
      "................",
    ],
  },
  DRAGO: {
    tile: "#5c1a1a",
    colors: { K: "#111111", G: "#40c057", D: "#2b8a3e", R: "#fa5252", W: "#f8f9fa", Y: "#ffd43b" },
    rows: [
      "................",
      "..Y.........Y...",
      "..YY.......YY...",
      "...KKKKKKKKK....",
      "..KGGGGGGGGGK...",
      ".KGGRKGGGGGGGK..",
      ".KGGKKGGGGGGGGK.",
      ".KGGGGGGGGGGGGK.",
      ".KDDGGGGGGGGGGGK",
      "..KDDDDGGGGGGGGK",
      "...KWKWKWDDDDDK.",
      "....K.K.K.KKKK..",
      "...KWKWKW.......",
      "..KDDDDDDK......",
      "...KKKKKK.......",
      "................",
    ],
  },
  CAVALIERE: {
    tile: "#1c3a5e",
    colors: { K: "#111111", S: "#ced4da", W: "#f8f9fa", D: "#495057", R: "#e03131" },
    rows: [
      ".......RR.......",
      "......RRRR......",
      ".....RRRR.......",
      "....KKKKKKK.....",
      "...KSSSSSSSK....",
      "..KSWWSSSSSSK...",
      "..KSWSSSSSSSK...",
      "..KSSSSSSSSSK...",
      "..KKKKKKKKKKK...",
      "..KSDDKDDKDDK...",
      "..KSSSSSSSSSK...",
      "..KSDDKDDKDDK...",
      "..KSSSSSSSSSK...",
      "...KSSSSSSSK....",
      "....KKKKKKK.....",
      "................",
    ],
  },
  MAGO: {
    tile: "#2e1f5e",
    colors: { K: "#111111", P: "#7950f2", Y: "#ffd43b", D: "#5f3dc4" },
    rows: [
      ".........K......",
      "........KPK.....",
      ".......KPPK.....",
      ".......KPPPK....",
      "......KPPYPK....",
      "......KPYYYPK...",
      ".....KPPPYPPK...",
      ".....KPPPPPPPK..",
      "....KPPPPPPPPK..",
      "....KPPPPYPPPPK.",
      "...KPPPPPPPPPPK.",
      "..KDDDDDDDDDDDDK",
      ".KDDDDDDDDDDDDDK",
      "..KKKKKKKKKKKKK.",
      "................",
      "................",
    ],
  },
  ARCIERE: {
    tile: "#1e4620",
    colors: { K: "#111111", B: "#a0522d", W: "#f1f3f5", S: "#adb5bd", T: "#868e96", G: "#51cf66" },
    rows: [
      "................",
      "....KK..........",
      "....KBK.........",
      "....KBWK........",
      ".....KBWK.......",
      ".....KB.WK......",
      "......KB.WK.....",
      ".GG...KB..WK..T.",
      "GSSSSSSSSSSSSSTT",
      ".GG...KB..WK..T.",
      "......KB.WK.....",
      ".....KB.WK......",
      ".....KBWK.......",
      "....KBWK........",
      "....KBK.........",
      "....KK..........",
    ],
  },
  POZIONE: {
    tile: "#4a1430",
    colors: { K: "#111111", C: "#8d5524", L: "#d0ebff", P: "#f06595", W: "#ffdeeb" },
    rows: [
      "................",
      "......KKKK......",
      "......KCCK......",
      "......KKKK......",
      ".......KLK......",
      ".......KLK......",
      "......KLLLK.....",
      ".....KLLLLLK....",
      "....KLLLLLLLK...",
      "...KPPPPPPPPPK..",
      "...KPPWPPPPPPK..",
      "...KPWPPPPPPPK..",
      "...KPPPPPPPPPK..",
      "....KPPPPPPPK...",
      ".....KKKKKKK....",
      "................",
    ],
  },
  SCUDO: {
    tile: "#1a2a4f",
    colors: { K: "#111111", B: "#4c6ef5", L: "#91a7ff", W: "#f8f9fa" },
    rows: [
      "................",
      "..KKKKKKKKKKKK..",
      "..KLLLLLWLLLLK..",
      "..KLBBBBWBBBLK..",
      "..KLBBBBWBBBLK..",
      "..KLBBBBWBBBLK..",
      "..KWWWWWWWWWWK..",
      "..KLBBBBWBBBLK..",
      "..KLBBBBWBBBLK..",
      "...KLBBBWBBLK...",
      "...KLBBBWBBLK...",
      "....KLBBWBLK....",
      ".....KLBWLK.....",
      "......KLLK......",
      ".......KK.......",
      "................",
    ],
  },
  MONETA: {
    tile: "#4d3800",
    colors: { K: "#111111", Y: "#fcc419", O: "#e67700", L: "#fff3bf" },
    rows: [
      "................",
      ".....KKKKKK.....",
      "...KKYYYYYYKK...",
      "..KYYLLYYYYYYK..",
      "..KYLYYOOOYYYK..",
      ".KYYLYOYYYOYYYK.",
      ".KYLYYOYYYYYYYK.",
      ".KYYYYYOOOYYYYK.",
      ".KYYYYYYYYOYYYK.",
      ".KYYYYOYYYOYYYK.",
      ".KYYYYYOOOYYYYK.",
      "..KYYYYYYYYYOK..",
      "..KYYYYYYYYOOK..",
      "...KKOOOOOOKK...",
      ".....KKKKKK.....",
      "................",
    ],
  },
  CHIAVE: {
    tile: "#343a40",
    colors: { K: "#111111", Y: "#ffd43b", O: "#e67700" },
    rows: [
      "................",
      "................",
      "................",
      "...KKKK.........",
      "..KYYYYK........",
      ".KYYKKYYK.......",
      ".KYK..KYK.......",
      ".KYK..KYK.......",
      ".KYYKKYYKKKKKKK.",
      "..KYYYYYYYYYYYYK",
      "...KKKKKOYKOKOK.",
      "........KK.K.K..",
      "................",
      "................",
      "................",
      "................",
    ],
  },
};

const SIZE = 20; // tessera 20x20 con il disegno 16x16 al centro
const SPARKLES = [[1, 1], [18, 2], [2, 17], [17, 18], [10, 0], [0, 10]];

function lighten(hex, amount) {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (shift) => Math.round(((n >> shift) & 255) + (255 - ((n >> shift) & 255)) * amount);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

function svg({ tile, colors, rows }, glow) {
  const px = [];
  const bg = glow ? lighten(tile, 0.35) : tile;
  px.push(`<rect width="${SIZE}" height="${SIZE}" fill="${bg}"/>`);
  px.push(`<rect x="0.5" y="0.5" width="${SIZE - 1}" height="${SIZE - 1}" fill="none" stroke="${lighten(tile, glow ? 0.8 : 0.3)}" stroke-width="1"/>`);
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== ".") px.push(`<rect x="${x + 2}" y="${y + 2}" width="1" height="1" fill="${colors[c]}"/>`);
    }),
  );
  if (glow) for (const [x, y] of SPARKLES) px.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="#ffffff"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">${px.join("")}</svg>\n`;
}

for (const [id, sprite] of Object.entries(SPRITES)) {
  const name = id.toLowerCase();
  writeFileSync(join(OUT, "symbols", `${name}.svg`), svg(sprite, false));
  writeFileSync(join(OUT, "symbols", `${name}-glow.svg`), svg(sprite, true));
}

// Sfondo 90x52: cielo a bande, stelle, montagne e prato.
{
  const W = 90, H = 52, px = [];
  const bands = ["#0b1026", "#101a3a", "#16244d", "#1d2f5f", "#253b70"];
  bands.forEach((c, i) => px.push(`<rect x="0" y="${i * 7}" width="${W}" height="${i === bands.length - 1 ? H : 7}" fill="${c}"/>`));
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
  for (let i = 0; i < 45; i++) px.push(`<rect x="${Math.floor(rnd() * W)}" y="${Math.floor(rnd() * 30)}" width="1" height="1" fill="${rnd() < 0.3 ? "#ffd43b" : "#e9ecef"}"/>`);
  // Luna piena 5x5.
  [".XXX.", "XXXXX", "XXXXX", "XXXXX", ".XXX."].forEach((row, y) =>
    [...row].forEach((c, x) => c === "X" && px.push(`<rect x="${72 + x}" y="${5 + y}" width="1" height="1" fill="#fff3bf"/>`)),
  );
  for (let x = 0; x < W; x++) {
    const h = Math.round(9 + 5 * Math.sin(x / 7) + 3 * Math.sin(x / 3.1));
    px.push(`<rect x="${x}" y="${H - 10 - h}" width="1" height="${h}" fill="#2c2350"/>`);
  }
  px.push(`<rect x="0" y="${H - 10}" width="${W}" height="10" fill="#1e4620"/><rect x="0" y="${H - 10}" width="${W}" height="1" fill="#2f9e44"/>`);
  writeFileSync(join(OUT, "background.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" shape-rendering="crispEdges">${px.join("")}</svg>\n`);
}

// Suoni: onde quadre a 8 bit, 22050 Hz mono.
const RATE = 22050;
function wav(samples) {
  const data = Buffer.alloc(samples.length);
  samples.forEach((v, i) => (data[i] = Math.max(0, Math.min(255, Math.round(128 + v * 100)))));
  const head = Buffer.alloc(44);
  head.write("RIFF", 0); head.writeUInt32LE(36 + data.length, 4); head.write("WAVE", 8);
  head.write("fmt ", 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24); head.writeUInt32LE(RATE, 28); head.writeUInt16LE(1, 32); head.writeUInt16LE(8, 34);
  head.write("data", 36); head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
/** Note in sequenza: [frequenza (Hz) o frequenza iniziale e finale, durata in s]. */
function tones(notes, volume = 0.6) {
  const out = [];
  for (const [freq, dur] of notes) {
    const [f0, f1] = Array.isArray(freq) ? freq : [freq, freq];
    const n = Math.round(dur * RATE);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const f = f0 + (f1 - f0) * (i / n);
      phase += f / RATE;
      const env = Math.min(1, (n - i) / (RATE * 0.02)) * volume;
      out.push((phase % 1 < 0.5 ? 1 : -1) * env);
    }
  }
  return out;
}
const N = { G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, G6: 1568 };
const SOUNDS = {
  spin: tones([[[220, 660], 0.18]], 0.35),
  stop: tones([[[180, 120], 0.06]], 0.5),
  win: tones([[N.C5, 0.07], [N.E5, 0.07], [N.G5, 0.14]], 0.45),
  "big-win": tones([[N.C5, 0.08], [N.E5, 0.08], [N.G5, 0.08], [N.C6, 0.08], [N.E6, 0.08], [N.G6, 0.08], [N.C6, 0.08], [N.G6, 0.3]], 0.45),
  feature: tones([[N.G4, 0.06], [N.C5, 0.06], [N.E5, 0.06], [N.G5, 0.06], [N.E5, 0.06], [N.G5, 0.06], [N.C6, 0.25]], 0.45),
};
for (const [name, samples] of Object.entries(SOUNDS)) writeFileSync(join(OUT, "sounds", `${name}.wav`), wav(samples));

console.log(`Asset scritti in ${OUT}`);
