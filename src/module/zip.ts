import { strFromU8, unzipSync, zipSync } from "fflate";
import { ModuleError } from "./build.js";
import { MODULE_FILES, parseSlotModule, type SlotModule } from "./parse.js";

/** Limiti di un pacchetto mod, per non leggere archivi enormi o malformati. */
export const ZIP_LIMITS = { entries: 500, bytes: 50 * 1024 * 1024 } as const;

const KNOWN: ReadonlySet<string> = new Set(Object.values(MODULE_FILES));

/** Cartella degli asset di un modulo: immagini e suoni usati dalla scena. */
export const ASSETS_DIR = "assets/";

/** Percorsi degli asset tra i file grezzi di un modulo. */
export const assetPaths = (raw: Readonly<Record<string, Uint8Array>>) => Object.keys(raw).filter((p) => p.startsWith(ASSETS_DIR));

/** Un percorso dentro lo zip è accettato solo se resta nella cartella del modulo. */
function safePath(name: string): boolean {
  return !name.startsWith("/") && !name.includes("\\") && !name.split("/").some((part) => part === ".." || part === ".");
}

/** File che macOS e Windows aggiungono da soli quando si comprime una cartella. */
function isJunk(name: string): boolean {
  const base = name.split("/").pop()!;
  return name.startsWith("__MACOSX/") || base === ".DS_Store" || base === "Thumbs.db";
}

/**
 * Estrae da uno zip i file di un modulo, indicizzati per percorso relativo
 * alla cartella del modulo: quelli di MODULE_FILES e quelli in assets/.
 *
 * Lo zip può contenere i file direttamente oppure dentro una sola cartella
 * (com'è comune quando si comprime una cartella). Gli altri file vengono
 * ignorati.
 */
export function unpackModuleZip(data: Uint8Array): Record<string, Uint8Array> {
  let entries = 0;
  let bytes = 0;
  const problems: string[] = [];
  let raw: Record<string, Uint8Array>;
  try {
    raw = unzipSync(data, {
      filter: (file) => {
        if (++entries > ZIP_LIMITS.entries) throw new ModuleError([`zip: più di ${ZIP_LIMITS.entries} file`]);
        bytes += file.originalSize;
        if (bytes > ZIP_LIMITS.bytes) throw new ModuleError([`zip: più di ${ZIP_LIMITS.bytes / 1024 / 1024} MB una volta estratto`]);
        if (!safePath(file.name)) problems.push(`zip: percorso non ammesso ${file.name}`);
        return !file.name.endsWith("/") && !isJunk(file.name);
      },
    });
  } catch (err) {
    if (err instanceof ModuleError) throw err;
    throw new ModuleError([`zip: archivio non valido (${(err as Error).message})`]);
  }
  if (problems.length > 0) throw new ModuleError(problems);

  // Se tutti i file stanno in una sola cartella, quella è la radice del modulo.
  const names = Object.keys(raw);
  const top = new Set(names.map((n) => n.split("/")[0]));
  const prefix = top.size === 1 && names.every((n) => n.includes("/")) ? `${[...top][0]}/` : "";
  if (!names.includes(`${prefix}${MODULE_FILES.manifest}`)) {
    throw new ModuleError([`zip: manca ${MODULE_FILES.manifest} nella radice dell'archivio`]);
  }

  const files: Record<string, Uint8Array> = {};
  for (const name of names) {
    const file = name.slice(prefix.length);
    if (KNOWN.has(file) || file.startsWith(ASSETS_DIR)) files[file] = raw[name]!;
  }
  return files;
}

/** Interpreta i file di un modulo: i JSON come oggetti, lo script come testo. Gli asset restano fuori. */
export function decodeModuleFiles(raw: Readonly<Record<string, Uint8Array>>): Record<string, unknown> {
  const problems: string[] = [];
  const files: Record<string, unknown> = {};
  for (const [file, bytes] of Object.entries(raw)) {
    if (!KNOWN.has(file)) continue;
    const text = strFromU8(bytes);
    if (!file.endsWith(".json")) {
      files[file] = text;
      continue;
    }
    try {
      files[file] = JSON.parse(text);
    } catch (err) {
      problems.push(`${file}: JSON non valido (${(err as Error).message})`);
    }
  }
  if (problems.length > 0) throw new ModuleError(problems);
  return files;
}

/** Legge uno zip di un modulo e lo valida, controllando anche gli asset usati dalla scena. */
export function parseModuleZip(data: Uint8Array): { module: SlotModule; raw: Record<string, Uint8Array> } {
  const raw = unpackModuleZip(data);
  return { module: parseSlotModule(decodeModuleFiles(raw), assetPaths(raw)), raw };
}

/** Legge uno zip di un modulo e restituisce i file pronti per parseSlotModule. */
export function readModuleZip(data: Uint8Array): Record<string, unknown> {
  return decodeModuleFiles(unpackModuleZip(data));
}

/** Crea lo zip di un modulo a partire dai suoi file, indicizzati per percorso relativo. */
export function writeModuleZip(files: Readonly<Record<string, Uint8Array>>): Uint8Array {
  // Data fissa: lo stesso modulo produce sempre lo stesso zip.
  const mtime = new Date(2020, 0, 1);
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, [bytes, { mtime }]])));
}
