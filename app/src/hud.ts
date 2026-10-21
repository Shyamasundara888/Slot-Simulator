import { Container, Graphics, Sprite, Text, type Application, type Texture, type Ticker } from "pixi.js";
import type { Mode } from "../../src/core/types.js";
import type { SlotModule } from "../../src/module/parse.js";
import type { UiElement, UiValue } from "../../src/module/schema.js";
import { formatTemplate, ladderIndex, MONEY_VALUES, type UiValues, valueOf } from "../../src/ui/values.js";
import { easeOutBack, tween } from "./anim.js";
import { money } from "./format.js";
import { locale } from "./i18n/index.js";

/**
 * Elementi di interfaccia dichiarati dal modulo in scenes/ui.json: contatori,
 * barre, scale, immagini e testi attorno ai rulli. Mostrano soltanto i valori
 * del round che il motore ha già deciso.
 */

const toHex = (color: string) => Number.parseInt(color.slice(1), 16);

/** Scrive un valore come testo: le vincite in crediti, gli altri come numeri. */
export function showValue(key: UiValue, value: number): string {
  if (MONEY_VALUES.has(key)) return money(value);
  return value.toLocaleString(locale, { maximumFractionDigits: 2 });
}

/** Immagine adattata a un riquadro, centrata e senza deformarla. */
function fitted(texture: Texture, x: number, y: number, w: number, h: number): Sprite {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.scale.set(Math.min(w / texture.width, h / texture.height));
  sprite.position.set(x + w / 2, y + h / 2);
  return sprite;
}

function label(text: string, size: number, color: number, weight: "600" | "800" = "600"): Text {
  const t = new Text({
    text,
    style: { fill: color, fontSize: size, fontWeight: weight, stroke: { color: 0x000000, width: Math.max(2, size / 8), join: "round" } },
  });
  t.anchor.set(0.5);
  return t;
}

/** Riduce un testo finché sta nella larghezza data. */
function fitWidth(text: Text, width: number): void {
  text.scale.set(1);
  if (text.width > width) text.scale.set(width / text.width);
}

/** Una parte dell'interfaccia: un contenitore centrato sul suo riquadro, ridisegnato quando cambiano i valori. */
abstract class ElementView<E extends UiElement = UiElement> {
  readonly container = new Container();
  /** Ultimo valore mostrato, per capire quando animare. */
  protected shown: string | null = null;
  private readonly flash = new Graphics();

  constructor(
    readonly element: E,
    protected readonly images: ReadonlyMap<string, Texture>,
  ) {
    const { x, y, width, height } = element;
    this.container.pivot.set(width / 2, height / 2);
    this.container.position.set(x + width / 2, y + height / 2);
    this.flash.roundRect(0, 0, width, height, 12).fill(0xffffff);
    this.flash.alpha = 0;
  }

  /** Riquadro di sfondo: l'immagine `frame` stirata, oppure un rettangolo colorato. */
  protected drawPanel(): void {
    const e = this.element;
    if (!("opacity" in e)) return;
    if (e.frame) {
      const sprite = new Sprite(this.images.get(e.frame)!);
      sprite.width = e.width;
      sprite.height = e.height;
      this.container.addChild(sprite);
    } else if (e.opacity > 0 || e.border) {
      const g = new Graphics().roundRect(0, 0, e.width, e.height, 12).fill({ color: toHex(e.background ?? "#000000"), alpha: e.opacity });
      if (e.border) g.roundRect(0, 0, e.width, e.height, 12).stroke({ width: 3, color: toHex(e.border), alpha: 0.9 });
      this.container.addChild(g);
    }
  }

  /** Va chiamato alla fine del costruttore delle sottoclassi, per mettere il lampo sopra a tutto. */
  protected finish(): void {
    this.container.addChild(this.flash);
  }

  /** Testo che identifica ciò che è mostrato: se cambia, l'elemento si anima. */
  protected abstract key(values: UiValues): string;
  protected abstract draw(values: UiValues, previous: UiValues | null, app: Application, turbo: boolean): void;

  /** Aggiorna l'elemento; restituisce vero se è cambiato. */
  update(values: UiValues, previous: UiValues | null, app: Application, turbo: boolean): boolean {
    const key = this.key(values);
    if (key === this.shown) return false;
    const first = this.shown === null;
    this.shown = key;
    this.draw(values, first ? null : previous, app, turbo);
    if (!first) void this.animate(app, this.element.onChange, turbo);
    return !first;
  }

