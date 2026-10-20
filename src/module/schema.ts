import { z } from "zod";

const symbolId = z.string().regex(/^[A-Z0-9_]+$/, "usa solo lettere maiuscole, cifre e _");
const strips = z.array(z.array(symbolId).min(1)).min(1);
const modeId = z.string().regex(/^[a-z][a-z0-9_]*$/, "usa lettere minuscole, cifre e _, iniziando con una lettera");
const payTable = z.record(z.string().regex(/^\d+$/, "la chiave deve essere un numero di simboli"), z.number().nonnegative());

export const manifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/, "usa solo lettere minuscole, cifre e -"),
    name: z.string().min(1),
    version: z.string().min(1),
    author: z.string().optional(),
    description: z.string().optional(),
    /** Versione dell'API del motore usata dal modulo. */
    engineApi: z.literal(1),
  })
  .strict();

export const reelsSchema = z
  .object({
    rows: z.number().int().min(1).max(10),
    modes: z
      .object({
        base: strips,
        /** Strisce dei free spin; se manca si usano quelle base. */
        free: strips.optional(),
      })
      /** Altre modalità, giocate solo su richiesta di uno script. */
      .catchall(strips)
      .superRefine((modes, ctx) => {
        for (const mode of Object.keys(modes)) {
          const parsed = modeId.safeParse(mode);
          if (!parsed.success) ctx.addIssue({ code: "custom", path: [mode], message: parsed.error.issues[0]!.message });
        }
      }),
  })
  .strict();

export const linesSchema = z.object({ lines: z.array(z.array(z.number().int().min(0))).min(1) }).strict();

export const paytableSchema = z
  .object({
    symbols: z.array(z.object({ id: symbolId, kind: z.enum(["normal", "wild", "scatter"]) }).strict()).min(1),
    /** Pagamenti su linea, in multipli della puntata per linea. */
    linePays: z.record(symbolId, payTable),
    /** Pagamenti scatter, in multipli della puntata totale. */
    scatterPays: payTable.optional(),
  })
  .strict();

export const featuresSchema = z
  .object({
    /** Rulli (da 1) su cui un wild si espande a coprire tutta la colonna. */
    expandingWild: z.object({ reels: z.array(z.number().int().min(1)).min(1) }).strict().optional(),
    freeSpins: z
      .object({
        trigger: z.object({ minScatters: z.number().int().min(1), spins: payTable }).strict(),
        retrigger: z.boolean().default(false),
        perExpandedWild: z
          .object({ extraSpins: z.number().int().min(0).default(0), upgrade: z.boolean().default(false) })
          .strict()
          .optional(),
        /** Dal simbolo meno pagante al più pagante. */
        upgradeLadder: z.array(symbolId).min(2).optional(),
        maxSpins: z.number().int().min(1).max(10_000).default(1_000),
      })
      .strict()
      .optional(),
    /** Vincita massima di un round, in multipli della puntata totale. */
    maxWin: z.number().positive().optional(),
  })
  .strict();

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "usa un colore esadecimale come #ffcc00");

/** Presentazione provvisoria: colori ed etichette dei simboli, finché non ci sono asset grafici. */
export const sceneSchema = z
  .object({
    background: color.optional(),
    symbols: z.record(symbolId, z.object({ label: z.string().min(1).optional(), color }).strict()).default({}),
    /** Nome mostrato per le modalità aggiunte dal modulo e, facoltativa, la regola per la paytable. */
    modes: z
      .record(modeId, z.object({ label: z.string().min(1), description: z.string().min(1).optional() }).strict())
      .default({}),
  })
  .strict();

export type Manifest = z.infer<typeof manifestSchema>;
export type ReelsFile = z.infer<typeof reelsSchema>;
export type LinesFile = z.infer<typeof linesSchema>;
export type PaytableFile = z.infer<typeof paytableSchema>;
export type FeaturesFile = z.input<typeof featuresSchema>;
export type SceneFile = z.infer<typeof sceneSchema>;
