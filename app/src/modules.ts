import { ModuleError } from "../../src/module/build.js";
import { parseSlotModule, type SlotModule } from "../../src/module/parse.js";
import { parseModuleZip } from "../../src/module/zip.js";
import { ScriptRuntime } from "../../src/script/runtime.js";
import wasmUri from "wasmoon/dist/glue.wasm?url";

// Vite include nel bundle i JSON dei moduli presenti in slots/, i loro script come testo e gli asset come URL.
const files = {
  ...import.meta.glob<unknown>("../../slots/*/**/*.json", { eager: true, import: "default" }),
  ...import.meta.glob<string>("../../slots/*/scripts/*.lua", { eager: true, query: "?raw", import: "default" }),
};
const assetUrls = import.meta.glob<string>("../../slots/*/assets/**/*", { eager: true, query: "?url", import: "default" });

/** Un modulo pronto per il client: la sua definizione e l'URL di ogni asset, per percorso relativo. */
export interface ClientModule {
  module: SlotModule;
  assets: ReadonlyMap<string, string>;
}

export interface LoadedModule {
  folder: string;
  loaded?: ClientModule;
  error?: string;
}

function byFolder<T>(entries: Record<string, T>): Map<string, Record<string, T>> {
  const out = new Map<string, Record<string, T>>();
  for (const [path, value] of Object.entries(entries)) {
    const match = /\/slots\/([^/]+)\/(.+)$/.exec(path);
    if (!match) continue;
    const [, folder, file] = match as unknown as [string, string, string];
    if (!out.has(folder)) out.set(folder, {});
    out.get(folder)![file] = value;
  }
  return out;
}

/** Raggruppa i file per cartella del modulo e li valida. */
export function loadBundledModules(): LoadedModule[] {
  const assets = byFolder(assetUrls);
  return [...byFolder(files)].map(([folder, moduleFiles]) => {
    const urls = new Map(Object.entries(assets.get(folder) ?? {}));
    try {
      return { folder, loaded: { module: parseSlotModule(moduleFiles, urls.keys()), assets: urls } };
    } catch (err) {
      return { folder, error: errorText(err) };
    }
  });
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
};

/**
 * Valida uno zip di un mod e crea un URL per ogni asset. Gli errori sono
 * messaggi per chi ha creato il mod. Con `checkScript` prova anche a caricare
 * lo script: serve prima di installare un mod.
 */
export async function loadModZip(zip: Uint8Array, checkScript = false): Promise<ClientModule> {
  const { module, raw } = parseModuleZip(zip);
  if (checkScript && module.script !== null) await ScriptRuntime.create(module.math, module.script, { wasmUri });
  const assets = new Map<string, string>();
  for (const [path, bytes] of Object.entries(raw)) {
    if (!path.startsWith("assets/")) continue;
    const type = MIME[path.split(".").pop()!.toLowerCase()] ?? "application/octet-stream";
    assets.set(path, URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type })));
  }
  return { module, assets };
}

/** Libera gli URL creati per gli asset di un mod. */
export function releaseAssets({ assets }: ClientModule): void {
  for (const url of assets.values()) if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}

export const errorText = (err: unknown) => (err instanceof ModuleError ? err.message : String(err));
