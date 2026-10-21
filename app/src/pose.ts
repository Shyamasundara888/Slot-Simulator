import type { MotionKind, RigMove } from "../../src/module/schema.js";

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


/** Trasformazioni di una parte del rig in un istante, attorno al suo perno. */
export interface PartPose {
  /** Rotazione in radianti. */
  rotation: number;
  sx: number;
  sy: number;
  /** Spostamento, in frazioni del disegno. */
  dx: number;
  dy: number;
  /** Quanto cresce in altezza il lato lontano dal perno, per ogni larghezza del disegno di distanza. */
  perspective: number;
  /** Quanto scurire la parte, da 0 a 0.9. */
  shade: number;
}

/** In quanti secondi i movimenti del rig arrivano all'ampiezza piena: all'inizio la parte è ferma. */
export const RIG_EASE_IN = 0.25;

/** Posa di una parte del rig `t` secondi dopo l'inizio della vincita, con un loop lungo `loop` secondi. */
export function rigPose(moves: readonly RigMove[], t: number, loop: number, strength = 1): PartPose {
  const pose: PartPose = { rotation: 0, sx: 1, sy: 1, dx: 0, dy: 0, perspective: 0, shade: 0 };
  const ease = Math.min(1, t / RIG_EASE_IN) * strength;
  for (const m of moves) {
    const u = TAU * ((m.cycles * t) / loop + m.phase);
    const w = ease * (m.wave === "pulse" ? (1 - Math.cos(u)) / 2 : Math.sin(u));
    pose.rotation += ((m.rotate ?? 0) * Math.PI * w) / 180;
    pose.sx += (m.scaleX ?? 0) * w;
    pose.sy += (m.scaleY ?? 0) * w;
    pose.dx += (m.x ?? 0) * w;
    pose.dy += (m.y ?? 0) * w;
    pose.perspective += (m.perspective ?? 0) * w;
    pose.shade += (m.shade ?? 0) * Math.abs(w);
  }
  pose.sx = Math.max(0.05, pose.sx);
  pose.sy = Math.max(0.05, pose.sy);
  pose.shade = Math.min(0.9, pose.shade);
  return pose;
}
