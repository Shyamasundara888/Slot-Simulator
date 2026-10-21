import { type ModuleDraft, reelModes } from "../../../src/edit/draft.js";
import {
  addElement,
  duplicateElement,
  moveElement,
  reelsBoxOf,
  removeElement,
  scriptValues,
  setElementBox,
  setElementField,
  setReelsBox,
  setStage,
  stageOf,
  UI_TYPES,
  type UiElementDraft,
  type UiElementType,
  uiElements,
  updateElement,
} from "../../../src/edit/ui.js";
import { MAX_OPTIONS, UI_ANIMATIONS, UI_VALUES, uiElementSchema } from "../../../src/module/schema.js";
import type { UiBox } from "../../../src/module/ui.js";
import { type Key, t } from "../i18n/index.js";
import { assetPicker, assetsOfKind } from "./assets.js";
import { h } from "./dom.js";
import { numberField, row, type TabContext, textField } from "./tabs.js";
import { checkbox, modeName } from "./tabs-math.js";

const FILE = "scenes/ui.json";
const ELEMENT_ID = /^[a-z][a-z0-9_-]*$/;
/** Cartella dei file caricati dalla scheda. */
const FOLDER = "assets/ui/";
const DOCS_URL = "https://github.com/Shyamasundara888/Slot-Simulator/blob/main/docs/modulo.md#scenesuijson";

type FieldKind = "text" | "textarea" | "number" | "optNumber" | "color" | "optColor" | "select" | "image" | "sound" | "value" | "steps";
interface Field {
  key: string;
  kind: FieldKind;
  choices?: readonly string[];
  attrs?: Record<string, string | number>;
}

const f = (key: string, kind: FieldKind, extra: Omit<Field, "key" | "kind"> = {}): Field => ({ key, kind, ...extra });

/** Campi che dicono cosa mostra un elemento, per tipo. Immagini e pannelli hanno anche parti a mano. */
const CONTENT: Record<UiElementType, Field[]> = {
  counter: [f("label", "text"), f("value", "value"), f("format", "text")],
  meter: [
    f("label", "text"),
    f("value", "value"),
    f("max", "number", { attrs: { min: 1 } }),
    f("style", "select", { choices: ["bar", "segments"] }),
    f("direction", "select", { choices: ["right", "up"] }),
    f("fillColor", "color"),
    f("fill", "image"),
  ],
  ladder: [f("label", "text"), f("value", "value"), f("steps", "steps"), f("direction", "select", { choices: ["row", "column"] }), f("highlight", "color")],
  text: [f("text", "textarea"), f("align", "select", { choices: ["left", "center", "right"] })],
  image: [],
  panel: [f("title", "text"), f("text", "textarea"), f("image", "image"), f("accent", "color")],
  picker: [
    f("title", "text"),
    f("count", "number", { attrs: { min: 2, max: 30, step: 1 } }),
    f("columns", "optNumber", { attrs: { min: 1, max: 30, step: 1 } }),
    f("cover", "image"),
    f("coverColor", "color"),
    f("accent", "color"),
  ],
};

/** Aspetto del riquadro e del testo: tutti i tipi tranne image. */
const LOOK: Field[] = [
  f("color", "color"),
  f("fontSize", "optNumber", { attrs: { min: 1, max: 200 } }),
  f("frame", "image"),
  f("background", "optColor"),
  f("opacity", "number", { attrs: { min: 0, max: 1, step: 0.05 } }),
  f("border", "optColor"),
];

const BEHAVIOUR: Field[] = [f("layer", "select", { choices: ["above", "below"] }), f("onChange", "select", { choices: UI_ANIMATIONS }), f("sound", "sound")];

const fieldLabel = (key: string) => t(`editor.ui.field.${key}` as Key);

/** Problemi del modulo che riguardano l'elemento: dalla validazione dei campi o dal controllo di coerenza. */
function elementProblems(ctx: TabContext, index: number, id: string): string[] {
  return ctx.problems.filter((p) => p.startsWith(`${FILE}: elements.${index}.`) || p.startsWith(`${FILE}: elemento ${id}:`));
}

