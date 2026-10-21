import type { MotionKind } from "../../src/module/schema.js";

/** Pose del disegno che si muove (motion): solo numeri, senza PixiJS, così si provano nei test. */

/** Trasformazioni del disegno in un istante. */
export interface Pose {
  /** Scala uniforme. */
  scale: number;
  /** Scala in più su un solo asse (battito d'ali). */
  sx: number;
  sy: number;
  /** Rotazione in radianti. */
  rotation: number;
  /** Spostamento verticale, in frazione dell'altezza della cella (negativo = in su). */
  dy: number;
  /** Ondeggiamento orizzontale del reticolo, in frazione della larghezza. */
  wave: number;
}

const TAU = Math.PI * 2;
/** Durata dell'uscita dalla tessera di "pop" e del salto all'arresto, in secondi. */
const POP_IN = 0.35;
export const LAND_SECONDS = 0.38;

const backOut = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
/** Da 0 a 1 e ritorno, partendo e finendo fermo. */
const breathe = (t: number, hz: number) => (1 - Math.cos(TAU * hz * t)) / 2;

/** Posa del disegno `t` secondi dopo l'inizio della vincita. */
export function motionPose(kind: MotionKind, t: number, strength = 1): Pose {
  const pose: Pose = { scale: 1, sx: 1, sy: 1, rotation: 0, dy: 0, wave: 0 };
  const k = strength;
  switch (kind) {
    case "pulse":
      pose.scale = 1 + 0.08 * k * breathe(t, 1.4);
      break;
    case "pop": {
      // Esce dalla tessera con un piccolo rimbalzo, poi respira restando un po' più grande.
      const lift = t < POP_IN ? backOut(t / POP_IN) : 1;
      pose.scale = 1 + 0.22 * k * lift + 0.05 * k * (t < POP_IN ? 0 : breathe(t - POP_IN, 1.2));
      pose.dy = -0.04 * k * lift;
      break;
    }
    case "swing":
      pose.scale = 1 + 0.08 * k * Math.min(1, t / 0.2);
      pose.rotation = 0.16 * k * Math.sin(TAU * 1.1 * t) * Math.min(1, t / 0.3);
      break;
    case "spin":
      pose.scale = 1 + 0.06 * k * Math.min(1, t / 0.2);
      pose.rotation = TAU * 0.45 * t * k;
      break;
    case "wobble":
      pose.scale = 1 + 0.07 * k * Math.min(1, t / 0.2);
      pose.wave = 0.035 * k * Math.min(1, t / 0.3);
      break;
    case "flutter":
      pose.scale = 1 + 0.06 * k * Math.min(1, t / 0.2);
      pose.sx = 1 - 0.14 * k * breathe(t, 3.2);
      pose.sy = 1 + 0.03 * k * breathe(t, 3.2);
      pose.dy = -0.025 * k * Math.sin(TAU * 1.6 * t);
      break;
  }
  return pose;
}

/** Posa del salto all'arresto del rullo: sale e torna giù in LAND_SECONDS. */
export function landPose(t: number, strength = 1): Pose {
  const u = Math.min(1, Math.max(0, t / LAND_SECONDS));
  return { scale: 1 + 0.22 * strength * Math.sin(Math.PI * u), sx: 1, sy: 1, rotation: 0, dy: -0.05 * strength * Math.sin(Math.PI * u), wave: 0 };
}