  /** Anima l'elemento una volta: per i cambi di valore e per ui.fx degli script. */
  async animate(app: Application, effect: UiElement["onChange"], turbo: boolean): Promise<void> {
    const ms = turbo ? 220 : 420;
    const { container, flash } = this;
    switch (effect) {
      case "pop":
      case "count":
        await tween(app.ticker, ms, (t) => container.scale.set(1 + 0.18 * Math.sin(Math.PI * easeOutBack(t))));
        container.scale.set(1);
        break;
      case "pulse":
        await tween(app.ticker, ms * 1.5, (t) => (flash.alpha = 0.45 * Math.sin(Math.PI * t)));
        flash.alpha = 0;
        break;
      case "shake": {
        const x = this.element.x + this.element.width / 2;
        await tween(app.ticker, ms, (t) => (container.x = x + 8 * Math.sin(t * Math.PI * 6) * (1 - t)));
        container.x = x;
        break;
      }
      case "none":
        break;
    }
  }
}

type Of<T extends UiElement["type"]> = Extract<UiElement, { type: T }>;

class CounterView extends ElementView<Of<"counter">> {
  private readonly value: Text;
  private counting: ((ticker: Ticker) => void) | null = null;

  constructor(element: Of<"counter">, images: ReadonlyMap<string, Texture>) {
    super(element, images);
    const { width: w, height: h } = element;
    this.drawPanel();
    const hasLabel = Boolean(element.label);
    if (element.label) {
      const title = label(element.label, Math.min(h * 0.22, 22), toHex(element.labelColor ?? element.color));
      title.position.set(w / 2, h * 0.24);
      fitWidth(title, w - 12);
      this.container.addChild(title);
    }
    this.value = label("", element.fontSize ?? (hasLabel ? h * 0.38 : h * 0.55), toHex(element.color), "800");
    this.value.position.set(w / 2, hasLabel ? h * 0.64 : h / 2);
    this.container.addChild(this.value);
    this.finish();
  }

  protected key(values: UiValues): string {
    return formatTemplate(this.element.format, values, this.element.value, showValue);
  }

  protected draw(values: UiValues, previous: UiValues | null, app: Application, turbo: boolean): void {
    const e = this.element;
    if (this.counting) app.ticker.remove(this.counting);
    this.counting = null;
    const from = previous ? valueOf(previous, e.value) : undefined;
    const to = valueOf(values, e.value);
    const write = (n: number) => {
      this.value.text = formatTemplate(e.format, { ...values, [e.value]: n }, e.value, showValue);
      fitWidth(this.value, e.width - 12);
    };
    if (e.onChange !== "count" || from === undefined || from === to) {
      write(to);
      return;
    }
    // Le cifre scorrono dal valore vecchio a quello nuovo.
    const ms = turbo ? 300 : 800;
    let elapsed = 0;
    const money = MONEY_VALUES.has(e.value);
    this.counting = (ticker) => {
      elapsed += ticker.deltaMS;
      const t = Math.min(1, elapsed / ms);
      const n = from + (to - from) * t;
      write(t >= 1 ? to : money ? n : Math.round(n));
      if (t >= 1 && this.counting) {
        app.ticker.remove(this.counting);
        this.counting = null;
      }
    };
    app.ticker.add(this.counting);
  }
}

class MeterView extends ElementView<Of<"meter">> {
  private readonly fill = new Container();
  private readonly inner: { x: number; y: number; w: number; h: number };

  constructor(element: Of<"meter">, images: ReadonlyMap<string, Texture>) {
    super(element, images);
    const { width: w, height: h } = element;
    this.drawPanel();
    let top = 8;
    if (element.label) {
      const size = element.fontSize ?? Math.min(20, (element.direction === "up" ? w : h) * 0.3);
      const title = label(element.label, size, toHex(element.color));
      title.position.set(w / 2, 6 + size / 2);
      fitWidth(title, w - 12);
      this.container.addChild(title);
      top = 12 + size;
    }
    this.inner = { x: 8, y: top, w: w - 16, h: h - top - 8 };
    this.container.addChild(this.fill);
    this.finish();
  }