export function uiTab(ctx: TabContext): HTMLElement {
  const { draft } = ctx;
  const elements = uiElements(draft);
  const selected = ctx.view.uiElement !== null && ctx.view.uiElement < elements.length ? ctx.view.uiElement : null;
  const select = (index: number | null) => ctx.setView({ uiElement: index });
  const imageAssets = assetsOfKind(ctx.assets, "image");

  const add = h(
    "select",
    {
      "data-key": "ui-add",
      "aria-label": t("editor.ui.add"),
      onchange: (e: Event) => {
        const type = (e.target as HTMLSelectElement).value as UiElementType;
        if (!type) return;
        const texts = { label: t("editor.ui.new.label"), text: t("editor.ui.new.text"), title: t("editor.ui.new.title"), button: t("editor.ui.new.button") };
        let index = -1;
        ctx.apply((d) => void (index = addElement(d, type, { texts, image: imageAssets[0] })));
        select(index);
      },
    },
    new Option(t("editor.ui.add"), ""),
    ...UI_TYPES.map((type) => new Option(t(`editor.ui.type.${type}`), type)),
  );

  return h(
    "div",
    { class: "ed-ui" },
    h("p", { class: "ed-hint" }, t("editor.ui.hint"), " ", h("a", { href: DOCS_URL, target: "_blank", rel: "noopener" }, t("editor.ui.docs"))),
    stageFields(ctx),
    modeFilter(ctx),
    stageMap(ctx, selected),
    h("h3", {}, t("editor.ui.elements")),
    elements.length === 0 ? h("p", { class: "ed-hint" }, t("editor.ui.empty")) : elementList(ctx, selected),
    h("p", {}, add),
    selected === null ? null : elementForm(ctx, selected),
  );
}

// --- stage e rulli ---

function stageFields(ctx: TabContext): HTMLElement {
  const { draft } = ctx;
  const stage = stageOf(draft);
  const custom = draft.ui?.reels;
  const reels = reelsBoxOf(draft);
  const setSize = (width: number | null, height: number | null) => {
    if (width === null || height === null || width < 300 || width > 4000 || height < 200 || height > 4000) return ctx.notify(t("editor.ui.stageRange"));
    ctx.apply((d) => setStage(d, width, height, ctx.view.uiScale));
  };
  const reelField = (key: keyof UiBox) =>
    row(
      fieldLabel(key),
      numberField(`${FILE}#reels.${key}`, custom?.[key], (v) => v !== null && ctx.apply((d) => setReelsBox(d, { ...reelsBoxOf(d), [key]: v })), { min: key === "x" || key === "y" ? 0 : 1, step: 1 }),
    );
  return h(
    "fieldset",
    { class: "ed-grid", "data-path": `${FILE}#reels` },
    h("legend", {}, t("editor.ui.stage")),
    h(
      "div",
      { class: "ed-inline" },
      row(t("editor.ui.stageWidth"), numberField(`${FILE}#stage.width`, stage.width, (v) => setSize(v, stage.height), { min: 300, max: 4000, step: 1 })),
      row(t("editor.ui.stageHeight"), numberField(`${FILE}#stage.height`, stage.height, (v) => setSize(stage.width, v), { min: 200, max: 4000, step: 1 })),
      checkbox("ui-scale", ctx.view.uiScale, t("editor.ui.scale"), (on) => ctx.setView({ uiScale: on })),
    ),
    h("div", {}, checkbox("ui-reels-centered", !custom, t("editor.ui.reelsCentered"), (on) => ctx.apply((d) => setReelsBox(d, on ? null : reels)))),
    custom ? h("div", { class: "ed-inline" }, ...(["x", "y", "width", "height"] as const).map(reelField)) : null,
    h("p", { class: "ed-hint" }, t("editor.ui.stageHint")),
  );
}

/** Modalità di cui la mappa mostra gli elementi; "" mostra tutti. */
function modeFilter(ctx: TabContext): HTMLElement {
  const modes = ["", ...reelModes(ctx.draft)];
  return h(
    "div",
    { class: "ed-modes" },
    h("span", { class: "ed-hint" }, t("editor.ui.showIn")),
    ...modes.map((m) =>
      h(
        "button",
        {
          type: "button", class: m === ctx.view.uiMode ? "active" : "", "data-key": `ui-mode-${m || "all"}`, "aria-pressed": String(m === ctx.view.uiMode),
          onclick: () => ctx.setView({ uiMode: m }),
        },
        m ? modeName(ctx.draft, m) : t("editor.ui.allModes"),
      ),
    ),
  );
}

