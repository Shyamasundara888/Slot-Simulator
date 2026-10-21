import { IMAGE_EXTENSIONS, SOUND_EXTENSIONS } from "../../../src/module/schema.js";
import { t } from "../i18n/index.js";
import { h } from "./dom.js";
import type { TabContext } from "./tabs.js";

export type AssetKind = "image" | "sound";

const EXTENSIONS: Record<AssetKind, readonly string[]> = { image: IMAGE_EXTENSIONS, sound: SOUND_EXTENSIONS };

const extension = (path: string) => path.split(".").pop()!.toLowerCase();

/** Asset del modulo di un tipo, in ordine alfabetico. */
export function assetsOfKind(paths: Iterable<string>, kind: AssetKind): string[] {
  return [...paths].filter((p) => EXTENSIONS[kind].includes(extension(p))).sort();
}

/** Nome di file accettato dal modulo: lettere, cifre, punto, - e _. */
function safeName(name: string): string {
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${stem || "file"}.${extension(name)}`;
}

/** Percorso libero dentro `folder` per un file caricato; lo stesso file già presente riusa il suo percorso. */
function uploadPath(ctx: TabContext, folder: string, name: string, bytes: Uint8Array): string {
  const wanted = `${folder}${safeName(name)}`;
  const same = (path: string) => {
    const old = ctx.assetBytes(path);
    return old !== undefined && old.length === bytes.length && old.every((b, i) => b === bytes[i]);
  };
  const dot = wanted.lastIndexOf(".");
  for (let n = 1; ; n++) {
    const path = n === 1 ? wanted : `${wanted.slice(0, dot)}-${n}${wanted.slice(dot)}`;
    if (!ctx.assets.includes(path) || same(path)) return path;
  }
}

export interface AssetPickerOptions {
  /** Percorso per `data-path` e `data-key`, come "scenes/ui.json#elements.0.image". */
  path: string;
  kind: AssetKind;
  value: string | undefined;
  onChange(path: string | undefined): void;
  /** Cartella in cui finiscono i file caricati, per esempio "assets/ui/". */
  folder: string;
  /** Falso se il campo non si può lasciare vuoto. */
  optional?: boolean;
  label?: string;
}

/**
 * Scelta di un'immagine o di un suono del modulo, con anteprima e caricamento
 * di un file nuovo. Lo usano le schede dell'editor che si riferiscono agli
 * asset, come Interfaccia.
 */
export function assetPicker(ctx: TabContext, options: AssetPickerOptions): HTMLElement {
  const { path, kind, value, onChange, folder, optional = true } = options;
  const choices = assetsOfKind(ctx.assets, kind);
  const select = h(
    "select",
    {
      "data-key": path,
      "data-path": path,
      "aria-label": options.label ?? "",
      onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value || undefined),
    },
    ...(optional || !value ? [new Option(t(optional ? "editor.assets.none" : "editor.assets.choose"), "")] : []),
    ...choices.map((p) => new Option(p.replace(/^assets\//, ""), p)),
  );
  // Un percorso che manca tra gli asset resta visibile, così il problema segnalato si capisce.
  if (value && !choices.includes(value)) select.append(new Option(t("editor.assets.missing", { path: value }), value));
  select.value = value ?? "";

  const input = h("input", {
    type: "file",
    hidden: true,
    accept: EXTENSIONS[kind].map((e) => `.${e}`).join(","),
    onchange: async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (!EXTENSIONS[kind].includes(extension(file.name))) return ctx.notify(t("editor.assets.badType", { types: EXTENSIONS[kind].join(", ") }));
      const bytes = new Uint8Array(await file.arrayBuffer());
      const target = uploadPath(ctx, folder, file.name, bytes);
      ctx.addAsset(target, bytes);
      onChange(target);
    },
  });
  const url = value ? ctx.assetUrls.get(value) : undefined;
  const preview =
    kind === "image"
      ? url
        ? h("img", { class: "ed-asset-thumb", src: url, alt: "" })
        : null
      : url
        ? h("button", { type: "button", title: t("editor.assets.play"), "aria-label": t("editor.assets.play"), onclick: () => void new Audio(url).play().catch(() => undefined) }, "▶")
        : null;
  return h(
    "span",
    { class: "ed-asset" },
    preview,
    select,
    h("button", { type: "button", "data-key": `${path}-upload`, onclick: () => input.click() }, t("editor.assets.upload")),
    input,
  );
}
