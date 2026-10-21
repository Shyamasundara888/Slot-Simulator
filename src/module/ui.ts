import type { SlotMath } from "../core/types.js";
import { unknownPlaceholders } from "../ui/values.js";
import type { UiElement, uiSchema } from "./schema.js";
import type { z } from "zod";

/** Misura dello stage quando il modulo non la dichiara: è quella delle prime slot. */
export const DEFAULT_STAGE = { width: 900, height: 520 } as const;

/** Segmenti al massimo in una barra a segmenti. */
export const MAX_SEGMENTS = 50;

export interface UiBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Layout ed elementi di interfaccia di un modulo, già validati. */
export interface UiLayout {
  stage: { width: number; height: number };
  /** Riquadro dei rulli; null = al centro dello stage, come nelle prime slot. */
  reels: UiBox | null;
  elements: readonly UiElement[];
}

/** Tutti gli asset a cui fanno riferimento gli elementi. */
export function uiAssets(ui: UiLayout): string[] {
  const paths = new Set<string>();
  for (const element of ui.elements) {
    if (element.sound) paths.add(element.sound);
    if ("frame" in element && element.frame) paths.add(element.frame);
    if (element.type === "meter" && element.fill) paths.add(element.fill);
    if (element.type === "image") for (const path of [element.image, ...(element.frames ?? [])]) if (path) paths.add(path);
    if (element.type === "panel" && element.image) paths.add(element.image);
    if (element.type === "picker" && element.cover) paths.add(element.cover);
  }
  return [...paths];
}

/** Immagini usate dagli elementi (gli asset senza i suoni). */
export function uiImages(ui: UiLayout): string[] {
  const sounds = new Set(ui.elements.map((e) => e.sound));
  return uiAssets(ui).filter((path) => !sounds.has(path));
}

/**
 * Controlla la coerenza di scenes/ui.json con il resto del modulo e
 * restituisce il layout, oppure l'elenco dei problemi.
 */
export function buildUi(file: z.output<typeof uiSchema>, math: SlotMath): { ui: UiLayout; problems: string[] } {
  const stage = file.stage ?? DEFAULT_STAGE;
  const problems: string[] = [];
  const outside = (b: UiBox) => b.x < 0 || b.y < 0 || b.x + b.width > stage.width || b.y + b.height > stage.height;
  if (file.reels && outside(file.reels)) problems.push(`reels: il riquadro dei rulli esce dallo stage ${stage.width}x${stage.height}`);

  const seen = new Set<string>();
  for (const element of file.elements) {
    const at = `elemento ${element.id}`;
    if (seen.has(element.id)) problems.push(`${at}: id ripetuto`);
    seen.add(element.id);
    if (outside(element)) problems.push(`${at}: esce dallo stage ${stage.width}x${stage.height}`);
    for (const mode of element.visibleIn ?? []) {
      if (!math.reels[mode]) problems.push(`${at}: visibleIn cita una modalità senza strisce dei rulli ${mode}`);
    }
    const texts: [string, string | undefined][] = [];
    switch (element.type) {
      case "counter":
        texts.push(["format", element.format]);
        break;
      case "text":
        texts.push(["text", element.text]);
        break;
      case "panel":
        texts.push(["title", element.title], ["text", element.text]);
        for (const [i, option] of (element.options ?? []).entries()) texts.push([`options.${i}.text`, option.text]);
        if (element.options && element.button) problems.push(`${at}: un pannello ha options oppure button, non tutti e due`);
        break;
      case "picker":
        break;
      case "meter":
        if (element.style === "segments" && element.max > MAX_SEGMENTS) {
          problems.push(`${at}: con style "segments" max può arrivare al più a ${MAX_SEGMENTS}`);
        }
        break;
      case "image":
        if (!element.image === !element.frames) problems.push(`${at}: serve image oppure frames (uno solo dei due)`);
        break;
      case "ladder":
        break;
    }
    for (const [field, text] of texts) {
      for (const name of unknownPlaceholders(text ?? "", element.type === "counter")) {
        problems.push(`${at}: ${field} usa un segnaposto sconosciuto {${name}}`);
      }
    }
  }
  return { ui: { stage, reels: file.reels ?? null, elements: file.elements }, problems };
}
