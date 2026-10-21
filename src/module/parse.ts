import type { z } from "zod";
import type { Mode, SlotMath, SymbolId, SymbolKind } from "../core/types.js";
import { buildSlotMath, ModuleError } from "./build.js";
import {
  featuresSchema,
  linesSchema,
  type Manifest,
  manifestSchema,
  type Motion,
  type Rig,
  paytableSchema,
  reelsSchema,
  sceneSchema,
  SOUND_EVENTS,
  uiSchema,
} from "./schema.js";
import { buildUi, uiAssets, type UiLayout } from "./ui.js";

/** File di un modulo, con il percorso relativo alla sua cartella. */
export const MODULE_FILES = {
  manifest: "manifest.json",
  reels: "math/reels.json",
  lines: "math/lines.json",
  paytable: "math/paytable.json",
  features: "math/features.json",
  scene: "scenes/main.json",
  /** Layout dello stage ed elementi di interfaccia. */
  ui: "scenes/ui.json",
  /** Script Lua con le regole aggiuntive, letto come testo. */
  script: "scripts/main.lua",
} as const;

const OPTIONAL_FILES: ReadonlySet<string> = new Set([MODULE_FILES.features, MODULE_FILES.scene, MODULE_FILES.ui, MODULE_FILES.script]);

export interface SymbolStyle {
  label: string;
  color: string;
  /** Percorsi relativi alla cartella del modulo, come assets/drago.svg. */
  image?: string | undefined;
  winFrames?: readonly string[] | undefined;
  fps: number;
  /** Disegno e tessera separati, per il movimento del disegno (motion). */
  art?: string | undefined;
  tile?: string | undefined;
  motion?: Motion | undefined;
  /** Parti del disegno che si muovono da sole nelle vincite. */
  rig?: Rig | undefined;
}

export interface ModeStyle {
  label: string;
  description?: string | undefined;
}

export type SoundEvent = (typeof SOUND_EVENTS)[number];

export interface Scene {
  background: string;
  backgroundImage?: string | undefined;
  sounds: Partial<Record<SoundEvent, string>>;
  symbols: ReadonlyMap<SymbolId, SymbolStyle>;
  /** Solo le modalità che la scena descrive. */
  modes: ReadonlyMap<Mode, ModeStyle>;
}

export interface SlotModule {
  manifest: Manifest;
  math: SlotMath;
  scene: Scene;
  /** Stage, riquadro dei rulli ed elementi di interfaccia (scenes/ui.json). */
  ui: UiLayout;
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

/** Tutti gli asset a cui fa riferimento una scena. */
export function sceneAssets(scene: Scene): string[] {
  const paths = new Set<string>();
  if (scene.backgroundImage) paths.add(scene.backgroundImage);
  for (const style of scene.symbols.values()) {
    for (const path of [style.image, style.art, style.tile]) if (path) paths.add(path);
    for (const frame of style.winFrames ?? []) paths.add(frame);
  }
  for (const path of Object.values(scene.sounds)) if (path) paths.add(path);
  return [...paths];
}

/**
 * Valida e unisce i file di un modulo, indicizzati per percorso relativo (vedi
 * MODULE_FILES): i JSON già letti come oggetti, lo script come testo.
 * Con `assets` (i percorsi dei file in assets/) controlla anche che la scena
 * usi solo asset presenti. Funziona sia in Node sia nel browser.
 */
export function parseSlotModule(files: Readonly<Record<string, unknown>>, assets?: Iterable<string>): SlotModule {
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

  const built = buildUi(validate(MODULE_FILES.ui, uiSchema, files[MODULE_FILES.ui] ?? {}), math);
  if (built.problems.length > 0) throw new ModuleError(built.problems.map((p) => `${MODULE_FILES.ui}: ${p}`));
  const { ui } = built;

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
      image: style?.image,
      winFrames: style?.winFrames,
      fps: style?.fps ?? 8,
      art: style?.art,
      tile: style?.tile,
      motion: style?.motion,
      rig: style?.rig,
    });
  }

  const scene: Scene = {
    background: sceneFile.background ?? "#1b1430",
    backgroundImage: sceneFile.backgroundImage,
    symbols,
    modes: new Map(Object.entries(sceneFile.modes)),
    sounds: Object.fromEntries(Object.entries(sceneFile.sounds).filter(([, path]) => path !== undefined)),
  };
  if (assets) {
    const present = new Set(assets);
    const missing = [
      ...sceneAssets(scene)
        .filter((path) => !present.has(path))
        .map((path) => `${MODULE_FILES.scene}: asset mancante ${path}`),
      ...uiAssets(ui)
        .filter((path) => !present.has(path))
        .map((path) => `${MODULE_FILES.ui}: asset mancante ${path}`),
    ];
    if (missing.length > 0) throw new ModuleError(missing);
  }
  return { manifest, math, scene, ui, script };
}
