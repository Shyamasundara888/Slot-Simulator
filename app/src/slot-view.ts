import { Application, Container, Graphics, Sprite, Text, Texture, type Ticker } from "pixi.js";
import type { Grid, LineWin, ScatterWin, SymbolId } from "../../src/core/types.js";
import type { SlotModule } from "../../src/module/parse.js";
import { uiImages } from "../../src/module/ui.js";
import { easeOutBack, tween } from "./anim.js";
import { lighten, WinEffects, type WinCell } from "./effects.js";
import { Hud } from "./hud.js";
const GAP = 8;
const LINE_COLORS = [0xffd43b, 0x69db7c, 0x4dabf7, 0xff8787, 0xda77f2, 0x63e6be, 0xffa94d, 0x74c0fc, 0xa9e34b, 0xf783ac];
/** Tinta delle celle che non fanno parte di una vincita. */
const DIMMED = 0x5a5a5a;

const toHex = (color: string) => Number.parseInt(color.slice(1), 16);

/** Carica un'immagine (anche SVG o blob:) come texture PixiJS. */
async function loadTexture(url: string): Promise<Texture> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return Texture.from(img);
}

/** Animazione di vincita di un simbolo: fotogrammi già della misura della cella. */
interface WinAnimation {
  frames: Texture[];
  fps: number;
}

/** Un rullo: rows + 2 sprite (uno sopra e uno sotto l'area visibile) che scorrono verso il basso. */
class ReelView {
  readonly container = new Container();
  private readonly sprites: Sprite[] = [];
  private symbols: SymbolId[];
  private offset = 0;
  private spinning = false;
  private stripPos = 0;

  constructor(
    private readonly strip: readonly SymbolId[],
    private readonly textures: ReadonlyMap<SymbolId, Texture>,
    private readonly rows: number,
    private readonly cellW: number,
    private readonly cellH: number,
  ) {
    this.stripPos = Math.floor(Math.random() * strip.length);
    this.symbols = Array.from({ length: rows + 2 }, (_, i) => strip[(this.stripPos + i) % strip.length]!);
    for (let i = 0; i < rows + 2; i++) {
      const sprite = new Sprite();
      sprite.anchor.set(0.5);
      this.sprites.push(sprite);
      this.container.addChild(sprite);
    }
    const mask = new Graphics().rect(0, 0, cellW, rows * this.pitch - GAP).fill(0xffffff);
    this.container.addChild(mask);
    this.container.mask = mask;
    this.layout();
  }

  private get pitch() {
    return this.cellH + GAP;
  }

  private layout(): void {
    this.sprites.forEach((sprite, i) => {
      sprite.texture = this.textures.get(this.symbols[i]!)!;
      sprite.x = this.cellW / 2;
      sprite.y = (i - 1) * this.pitch + this.offset + this.cellH / 2;
    });
  }

  /** Sprite della riga visibile `row`, a rullo fermo. */
  cell(row: number): Sprite {
    return this.sprites[row + 1]!;
  }

  /** Simbolo mostrato nella riga visibile `row`. */
  symbolAt(row: number): SymbolId {
    return this.symbols[row + 1]!;
  }

  /** Rimette le texture dei simboli, per esempio dopo un'animazione. */
  refresh(): void {
    this.layout();
    for (const sprite of this.sprites) sprite.scale.set(1);
  }

  setVisible(column: readonly SymbolId[]): void {
    this.symbols.splice(1, this.rows, ...column);
    this.offset = 0;
    this.layout();
  }

  start(): void {
    this.spinning = true;
  }

  /** Avanza lo scorrimento; `speed` in pixel al millisecondo. */
  update(deltaMS: number, speed: number): void {
    if (!this.spinning) return;
    this.offset += deltaMS * speed;
    while (this.offset >= this.pitch) {
      this.offset -= this.pitch;
      this.stripPos = (this.stripPos - 1 + this.strip.length) % this.strip.length;
      this.symbols.pop();
      this.symbols.unshift(this.strip[this.stripPos]!);
    }
    this.layout();
  }

  /** Ferma il rullo sulla colonna data, con un piccolo rimbalzo. */
  async stop(app: Application, column: readonly SymbolId[], ms: number): Promise<void> {
    this.spinning = false;
    const random = () => this.strip[Math.floor(Math.random() * this.strip.length)]!;
    this.symbols = [random(), ...column, random()];
    await tween(app.ticker, ms, (t) => {
      this.offset = -this.pitch * (1 - easeOutBack(t));
      this.layout();
    });
    this.offset = 0;
    this.layout();
  }

