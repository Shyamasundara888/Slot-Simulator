import { describe, expect, it } from "vitest";
import { buildSlotMath, ModuleError } from "../src/module/build.js";
import { loadSlotModule } from "../src/module/load.js";

describe("moduli", () => {
  it("carica il modulo di esempio", async () => {
    const { manifest, math } = await loadSlotModule("slots/tempio-del-sole");
    expect(manifest.id).toBe("tempio-del-sole");
    expect(math.reelCount).toBe(5);
    expect(math.rows).toBe(3);
    expect(math.lines).toHaveLength(10);
    expect(math.wild).toBe("SOLE");
    expect(math.scatter?.symbol).toBe("PORTALE");
  });

  it("elenca tutti i problemi di coerenza in un solo errore", () => {
    try {
      buildSlotMath(
        { rows: 3, modes: { base: [["A", "X"], ["A", "A", "A"]] } },
        { lines: [[0, 5]] },
        { symbols: [{ id: "A", kind: "normal" }], linePays: { A: { "3": 1 }, Z: { "2": 1 } } },
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ModuleError);
      const problems = (err as ModuleError).problems.join("\n");
      expect(problems).toContain("meno delle 3 righe");
      expect(problems).toContain("simbolo non definito X");
      expect(problems).toContain("riga oltre");
      expect(problems).toContain("fuori da 1..2");
      expect(problems).toContain("linePays: simbolo non definito Z");
    }
  });
});
