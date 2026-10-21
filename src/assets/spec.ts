import { z } from "zod";
import { motionSchema, SOUND_EVENTS } from "../module/schema.js";

/**
 * Sorgente degli asset di un modulo: `art/art.json`. Descrive come disegnare
 * ogni simbolo, lo sfondo e i suoni; `npm run assets` ne ricava i file in
 * `assets/` e aggiorna `scenes/main.json`. La cartella `art/` non finisce
 * negli zip dei mod: serve solo a chi crea la slot.
 */

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "usa un colore esadecimale come #ffcc00");
/** File dentro art/ (immagini disegnate a mano o prodotte da un generatore esterno). */
const artFile = (extensions: readonly string[]) =>
  z
    .string()
    .regex(
      new RegExp(`^art/([A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\\.(${extensions.join("|")})$`, "i"),
      `serve un file dentro art/ (${extensions.join(", ")})`,
    );
export const RASTER_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;
const svgFile = artFile(["svg"]);
const rasterFile = artFile(RASTER_EXTENSIONS);
const jsonFile = artFile(["json"]);
/** Fotogrammi numerati dentro art/: i # stanno per il numero del fotogramma, da 0 e con gli zeri davanti. */
const framePattern = z
  .string()
  .regex(
    new RegExp(`^art/([A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]*#+[A-Za-z0-9_.-]*\\.(${RASTER_EXTENSIONS.join("|")})$`, "i"),
    "serve un percorso dentro art/ con # al posto del numero, per esempio art/raw/anim/drago-##.webp",
  );

/** Percorsi dei fotogrammi di un'animazione: art/raw/anim/drago-##.webp diventa drago-00.webp, drago-01.webp... */
export function framePaths(pattern: string, count: number): string[] {
  const run = /#+/.exec(pattern)!;
  return Array.from({ length: count }, (_, k) => pattern.replace(run[0], String(k).padStart(run[0].length, "0")));
}