  protected key(values: UiValues): string {
    return String(Math.max(0, Math.min(this.element.max, valueOf(values, this.element.value))));
  }

  protected draw(values: UiValues): void {
    const e = this.element;
    const { x, y, w, h } = this.inner;
    const value = Math.max(0, Math.min(e.max, valueOf(values, e.value)));
    this.fill.removeChildren().forEach((child) => child.destroy());
    const color = toHex(e.fillColor);
    const image = e.fill ? this.images.get(e.fill) : undefined;
    const up = e.direction === "up";
    if (e.style === "segments") {
      const n = Math.round(e.max);
      const gap = 4;
      const size = ((up ? h : w) - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const filled = i < Math.floor(value);
        // In verticale si riempie dal basso.
        const cx = up ? x : x + i * (size + gap);
        const cy = up ? y + h - (i + 1) * size - i * gap : y;
        const cw = up ? w : size;
        const ch = up ? size : h;
        if (image && filled) {
          this.fill.addChild(fitted(image, cx, cy, cw, ch));
        } else {
          this.fill.addChild(
            new Graphics().roundRect(cx, cy, cw, ch, 6).fill({ color: filled ? color : 0xffffff, alpha: filled ? 1 : 0.12 }),
          );
        }
      }
      return;
    }
    this.fill.addChild(new Graphics().roundRect(x, y, w, h, 8).fill({ color: 0xffffff, alpha: 0.12 }));
    const part = value / e.max;
    const fx = x;
    const fy = up ? y + h * (1 - part) : y;
    const fw = up ? w : w * part;
    const fh = up ? h * part : h;
    if (part <= 0) return;
    if (image) {
      const sprite = new Sprite(image);
      sprite.position.set(x, y);
      sprite.width = w;
      sprite.height = h;
      const mask = new Graphics().rect(fx, fy, fw, fh).fill(0xffffff);
      sprite.mask = mask;
      this.fill.addChild(sprite, mask);
    } else {
      this.fill.addChild(new Graphics().roundRect(fx, fy, fw, fh, 8).fill(color));
    }
  }
}

class LadderView extends ElementView<Of<"ladder">> {
  private readonly steps: Container[] = [];
  private readonly marks: Graphics[] = [];

  constructor(element: Of<"ladder">, images: ReadonlyMap<string, Texture>, symbols: ReadonlyMap<string, Texture>) {
    super(element, images);
    const { width: w, height: h } = element;
    this.drawPanel();
    let top = 6;
    if (element.label) {
      const size = element.fontSize ?? Math.min(18, h * 0.2);
      const title = label(element.label, size, toHex(element.color));
      title.position.set(w / 2, 4 + size / 2);
      fitWidth(title, w - 12);
      this.container.addChild(title);
      top = 8 + size;
    }
    const n = element.steps.length;
    const row = element.direction === "row";
    const gap = 6;
    const area = { x: 6, y: top, w: w - 12, h: h - top - 6 };
    const size = ((row ? area.w : area.h) - gap * (n - 1)) / n;
    element.steps.forEach((step, i) => {
      const cell = new Container();
      const cx = row ? area.x + i * (size + gap) : area.x;
      // In colonna il primo gradino sta in basso, come una scala che sale.
      const cy = row ? area.y : area.y + area.h - (i + 1) * size - i * gap;
      const cw = row ? size : area.w;
      const ch = row ? area.h : size;
      const mark = new Graphics().roundRect(cx, cy, cw, ch, 8).stroke({ width: 3, color: toHex(element.highlight) });
      mark.visible = false;
      const symbol = symbols.get(step);
      if (symbol) cell.addChild(fitted(symbol, cx + 3, cy + 3, cw - 6, ch - 6));
      else {
        const text = label(step, element.fontSize ?? Math.min(ch * 0.5, 30), toHex(element.color), "800");
        text.position.set(cx + cw / 2, cy + ch / 2);
        fitWidth(text, cw - 6);
        cell.addChild(text);
      }
      this.container.addChild(cell, mark);
      this.steps.push(cell);
      this.marks.push(mark);
    });
    this.finish();
  }

  protected key(values: UiValues): string {
    return String(ladderIndex(this.element.steps, valueOf(values, this.element.value)));
  }

