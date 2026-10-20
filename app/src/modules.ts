import { ModuleError } from "../../src/module/build.js";
import { parseSlotModule, type SlotModule } from "../../src/module/parse.js";

// Vite include nel bundle tutti i JSON dei moduli presenti in slots/ e i loro script come testo.
const files = {
  ...import.meta.glob<unknown>("../../slots/*/**/*.json", { eager: true, import: "default" }),
  ...import.meta.glob<string>("../../slots/*/scripts/*.lua", { eager: true, query: "?raw", import: "default" }),
};

export interface LoadedModule {
  folder: string;
  module?: SlotModule;
  error?: string;
}

/** Raggruppa i file per cartella del modulo e li valida. */
export function loadBundledModules(): LoadedModule[] {
  const byFolder = new Map<string, Record<string, unknown>>();
  for (const [path, json] of Object.entries(files)) {
    const match = /\/slots\/([^/]+)\/(.+)$/.exec(path);
    if (!match) continue;
    const [, folder, file] = match as unknown as [string, string, string];
    if (!byFolder.has(folder)) byFolder.set(folder, {});
    byFolder.get(folder)![file] = json;
  }
  return [...byFolder].map(([folder, moduleFiles]) => {
    try {
      return { folder, module: parseSlotModule(moduleFiles) };
    } catch (err) {
      return { folder, error: err instanceof ModuleError ? err.message : String(err) };
    }
  });
}