const seed = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Pixel art: una riga di caratteri per riga di pixel, '.' trasparente, gli altri caratteri dalla palette. */
const pixels = z
  .object({
    palette: z.record(z.string().length(1), color),
    rows: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine(({ palette, rows }, ctx) => {
    if (new Set(rows.map((r) => r.length)).size > 1) ctx.addIssue({ code: "custom", message: "le righe devono avere la stessa lunghezza" });
    for (const c of new Set(rows.join(""))) {
      if (c !== "." && !(c in palette)) ctx.addIssue({ code: "custom", message: `carattere ${c} senza colore nella palette` });
    }
  });

const symbolArt = z
  .object({
    /** Colore della tessera, usato anche come colore del simbolo nella scena. */
    tile: color,
    /** Disegno del simbolo: almeno uno. Se ce n'è più di uno vince image, poi svg, poi pixels. */
    pixels: pixels.optional(),
    svg: svgFile.optional(),
    /** Immagine raster, per esempio da un generatore di immagini esterno. */
    image: rasterFile.optional(),
    /** Descrizione per il generatore esterno (npm run assets -- prompts). */
    prompt: z.string().optional(),
    /** false: npm run assets -- generate salta il simbolo (per esempio le lettere, che SDXL disegna male). */
    generate: z.boolean().default(true),
    /** false: il simbolo si genera senza il riferimento di stile (generate.reference), col workflow semplice. */
    reference: z.literal(false).optional(),
    /** Peso del riferimento di stile per questo simbolo, al posto di generate.referenceWeight. */
    referenceWeight: z.number().min(0).max(2).optional(),
    /**
     * Disegno (SVG o immagine in art/) che impone la forma al generatore con ControlNet: il simbolo
     * si genera col workflow simbolo-forma.json, utile per lettere e forme che SDXL sbaglia.
     */
    shape: artFile(["svg", ...RASTER_EXTENSIONS]).optional(),
    /** Forza della forma per questo simbolo, al posto di generate.shapeStrength. */
    shapeStrength: z.number().min(0).max(2).optional(),
    /** Seed per npm run assets -- generate, se diverso da generate.seed (per esempio quello di una variante scelta). */
    seed: seed.optional(),
    /** Colore del bagliore nelle animazioni di vincita (predefinito: la tessera schiarita). */
    glow: color.optional(),
    /**
     * Animazione di vincita fatta di immagini, per esempio una clip image-to-video scontornata:
     * prende il posto dei fotogrammi illuminati di win.frames per questo simbolo.
     */
    animation: z
      .object({
        frames: framePattern,
        count: z.number().int().min(2).max(120),
        fps: z.number().positive().max(60).default(12),
        /** "pingpong": avanti e poi indietro, così il loop non salta; "loop": ricomincia dal primo. */
        loop: z.enum(["pingpong", "loop"]).default("pingpong"),
      })
      .strict()
      .optional(),
    /**
     * Movimento del disegno nel client, sopra la tessera: nelle vincite (e con land quando il rullo
     * si ferma) il soggetto si anima da solo, senza fotogrammi. Vedi MOTIONS in src/module/schema.ts.
     */
    motion: motionSchema.optional(),
  })
  .strict()
  .refine((s) => s.pixels || s.svg || s.image, "serve almeno uno tra pixels, svg e image")
  .refine((s) => !(s.motion && s.animation), "motion e animation sono alternativi: tieni uno dei due");

const note = z.tuple([z.union([z.number().positive(), z.tuple([z.number().positive(), z.number().positive()])]), z.number().positive().max(5)]);

/** Suono già pronto in art/, per esempio composto con tools/audio: viene copiato in assets/sounds/. */
const soundFile = z
  .object({ file: artFile(["ogg", "mp3", "wav"]) })
  .strict();

const synthSound = z
  .object({
    wave: z.enum(["square", "triangle", "sine", "noise"]).default("square"),
    /** Note in sequenza: [frequenza in Hz oppure [inizio, fine] per una glissata, durata in secondi]. */
    notes: z.array(note).min(1),
    volume: z.number().min(0).max(1).default(0.5),
  })
  .strict();

/** Suono di un evento: sintetizzato a 8 bit dalle note, oppure un file. */
const soundArt = z.union([synthSound, soundFile]);

export const artSchema = z
  .object({
    /** Stile generale, ripreso in testa a ogni prompt per il generatore esterno. */
    prompt: z.string().optional(),
    /** "pixel": pixel netti e tessera quadrata; "smooth": bordi arrotondati e sfumature. */
    look: z.enum(["pixel", "smooth"]).default("pixel"),
    /** Colore della cornice in rilievo attorno alle tessere con look "smooth" (predefinito: oro). */
    frame: color.default("#c9a227"),
    symbols: z.record(z.string(), symbolArt),
    win: z
      .object({
        /** Fotogrammi illuminati, seguiti dal simbolo normale. */
        frames: z.number().int().min(1).max(8).default(1),
        fps: z.number().positive().max(60).default(6),
      })
      .strict()
      .default({}),
    background: z
      .object({ svg: svgFile.optional(), image: rasterFile.optional(), prompt: z.string().optional(), seed: seed.optional() })
      .strict()
      .refine((b) => b.svg || b.image, "serve svg o image")
      .optional(),
    sounds: z.record(z.enum(SOUND_EVENTS), soundArt).default({}),
    /** Impostazioni di npm run assets -- generate (ComfyUI in locale). */
    generate: z
      .object({
        /** Workflow in formato API per i simboli e per lo sfondo; predefiniti quelli di tools/comfyui/workflows. */
        workflow: jsonFile.optional(),
        backgroundWorkflow: jsonFile.optional(),
        /**
         * Immagine guida dello stile (di solito un simbolo già generato e scelto): se c'è, i simboli
         * si generano col workflow simbolo-stile.json (IP-Adapter), che la passa come riferimento.
         */
        reference: rasterFile.optional(),
        /** Quanto conta il riferimento (nodi IPAdapter): più basso passa meno la forma del riferimento. */
        referenceWeight: z.number().min(0).max(2).optional(),
        /** Modo dell'IP-Adapter, per esempio "style transfer" o "strong style transfer". */
        referenceMode: z.string().optional(),
        /** Workflow per i simboli con shape (ControlNet); predefinito tools/comfyui/workflows/simbolo-forma.json. */
        shapeWorkflow: jsonFile.optional(),
        /** Quanto la forma guida il generatore (0-2) e fino a che punto della generazione (0-1). */
        shapeStrength: z.number().min(0).max(2).optional(),
        shapeEnd: z.number().min(0).max(1).optional(),
        /** Toglie dai simboli i frammenti staccati lasciati dallo scontorno. */
        cleanup: z.boolean().default(true),
        /** Ritaglia i bordi trasparenti dei simboli e ricentra il soggetto, così riempie la tessera. */
        fit: z.boolean().default(true),
        /** Seed comune a tutta la serie, per uno stile coerente. */
        seed: seed.default(777),
        /** Lato in pixel delle immagini dei simboli salvate in art/raw. */
        size: z.number().int().min(64).max(2048).default(512),
        /** Misura dello sfondo salvato; se manca resta quella del workflow. */
        backgroundSize: z.tuple([z.number().int().min(64).max(4096), z.number().int().min(64).max(4096)]).optional(),
      })
      .strict()
      .default({}),
  })
  .strict();

export type ArtSpec = z.infer<typeof artSchema>;
export type SymbolArt = z.infer<typeof symbolArt>;
export type SoundArt = z.infer<typeof soundArt>;
export type SynthSound = z.infer<typeof synthSound>;
