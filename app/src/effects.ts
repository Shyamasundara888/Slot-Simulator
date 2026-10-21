import { BlurFilter, Container, FillGradient, Graphics, Sprite, Text, type Application, type Texture, type Ticker } from "pixi.js";
import { easeOutBack, tween } from "./anim.js";

/**
 * Effetti di vincita: bagliore attorno alle celle vincenti, riflesso che scorre,
 * scintille e, per le vincite grandi, una schermata con monete e contatore.
 * Sono solo presentazione: cosa e quanto si vince lo decide il motore.
 */

/** Una cella vincente, in coordinate dello stage. */
export interface WinCell {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Colore del bagliore, per esempio quello del simbolo schiarito. */
  color: number;
}

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  spin: number;
  life: number;
  age: number;
  gravity: number;
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Schiarisce un colore verso il bianco di `amount` (0-1). */
export function lighten(color: number, amount: number): number {
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return (mix((color >> 16) & 255) << 16) | (mix((color >> 8) & 255) << 8) | mix(color & 255);
}

export class WinEffects {
  /** Sotto i rulli: il bagliore si vede ai bordi delle tessere. */
  readonly under = new Container();
  /** Sopra i rulli: riflessi e scintille. */
  readonly over = new Container();
  /** Sopra tutto: la schermata delle vincite grandi. */
  readonly top = new Container();

  private readonly particles: Particle[] = [];
  private readonly spark: Texture;
  private readonly coin: Texture;
  private readonly shine: Texture;
  private loop: ((ticker: Ticker) => void) | null = null;
  private readonly calm = reducedMotion();

  constructor(
    private readonly app: Application,
    private readonly stageW: number,
    private readonly stageH: number,
  ) {
    this.spark = this.texture(
      new Graphics()
        .star(16, 16, 4, 16, 3)
        .fill(0xffffff)
        .circle(16, 16, 4)
        .fill(0xffffff),
    );
    this.coin = this.texture(
      new Graphics()
        .circle(14, 14, 14)
        .fill(0xb8860b)
        .circle(14, 14, 11)
        .fill(0xffd43b)
        .circle(14, 14, 7)
        .stroke({ width: 2, color: 0xb8860b })
        .ellipse(10, 9, 4, 2)
        .fill({ color: 0xffffff, alpha: 0.7 }),
    );
    const band = new FillGradient({ type: "linear", start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, textureSpace: "local" });
    band.addColorStop(0, "rgba(255,255,255,0)").addColorStop(0.5, "rgba(255,255,255,0.55)").addColorStop(1, "rgba(255,255,255,0)");
    this.shine = this.texture(new Graphics().rect(0, 0, 48, 8).fill(band));
    this.app.ticker.add(this.updateParticles);
  }

  private texture(graphics: Graphics): Texture {
    const texture = this.app.renderer.generateTexture({ target: graphics, resolution: 2 });
    graphics.destroy();
    return texture;
  }

  /** Bagliore, riflesso e scintille sulle celle vincenti, finché non si chiama clear(). */
  highlight(cells: readonly WinCell[]): void {
    this.clear();
    const glows = cells.map((cell) => {
      const glow = new Graphics().roundRect(cell.x - 10, cell.y - 10, cell.w + 20, cell.h + 20, 22).fill(cell.color);
      glow.filters = [new BlurFilter({ strength: 10, quality: 3 })];
      glow.blendMode = "add";
      this.under.addChild(glow);
      return glow;
    });
    const shines = cells.map((cell) => {
      const holder = new Container();
      const mask = new Graphics().roundRect(cell.x, cell.y, cell.w, cell.h, 12).fill(0xffffff);
      const band = new Sprite(this.shine);
      band.anchor.set(0.5);
      band.blendMode = "add";
      band.height = cell.h * 2;
      band.width = cell.w * 0.5;
      band.rotation = 0.35;
      band.y = cell.y + cell.h / 2;
      holder.addChild(band, mask);
      holder.mask = mask;
      this.over.addChild(holder);
      return { band, cell };
    });

    let elapsed = 0;
    let sparkTimer = 0;
    this.loop = (ticker) => {
      elapsed += ticker.deltaMS / 1000;
      for (const glow of glows) glow.alpha = 0.75 + 0.25 * Math.sin(elapsed * Math.PI * 2);
      // Il riflesso attraversa la cella ogni 1,6 secondi.
      const phase = (elapsed % 1.6) / 1.6;
      for (const { band, cell } of shines) {
        band.x = cell.x - cell.w * 0.5 + phase * cell.w * 2;
        band.visible = phase < 0.6;
      }
      if (this.calm) return;
      sparkTimer += ticker.deltaMS;
      while (sparkTimer > 90) {
        sparkTimer -= 90;
        const cell = cells[Math.floor(Math.random() * cells.length)]!;
        this.emit(this.spark, cell.x + Math.random() * cell.w, cell.y + Math.random() * cell.h, {
          vx: (Math.random() - 0.5) * 30,
          vy: -20 - Math.random() * 40,
          life: 0.6 + Math.random() * 0.5,
          scale: 0.35 + Math.random() * 0.4,
          tint: lighten(cell.color, 0.6),
          gravity: 0,
        });
      }
    };
    this.app.ticker.add(this.loop);
  }