  protected draw(values: UiValues): void {
    const current = ladderIndex(this.element.steps, valueOf(values, this.element.value));
    this.steps.forEach((cell, i) => {
      // I gradini superati restano in ombra, quelli ancora da raggiungere un po' meno.
      cell.alpha = i === current ? 1 : i < current ? 0.3 : 0.6;
      cell.scale.set(1);
      this.marks[i]!.visible = i === current;
    });
  }
}

class ImageView extends ElementView<Of<"image">> {
  constructor(element: Of<"image">, images: ReadonlyMap<string, Texture>, app: Application) {
    super(element, images);
    const { width: w, height: h } = element;
    const frames = (element.frames ?? [element.image!]).map((path) => images.get(path)!);
    const sprite = fitted(frames[0]!, 0, 0, w, h);
    this.container.addChild(sprite);
    if (frames.length > 1) {
      let elapsed = 0;
      app.ticker.add((ticker) => {
        if (sprite.destroyed) return;
        elapsed += ticker.deltaMS / 1000;
        sprite.texture = frames[Math.floor(elapsed * element.fps) % frames.length]!;
      });
    }
    this.finish();
  }

  protected key(): string {
    return "";
  }

  protected draw(): void {}
}

class TextView extends ElementView<Of<"text">> {
  private readonly text: Text;

  constructor(element: Of<"text">, images: ReadonlyMap<string, Texture>) {
    super(element, images);
    const { width: w, height: h } = element;
    this.drawPanel();
    const size = element.fontSize ?? Math.min(26, h * 0.4);
    this.text = new Text({
      text: "",
      style: {
        fill: toHex(element.color),
        fontSize: size,
        fontWeight: "700",
        align: element.align,
        wordWrap: true,
        wordWrapWidth: w - 12,
        stroke: { color: 0x000000, width: Math.max(2, size / 8), join: "round" },
      },
    });
    const ax = { left: 0, center: 0.5, right: 1 }[element.align];
    this.text.anchor.set(ax, 0.5);
    this.text.position.set(6 + ax * (w - 12), h / 2);
    this.container.addChild(this.text);
    this.finish();
  }

  protected key(values: UiValues): string {
    return formatTemplate(this.element.text, values, null, showValue);
  }

  protected draw(values: UiValues): void {
    this.text.text = this.key(values);
    const { height: h } = this.element;
    this.text.scale.set(1);
    if (this.text.height > h - 8) this.text.scale.set((h - 8) / this.text.height);
  }
}

/** Un pulsante disegnato: riquadro con bordo nel colore d'accento, etichetta e testo facoltativo. */
function button(w: number, h: number, accent: number, labelText: string, detail: string | undefined, color: number): Container {
  const c = new Container();
  c.addChild(new Graphics().roundRect(0, 0, w, h, 10).fill({ color: 0x000000, alpha: 0.45 }).stroke({ width: 3, color: accent }));
  const title = label(labelText, Math.min(26, h * (detail ? 0.32 : 0.45)), accent, "800");
  title.position.set(w / 2, detail ? h * 0.32 : h / 2);
  fitWidth(title, w - 16);
  c.addChild(title);
  if (detail) {
    const body = new Text({
      text: detail,
      style: { fill: color, fontSize: Math.min(16, h * 0.2), align: "center", wordWrap: true, wordWrapWidth: w - 16 },
    });
    body.label = "dettaglio";
    body.anchor.set(0.5);
    body.position.set(w / 2, h * 0.7);
    if (body.height > h * 0.5) body.scale.set((h * 0.5) / body.height);
    c.addChild(body);
  }
  c.eventMode = "none";
  c.cursor = "pointer";
  return c;
}

/** Abilita il tocco su un pulsante finché non viene toccato. */
function tapOnce(target: Container): Promise<void> {
  return new Promise((resolve) => {
    target.eventMode = "static";
    target.once("pointertap", () => {
      target.eventMode = "none";
      resolve();
    });
  });
}

/** Pannello che compare sopra i rulli: titolo, testo, immagine e opzioni o pulsante. */
class PanelView extends ElementView<Of<"panel">> {
  private readonly text: Text | null = null;
  private readonly options: Container[] = [];
  /** Testi sotto le opzioni, che possono avere segnaposto. */
  private readonly details: (Text | null)[] = [];
  private readonly close: Container | null = null;