const pct = (value: number, of: number) => `${((value / of) * 100).toFixed(3)}%`;

function placeBox(el: HTMLElement, box: UiBox, stage: { width: number; height: number }): void {
  el.style.left = pct(box.x, stage.width);
  el.style.top = pct(box.y, stage.height);
  el.style.width = pct(box.width, stage.width);
  el.style.height = pct(box.height, stage.height);
}

/**
 * Rende trascinabile un riquadro della mappa: trascinandolo si sposta,
 * trascinando l'angolo in basso a destra si ridimensiona. La bozza cambia
 * solo al rilascio, così ogni trascinamento è un solo passo di annulla.
 */
function draggable(el: HTMLElement, box: UiBox, stage: { width: number; height: number }, onDone: (box: UiBox) => void, onClick: () => void): void {
  const handle = h("span", { class: "ed-stage-handle", "aria-hidden": "true" });
  el.append(handle);
  el.addEventListener("pointerdown", (down: PointerEvent) => {
    if (down.button !== 0) return;
    down.preventDefault();
    const resize = down.target === handle;
    const map = el.parentElement!.getBoundingClientRect();
    const scale = stage.width / map.width;
    let next = box;
    let moved = false;
    el.setPointerCapture(down.pointerId);
    el.classList.add("dragging");
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - down.clientX) * scale;
      const dy = (e.clientY - down.clientY) * scale;
      if (!moved && Math.hypot(dx, dy) < 3 * scale) return;
      moved = true;
      next = resize
        ? { ...box, width: Math.min(stage.width - box.x, Math.max(8, box.width + dx)), height: Math.min(stage.height - box.y, Math.max(8, box.height + dy)) }
        : { ...box, x: Math.min(stage.width - box.width, Math.max(0, box.x + dx)), y: Math.min(stage.height - box.height, Math.max(0, box.y + dy)) };
      placeBox(el, next, stage);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.classList.remove("dragging");
      if (moved) onDone(next);
      else onClick();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  });
  // Frecce: sposta di 1 (10 con Maiusc); con Alt ridimensiona.
  el.addEventListener("keydown", (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!delta) return;
    e.preventDefault();
    const [dx, dy] = delta as [number, number];
    onDone(e.altKey ? { ...box, width: box.width + dx, height: box.height + dy } : { ...box, x: box.x + dx, y: box.y + dy });
  });
}

function stageMap(ctx: TabContext, selected: number | null): HTMLElement {
  const { draft } = ctx;
  const stage = stageOf(draft);
  const background = draft.scene.backgroundImage ? ctx.assetUrls.get(draft.scene.backgroundImage) : undefined;
  const map = h("div", {
    class: "ed-stage",
    style: `aspect-ratio: ${stage.width} / ${stage.height}; background-color: ${draft.scene.background ?? "#1b1430"};${background ? ` background-image: url("${background}");` : ""}`,
    "aria-label": t("editor.ui.map"),
  });

  const custom = draft.ui?.reels;
  const reels = h("div", { class: custom ? "ed-stage-reels" : "ed-stage-reels centered", "data-key": "ui-box-reels", tabindex: custom ? 0 : -1, title: t("editor.ui.reels") }, h("span", {}, t("editor.ui.reels")));
  placeBox(reels, reelsBoxOf(draft), stage);
  if (custom) draggable(reels, custom, stage, (box) => ctx.apply((d) => setReelsBox(d, box)), () => undefined);
  map.append(reels);

  const mode = ctx.view.uiMode;
  uiElements(draft).forEach((element, i) => {
    if (mode && element.visibleIn && !element.visibleIn.includes(mode)) return;
    const classes = ["ed-stage-el", element.layer === "below" ? "below" : "", i === selected ? "selected" : "", elementProblems(ctx, i, element.id).length ? "invalid" : ""];
    const box = h(
      "div",
      { class: classes.filter(Boolean).join(" "), "data-key": `ui-box-${i}`, tabindex: 0, title: `${element.id} (${t(`editor.ui.type.${element.type}`)})` },
      h("span", {}, element.id),
    );
    const image = element.type === "image" ? (element.image ?? element.frames?.[0]) : "frame" in element ? element.frame : undefined;
    const url = image ? ctx.assetUrls.get(image) : undefined;
    if (url) box.style.backgroundImage = `url("${url}")`;
    placeBox(box, element, stage);
    draggable(box, element, stage, (b) => (ctx.apply((d) => setElementBox(d, i, b)), select()), select);
    function select() {
      if (selected !== i) ctx.setView({ uiElement: i });
    }
    map.append(box);
  });
  return h("div", { class: "ed-stage-wrap" }, map, h("p", { class: "ed-hint" }, t("editor.ui.mapHint")));
}

