import { z } from "zod";
import { SOUND_EVENTS } from "../module/schema.js";

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
    /** Colore del bagliore nelle animazioni di vincita (predefinito: la tessera schiarita). */
    glow: color.optional(),
  })
  .strict()
  .refine((s) => s.pixels || s.svg || s.image, "serve almeno uno tra pixels, svg e image");

const note = z.tuple([z.union([z.number().positive(), z.tuple([z.number().positive(), z.number().positive()])]), z.number().positive().max(5)]);

const soundArt = z
  .object({
    wave: z.enum(["square", "triangle", "sine", "noise"]).default("square"),
    /** Note in sequenza: [frequenza in Hz oppure [inizio, fine] per una glissata, durata in secondi]. */
    notes: z.array(note).min(1),
    volume: z.number().min(0).max(1).default(0.5),
  })
  .strict();

export const artSchema = z
  .object({
    /** Stile generale, ripreso in testa a ogni prompt per il generatore esterno. */
    prompt: z.string().optional(),
    /** "pixel": pixel netti e tessera quadrata; "smooth": bordi arrotondati e sfumature. */
    look: z.enum(["pixel", "smooth"]).default("pixel"),
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
      .object({ svg: svgFile.optional(), image: rasterFile.optional(), prompt: z.string().optional() })
      .strict()
      .refine((b) => b.svg || b.image, "serve svg o image")
      .optional(),
    sounds: z.record(z.enum(SOUND_EVENTS), soundArt).default({}),
  })
  .strict();

export type ArtSpec = z.infer<typeof artSchema>;
export type SymbolArt = z.infer<typeof symbolArt>;
export type SoundArt = z.infer<typeof soundArt>;