  constructor(element: Of<"panel">, images: ReadonlyMap<string, Texture>) {
    super(element, images);
    const { width: w, height: h } = element;
    const accent = toHex(element.accent);
    this.drawPanel();
    let y = 14;
    if (element.image) {
      const ih = h * 0.28;
      this.container.addChild(fitted(images.get(element.image)!, 12, y, w - 24, ih));
      y += ih + 8;
    }
    if (element.title) {
      const size = element.fontSize ? element.fontSize * 1.4 : Math.min(40, h * 0.1);
      const title = label(element.title, size, accent, "800");
      title.position.set(w / 2, y + size / 2);
      fitWidth(title, w - 24);
      this.container.addChild(title);
      y += size + 12;
    }
    const n = element.options?.length ?? 0;
    const buttonsH = n > 0 ? Math.min(90, (h - y) * 0.6 / n) * n + 10 * (n - 1) : element.button ? 56 : 0;
    if (element.text !== undefined) {
      const size = element.fontSize ?? Math.min(22, h * 0.06);
      this.text = new Text({
        text: "",
        style: { fill: toHex(element.color), fontSize: size, align: "center", wordWrap: true, wordWrapWidth: w - 32 },
      });
      this.text.anchor.set(0.5, 0);
      this.text.position.set(w / 2, y);
      this.container.addChild(this.text);
    }
    const bottom = h - 16 - buttonsH;
    if (n > 0) {
      const bh = (buttonsH - 10 * (n - 1)) / n;
      element.options!.forEach((option, i) => {
        const b = button(w - 40, bh, accent, option.label, option.text, toHex(element.color));
        b.position.set(20, bottom + i * (bh + 10));
        this.container.addChild(b);
        this.options.push(b);
        this.details.push((b.children.find((c) => c.label === "dettaglio") as Text | undefined) ?? null);
      });
    } else if (element.button) {
      const b = button(Math.min(240, w - 40), 52, accent, element.button, undefined, toHex(element.color));
      b.position.set((w - b.width) / 2, bottom);
      this.container.addChild(b);
      this.close = b;
    }
    this.finish();
  }

  private texts(values: UiValues): string[] {
    const format = (text: string | undefined) => (text === undefined ? "" : formatTemplate(text, values, null, showValue));
    return [format(this.element.text), ...(this.element.options ?? []).map((o) => format(o.text))];
  }

  protected key(values: UiValues): string {
    return this.texts(values).join("\n");
  }

  protected draw(values: UiValues): void {
    const [text, ...details] = this.texts(values);
    if (this.text) this.text.text = text!;
    details.forEach((detail, i) => {
      if (this.details[i]) this.details[i].text = detail;
    });
  }

  get waits(): boolean {
    return this.close !== null;
  }

  /** Aspetta che il giocatore tocchi un'opzione; restituisce il suo numero, da 1. */
  ask(): Promise<number> {
    return Promise.race(this.options.map((b, i) => tapOnce(b).then(() => i + 1))).then((choice) => {
      for (const b of this.options) b.eventMode = "none";
      return choice;
    });
  }

  /** Aspetta il tocco sul pulsante di chiusura. */
  waitClose(): Promise<void> {
    return this.close ? tapOnce(this.close) : Promise.resolve();
  }
}

/** Pick-em: oggetti coperti che il giocatore tocca per scoprire premi già decisi dallo script. */
class PickerView extends ElementView<Of<"picker">> {
  private readonly covers: Container[] = [];
  private readonly cells: { x: number; y: number; w: number; h: number }[] = [];

