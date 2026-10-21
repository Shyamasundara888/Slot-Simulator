import type { UiFile } from "../module/schema.js";
import { centeredReels, DEFAULT_STAGE, type UiBox } from "../module/ui.js";
import { type ModuleDraft, reelCount } from "./draft.js";

/** Un elemento di scenes/ui.json come sta nel file, con i campi facoltativi assenti. */
export type UiElementDraft = NonNullable<UiFile["elements"]>[number];
export type UiElementType = UiElementDraft["type"];
type UiDraft = UiFile & { elements: UiElementDraft[] };

/** Tipi di elemento nell'ordine in cui l'editor li propone. */
export const UI_TYPES: readonly UiElementType[] = ["counter", "meter", "ladder", "text", "image", "panel", "picker"];

/** Testi di partenza degli elementi nuovi: l'editor li passa nella lingua dell'interfaccia. */
export interface ElementTexts {
  label: string;
  text: string;
  title: string;
  button: string;
}

const TEXTS: ElementTexts = { label: "Free spin", text: "Fino a {maxWin}x la puntata", title: "Bonus", button: "OK" };

/** Lato minimo di un elemento o dei rulli quando si ridimensionano. */
export const MIN_SIDE = 8;

/** Il file scenes/ui.json della bozza; lo crea vuoto se il modulo non lo ha. */
export function ensureUi(draft: ModuleDraft): UiDraft {
  draft.ui ??= { elements: [] };
  draft.ui.elements ??= [];
  return draft.ui as UiDraft;
}

export const uiElements = (draft: ModuleDraft): readonly UiElementDraft[] => draft.ui?.elements ?? [];

export const stageOf = (draft: ModuleDraft) => draft.ui?.stage ?? DEFAULT_STAGE;

/** Riquadro dei rulli: quello del file, oppure quello al centro che il client usa quando manca. */
export const reelsBoxOf = (draft: ModuleDraft): UiBox =>
  draft.ui?.reels ?? centeredReels(stageOf(draft), reelCount(draft), draft.reels.rows);

/** Primo id libero a partire da `base`: base, base-2, base-3, ... */
export function freeElementId(draft: ModuleDraft, base: string): string {
  const used = new Set(uiElements(draft).map((e) => e.id));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Misura di partenza di ogni tipo, in unità dello stage. */
const SIZES: Record<UiElementType, [number, number]> = {
  counter: [140, 90],
  meter: [300, 56],
  ladder: [360, 64],
  text: [320, 40],
  image: [120, 120],
  panel: [420, 260],
  picker: [480, 260],
};

/** Riquadro arrotondato e tenuto dentro lo stage. */
function fit(draft: ModuleDraft, box: UiBox): UiBox {
  const stage = stageOf(draft);
  const width = Math.round(Math.min(stage.width, Math.max(MIN_SIDE, box.width)));
  const height = Math.round(Math.min(stage.height, Math.max(MIN_SIDE, box.height)));
  return {
    x: Math.round(Math.min(stage.width - width, Math.max(0, box.x))),
    y: Math.round(Math.min(stage.height - height, Math.max(0, box.y))),
    width,
    height,
  };
}

/**
 * Aggiunge un elemento al centro dello stage, con valori di partenza validi.
 * Un'immagine usa `image`, se c'è; senza, il modulo segnala che ne manca una.
 * Restituisce la posizione del nuovo elemento nell'elenco.
 */
export function addElement(draft: ModuleDraft, type: UiElementType, options: { texts?: Partial<ElementTexts>; image?: string | undefined } = {}): number {
  const ui = ensureUi(draft);
  const texts = { ...TEXTS, ...options.texts };
  const stage = stageOf(draft);
  const [w, hgt] = SIZES[type];
  const box = fit(draft, { x: (stage.width - w) / 2, y: (stage.height - hgt) / 2, width: w, height: hgt });
  const base = { id: freeElementId(draft, type), ...box };
  const look = { background: "#0f1a2b", opacity: 0.85, border: "#ffd43b" };
  let element: UiElementDraft;
  switch (type) {
    case "counter":
      element = { ...base, type, label: texts.label, value: "free.remaining", format: "{value} / {free.total}", ...look };
      break;
    case "meter":
      element = { ...base, type, label: texts.label, value: "free.played", max: 10, ...look };
      break;
    case "ladder":
      element = { ...base, type, value: "multiplier", steps: ["1", "2", "3", "5"], ...look };
      break;
    case "text":
      element = { ...base, type, text: texts.text };
      break;
    case "image":
      element = options.image ? { ...base, type, image: options.image } : { ...base, type };
      break;
    case "panel":
      element = { ...base, type, title: texts.title, text: texts.text, button: texts.button };
      break;
    case "picker":
      element = { ...base, type, title: texts.title, count: 3 };
      break;
  }
  ui.elements.push(element);
  return ui.elements.length - 1;
}

/** Copia un elemento subito dopo l'originale, spostata un poco e con un id nuovo. */
export function duplicateElement(draft: ModuleDraft, index: number): number {
  const ui = ensureUi(draft);
  const source = ui.elements[index];
  if (!source) return -1;
  const copy = structuredClone(source);
  copy.id = freeElementId(draft, source.id.replace(/-\d+$/, ""));
  Object.assign(copy, fit(draft, { x: source.x + 16, y: source.y + 16, width: source.width, height: source.height }));
  ui.elements.splice(index + 1, 0, copy);
  return index + 1;
}

export function removeElement(draft: ModuleDraft, index: number): void {
  draft.ui?.elements?.splice(index, 1);
}

/** Sposta un elemento nell'elenco: quelli dopo si disegnano sopra quelli prima. */
export function moveElement(draft: ModuleDraft, index: number, delta: number): void {
  const list = draft.ui?.elements;
  const to = index + delta;
  if (!list || index < 0 || index >= list.length || to < 0 || to >= list.length) return;
  const [element] = list.splice(index, 1);
  list.splice(to, 0, element!);
}

/** Cambia un elemento; `change` riceve l'elemento com'è nel file. */
export function updateElement(draft: ModuleDraft, index: number, change: (element: UiElementDraft) => void): void {
  const element = draft.ui?.elements?.[index];
  if (element) change(element);
}

/** Cambia un campo facoltativo; undefined, "" e i valori uguali al predefinito lo tolgono dal file. */
export function setElementField(draft: ModuleDraft, index: number, field: string, value: unknown): void {
  updateElement(draft, index, (element) => {
    const record = element as Record<string, unknown>;
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) delete record[field];
    else record[field] = value;
  });
}

