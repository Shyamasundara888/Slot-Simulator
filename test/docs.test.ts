import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSlotModule } from "../src/module/load.js";
import { exactRtp } from "../src/sim/exact.js";

const skills = readdirSync(".claude/skills").map((name) => join(".claude/skills", name, "SKILL.md"));
const pages = [
  "README.md",
  "AGENTS.md",
  "llms.txt",
  ...readdirSync("docs").filter((name) => name.endsWith(".md")).map((name) => join("docs", name)),
  ...skills,
];

describe("documentazione", () => {
  it("il modello di slot è valido", async () => {
    const { manifest, math } = await loadSlotModule("templates/slot-base");
    expect(manifest.id).toBe("slot-base");
    expect(exactRtp(math).baseRtp).toBeGreaterThan(0.7);
    expect(exactRtp(math).baseRtp).toBeLessThan(0.8);
  });

  it.each(pages)("%s cita solo file che esistono", (page) => {
    const text = readFileSync(page, "utf8");
    const links = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1] ?? "");
    const missing = links
      .filter((link) => !/^[a-z]+:/.test(link) && !link.startsWith("#"))
      .map((link) => join(dirname(page), link.split("#")[0] ?? ""))
      .filter((path) => !existsSync(path));
    expect(missing).toEqual([]);
  });

  it.each(skills)("%s ha nome e descrizione", (skill) => {
    const text = readFileSync(skill, "utf8");
    expect(text).toMatch(/^---\nname: [a-z-]+\ndescription: .+\n/);
  });
});
