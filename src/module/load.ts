import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import type { SlotMath } from "../core/types.js";
import { buildSlotMath, ModuleError } from "./build.js";
import { linesSchema, type Manifest, manifestSchema, paytableSchema, reelsSchema } from "./schema.js";

export interface SlotModule {
  dir: string;
  manifest: Manifest;
  math: SlotMath;
}

async function readJson<S extends z.ZodTypeAny>(dir: string, file: string, schema: S): Promise<z.infer<S>> {
  const path = join(dir, file);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    throw new ModuleError([`${file}: impossibile leggere il file (${(err as Error).message})`]);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ModuleError(parsed.error.issues.map((i) => `${file}: ${i.path.join(".") || "(radice)"}: ${i.message}`));
  }
  return parsed.data;
}

/** Carica un modulo slot da una cartella (manifest.json + math/). */
export async function loadSlotModule(dir: string): Promise<SlotModule> {
  const manifest = await readJson(dir, "manifest.json", manifestSchema);
  const [reels, lines, paytable] = await Promise.all([
    readJson(dir, "math/reels.json", reelsSchema),
    readJson(dir, "math/lines.json", linesSchema),
    readJson(dir, "math/paytable.json", paytableSchema),
  ]);
  return { dir, manifest, math: buildSlotMath(reels, lines, paytable) };
}