  /** Sostituisce il simbolo di una cella con un'animazione di pulsazione. */
  async morph(app: Application, row: number, symbol: SymbolId, ms: number): Promise<void> {
    const sprite = this.cell(row);
    await tween(app.ticker, ms / 2, (t) => sprite.scale.set(1 - 0.5 * t));
    this.symbols[row + 1] = symbol;
    sprite.texture = this.textures.get(symbol)!;
    await tween(app.ticker, ms / 2, (t) => sprite.scale.set(0.5 + 0.5 * easeOutBack(t)));
    sprite.scale.set(1);
  }
}

/** Vista PixiJS di una slot: anima l'esito che il motore ha già deciso. */
export class SlotView {
  private readonly reels: ReelView[] = [];
  private readonly winLayer = new Graphics();
  private readonly winText: Text;
  private readonly gridX: number;
  private readonly gridY: number;
  private readonly cellW: number;
  private readonly cellH: number;
  private speed = 2.2;
  private readonly animations = new Map<SymbolId, WinAnimation>();

  private winAnimation: ((ticker: Ticker) => void) | null = null;
  private readonly effects: WinEffects;
  /** Elementi di interfaccia del modulo (scenes/ui.json). */
  readonly hud: Hud;

  private constructor(
    private readonly app: Application,
    private readonly module: SlotModule,
    images: ReadonlyMap<string, Texture>,
    private readonly onReelStop: () => void,
    onUiSound: (path: string) => void,
  ) {
    const { math, scene } = module;
    // Dimensioni logiche dello stage: il canvas viene scalato per riempire il contenitore.
    const { width: stageW, height: stageH } = module.ui.stage;
    const background = scene.backgroundImage && images.get(scene.backgroundImage);
    if (background) {
      // Adatta l'immagine a tutto lo stage, tagliando i bordi che avanzano.
      const sprite = new Sprite(background);
      const scale = Math.max(stageW / background.width, stageH / background.height);
      sprite.scale.set(scale);
      sprite.anchor.set(0.5);
      sprite.position.set(stageW / 2, stageH / 2);
      app.stage.addChild(sprite);
    }
    const box = module.ui.reels;
    if (box) {
      // I rulli riempiono il riquadro scelto dal modulo.
      this.cellW = (box.width - GAP * (math.reelCount - 1)) / math.reelCount;
      this.cellH = (box.height - GAP * (math.rows - 1)) / math.rows;
    } else {
      this.cellW = Math.min(160, (stageW - 40 - GAP * (math.reelCount - 1)) / math.reelCount);
      this.cellH = Math.min(140, (stageH - 80 - GAP * (math.rows - 1)) / math.rows);
    }
    const gridW = math.reelCount * this.cellW + (math.reelCount - 1) * GAP;
    const gridH = math.rows * this.cellH + (math.rows - 1) * GAP;
    this.gridX = box ? box.x : (stageW - gridW) / 2;
    this.gridY = box ? box.y : (stageH - gridH) / 2;

    const frame = new Graphics()
      .roundRect(this.gridX - 16, this.gridY - 16, gridW + 32, gridH + 32, 20)
      .fill({ color: 0x000000, alpha: 0.35 })
      .stroke({ width: 3, color: 0xf5b301, alpha: 0.6 });
    // Gli elementi "below" stanno fra lo sfondo e i rulli, quelli "above" sopra le linee vincenti.
    const textures = this.buildTextures(scene.symbols, images);
    const symbolImages = new Map(
      [...scene.symbols].map(([id, style]) => [id, (style.image && images.get(style.image)) || textures.get(id)!] as const),
    );
    this.hud = new Hud(app, module, images, symbolImages, onUiSound);
    app.stage.addChild(this.hud.below);
    app.stage.addChild(frame);

    this.effects = new WinEffects(app, stageW, stageH);
    app.stage.addChild(this.effects.under);

    for (const [id, style] of scene.symbols) {
      if (!style.winFrames) continue;
      const frames = style.winFrames.map((path) => this.imageTile(id, images.get(path)!));
      this.animations.set(id, { frames, fps: style.fps });
    }
    math.reels.base.forEach((strip, i) => {
      const reel = new ReelView(strip, textures, math.rows, this.cellW, this.cellH);
      reel.container.x = this.gridX + i * (this.cellW + GAP);
      reel.container.y = this.gridY;
      this.reels.push(reel);
      app.stage.addChild(reel.container);
    });

    app.stage.addChild(this.effects.over);
    app.stage.addChild(this.winLayer);
    app.stage.addChild(this.hud.above);
    this.winText = new Text({
      text: "",
      style: { fill: 0xffffff, fontSize: 56, fontWeight: "800", stroke: { color: 0x1b1430, width: 8, join: "round" } },
    });
    this.winText.anchor.set(0.5);
    this.winText.position.set(stageW / 2, stageH / 2);
    app.stage.addChild(this.winText);
    app.stage.addChild(this.effects.top);

    app.ticker.add((ticker) => {
      for (const reel of this.reels) reel.update(ticker.deltaMS, this.speed);
    });
  }

