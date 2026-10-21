import { describe, expect, it } from "vitest";
import { LAND_SECONDS, landPose, motionPose } from "../app/src/pose.js";
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
});