/** Posizione e misura di un elemento, arrotondate e tenute dentro lo stage. */
export function setElementBox(draft: ModuleDraft, index: number, box: UiBox): void {
  updateElement(draft, index, (element) => Object.assign(element, fit(draft, box)));
}

/**
 * Cambia la misura dello stage. Con `scale` rulli ed elementi si allargano o
 * si stringono nella stessa proporzione; senza, restano dove sono e quelli
 * che escono vengono segnalati dal controllo del modulo.
 */
export function setStage(draft: ModuleDraft, width: number, height: number, scale = false): void {
  const ui = ensureUi(draft);
  const old = stageOf(draft);
  ui.stage = { width: Math.round(width), height: Math.round(height) };
  if (!scale) return;
  const sx = width / old.width;
  const sy = height / old.height;
  const resize = (b: UiBox): UiBox => ({ x: Math.round(b.x * sx), y: Math.round(b.y * sy), width: Math.round(b.width * sx), height: Math.round(b.height * sy) });
  if (ui.reels) ui.reels = fit(draft, resize(ui.reels));
  for (const element of ui.elements) Object.assign(element, fit(draft, resize(element)));
}

/** Riquadro dei rulli; null li rimette al centro. */
export function setReelsBox(draft: ModuleDraft, box: UiBox | null): void {
  const ui = ensureUi(draft);
  if (box) ui.reels = fit(draft, box);
  else delete ui.reels;
}

/**
 * Valori che uno script pubblica: script.<nome> da ui.set e ui.add,
 * session.<nome> dalla tabella session. Servono a suggerirli nei campi.
 */
export function scriptValues(script: string | null): string[] {
  if (!script) return [];
  const found = new Set<string>();
  for (const [, name] of script.matchAll(/ui\.(?:set|add)\(\s*["']([a-z][a-z0-9_]*)["']/g)) found.add(`script.${name}`);
  for (const [, name] of script.matchAll(/\bsession\.([a-z][a-z0-9_]*)/g)) found.add(`session.${name}`);
  return [...found].sort();
}