// --- elenco ---

function elementList(ctx: TabContext, selected: number | null): HTMLElement {
  const { draft } = ctx;
  const elements = uiElements(draft);
  const visible = (e: UiElementDraft) => (e.visibleIn ?? []).map((m) => modeName(draft, m)).join(", ") || t("editor.ui.always");
  return h(
    "table",
    { class: "ed-table ed-ui-list" },
    h(
      "thead",
      {},
      h("tr", {}, h("th", {}, ""), h("th", {}, t("editor.ui.field.id")), h("th", {}, t("editor.ui.field.type")), h("th", {}, t("editor.ui.field.visibleIn")), h("th", {}, "")),
    ),
    h(
      "tbody",
      {},
      ...elements.map((element, i) =>
        h(
          "tr",
          {
            class: [i === selected ? "selected" : "", elementProblems(ctx, i, element.id).length ? "invalid" : ""].filter(Boolean).join(" "),
            "data-path": `${FILE}#elemento ${element.id}`,
          },
          h(
            "td",
            { class: "ed-order" },
            h("button", { type: "button", "data-key": `ui-up-${i}`, title: t("editor.ui.up"), "aria-label": t("editor.ui.up"), disabled: i === 0, onclick: () => (ctx.apply((d) => moveElement(d, i, -1)), ctx.setView({ uiElement: i - 1 })) }, "↑"),
            h("button", { type: "button", "data-key": `ui-down-${i}`, title: t("editor.ui.down"), "aria-label": t("editor.ui.down"), disabled: i === elements.length - 1, onclick: () => (ctx.apply((d) => moveElement(d, i, 1)), ctx.setView({ uiElement: i + 1 })) }, "↓"),
          ),
          h("td", {}, h("button", { type: "button", class: "ed-link", "data-key": `ui-select-${i}`, onclick: () => ctx.setView({ uiElement: i }) }, element.id)),
          h("td", {}, t(`editor.ui.type.${element.type}`)),
          h("td", {}, visible(element)),
          h(
            "td",
            { class: "ed-order" },
            h("button", { type: "button", "data-key": `ui-duplicate-${i}`, title: t("editor.ui.duplicate"), "aria-label": t("editor.ui.duplicate"), onclick: () => {
              let index = -1;
              ctx.apply((d) => void (index = duplicateElement(d, i)));
              ctx.setView({ uiElement: index });
            } }, "⧉"),
            h("button", {
              type: "button", class: "ed-danger", "data-key": `ui-remove-${i}`, title: t("editor.ui.remove"), "aria-label": t("editor.ui.remove"),
              onclick: () => {
                if (!confirm(t("editor.ui.removeConfirm", { id: element.id }))) return;
                ctx.apply((d) => removeElement(d, i));
                ctx.setView({ uiElement: null });
              },
            }, "✕"),
          ),
        ),
      ),
    ),
  );
}

// --- modulo dell'elemento scelto ---