  constructor(element: Of<"picker">, images: ReadonlyMap<string, Texture>) {
    super(element, images);
    const { width: w, height: h } = element;
    this.drawPanel();
    let top = 12;
    if (element.title) {
      const size = element.fontSize ? element.fontSize * 1.4 : Math.min(34, h * 0.12);
      const title = label(element.title, size, toHex(element.accent), "800");
      title.position.set(w / 2, top + size / 2);
      fitWidth(title, w - 24);
      this.container.addChild(title);
      top += size + 10;
    }
    const columns = element.columns ?? element.count;
    const rows = Math.ceil(element.count / columns);
    const gap = 10;
    const cw = (w - 24 - gap * (columns - 1)) / columns;
    const ch = (h - top - 12 - gap * (rows - 1)) / rows;
    for (let i = 0; i < element.count; i++) {
      const cell = { x: 12 + (i % columns) * (cw + gap), y: top + Math.floor(i / columns) * (ch + gap), w: cw, h: ch };
      const cover = new Container();
      if (element.cover) cover.addChild(fitted(images.get(element.cover)!, cell.x, cell.y, cell.w, cell.h));
      else {
        cover.addChild(
          new Graphics()
            .roundRect(cell.x, cell.y, cell.w, cell.h, 10)
            .fill(toHex(element.coverColor))
            .stroke({ width: 3, color: toHex(element.accent) }),
        );
        const q = label("?", Math.min(cell.h, cell.w) * 0.5, 0xffffff, "800");
        q.position.set(cell.x + cell.w / 2, cell.y + cell.h / 2);
        cover.addChild(q);
      }
      cover.cursor = "pointer";
      this.container.addChild(cover);
      this.covers.push(cover);
      this.cells.push(cell);
    }
    this.finish();
  }

  protected key(): string {
    return "";
  }

  protected draw(): void {}

  /** Rimette gli oggetti coperti, per un nuovo pick-em. */
  reset(): void {
    for (const c of this.container.children.filter((c) => c.label === "premio")) c.destroy();
    for (const cover of this.covers) {
      cover.visible = true;
      cover.eventMode = "none";
    }
  }

  /**
   * Il giocatore tocca un oggetto per ogni premio e li scopre nell'ordine
   * dato: dove tocca non cambia niente, i premi sono già decisi. Con
   * `auto` gli oggetti si scoprono da soli.
   */
  async pick(app: Application, prizes: readonly string[], auto: boolean): Promise<void> {
    this.reset();
    const accent = toHex(this.element.accent);
    for (const prize of prizes) {
      const free = this.covers.map((c, i) => [c, i] as const).filter(([c]) => c.visible);
      let index: number;
      if (auto) {
        await new Promise((r) => setTimeout(r, 350));
        index = free[0]![1];
      } else {
        index = await Promise.race(free.map(([c, i]) => tapOnce(c).then(() => i)));
        for (const [c] of free) c.eventMode = "none";
      }
      const cover = this.covers[index]!;
      const cell = this.cells[index]!;
      await tween(app.ticker, 160, (t) => (cover.alpha = 1 - t));
      cover.visible = false;
      cover.alpha = 1;
      const shown = new Container();
      shown.label = "premio";
      shown.addChild(new Graphics().roundRect(cell.x, cell.y, cell.w, cell.h, 10).fill({ color: 0x000000, alpha: 0.5 }).stroke({ width: 3, color: accent }));
      const text = label(prize, Math.min(cell.h * 0.4, 34), accent, "800");
      text.position.set(cell.x + cell.w / 2, cell.y + cell.h / 2);
      fitWidth(text, cell.w - 8);
      shown.addChild(text);
      shown.alpha = 0;
      this.container.addChildAt(shown, this.container.children.length - 1);
      await tween(app.ticker, 260, (t) => (shown.alpha = t));
    }
  }
}

/** Tutti gli elementi di un modulo, divisi tra quelli sotto e quelli sopra i rulli. */
export class Hud {
  readonly below = new Container();
  readonly above = new Container();
  private readonly views: ElementView[] = [];
  private values: UiValues | null = null;
  private mode: Mode | null = null;
  /** Visibilità decisa dagli script con ui.show e ui.hide, fino alla fine del round. */
  private readonly forced = new Map<string, boolean>();
  /** Visibilità attuale di ogni elemento, per sapere quando farlo comparire o sparire. */
  private readonly visible = new Map<ElementView, boolean>();

  /**
   * `images` contiene le immagini degli elementi, `symbols` un'immagine per
   * ogni simbolo (per le scale fatte di simboli), `onSound` suona un asset.
   */
  constructor(
    private readonly app: Application,
    module: SlotModule,
    images: ReadonlyMap<string, Texture>,
    symbols: ReadonlyMap<string, Texture>,
    private readonly onSound: (path: string) => void,
  ) {
    for (const element of module.ui.elements) {
      const view =
        element.type === "counter"
          ? new CounterView(element, images)
          : element.type === "meter"
            ? new MeterView(element, images)
            : element.type === "ladder"
              ? new LadderView(element, images, symbols)
              : element.type === "image"
                ? new ImageView(element, images, app)
                : element.type === "panel"
                  ? new PanelView(element, images)
                  : element.type === "picker"
                    ? new PickerView(element, images)
                    : new TextView(element, images);
      this.views.push(view);
      (element.layer === "below" ? this.below : this.above).addChild(view.container);
    }
  }

