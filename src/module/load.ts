import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { z } from "zod";
import type { SlotMath } from "../core/types.js";
import { buildSlotMath, ModuleError } from "./build.js";
import { featuresSchema, linesSchema, type Manifest, manifestSchema, paytableSchema, reelsSchema } from "./schema.js";

export interface SlotModule {
  dir: string;
  manifest: Manifest;
  math: SlotMath;
}

async function readJson<S extends z.ZodTypeAny>(
  dir: string,
  file: string,
  schema: S,
  optional = false,
): Promise<z.infer<S>> {
  const path = join(dir, file);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    if (!optional || (err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new ModuleError([`${file}: impossibile leggere il file (${(err as Error).message})`]);
    }
    raw = {};
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ModuleError(parsed.error.issues.map((i) => `${file}: ${i.path.join(".") || "(radice)"}: ${i.message}`));
  }
  return parsed.data;
}

/** Carica un modulo slot da una cartella (manifest.json + math/; math/features.json è facoltativo). */
export async function loadSlotModule(dir: string): Promise<SlotModule> {
  const manifest = await readJson(dir, "manifest.json", manifestSchema);
  const [reels, lines, paytable, features] = await Promise.all([
    readJson(dir, "math/reels.json", reelsSchema),
    readJson(dir, "math/lines.json", linesSchema),
    readJson(dir, "math/paytable.json", paytableSchema),
    readJson(dir, "math/features.json", featuresSchema, true),
  ]);
  return { dir, manifest, math: buildSlotMath(reels, lines, paytable, features) };
}