function elementForm(ctx: TabContext, index: number): HTMLElement {
  const { draft } = ctx;
  const element = uiElements(draft)[index]!;
  // I valori predefiniti dello schema riempiono i campi assenti nel file.
  const parsed = uiElementSchema.safeParse(element);
  const shown = (parsed.success ? parsed.data : element) as Record<string, unknown>;
  const raw = element as Record<string, unknown>;
  const path = (key: string) => `${FILE}#elements.${index}.${key}`;
  const set = (key: string) => (value: unknown) => ctx.apply((d) => setElementField(d, index, key, value));

  const rename = (input: HTMLInputElement) => {
    const id = input.value.trim();
    if (id === element.id) return;
    if (!ELEMENT_ID.test(id)) {
      input.value = element.id;
      return ctx.notify(t("editor.ui.idInvalid", { id }));
    }
    if (uiElements(draft).some((e) => e.id === id)) {
      input.value = element.id;
      return ctx.notify(t("editor.ui.idTaken", { id }));
    }
    ctx.apply((d) => updateElement(d, index, (e) => void (e.id = id)));
    if (draft.script && new RegExp(`["']${element.id}["']`).test(draft.script)) ctx.notify(t("editor.ui.scriptMentions", { from: element.id, to: id }));
  };

  const field = (spec: Field): HTMLElement => {
    const { key, kind } = spec;
    const value = shown[key];
    const label = fieldLabel(key);
    switch (kind) {
      case "text":
        return row(label, textField(path(key), (raw[key] as string | undefined) ?? "", (v) => set(key)(v)), hintOf(key));
      case "textarea":
        return row(
          label,
          h("textarea", { rows: 2, value: (raw[key] as string | undefined) ?? "", "data-key": path(key), "data-path": path(key), onchange: (e: Event) => set(key)((e.target as HTMLTextAreaElement).value) }),
          hintOf(key),
        );
      case "number":
      case "optNumber":
        return row(label, numberField(path(key), value as number | undefined, (v) => set(key)(v ?? undefined), spec.attrs), hintOf(key));
      case "color":
        return row(label, h("input", { type: "color", value: (value as string | undefined) ?? "#ffffff", "data-key": path(key), "data-path": path(key), onchange: (e: Event) => set(key)((e.target as HTMLInputElement).value) }));
      case "optColor":
        return optionalColor(path(key), label, raw[key] as string | undefined, set(key));
      case "select":
        return row(
          label,
          h(
            "select",
            { "data-key": path(key), "data-path": path(key), onchange: (e: Event) => set(key)((e.target as HTMLSelectElement).value) },
            ...spec.choices!.map((c) => {
              const option = new Option(t(`editor.ui.opt.${key}.${c}` as Key), c);
              option.selected = c === value;
              return option;
            }),
          ),
        );
      case "image":
      case "sound":
        return row(label, assetPicker(ctx, { path: path(key), kind, value: raw[key] as string | undefined, onChange: set(key), folder: FOLDER, label }));
      case "value":
        return row(label, textField(path(key), (raw[key] as string | undefined) ?? "", (v) => set(key)(v.trim()), { list: "ed-ui-values", size: 18 }), t("editor.ui.valueHint"));
      case "steps":
        return row(
          label,
          textField(path(key), ((raw[key] as string[] | undefined) ?? []).join(", "), (v) => set(key)(v.split(",").map((s) => s.trim()).filter(Boolean)), { size: 30 }),
          t("editor.ui.stepsHint"),
        );
    }
  };

  const box = (["x", "y", "width", "height"] as const).map((key) =>
    row(fieldLabel(key), numberField(path(key), element[key], (v) => v !== null && ctx.apply((d) => setElementBox(d, index, { ...element, [key]: v })), { step: 1 })),
  );

  const visibleIn = h(
    "div",
    { class: "ed-field", "data-path": path("visibleIn") },
    h("span", {}, fieldLabel("visibleIn")),
    h(
      "div",
      {},
      ...reelModes(draft).map((m) =>
        checkbox(`ui-visible-${index}-${m}`, element.visibleIn?.includes(m) ?? false, modeName(draft, m), (on) =>
          ctx.apply((d) =>
            updateElement(d, index, (e) => {
              const modes = new Set(e.visibleIn ?? []);
              if (on) modes.add(m);
              else modes.delete(m);
              const ordered = reelModes(d).filter((x) => modes.has(x));
              if (ordered.length) e.visibleIn = ordered;
              else delete e.visibleIn;
            }),
          ),
        ),
      ),
    ),
    h("small", {}, t("editor.ui.visibleHint")),
  );

  const content: (HTMLElement | null)[] = CONTENT[element.type].map(field);
  if (element.type === "image") content.push(...imageFields(ctx, index, element, path));
  if (element.type === "panel") content.push(panelClosing(ctx, index, element, path));

  const problems = elementProblems(ctx, index, element.id);
  return h(
    "section",
    { class: "ed-ui-form", "aria-label": element.id },
    h("h3", {}, t("editor.ui.editing", { id: element.id, type: t(`editor.ui.type.${element.type}`) })),
    problems.length ? h("ul", { class: "ed-error" }, ...problems.map((p) => h("li", {}, p.replace(/^[^:]+: /, "")))) : null,
    h(
      "div",
      { class: "ed-inline" },
      row(fieldLabel("id"), h("input", { type: "text", value: element.id, size: 14, "data-key": path("id"), "data-path": path("id"), onchange: (e: Event) => rename(e.target as HTMLInputElement) })),
      ...box,
    ),
    h("fieldset", { class: "ed-grid" }, h("legend", {}, t("editor.ui.content")), ...content),
    element.type === "image"
      ? null
      : h("fieldset", { class: "ed-grid" }, h("legend", {}, t("editor.ui.look")), ...LOOK.map(field), element.type === "counter" ? field(f("labelColor", "optColor")) : null),
    h("fieldset", { class: "ed-grid" }, h("legend", {}, t("editor.ui.behaviour")), visibleIn, ...BEHAVIOUR.map(field)),
    h("datalist", { id: "ed-ui-values" }, ...valueOptions(draft)),
  );
}

