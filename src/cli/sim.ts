import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { ModuleError } from "../module/build.js";
import { loadSlotModule } from "../module/load.js";
import { exactRtp } from "../sim/exact.js";
import { simulate, WIN_BUCKETS } from "../sim/simulate.js";

const USAGE = `Uso: npm run sim -- <cartella-modulo> [--spins N] [--seed S] [--exact] [--json]

  --spins N   numero di spin da simulare (predefinito 1000000)
  --seed S    seed dell'RNG, numero o testo (predefinito 1)
  --exact     calcola solo l'RTP esatto, senza simulare
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

  if (values.exact) {
    if (values.json) return console.log(JSON.stringify(exact, null, 2));
    console.log(`${manifest.name} ${manifest.version}: RTP esatto della modalità base`);
    console.log(`  RTP totale   ${pct(exact.rtp, 4)}`);
    console.log(`  da linee     ${pct(exact.lineRtp, 4)}`);
    console.log(`  da scatter   ${pct(exact.scatterRtp, 4)}`);
    return;
  }

  const spins = Number(values.spins);
  const seed = /^\d+$/.test(values.seed) ? Number(values.seed) : values.seed;
  const started = performance.now();
  const result = simulate(math, { spins, seed });
  const seconds = (performance.now() - started) / 1000;

  if (values.json) return console.log(JSON.stringify({ exact, simulation: result }, null, 2));

  console.log(`${manifest.name} ${manifest.version}: ${spins.toLocaleString("it-IT")} spin, seed ${seed}, ${seconds.toFixed(1)} s`);
  console.log(`  RTP simulato        ${pct(result.rtp)} ± ${pct(result.rtpConfidence95)} (95%)`);
  console.log(`  RTP esatto          ${pct(exact.rtp)}`);
  console.log(`    da linee          ${pct(result.lineRtp)}  (esatto ${pct(exact.lineRtp)})`);
  console.log(`    da scatter        ${pct(result.scatterRtp)}  (esatto ${pct(exact.scatterRtp)})`);
  console.log(`  Frequenza vincite   ${pct(result.hitFrequency)} (1 spin su ${(1 / result.hitFrequency).toFixed(1)})`);
  console.log(`  Deviazione std      ${result.stdDev.toFixed(2)}x`);
  console.log(`  Vincita massima     ${result.maxWin.toFixed(2)}x (spin n. ${result.maxWinSpin + 1})`);
  console.log("  Vincite per fascia (multipli della puntata totale):");
  WIN_BUCKETS.forEach((b, i) => {
    const n = result.winBuckets[i]!;
    console.log(`    ${bucketLabel(b).padEnd(16)} ${pct(n / spins, 3).padStart(8)}`);
  });
  if (math.scatter) {
    console.log(`  Scatter (${math.scatter.symbol}) per spin:`);
    result.scatterCounts.forEach((n, count) => {
      if (count >= 3 && n > 0) console.log(`    ${count} scatter          1 spin su ${Math.round(spins / n)}`);
    });
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof ModuleError ? err.message : err);
  process.exitCode = 1;
});
