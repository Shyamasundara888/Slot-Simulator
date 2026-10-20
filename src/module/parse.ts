import type { z } from "zod";
import type { Mode, SlotMath, SymbolId, SymbolKind } from "../core/types.js";
import { buildSlotMath, ModuleError } from "./build.js";
import {
  featuresSchema,
  linesSchema,
  type Manifest,
  manifestSchema,
  paytableSchema,
  reelsSchema,
  sceneSchema,
} from "./schema.js";

/** File di un modulo, con il percorso relativo alla sua cartella. */
export const MODULE_FILES = {
  manifest: "manifest.json",
  reels: "math/reels.json",
  lines: "math/lines.json",
  paytable: "math/paytable.json",
  features: "math/features.json",
  scene: "scenes/main.json",
  /** Script Lua con le regole aggiuntive, letto come testo. */
  script: "scripts/main.lua",
} as const;

const OPTIONAL_FILES: ReadonlySet<string> = new Set([MODULE_FILES.features, MODULE_FILES.scene, MODULE_FILES.script]);

export interface SymbolStyle {
  label: string;
  color: string;
}

export interface ModeStyle {
  label: string;
  description?: string | undefined;
}

export interface Scene {
  background: string;
  symbols: ReadonlyMap<SymbolId, SymbolStyle>;
  /** Solo le modalità che la scena descrive. */
  modes: ReadonlyMap<Mode, ModeStyle>;
}

export interface SlotModule {
  manifest: Manifest;
  math: SlotMath;
  scene: Scene;
  /** Sorgente di scripts/main.lua, se il modulo ne ha uno. */
  script: string | null;
}

/** Colori usati per i simboli che la scena non descrive. */
const DEFAULT_COLORS: Record<SymbolKind, string[]> = {
  wild: ["#f5b301"],
  scatter: ["#d6336c"],
  normal: ["#4dabf7", "#69db7c", "#b197fc", "#ffa94d", "#63e6be", "#ff8787", "#74c0fc", "#a9e34b", "#e599f7"],
};

function validate<S extends z.ZodTypeAny>(file: string, schema: S, raw: unknown): z.infer<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ModuleError(parsed.error.issues.map((i) => `${file}: ${i.path.join(".") || "(radice)"}: ${i.message}`));
  }
  return parsed.data;
}

/**
 * Valida e unisce i file di un modulo, indicizzati per percorso relativo (vedi
 * MODULE_FILES): i JSON già letti come oggetti, lo script come testo.
 * Funziona sia in Node sia nel browser.
 */
export function parseSlotModule(files: Readonly<Record<string, unknown>>): SlotModule {
  const missing = Object.values(MODULE_FILES).filter((f) => files[f] === undefined && !OPTIONAL_FILES.has(f));
  if (missing.length > 0) throw new ModuleError(missing.map((f) => `${f}: file mancante`));

  const manifest = validate(MODULE_FILES.manifest, manifestSchema, files[MODULE_FILES.manifest]);
  const math = buildSlotMath(
    validate(MODULE_FILES.reels, reelsSchema, files[MODULE_FILES.reels]),
    validate(MODULE_FILES.lines, linesSchema, files[MODULE_FILES.lines]),
    validate(MODULE_FILES.paytable, paytableSchema, files[MODULE_FILES.paytable]),
    validate(MODULE_FILES.features, featuresSchema, files[MODULE_FILES.features] ?? {}),
  );
  const sceneFile = validate(MODULE_FILES.scene, sceneSchema, files[MODULE_FILES.scene] ?? {});

  const unknown = [
    ...Object.keys(sceneFile.symbols)
      .filter((id) => !math.symbols.has(id))
      .map((id) => `simbolo non definito ${id}`),
    ...Object.keys(sceneFile.modes)
      .filter((mode) => !math.reels[mode])
      .map((mode) => `modalità senza strisce dei rulli ${mode}`),
  ];
  if (unknown.length > 0) throw new ModuleError(unknown.map((p) => `${MODULE_FILES.scene}: ${p}`));

  const script = files[MODULE_FILES.script] ?? null;
  if (script !== null && typeof script !== "string") {
    throw new ModuleError([`${MODULE_FILES.script}: lo script va passato come testo`]);
  }

  const used: Record<SymbolKind, number> = { wild: 0, scatter: 0, normal: 0 };
  const symbols = new Map<SymbolId, SymbolStyle>();
  for (const [id, kind] of math.symbols) {
    const style = sceneFile.symbols[id];
    const palette = DEFAULT_COLORS[kind];
    symbols.set(id, {
      label: style?.label ?? id,
      color: style?.color ?? palette[used[kind]++ % palette.length]!,
    });
  }

  return {
    manifest,
    math,
    scene: { background: sceneFile.background ?? "#1b1430", symbols, modes: new Map(Object.entries(sceneFile.modes)) },
    script,
  };
}
