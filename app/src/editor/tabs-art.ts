import { buildTiles, IMAGE_FOLDER, setBackgroundImage, setMotion, setSound, setSymbolArt, SOUND_FOLDER, symbolStyle, type TileOptions } from "../../../src/edit/art.js";
import { type Motion, MOTIONS, type MotionKind, SOUND_EVENTS } from "../../../src/module/schema.js";
import { t } from "../i18n/index.js";
import { motionPose } from "../pose.js";
import { assetPicker } from "./assets.js";
import { h, numberValue } from "./dom.js";
import { numberField, row, type TabContext } from "./tabs.js";
import { checkbox } from "./tabs-math.js";

const FILE = "scenes/main.json";
const DOCS_URL = "https://github.com/Shyamasundara888/Slot-Simulator/blob/main/docs/asset.md#disegni-che-si-muovono";
const DEFAULT_MOTION: Motion = { win: "pop", shine: true, land: false, strength: 1 };

/** Scelte della scheda che non stanno nel modulo: simbolo aperto e impostazioni delle tessere. */
export interface ArtView {
  symbol: string | null;
  /** Disegno da cui creare le tessere, per simbolo. */
  sources: Record<string, string>;
  tiles: TileOptions;
}

export const DEFAULT_ART_VIEW: ArtView = { symbol: null, sources: {}, tiles: { look: "smooth", frame: "#c9a227", frames: 3 } };

/**
 * Scheda Grafica e suoni: immagini, tessere, fotogrammi di vincita e movimento dei
 * simboli, sfondo e suoni della scena. Lavora su scenes/main.json e sugli asset, così
 * vale per ogni slot, anche importata da uno zip senza le sorgenti in art/.
 */
export function artTab(ctx: TabContext): HTMLElement {
  const ids = ctx.draft.paytable.symbols.map((s) => s.id);
  const open = ctx.view.art.symbol && ids.includes(ctx.view.art.symbol) ? ctx.view.art.symbol : (ids[0] ?? null);
  const effective = (id: string) => ctx.lastValid?.scene.symbols.get(id);
  const thumb = (id: string) => {
    const image = ctx.draft.scene.symbols?.[id]?.image ?? effective(id)?.image;
    const url = image ? ctx.assetUrls.get(image) : undefined;
    const color = ctx.draft.scene.symbols?.[id]?.color ?? effective(id)?.color ?? "#4dabf7";
    return url ? h("img", { class: "icon", src: url, alt: "" }) : h("span", { class: "swatch", style: `background:${color}` });
  };
  queuePreviews();
  return h(
    "div",
    {},
    h("p", { class: "ed-hint" }, t("editor.art.hint"), " ", h("a", { class: "ed-link", href: DOCS_URL, target: "_blank", rel: "noopener" }, t("editor.art.docs"))),
    h("h3", {}, t("editor.art.symbols")),
    h(
      "div",
      { class: "ed-art-symbols", role: "list" },
      ...ids.map((id) =>
        h(
          "button",
          {
            type: "button", role: "listitem", class: id === open ? "selected" : "", "data-key": `art-symbol-${id}`,
            onclick: () => ctx.setView({ art: { ...ctx.view.art, symbol: id } }),
          },
          thumb(id),
          h("span", {}, id),
        ),
      ),
    ),
    open ? symbolForm(ctx, open) : null,
    backgroundSection(ctx),
    soundsSection(ctx),
  );
}

