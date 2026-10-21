import { describe, expect, it } from "vitest";
import { LAND_SECONDS, landPose, motionPose, RIG_EASE_IN, rigPose } from "../app/src/pose.js";
import { MOTIONS, sceneSchema } from "../src/module/schema.js";

describe("movimento del disegno (motion)", () => {
  it("ogni movimento parte dalla posa ferma, così il disegno non salta sopra la tessera", () => {
    for (const kind of MOTIONS) {
      const pose = motionPose(kind, 0);
      expect(pose.scale, kind).toBeCloseTo(1, 5);
      expect(pose.rotation, kind).toBeCloseTo(0, 5);
      expect(pose.dy, kind).toBeCloseTo(0, 5);
      expect(pose.wave, kind).toBe(0);
    }
  });

  it("pop esce dalla tessera e resta più grande, pulse torna alla misura normale", () => {
    expect(motionPose("pop", 0.35).scale).toBeGreaterThan(1.15);
    expect(motionPose("pop", 2).scale).toBeGreaterThan(1.15);
    expect(motionPose("pop", 0.35).dy).toBeLessThan(0);
    expect(motionPose("pulse", 1 / 1.4).scale).toBeCloseTo(1, 5);
    expect(motionPose("pulse", 0.5 / 1.4).scale).toBeCloseTo(1.08, 5);
  });

  it("strength cambia l'ampiezza", () => {
    expect(motionPose("swing", 0.5, 0.5).rotation).toBeCloseTo(motionPose("swing", 0.5).rotation / 2, 5);
    expect(motionPose("wobble", 1, 2).wave).toBeCloseTo(2 * motionPose("wobble", 1).wave, 5);
  });

  it("il salto all'arresto sale e torna giù", () => {
    expect(landPose(0).scale).toBeCloseTo(1, 5);
    expect(landPose(LAND_SECONDS / 2).scale).toBeGreaterThan(1.2);
    expect(landPose(LAND_SECONDS).scale).toBeCloseTo(1, 5);
  });

  it("nella scena motion richiede il disegno e la tessera separati", () => {
    const scene = (style: Record<string, unknown>) => sceneSchema.safeParse({ symbols: { A: { color: "#336699", ...style } } });
    expect(scene({ motion: { win: "pop" } }).success).toBe(false);
    const ok = scene({ art: "assets/a-disegno.svg", tile: "assets/a-tessera.svg", motion: { win: "swing" } });
    expect(ok.success).toBe(true);
    expect(ok.data!.symbols.A!.motion).toEqual({ win: "swing", shine: true, land: false, strength: 1 });
    expect(scene({ art: "assets/a.svg", tile: "assets/t.svg", motion: { win: "salta" } }).success).toBe(false);
  });

  it("le parti del rig partono ferme, chiudono il loop e rispettano onda e fase", () => {
    const flap = [{ scaleX: -0.4, shade: 0.2, cycles: 2, phase: 0, wave: "pulse" as const }];
    const legs = [{ rotate: 10, cycles: 1, phase: 0.25, wave: "sine" as const }];
    expect(rigPose(legs, 0, 1.2).rotation).toBe(0);
    // Dopo l'entrata, la posa si ripete esattamente a ogni loop.
    for (const t of [0.3, 0.71, 1.05]) {
      expect(rigPose(flap, t, 1.2).sx).toBeCloseTo(rigPose(flap, t + 1.2, 1.2).sx, 10);
      expect(rigPose(legs, t, 1.2).rotation).toBeCloseTo(rigPose(legs, t + 2.4, 1.2).rotation, 10);
    }
    // pulse: massimo a metà del suo periodo (due battiti per loop, quindi a 0.3 s), ombra compresa.
    expect(rigPose(flap, 0.3, 1.2).sx).toBeCloseTo(0.6, 10);
    expect(rigPose(flap, 0.3, 1.2).shade).toBeCloseTo(0.2, 10);
    expect(rigPose(flap, 0.6, 1.2).sx).toBeCloseTo(1, 10);
    // sine con fase 0.25: già al massimo all'inizio del loop, dopo l'entrata.
    expect(rigPose(legs, 1.2, 1.2).rotation).toBeCloseTo((10 * Math.PI) / 180, 10);
    expect(rigPose(legs, RIG_EASE_IN / 2, 1.2, 1).rotation).toBeLessThan(rigPose(legs, 1.2, 1.2).rotation / 2 + 1e-9);
    expect(rigPose(legs, 1.2, 1.2, 0.5).rotation).toBeCloseTo((5 * Math.PI) / 180, 10);
  });

  it("nella scena il rig richiede motion", () => {
    const rig = { parts: [{ id: "ala", shape: [[0, 0], [1, 0], [1, 1]], pivot: [0.5, 0.5], moves: [{ rotate: 5 }] }] };
    const scene = (style: Record<string, unknown>) => sceneSchema.safeParse({ symbols: { A: { color: "#336699", art: "assets/a.svg", tile: "assets/t.svg", ...style } } });
    expect(scene({ rig }).success).toBe(false);
    const ok = scene({ motion: {}, rig });
    expect(ok.success).toBe(true);
    expect(ok.data!.symbols.A!.rig!.parts[0]).toMatchObject({ front: false, moves: [{ rotate: 5, cycles: 1, phase: 0, wave: "sine" }] });
  });
});