  /** Mostra i valori dati nella modalità data, animando gli elementi che cambiano. */
  update(values: UiValues, mode: Mode, turbo = false): void {
    const previous = this.values;
    this.values = { ...values };
    this.mode = mode;
    for (const view of this.views) {
      // Pannelli e pick-em senza visibleIn compaiono solo quando lo script li chiama.
      const popup = view.element.type === "panel" || view.element.type === "picker";
      const visible =
        this.forced.get(view.element.id) ?? (view.element.visibleIn ? view.element.visibleIn.includes(mode) : !popup);
      const was = this.visible.get(view);
      this.visible.set(view, visible);
      if (was === undefined) {
        view.container.visible = visible;
        view.container.alpha = visible ? 1 : 0;
      } else if (was !== visible) void this.fade(view.container, visible, turbo);
      // Un elemento nascosto si aggiorna senza animazioni né suoni.
      const changed = view.update(values, previous, this.app, turbo || !visible);
      if (changed && visible && view.element.sound) this.onSound(view.element.sound);
    }
  }

  /** ui.show e ui.hide: l'elemento resta come chiesto fino a clearForced. */
  force(id: string, visible: boolean, turbo = false): void {
    this.forced.set(id, visible);
    if (this.values && this.mode !== null) this.update(this.values, this.mode, turbo);
  }

  /** All'inizio di un round gli elementi tornano a seguire visibleIn. */
  clearForced(): void {
    this.forced.clear();
  }

  /** ui.fx: anima un elemento, se si vede. */
  effect(id: string, effect: UiElement["onChange"], turbo = false): void {
    for (const view of this.views) {
      if (view.element.id === id && this.visible.get(view)) void view.animate(this.app, effect, turbo);
    }
  }

  private view(id: string): ElementView | undefined {
    return this.views.find((v) => v.element.id === id);
  }

  /** ui.show: mostra l'elemento; se è un pannello con pulsante aspetta il tocco (in turbo si chiude da solo) e lo nasconde. */
  async show(id: string, turbo: boolean): Promise<void> {
    this.force(id, true, turbo);
    const view = this.view(id);
    if (!(view instanceof PanelView) || !view.waits) return;
    await (turbo ? new Promise((r) => setTimeout(r, 900)) : view.waitClose());
    this.force(id, false, turbo);
  }

  /** choose: mostra il pannello delle opzioni, aspetta il tocco e lo nasconde. Restituisce l'opzione, da 1. */
  async choose(id: string): Promise<number> {
    const view = this.view(id);
    if (!(view instanceof PanelView)) throw new Error(`pannello sconosciuto ${id}`);
    this.force(id, true);
    const choice = await view.ask();
    this.force(id, false);
    return choice;
  }

  /** ui.pick: mostra il pick-em, fa scoprire i premi e lo nasconde. */
  async pick(id: string, prizes: readonly string[], turbo: boolean): Promise<void> {
    const view = this.view(id);
    if (!(view instanceof PickerView)) return;
    this.force(id, true, turbo);
    await view.pick(this.app, prizes, turbo);
    await new Promise((r) => setTimeout(r, turbo ? 400 : 1200));
    this.force(id, false, turbo);
  }

  /** Centri, in coordinate dello stage, degli elementi visibili che mostrano il valore dato. */
  targets(value: string): { x: number; y: number }[] {
    return this.views
      .filter((view) => this.visible.get(view) && "value" in view.element && view.element.value === value)
      .map(({ element: e }) => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 }));
  }

  private async fade(container: Container, visible: boolean, turbo: boolean): Promise<void> {
    if (container.visible === visible && container.alpha === (visible ? 1 : 0)) return;
    const from = container.visible ? container.alpha : 0;
    const to = visible ? 1 : 0;
    container.visible = true;
    await tween(this.app.ticker, turbo ? 120 : 300, (t) => (container.alpha = from + (to - from) * t));
    container.visible = visible;
  }
}