function hintOf(key: string): string | undefined {
  return key === "format" || key === "text" ? t("editor.ui.placeholdersHint") : undefined;
}

/** Valori da suggerire nei campi value: quelli del round e quelli che lo script pubblica. */
function valueOptions(draft: ModuleDraft): HTMLOptionElement[] {
  return [
    ...UI_VALUES.map((v) => new Option(t(`editor.ui.value.${v}` as Key), v)),
    ...scriptValues(draft.script).map((v) => new Option(t("editor.ui.value.script"), v)),
  ];
}

/** Colore facoltativo: senza la spunta il campo non c'è nel file. */
function optionalColor(path: string, label: string, value: string | undefined, onChange: (value: string | undefined) => void): HTMLElement {
  const input = h("input", {
    type: "color", value: value ?? "#000000", disabled: value === undefined, "data-key": path, "data-path": path, "aria-label": label,
    onchange: (e: Event) => onChange((e.target as HTMLInputElement).value),
  });
  return h(
    "div",
    { class: "ed-field" },
    h("span", {}, label),
    h("div", { class: "ed-inline" }, checkbox(`${path}-on`, value !== undefined, t("editor.ui.use"), (on) => onChange(on ? input.value : undefined)), input),
  );
}

/** Immagine fissa oppure fotogrammi in ciclo. */
function imageFields(ctx: TabContext, index: number, element: Extract<UiElementDraft, { type: "image" }>, path: (key: string) => string): HTMLElement[] {
  const animated = element.frames !== undefined;
  const toggle = checkbox(`ui-animated-${index}`, animated, t("editor.ui.animated"), (on) =>
    ctx.apply((d) =>
      updateElement(d, index, (e) => {
        if (e.type !== "image") return;
        if (on) {
          e.frames = e.image ? [e.image] : [];
          delete e.image;
        } else {
          if (e.frames?.[0]) e.image = e.frames[0];
          delete e.frames;
          delete e.fps;
        }
      }),
    ),
  );
  if (!animated) {
    return [toggle, row(t("editor.ui.field.image"), assetPicker(ctx, { path: path("image"), kind: "image", value: element.image, onChange: (v) => ctx.apply((d) => setElementField(d, index, "image", v)), folder: FOLDER, optional: false }))];
  }
  const frames = element.frames ?? [];
  const setFrames = (next: string[]) => ctx.apply((d) => updateElement(d, index, (e) => void (e.type === "image" && (e.frames = next))));
  return [
    toggle,
    h(
      "div",
      { class: "ed-field", "data-path": path("frames") },
      h("span", {}, t("editor.ui.field.frames")),
      h(
        "ol",
        { class: "ed-frames" },
        ...frames.map((frame, i) =>
          h(
            "li",
            {},
            assetPicker(ctx, {
              path: path(`frames.${i}`), kind: "image", value: frame, folder: FOLDER, optional: false,
              onChange: (v) => v && setFrames(frames.map((x, j) => (j === i ? v : x))),
            }),
            h("button", { type: "button", class: "ed-danger", title: t("editor.ui.frameRemove"), "aria-label": t("editor.ui.frameRemove"), onclick: () => setFrames(frames.filter((_, j) => j !== i)) }, "✕"),
          ),
        ),
      ),
      assetPicker(ctx, { path: path(`frames.${frames.length}`), kind: "image", value: undefined, folder: FOLDER, label: t("editor.ui.frameAdd"), onChange: (v) => v && setFrames([...frames, v]) }),
    ),
    row(t("editor.ui.field.fps"), numberField(path("fps"), element.fps ?? 8, (v) => ctx.apply((d) => setElementField(d, index, "fps", v ?? undefined)), { min: 1, max: 60 })),
  ];
}

