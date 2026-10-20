import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { ModuleError } from "./build.js";
import { MODULE_FILES, parseSlotModule, type SlotModule } from "./parse.js";
import { ASSETS_DIR, assetPaths, decodeModuleFiles, parseModuleZip } from "./zip.js";

export type { SlotModule } from "./parse.js";

/** Elenca ricorsivamente i file di assets/, con percorsi relativi alla cartella del modulo. */
async function listAssets(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(join(dir, ASSETS_DIR), { recursive: true, withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join("/"));
}

/** Legge da una cartella i file grezzi di un modulo, asset compresi; quelli facoltativi possono mancare. */
export async function readModuleDir(dir: string): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  await Promise.all(
    [...Object.values(MODULE_FILES), ...(await listAssets(dir))].map(async (file) => {
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
    return parseModuleZip(data).module;
  }
  const raw = await readModuleDir(path);
  return parseSlotModule(decodeModuleFiles(raw), assetPaths(raw));
}
