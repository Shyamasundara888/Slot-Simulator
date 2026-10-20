import { ModuleError } from "../../src/module/build.js";
import { parseSlotModule, type SlotModule } from "../../src/module/parse.js";
import { readModuleZip } from "../../src/module/zip.js";
import { ScriptRuntime } from "../../src/script/runtime.js";
import wasmUri from "wasmoon/dist/glue.wasm?url";

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

/** Valida uno zip di un mod; gli errori sono messaggi per chi l'ha creato. */
export function parseModZip(zip: Uint8Array): SlotModule {
  return parseSlotModule(readModuleZip(zip));
}

/** Come parseModZip, ma prova anche a caricare lo script: serve prima di installare un mod. */
export async function validateModZip(zip: Uint8Array): Promise<SlotModule> {
  const module = parseModZip(zip);
  if (module.script !== null) await ScriptRuntime.create(module.math, module.script, { wasmUri });
  return module;
}

export const errorText = (err: unknown) => (err instanceof ModuleError ? err.message : String(err));
