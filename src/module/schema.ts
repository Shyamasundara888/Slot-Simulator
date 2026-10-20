import { z } from "zod";

const symbolId = z.string().regex(/^[A-Z0-9_]+$/, "usa solo lettere maiuscole, cifre e _");
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
    modes: z.object({ base: z.array(z.array(symbolId).min(1)).min(1) }).strict(),
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

export type Manifest = z.infer<typeof manifestSchema>;
export type ReelsFile = z.infer<typeof reelsSchema>;
export type LinesFile = z.infer<typeof linesSchema>;
export type PaytableFile = z.infer<typeof paytableSchema>;
