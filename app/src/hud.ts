import { Container, Graphics, Sprite, Text, type Application, type Texture, type Ticker } from "pixi.js";
import type { Mode } from "../../src/core/types.js";
import type { SlotModule } from "../../src/module/parse.js";
import type { UiElement, UiValue } from "../../src/module/schema.js";
import { formatTemplate, ladderIndex, MONEY_VALUES, type UiValues } from "../../src/ui/values.js";
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
    if (!first) void this.animate(app, turbo);
    return !first;
  }

  private async animate(app: Application, turbo: boolean): Promise<void> {
    const ms = turbo ? 220 : 420;
    const { container, flash } = this;
    switch (this.element.onChange) {
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
    const from = previous?.[e.value];
    const to = values[e.value];
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
    return String(Math.max(0, Math.min(this.element.max, values[this.element.value])));
  }

  protected draw(values: UiValues): void {
    const e = this.element;
    const { x, y, w, h } = this.inner;
    const value = Math.max(0, Math.min(e.max, values[e.value]));
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
    return String(ladderIndex(this.element.steps, values[this.element.value]));
  }

  protected draw(values: UiValues): void {
    const current = ladderIndex(this.element.steps, values[this.element.value]);
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

/** Tutti gli elementi di un modulo, divisi tra quelli sotto e quelli sopra i rulli. */
export class Hud {
  readonly below = new Container();
  readonly above = new Container();
  private readonly views: ElementView[] = [];
  private values: UiValues | null = null;
  private mode: Mode | null = null;

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
                : new TextView(element, images);
      this.views.push(view);
      (element.layer === "below" ? this.below : this.above).addChild(view.container);
    }
  }

  /** Mostra i valori dati nella modalità data, animando gli elementi che cambiano. */
  update(values: UiValues, mode: Mode, turbo = false): void {
    const previous = this.values;
    this.values = { ...values };
    const previousMode = this.mode;
    const modeChanged = mode !== previousMode;
    this.mode = mode;
    for (const view of this.views) {
      const visible = !view.element.visibleIn || view.element.visibleIn.includes(mode);
      if (modeChanged && previousMode === null) {
        view.container.visible = visible;
        view.container.alpha = visible ? 1 : 0;
      } else if (modeChanged) void this.fade(view.container, visible, turbo);
      // Un elemento nascosto si aggiorna senza animazioni né suoni.
      const changed = view.update(values, previous, this.app, turbo || !visible);
      if (changed && visible && view.element.sound) this.onSound(view.element.sound);
    }
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