  private emit(
    texture: Texture,
    x: number,
    y: number,
    o: { vx: number; vy: number; life: number; scale: number; tint?: number; gravity: number; layer?: Container },
  ): void {
    if (this.particles.length > 400) return;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.scale.set(o.scale);
    sprite.rotation = Math.random() * Math.PI;
    if (o.tint !== undefined) sprite.tint = o.tint;
    if (texture === this.spark) sprite.blendMode = "add";
    (o.layer ?? this.over).addChild(sprite);
    this.particles.push({ sprite, vx: o.vx, vy: o.vy, spin: (Math.random() - 0.5) * 6, life: o.life, age: 0, gravity: o.gravity });
  }

  private readonly updateParticles = (ticker: Ticker): void => {
    const dt = ticker.deltaMS / 1000;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.age += dt;
      p.vy += p.gravity * dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.sprite.rotation += p.spin * dt;
      const left = 1 - p.age / p.life;
      p.sprite.alpha = Math.min(1, left * 3);
      if (p.sprite.texture === this.coin) p.sprite.scale.x = p.sprite.scale.y * Math.cos(p.age * 9);
      if (left <= 0 || p.sprite.y > this.stageH + 40) {
        p.sprite.destroy();
        this.particles.splice(i, 1);
      }
    }
  };

  /**
   * Schermata delle vincite grandi: titolo, contatore che sale fino a `amount`
   * e pioggia di monete. Si chiude da sola; un clic la accorcia.
   */
  async celebrate(title: string, amount: number, format: (credits: number) => string, ms: number): Promise<void> {
    const dim = new Graphics().rect(0, 0, this.stageW, this.stageH).fill({ color: 0x000000, alpha: 0.55 });
    dim.eventMode = "static";
    const heading = new Text({
      text: title,
      style: {
        fill: new FillGradient({
          type: "linear",
          start: { x: 0, y: 0 },
          end: { x: 0, y: 1 },
          colorStops: [
            { offset: 0, color: "#fff3bf" },
            { offset: 0.5, color: "#ffd43b" },
            { offset: 1, color: "#e67700" },
          ],
          textureSpace: "local",
        }),
        fontSize: 84,
        fontWeight: "900",
        stroke: { color: 0x3b1f00, width: 10, join: "round" },
        dropShadow: { color: 0x000000, alpha: 0.6, blur: 8, distance: 4, angle: Math.PI / 2 },
      },
    });
    heading.anchor.set(0.5);
    heading.position.set(this.stageW / 2, this.stageH * 0.38);
    const counter = new Text({
      text: format(0),
      style: { fill: 0xffffff, fontSize: 60, fontWeight: "800", stroke: { color: 0x1b1430, width: 8, join: "round" } },
    });
    counter.anchor.set(0.5);
    counter.position.set(this.stageW / 2, this.stageH * 0.62);
    const coins = new Container();
    this.top.addChild(dim, coins, heading, counter);

    let skip = false;
    let popped = false;
    dim.on("pointertap", () => (skip = true));
    let coinTimer = 0;
    const rain = (ticker: Ticker) => {
      if (popped) heading.scale.set(1 + 0.04 * Math.sin(performance.now() / 160));
      if (this.calm) return;
      coinTimer += ticker.deltaMS;
      while (coinTimer > 28) {
        coinTimer -= 28;
        this.emit(this.coin, this.stageW / 2 + (Math.random() - 0.5) * 120, this.stageH + 10, {
          vx: (Math.random() - 0.5) * 520,
          vy: -520 - Math.random() * 260,
          life: 2.5,
          scale: 0.7 + Math.random() * 0.6,
          gravity: 780,
          layer: coins,
        });
      }
    };
    this.app.ticker.add(rain);

    heading.alpha = 0;
    await tween(this.app.ticker, 350, (t) => {
      heading.alpha = t;
      heading.scale.set(0.3 + 0.7 * easeOutBack(t));
    });
    popped = true;
    // Il contatore rallenta verso la fine, come nelle slot; un clic lo porta subito alla cifra finale.
    await new Promise<void>((resolve) => {
      // Tempo reale e non quello del ticker, che rallenta quando i fotogrammi sono pochi.
      const start = performance.now();
      const count = () => {
        const t = skip ? 1 : Math.min(1, (performance.now() - start) / ms);
        counter.text = format(amount * (1 - (1 - t) ** 3));
        if (t < 1) return;
        this.app.ticker.remove(count);
        resolve();
      };
      this.app.ticker.add(count);
    });
    counter.text = format(amount);
    await tween(this.app.ticker, 250, (t) => counter.scale.set(1.15 - 0.15 * t));
    // Resta un attimo a schermo con la cifra finale, poi sfuma.
    await new Promise((r) => setTimeout(r, skip ? 150 : 700));
    this.app.ticker.remove(rain);
    await tween(this.app.ticker, 300, (t) => (this.top.alpha = 1 - t));
    // Le monete ancora in volo stanno nel livello che sta per sparire: si tolgono dalla lista prima.
    for (let i = this.particles.length - 1; i >= 0; i--) if (this.particles[i]!.sprite.parent === coins) this.particles.splice(i, 1);
    this.top.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.top.alpha = 1;
  }

  /** Toglie bagliori e riflessi; le scintille già partite finiscono da sole. */
  clear(): void {
    if (this.loop) {
      this.app.ticker.remove(this.loop);
      this.loop = null;
    }
    this.under.removeChildren().forEach((child) => child.destroy({ children: true }));
    for (const child of [...this.over.children]) {
      if (this.particles.some((p) => p.sprite === child)) continue;
      this.over.removeChild(child);
      child.destroy({ children: true });
    }
  }

  destroy(): void {
    this.app.ticker.remove(this.updateParticles);
    this.clear();
  }
}