/** Come si chiude un pannello: con un pulsante, con una scelta fra opzioni, oppure da solo. */
function panelClosing(ctx: TabContext, index: number, element: Extract<UiElementDraft, { type: "panel" }>, path: (key: string) => string): HTMLElement {
  const mode = element.options ? "options" : element.button ? "button" : "auto";
  const change = (next: string) =>
    ctx.apply((d) =>
      updateElement(d, index, (e) => {
        if (e.type !== "panel") return;
        delete e.options;
        delete e.button;
        if (next === "button") e.button = t("editor.ui.new.button");
        if (next === "options") e.options = [{ label: t("editor.ui.new.option", { n: 1 }) }, { label: t("editor.ui.new.option", { n: 2 }) }];
      }),
    );
  const closing = row(
    t("editor.ui.closing"),
    h(
      "select",
      { "data-key": path("closing"), onchange: (e: Event) => change((e.target as HTMLSelectElement).value) },
      ...["button", "options", "auto"].map((c) => {
        const option = new Option(t(`editor.ui.closing.${c}` as Key), c);
        option.selected = c === mode;
        return option;
      }),
    ),
    t(`editor.ui.closingHint.${mode}` as Key),
  );
  const parts: (HTMLElement | null)[] = [closing];
  if (mode === "button") {
    parts.push(row(t("editor.ui.field.button"), textField(path("button"), element.button ?? "", (v) => ctx.apply((d) => setElementField(d, index, "button", v)))));
  }
  if (mode === "options") {
    const options = element.options ?? [];
    const setOption = (i: number, key: "label" | "text", value: string) =>
      ctx.apply((d) =>
        updateElement(d, index, (e) => {
          const option = e.type === "panel" ? e.options?.[i] : undefined;
          if (!option) return;
          if (key === "text" && value.trim() === "") delete option.text;
          else option[key] = value;
        }),
      );
    parts.push(
      h(
        "ol",
        { class: "ed-options" },
        ...options.map((option, i) =>
          h(
            "li",
            {},
            textField(path(`options.${i}.label`), option.label, (v) => setOption(i, "label", v), { size: 14, "aria-label": t("editor.ui.optionLabel"), placeholder: t("editor.ui.optionLabel") }),
            textField(path(`options.${i}.text`), option.text ?? "", (v) => setOption(i, "text", v), { size: 24, "aria-label": t("editor.ui.optionText"), placeholder: t("editor.ui.optionText") }),
            h(
              "button",
              {
                type: "button", class: "ed-danger", disabled: options.length <= 2, title: t("editor.ui.optionRemove"), "aria-label": t("editor.ui.optionRemove"),
                onclick: () => ctx.apply((d) => updateElement(d, index, (e) => void (e.type === "panel" && e.options?.splice(i, 1)))),
              },
              "✕",
            ),
          ),
        ),
      ),
      options.length < MAX_OPTIONS
        ? h(
            "button",
            {
              type: "button", "data-key": `ui-option-add-${index}`,
              onclick: () => ctx.apply((d) => updateElement(d, index, (e) => void (e.type === "panel" && e.options?.push({ label: t("editor.ui.new.option", { n: options.length + 1 }) })))),
            },
            t("editor.ui.optionAdd"),
          )
        : null,
      h("p", { class: "ed-hint" }, t("editor.ui.optionsHint")),
    );
  }
  return h("div", { class: "ed-field" }, ...parts);
}
