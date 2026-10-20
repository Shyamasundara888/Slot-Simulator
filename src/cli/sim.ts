import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { ModuleError } from "../module/build.js";
import { loadSlotModule } from "../module/load.js";
import { MODULE_FILES } from "../module/parse.js";
import { ScriptError, ScriptRuntime } from "../script/runtime.js";
import { exactRtp } from "../sim/exact.js";
import { simulate, WIN_BUCKETS } from "../sim/simulate.js";

const USAGE = `Uso: npm run sim -- <cartella-modulo> [--spins N] [--seed S] [--exact] [--json]

  --spins N   numero di round da simulare (predefinito 1000000)
  --seed S    seed dell'RNG, numero o testo (predefinito 1)
  --exact     calcola solo l'RTP esatto dello spin base, senza simulare e senza script
  --json      stampa il risultato in JSON`;

const pct = (x: number, digits = 2) => `${(x * 100).toFixed(digits)}%`;
const bucketLabel = ([lo, hi]: readonly [number, number]) => (hi === Infinity ? `${lo}x e oltre` : `da ${lo}x a ${hi}x`);

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      spins: { type: "string", default: "1000000" },
      seed: { type: "string", default: "1" },
      exact: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const dir = positionals[0];
  if (values.help || dir === undefined) {
    console.log(USAGE);
    process.exitCode = dir === undefined && !values.help ? 1 : 0;
    return;
  }

  const module = await loadSlotModule(resolve(dir));
  const { math, manifest } = module;
  const exact = exactRtp(math);
  const script = module.script === null ? null : await ScriptRuntime.create(math, module.script);

  if (values.exact) {
    if (values.json) return console.log(JSON.stringify(exact, null, 2));
    console.log(`${manifest.name} ${manifest.version}: RTP esatto dello spin base (free spin esclusi)`);
    if (script) console.log(`  attenzione: il calcolo ignora ${MODULE_FILES.script} (hook ${script.hooks.join(", ")})`);
    console.log(`  RTP base       ${pct(exact.baseRtp, 4)}`);
    console.log(`  da linee       ${pct(exact.lineRtp, 4)}`);
    console.log(`  da scatter     ${pct(exact.scatterRtp, 4)}`);
    if (math.freeSpins) console.log(`  free spin      1 spin su ${(1 / exact.freeSpinsProbability).toFixed(1)}`);
    return;
  }

  const spins = Number(values.spins);
  const seed = /^\d+$/.test(values.seed) ? Number(values.seed) : values.seed;
  const started = performance.now();
  const result = simulate(math, { spins, seed, hooks: script ?? undefined });
  const seconds = (performance.now() - started) / 1000;

  if (values.json) return console.log(JSON.stringify({ exact, simulation: result }, null, 2));

  console.log(`${manifest.name} ${manifest.version}: ${spins.toLocaleString("it-IT")} round, seed ${seed}, ${seconds.toFixed(1)} s`);
  if (script) console.log(`  script ${MODULE_FILES.script} con hook ${script.hooks.join(", ")}`);
  console.log(`  RTP simulato        ${pct(result.rtp)} ± ${pct(result.rtpConfidence95)} (95%)`);
  console.log(`    spin base         ${pct(result.baseRtp)}  (esatto ${pct(exact.baseRtp)})`);
  if (result.freeSpins) console.log(`    free spin         ${pct(result.freeSpinsRtp)}`);
  for (const [mode, e] of Object.entries(result.extra)) console.log(`    modalità ${mode.padEnd(8)} ${pct(e.rtp)}`);
  console.log(`  Frequenza vincite   ${pct(result.hitFrequency)} (1 round su ${(1 / result.hitFrequency).toFixed(1)})`);
  console.log(`  Deviazione std      ${result.stdDev.toFixed(2)}x`);
  console.log(`  Vincita massima     ${result.maxWin.toFixed(2)}x (round n. ${result.maxWinSpin + 1})`);
  if (Number.isFinite(math.maxWin)) {
    console.log(`  Tetto di vincita    ${math.maxWin}x, raggiunto ${result.cappedRounds} volte`);
  }
  if (result.freeSpins) {
    const f = result.freeSpins;
    const every = f.triggers ? `1 round su ${Math.round(spins / f.triggers)}` : "mai";
    console.log("  Free spin:");
    console.log(`    attivazione       ${every} (esatto 1 su ${(1 / exact.freeSpinsProbability).toFixed(1)})`);
    console.log(`    spin per bonus    ${f.averageSpins.toFixed(1)} in media`);
    console.log(`    vincita media     ${f.averageWin.toFixed(2)}x`);
    if (math.freeSpins?.upgradeOnExpandedWild) console.log(`    upgrade medio     livello ${f.averageUpgradeLevel.toFixed(2)}`);
  }
  for (const [mode, e] of Object.entries(result.extra)) {
    console.log(`  Modalità ${mode} (richiesta dallo script):`);
    console.log(`    sequenze          1 round su ${Math.round(spins / e.rounds)}`);
    console.log(`    spin per sequenza ${e.averageSpins.toFixed(1)} in media`);
    console.log(`    vincita media     ${e.averageWin.toFixed(2)}x`);
  }
  console.log("  Vincite per fascia (multipli della puntata totale):");
  WIN_BUCKETS.forEach((b, i) => {
    const n = result.winBuckets[i]!;
    console.log(`    ${bucketLabel(b).padEnd(18)} ${pct(n / spins, 4).padStart(9)}`);
  });
}

main().catch((err: unknown) => {
  console.error(err instanceof ModuleError || err instanceof ScriptError ? err.message : err);
  process.exitCode = 1;
});