function symbolForm(ctx: TabContext, id: string): HTMLElement {
  const style = ctx.draft.scene.symbols?.[id];
  const color = style?.color ?? ctx.lastValid?.scene.symbols.get(id)?.color ?? "#4dabf7";
  const path = (key: string) => `${FILE}#symbols.${id}.${key}`;
  const picker = (key: "image" | "art" | "tile", value: string | undefined, label: string) =>
    row(label, assetPicker(ctx, { path: path(key), kind: "image", value, folder: IMAGE_FOLDER, label, onChange: (p) => ctx.apply((d) => setSymbolArt(d, id, { [key]: p })) }));

  // Tessere da un disegno: lo stesso risultato di npm run assets -- build, fatto nel browser.
  const tiles = ctx.view.art.tiles;
  const source = ctx.view.art.sources[id];
  const setTiles = (change: Partial<TileOptions>) => ctx.setView({ art: { ...ctx.view.art, tiles: { ...tiles, ...change } } });
  const create = () => {
    const bytes = source ? ctx.assetBytes(source) : undefined;
    if (!source || !bytes) return ctx.notify(t("editor.art.tilesNoSource"));
    const built = buildTiles(id, { path: source, bytes }, color, tiles);
    for (const [file, data] of Object.entries(built.files)) ctx.addAsset(file, data);
    ctx.apply((d) => setSymbolArt(d, id, symbolStyle(d, id, color).motion ? built.moving : { ...built.still, art: built.moving.art, tile: built.moving.tile }));
    ctx.notify(t("editor.art.tilesDone", { id, count: Object.keys(built.files).length }));
  };
  const tilesSet = h(
    "fieldset",
    { class: "ed-grid" },
    h("legend", {}, t("editor.art.tiles")),
    row(
      t("editor.art.source"),
      assetPicker(ctx, {
        path: `art-source-${id}`, kind: "image", value: source, folder: IMAGE_FOLDER, label: t("editor.art.source"),
        onChange: (p) => ctx.setView({ art: { ...ctx.view.art, sources: { ...ctx.view.art.sources, [id]: p ?? "" } } }),
      }),
      t("editor.art.sourceHint"),
    ),
    h(
      "div",
      { class: "ed-inline" },
      row(
        t("editor.art.look"),
        h(
          "select",
          { "data-key": "art-look", onchange: (e: Event) => setTiles({ look: (e.target as HTMLSelectElement).value as TileOptions["look"] }) },
          ...(["smooth", "pixel"] as const).map((look) => {
            const option = new Option(t(`editor.art.look.${look}`), look);
            option.selected = look === tiles.look;
            return option;
          }),
        ),
      ),
      row(t("editor.art.frame"), h("input", { type: "color", value: tiles.frame, "data-key": "art-frame", onchange: (e: Event) => setTiles({ frame: (e.target as HTMLInputElement).value }) })),
      row(
        t("editor.art.glowFrames"),
        h("input", {
          type: "number", min: 1, max: 8, step: 1, value: tiles.frames, "data-key": "art-frames",
          onchange: (e: Event) => {
            const value = numberValue(e.target as HTMLInputElement);
            if (value !== null && value >= 1 && value <= 8) setTiles({ frames: Math.round(value) });
          },
        }),
      ),
    ),
    h("div", {}, h("button", { type: "button", "data-key": `art-create-${id}`, disabled: !source, onclick: create }, t("editor.art.tilesCreate"))),
    h("p", { class: "ed-hint" }, t("editor.art.tilesHint", { color })),
  );

  // Fotogrammi mostrati in ciclo quando il simbolo vince.
  const frames = style?.winFrames ?? [];
  const setFrames = (next: string[]) => ctx.apply((d) => setSymbolArt(d, id, { winFrames: next }));
  const framesSet = h(
    "fieldset",
    { class: "ed-grid", "data-path": path("winFrames") },
    h("legend", {}, t("editor.art.winFrames")),
    h(
      "ol",
      { class: "ed-frames" },
      ...frames.map((frame, i) =>
        h(
          "li",
          {},
          assetPicker(ctx, {
            path: `${path("winFrames")}.${i}`, kind: "image", value: frame, folder: IMAGE_FOLDER, optional: false,
            onChange: (p) => p && setFrames(frames.map((f, k) => (k === i ? p : f))),
          }),
          " ",
          h("button", { type: "button", "data-key": `art-frame-remove-${i}`, onclick: () => setFrames(frames.filter((_, k) => k !== i)) }, t("editor.ui.frameRemove")),
        ),
      ),
    ),
    h(
      "div",
      { class: "ed-inline" },
      h("button", { type: "button", "data-key": "art-frame-add", onclick: () => setFrames([...frames, frames.at(-1) ?? style?.image ?? ""].filter(Boolean)) }, t("editor.ui.frameAdd")),
      row(t("editor.art.fps"), numberField(path("fps"), style?.fps, (v) => ctx.apply((d) => setSymbolArt(d, id, { fps: v === null ? undefined : v })), { min: 1, max: 60, step: 1 })),
    ),
    h("p", { class: "ed-hint" }, t("editor.art.winFramesHint")),
  );

  // Movimento del disegno sopra la tessera.
  // Nella bozza i campi del movimento possono mancare: valgono i predefiniti dello schema.
  const m = style?.motion;
  const motion: Motion | undefined = m
    ? { win: m.win ?? DEFAULT_MOTION.win, shine: m.shine ?? DEFAULT_MOTION.shine, land: m.land ?? DEFAULT_MOTION.land, strength: m.strength ?? DEFAULT_MOTION.strength }
    : undefined;
  const update = (change: Partial<Motion> | null) =>
    ctx.apply((d) => setMotion(d, id, change === null ? undefined : { ...DEFAULT_MOTION, ...motion, ...change }, ctx.assets));
  const motionSet = h(
    "fieldset",
    { class: "ed-grid", "data-path": `${FILE}#symbols.${id}` },
    h("legend", {}, t("editor.art.motion")),
    row(
      t("editor.art.motionWin"),
      h(
        "select",
        {
          "data-key": path("motion.win"), "data-path": path("motion.win"),
          onchange: (e: Event) => {
            const value = (e.target as HTMLSelectElement).value;
            update(value ? { win: value as MotionKind } : null);
          },
        },
        new Option(t("editor.art.motionNone"), ""),
        ...MOTIONS.map((kind) => new Option(t(`editor.art.motion.${kind}`), kind)),
      ),
      motion ? t(`editor.art.motionHint.${motion.win}`) : t("editor.art.motionOff"),
    ),
    picker("art", style?.art, t("editor.art.drawing")),
    picker("tile", style?.tile, t("editor.art.emptyTile")),
    motion
      ? h(
          "div",
          { class: "ed-inline" },
          checkbox("art-shine", motion.shine, t("editor.art.shine"), (on) => update({ shine: on })),
          checkbox("art-land", motion.land, t("editor.art.land"), (on) => update({ land: on })),
          row(
            t("editor.art.strength"),
            numberField(path("motion.strength"), motion.strength, (v) => v !== null && v >= 0.2 && v <= 3 && update({ strength: v }), { min: 0.2, max: 3, step: 0.1 }),
          ),
        )
      : null,
    preview(ctx, style?.art, style?.tile ?? style?.image, motion),
  );
  (motionSet.querySelector("select") as HTMLSelectElement).value = motion?.win ?? "";

  return h(
    "div",
    { class: "ed-ui-form" },
    h("h3", {}, t("editor.art.editing", { id })),
    h("fieldset", { class: "ed-grid" }, h("legend", {}, t("editor.art.image")), picker("image", style?.image, t("editor.art.image"))),
    tilesSet,
    framesSet,
    motionSet,
  );
}