  /**
   * Crea la vista. `assets` dà l'URL di ogni asset del modulo; `onReelStop`
   * viene chiamato quando si ferma ciascun rullo (per il suono).
   */
  static async create(
    host: HTMLElement,
    module: SlotModule,
    assets: ReadonlyMap<string, string>,
    onReelStop: () => void = () => {},
    onUiSound: (path: string) => void = () => {},
  ): Promise<SlotView> {
    const images = new Map<string, Texture>();
    const { scene } = module;
    const paths = new Set<string>();
    if (scene.backgroundImage) paths.add(scene.backgroundImage);
    for (const style of scene.symbols.values()) for (const p of [style.image, ...(style.winFrames ?? [])]) if (p) paths.add(p);
    for (const p of uiImages(module.ui)) paths.add(p);
    await Promise.all(
      [...paths].map(async (path) => {
        const url = assets.get(path);
        if (!url) throw new Error(`asset mancante ${path}`);
        try {
          images.set(path, await loadTexture(url));
        } catch {
          throw new Error(`immagine non leggibile ${path}`);
        }
      }),
    );
    const app = new Application();
    const { width, height } = module.ui.stage;
    await app.init({
      width,
      height,
      background: module.scene.background,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    host.replaceChildren(app.canvas);
    host.style.aspectRatio = `${width} / ${height}`;
    return new SlotView(app, module, images, onReelStop, onUiSound);
  }

  /** Tessera della misura della cella con l'immagine centrata, sul colore del simbolo. */
  private imageTile(id: SymbolId, image: Texture): Texture {
    const w = this.cellW;
    const h = this.cellH;
    const style = this.module.scene.symbols.get(id)!;
    const tile = new Container();
    tile.addChild(new Graphics().roundRect(0, 0, w, h, 12).fill(toHex(style.color)));
    const sprite = new Sprite(image);
    const scale = Math.min(w / image.width, h / image.height);
    sprite.scale.set(scale);
    sprite.anchor.set(0.5);
    sprite.position.set(w / 2, h / 2);
    tile.addChild(sprite);
    const texture = this.app.renderer.generateTexture({ target: tile, resolution: 2 });
    tile.destroy({ children: true });
    return texture;
  }

  private buildTextures(styles: SlotModule["scene"]["symbols"], images: ReadonlyMap<string, Texture>): Map<SymbolId, Texture> {
    const textures = new Map<SymbolId, Texture>();
    const w = this.cellW;
    const h = this.cellH;
    for (const [id, style] of styles) {
      if (style.image) {
        textures.set(id, this.imageTile(id, images.get(style.image)!));
        continue;
      }
      const color = toHex(style.color);
      const kind = this.module.math.symbols.get(id);
      const tile = new Container();
      tile.addChild(
        new Graphics()
          .roundRect(0, 0, w, h, 16)
          .fill(color)
          .roundRect(4, 4, w - 8, h * 0.45, 12)
          .fill({ color: 0xffffff, alpha: 0.12 })
          .roundRect(0, 0, w, h, 16)
          .stroke({ width: kind === "normal" ? 2 : 5, color: kind === "normal" ? 0x000000 : 0xffffff, alpha: 0.5 }),
      );
      const label = new Text({
        text: style.label,
        style: {
          fill: 0xffffff,
          fontSize: Math.min(34, (w * 1.6) / Math.max(3, style.label.length)),
          fontWeight: "700",
          stroke: { color: 0x000000, width: 4, join: "round" },
        },
      });
      label.anchor.set(0.5);
      label.position.set(w / 2, h / 2);
      tile.addChild(label);
      if (kind !== "normal") {
        const tag = new Text({ text: kind === "wild" ? "WILD" : "SCATTER", style: { fill: 0xffffff, fontSize: 13, fontWeight: "700" } });
        tag.anchor.set(0.5);
        tag.position.set(w / 2, h - 16);
        tile.addChild(tag);
      }
      textures.set(id, this.app.renderer.generateTexture({ target: tile, resolution: 2 }));
      tile.destroy({ children: true });
    }
    return textures;
  }

  /** Mostra una griglia senza animazioni. */
  show(grid: Grid): void {
    grid.forEach((column, i) => this.reels[i]!.setVisible(column));
  }

  /** Fa girare i rulli e li ferma uno alla volta sulla griglia estratta. */
  async spin(reelGrid: Grid, turbo: boolean): Promise<void> {
    this.clearWins();
    this.speed = turbo ? 3.2 : 2.2;
    for (const reel of this.reels) reel.start();
    await new Promise((r) => setTimeout(r, turbo ? 120 : 380));
    for (let i = 0; i < this.reels.length; i++) {
      const done = this.reels[i]!.stop(this.app, reelGrid[i]!, turbo ? 160 : 320).then(this.onReelStop);
      if (i === this.reels.length - 1) await done;
      else await new Promise((r) => setTimeout(r, turbo ? 60 : 170));
    }
  }

  /** Anima le celle che upgrade ed espansioni hanno cambiato. */
  async reveal(reelGrid: Grid, grid: Grid, turbo: boolean): Promise<void> {
    const jobs: Promise<void>[] = [];
    grid.forEach((column, reel) =>
      column.forEach((symbol, row) => {
        if (reelGrid[reel]![row] !== symbol) jobs.push(this.reels[reel]!.morph(this.app, row, symbol, turbo ? 200 : 420));
      }),
    );
    await Promise.all(jobs);
  }

  /** Evidenzia linee vincenti e scatter; `amount` è la vincita dello spin in crediti. */
  showWins(lineWins: readonly LineWin[], scatterWin: ScatterWin | null, reelGrid: Grid, amount: string | null): void {
    this.clearWins();
    const { math } = this.module;
    const winning = new Set<string>();
    const center = (reel: number, row: number) => ({
      x: this.gridX + reel * (this.cellW + GAP) + this.cellW / 2,
      y: this.gridY + row * (this.cellH + GAP) + this.cellH / 2,
    });

    for (const win of lineWins) {
      const rows = math.lines[win.line]!;
      const color = LINE_COLORS[win.line % LINE_COLORS.length]!;
      rows.forEach((row, reel) => {
        const { x, y } = center(reel, row);
        if (reel === 0) this.winLayer.moveTo(x - this.cellW / 2, y);
        this.winLayer.lineTo(x, y);
        if (reel < win.count) winning.add(`${reel}:${row}`);
      });
      const last = center(rows.length - 1, rows.at(-1)!);
      this.winLayer.lineTo(last.x + this.cellW / 2, last.y).stroke({ width: 6, color, alpha: 0.9, cap: "round", join: "round" });
    }
    if (scatterWin) {
      reelGrid.forEach((column, reel) =>
        column.forEach((s, row) => {
          if (s === scatterWin.symbol) winning.add(`${reel}:${row}`);
        }),
      );
    }
    if (winning.size > 0) {
      this.reels.forEach((reel, i) => {
        // Scurite con una tinta invece che con la trasparenza, così lo sfondo non traspare dalle celle.
        for (let row = 0; row < math.rows; row++) reel.cell(row).tint = winning.has(`${i}:${row}`) ? 0xffffff : DIMMED;
      });
      this.animateWins(winning);
      const cells: WinCell[] = [...winning].map((key) => {
        const [reel, row] = key.split(":").map(Number) as [number, number];
        const { x, y } = center(reel, row);
        const color = this.module.scene.symbols.get(this.reels[reel]!.symbolAt(row))?.color ?? "#ffd43b";
        return { x: x - this.cellW / 2, y: y - this.cellH / 2, w: this.cellW, h: this.cellH, color: lighten(toHex(color), 0.65) };
      });
      this.effects.highlight(cells);
    }
    this.winText.text = amount ?? "";
  }

  /** Anima le celle vincenti: i fotogrammi della scena se ci sono, altrimenti una pulsazione. */
  private animateWins(winning: ReadonlySet<string>): void {
    const cells = [...winning].map((key) => {
      const [reel, row] = key.split(":").map(Number) as [number, number];
      const view = this.reels[reel]!;
      return { sprite: view.cell(row), animation: this.animations.get(view.symbolAt(row)) };
    });
    let elapsed = 0;
    this.winAnimation = (ticker) => {
      elapsed += ticker.deltaMS / 1000;
      for (const { sprite, animation } of cells) {
        if (animation) sprite.texture = animation.frames[Math.floor(elapsed * animation.fps) % animation.frames.length]!;
        else sprite.scale.set(1 + 0.06 * Math.sin(elapsed * Math.PI * 3));
      }
    };
    this.app.ticker.add(this.winAnimation);
  }

  /**
   * Schermata delle vincite grandi sopra i rulli: `title` è il testo da mostrare
   * (per esempio "BIG WIN"), `credits` la vincita a cui sale il contatore.
   */
  celebrate(title: string, credits: number, format: (credits: number) => string, turbo: boolean): Promise<void> {
    this.winText.text = "";
    return this.effects.celebrate(title, credits, format, turbo ? 900 : 2600);
  }

  clearWins(): void {
    this.effects.clear();
    if (this.winAnimation) {
      this.app.ticker.remove(this.winAnimation);
      this.winAnimation = null;
      for (const reel of this.reels) reel.refresh();
    }
    this.winLayer.clear();
    this.winText.text = "";
    for (const reel of this.reels) for (let row = 0; row < this.module.math.rows; row++) reel.cell(row).tint = 0xffffff;
  }

  destroy(): void {
    this.effects.destroy();
    this.app.destroy(true, { children: true, texture: true });
  }
}
