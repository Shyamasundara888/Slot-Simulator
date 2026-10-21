import { Container, FillGradient, Graphics, MeshPlane, Sprite, type Renderer, type Texture } from "pixi.js";
import type { Motion } from "../../src/module/schema.js";
import { LAND_SECONDS, landPose, motionPose } from "./pose.js";

const TAU = Math.PI * 2;

/**
 * Movimento del disegno di un simbolo sopra la sua tessera, senza fotogrammi:
 * respiro, uscita dalla tessera, oscillazione, rotazione, ondeggiamento e battito d'ali,
 * con un riflesso che segue la sagoma del disegno. Solo presentazione.
 */

/** Ogni quanti secondi il riflesso attraversa il disegno, e per quanta parte del periodo si vede. */
const SHINE_PERIOD = 1.6;
const SHINE_VISIBLE = 0.55;

let shineTexture: Texture | null = null;
/** Banda di luce sfumata ai lati, condivisa da tutti i disegni. */
function shineBand(renderer: Renderer): Texture {
  if (shineTexture && !shineTexture.destroyed) return shineTexture;
  const band = new FillGradient({ type: "linear", start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, textureSpace: "local" });
  band.addColorStop(0, "rgba(255,255,255,0)").addColorStop(0.5, "rgba(255,255,255,0.8)").addColorStop(1, "rgba(255,255,255,0)");
  const graphics = new Graphics().rect(0, 0, 64, 8).fill(band);
  shineTexture = renderer.generateTexture({ target: graphics, resolution: 2 });
  graphics.destroy();
  return shineTexture;
}

const GRID = 12;

/** Il disegno di un simbolo che si muove, centrato in una cella di w x h. */
export class SymbolMotion {
  readonly container = new Container();
  /** Contiene disegno e riflesso e prende la posa; container resta al centro della cella. */
  private readonly body = new Container();
  private readonly mesh: MeshPlane;
  private readonly rest: Float32Array;
  private readonly shine: Sprite | null = null;
  private readonly fit: number;
  private elapsed = 0;

  constructor(
    renderer: Renderer,
    art: Texture,
    private readonly motion: Motion,
    w: number,
    private readonly h: number,
    /** "land": solo il salto all'arresto del rullo. */
    private readonly mode: "win" | "land" = "win",
  ) {
    this.fit = Math.min(w / art.width, h / art.height);
    this.mesh = new MeshPlane({ texture: art, verticesX: GRID, verticesY: GRID });
    this.mesh.pivot.set(art.width / 2, art.height / 2);
    this.rest = Float32Array.from(this.mesh.geometry.getAttribute("aPosition").buffer.data as Float32Array);
    this.body.addChild(this.mesh);
    if (motion.shine && mode === "win") {
      // Il riflesso si vede solo dentro la sagoma del disegno: la maschera è una copia del disegno.
      const mask = new Sprite(art);
      mask.anchor.set(0.5);
      const band = new Sprite(shineBand(renderer));
      band.anchor.set(0.5);
      band.blendMode = "add";
      band.width = art.width * 0.45;
      band.height = art.height * 1.8;
      band.rotation = 0.35;
      band.mask = mask;
      this.body.addChild(mask, band);
      this.shine = band;
    }
    this.container.addChild(this.body);
    this.update(0);
  }

  /** Avanza di `seconds`; restituisce false quando un salto all'arresto è finito. */
  update(seconds: number): boolean {
    this.elapsed += seconds;
    const t = this.elapsed;
    const pose = this.mode === "land" ? landPose(t, this.motion.strength) : motionPose(this.motion.win, t, this.motion.strength);
    this.body.scale.set(this.fit * pose.scale * pose.sx, this.fit * pose.scale * pose.sy);
    this.body.rotation = pose.rotation;
    this.body.y = pose.dy * this.h;
    this.deform(pose.wave, t);
    if (this.shine) {
      const phase = (t % SHINE_PERIOD) / SHINE_PERIOD;
      const width = this.mesh.texture.width;
      this.shine.visible = phase < SHINE_VISIBLE;
      this.shine.x = -width * 0.8 + (phase / SHINE_VISIBLE) * width * 1.6;
    }
    return this.mode !== "land" || t < LAND_SECONDS;
  }

  /** Ondeggiamento: le righe del reticolo si spostano di lato, sfasate dall'alto in basso. */
  private deform(wave: number, t: number): void {
    const buffer = this.mesh.geometry.getAttribute("aPosition").buffer;
    const data = buffer.data as Float32Array;
    if (wave === 0 && data[0] === this.rest[0]) return;
    const { width, height } = this.mesh.texture;
    for (let i = 0; i < data.length; i += 2) {
      const y = this.rest[i + 1]! / height;
      // Più forte in alto, ferma alla base, come una gelatina appoggiata.
      data[i] = this.rest[i]! + wave * width * (1 - y) * Math.sin(TAU * (1.8 * t - 0.6 * y));
      data[i + 1] = this.rest[i + 1]!;
    }
    buffer.update();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
