import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ModuleError } from "./build.js";
import { MODULE_FILES, parseSlotModule, type SlotModule } from "./parse.js";
import { decodeModuleFiles, readModuleZip } from "./zip.js";

export type { SlotModule } from "./parse.js";

/** Legge da una cartella i file grezzi di un modulo; quelli facoltativi possono mancare. */
export async function readModuleDir(dir: string): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  await Promise.all(
    Object.values(MODULE_FILES).map(async (file) => {
      try {
        files[file] = await readFile(join(dir, file));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
        throw new ModuleError([`${file}: impossibile leggere il file (${(err as Error).message})`]);
      }
    }),
  );
  return files;
}

/** Carica un modulo slot da una cartella o da uno zip. */
export async function loadSlotModule(path: string): Promise<SlotModule> {
  if (path.endsWith(".zip")) {
    let data: Uint8Array;
    try {
      data = await readFile(path);
    } catch (err) {
      throw new ModuleError([`${path}: impossibile leggere lo zip (${(err as Error).message})`]);
    }
    return parseSlotModule(readModuleZip(data));
  }
  return parseSlotModule(decodeModuleFiles(await readModuleDir(path)));
}