/** Tessera e disegno sovrapposti; con il movimento il disegno si anima come nel gioco. */
function preview(ctx: TabContext, art: string | undefined, tile: string | undefined, motion: Motion | undefined): HTMLElement | null {
  const tileUrl = tile ? ctx.assetUrls.get(tile) : undefined;
  const artUrl = art ? ctx.assetUrls.get(art) : undefined;
  if (!tileUrl && !artUrl) return null;
  const drawing = artUrl && motion ? h("img", { src: artUrl, alt: "", "data-motion": motion.win, "data-strength": motion.strength }) : null;
  return h(
    "div",
    { class: "ed-art-preview-row" },
    h("div", { class: "ed-art-preview", "aria-label": t("editor.art.preview") }, tileUrl ? h("img", { src: tileUrl, alt: "" }) : null, drawing),
    h("small", {}, motion ? t("editor.art.previewHint") : t("editor.art.previewStill")),
  );
}

let previewFrame = 0;
const previewStart = performance.now();

/** Anima i disegni con data-motion finché ce ne sono nella pagina. */
function queuePreviews(): void {
  if (previewFrame) return;
  const step = () => {
    const images = document.querySelectorAll<HTMLImageElement>("#editor img[data-motion]");
    if (images.length === 0) {
      previewFrame = 0;
      return;
    }
    // Il movimento riparte ogni 3 secondi, così si vede anche l'entrata.
    const t = ((performance.now() - previewStart) / 1000) % 3;
    for (const img of images) {
      const pose = motionPose(img.dataset.motion as MotionKind, t, Number(img.dataset.strength) || 1);
      const skew = pose.wave ? ` skewX(${(pose.wave * 40 * Math.sin(Math.PI * 2 * 1.8 * t)).toFixed(2)}deg)` : "";
      img.style.transform = `translateY(${(pose.dy * 100).toFixed(2)}%) rotate(${pose.rotation}rad) scale(${pose.scale * pose.sx}, ${pose.scale * pose.sy})${skew}`;
    }
    previewFrame = requestAnimationFrame(step);
  };
  previewFrame = requestAnimationFrame(step);
}

function backgroundSection(ctx: TabContext): HTMLElement {
  return h(
    "fieldset",
    { class: "ed-grid" },
    h("legend", {}, t("editor.art.background")),
    h(
      "div",
      { class: "ed-inline" },
      row(
        t("editor.general.background"),
        h("input", {
          type: "color", value: ctx.draft.scene.background ?? "#1b1430", "data-key": `${FILE}#background`, "data-path": `${FILE}#background`,
          onchange: (e: Event) => ctx.apply((d) => void (d.scene.background = (e.target as HTMLInputElement).value)),
        }),
      ),
      row(
        t("editor.art.backgroundImage"),
        assetPicker(ctx, {
          path: `${FILE}#backgroundImage`, kind: "image", value: ctx.draft.scene.backgroundImage, folder: IMAGE_FOLDER, label: t("editor.art.backgroundImage"),
          onChange: (p) => ctx.apply((d) => setBackgroundImage(d, p)),
        }),
        t("editor.art.backgroundHint"),
      ),
    ),
  );
}

function soundsSection(ctx: TabContext): HTMLElement {
  const sounds = (ctx.draft.scene.sounds ?? {}) as Partial<Record<(typeof SOUND_EVENTS)[number], string>>;
  return h(
    "fieldset",
    { class: "ed-grid" },
    h("legend", {}, t("editor.art.sounds")),
    ...SOUND_EVENTS.map((event) =>
      row(
        t(`editor.art.sound.${event}`),
        assetPicker(ctx, {
          path: `${FILE}#sounds.${event}`, kind: "sound", value: sounds[event], folder: SOUND_FOLDER, label: t(`editor.art.sound.${event}`),
          onChange: (p) => ctx.apply((d) => setSound(d, event, p)),
        }),
      ),
    ),
    h("p", { class: "ed-hint" }, t("editor.art.soundsHint")),
  );
}
