import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ModuleError } from "./build.js";
import { MODULE_FILES, parseSlotModule, type SlotModule } from "./parse.js";

export type { SlotModule } from "./parse.js";

/** Carica un modulo slot da una cartella; i file facoltativi possono mancare. */
export async function loadSlotModule(dir: string): Promise<SlotModule> {
  const files: Record<string, unknown> = {};
  await Promise.all(
    Object.values(MODULE_FILES).map(async (file) => {
      let text: string;
      try {
        text = await readFile(join(dir, file), "utf8");
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
        throw new ModuleError([`${file}: impossibile leggere il file (${(err as Error).message})`]);
      }
      if (!file.endsWith(".json")) {
        files[file] = text;
        return;
      }
      try {
        files[file] = JSON.parse(text);
      } catch (err) {
        throw new ModuleError([`${file}: JSON non valido (${(err as Error).message})`]);
      }
    }),
  );
  return parseSlotModule(files);
}
