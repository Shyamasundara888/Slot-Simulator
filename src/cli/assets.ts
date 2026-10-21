import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildAssets, promptsMarkdown } from "../assets/build.js";
import { ComfyClient, ComfyError } from "../assets/comfyui.js";
import { ART_FILE, generate, importFrames, readSpec } from "../assets/generate.js";
import { framePaths } from "../assets/spec.js";
import { ModuleError } from "../module/build.js";
import { loadSlotModule } from "../module/load.js";

const USAGE = `Uso: npm run assets -- <comando> <cartella-modulo>

  build     legge art/art.json, crea immagini, fotogrammi di vincita, sfondo e suoni in assets/
            e aggiorna scenes/main.json (le cartelle assets/symbols e assets/sounds vengono rifatte)
  prompts   scrive art/prompts.md con un prompt per simbolo, da usare con un generatore di immagini esterno
  generate  genera con ComfyUI in locale le immagini dei simboli e dello sfondo in art/raw/
            (salta quelle già presenti; registra prompt, seed e modello in art/raw/generated.json)
  frames    porta in art/raw/anim/ i fotogrammi scontornati di un'animazione di vincita, ritagliati
            tutti allo stesso modo, e dice cosa mettere in art.json

Opzioni di generate:
  --only <ID>       solo questo simbolo (ripetibile); "background" per lo sfondo
  --force           rigenera anche le immagini già presenti
  --variants <n>    n varianti per immagine, con seed consecutivi, in art/raw/varianti/
  --seed <n>        seed di partenza al posto di quello di art.json
  --url <indirizzo> API di ComfyUI (predefinito: COMFYUI_URL oppure http://127.0.0.1:8188)

Opzioni di frames:
  --symbol <ID>      simbolo da animare
  --from <cartella>  cartella con i fotogrammi PNG o WebP, in ordine alfabetico`;



/** Simboli della paytable, per controllare che art.json li copra tutti e non ne inventi. */
async function paytableSymbols(dir: string): Promise<string[]> {
  const paytable = JSON.parse(await readFile(join(dir, "math/paytable.json"), "utf8")) as { symbols: { id: string }[] };
  return paytable.symbols.map((s) => s.id);
}

async function build(dir: string): Promise<void> {
  const spec = await readSpec(dir);
  const symbols = await paytableSymbols(dir);
  const problems = Object.keys(spec.symbols)
    .filter((id) => !symbols.includes(id))
    .map((id) => `${ART_FILE}: symbols.${id}: simbolo non presente in math/paytable.json`);
  for (const [id, art] of Object.entries(spec.symbols)) {
    const frames = art.animation ? framePaths(art.animation.frames, art.animation.count) : [];
    for (const file of [art.svg, art.image, ...frames]) if (file && !existsSync(join(dir, file))) problems.push(`${ART_FILE}: symbols.${id}: manca ${file}`);
  }
  for (const file of [spec.background?.svg, spec.background?.image]) if (file && !existsSync(join(dir, file))) problems.push(`${ART_FILE}: background: manca ${file}`);
  if (problems.length > 0) throw new ModuleError(problems);

  const { files, scene } = buildAssets(spec, (path) => readFileSync(join(dir, path)));

  // Le cartelle generate vengono rifatte da zero, così non restano file di disegni tolti.
  await rm(join(dir, "assets/symbols"), { recursive: true, force: true });
  await rm(join(dir, "assets/sounds"), { recursive: true, force: true });
  if (!scene.backgroundImage) await rm(join(dir, "assets/background.svg"), { force: true });
  for (const [path, bytes] of files) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), bytes);
  }

  // Nella scena cambiano solo i campi che dipendono dagli asset: etichette, nomi delle modalità e il resto restano.
  const scenePath = join(dir, "scenes/main.json");
  const current = existsSync(scenePath) ? (JSON.parse(await readFile(scenePath, "utf8")) as Record<string, unknown>) : {};
  const oldSymbols = (current.symbols ?? {}) as Record<string, Record<string, unknown>>;
  // Coppie e non un oggetto: un oggetto metterebbe in testa gli id numerici come "10".
  const newSymbols: [string, Record<string, unknown>][] = [];
  for (const id of symbols) {
    const old = oldSymbols[id];
    const built = scene.symbols[id];
    if (old || built) newSymbols.push([id, built ? { label: old?.label ?? id, ...old, ...built } : old!]);
  }
  const next: Record<string, unknown> = { ...current, symbols: newSymbols, sounds: scene.sounds };
  if (scene.backgroundImage) next.backgroundImage = scene.backgroundImage;
  else delete next.backgroundImage;
  if (Object.keys(scene.sounds).length === 0) delete next.sounds;
  await mkdir(dirname(scenePath), { recursive: true });
  await writeFile(scenePath, `${formatScene(next)}\n`);

  const module = await loadSlotModule(dir);
  const missing = symbols.filter((id) => !spec.symbols[id]);
  const kb = [...files.values()].reduce((n, b) => n + b.length, 0) / 1024;
  console.log(`${module.manifest.name}: ${files.size} asset (${kb.toFixed(0)} KB) in ${join(dir, "assets")}, scena aggiornata`);
  if (missing.length > 0) console.log(`  senza disegno (restano tessere colorate): ${missing.join(", ")}`);
}

/** JSON della scena con un simbolo per riga, come gli altri file dei moduli. */
function formatScene(scene: Record<string, unknown>): string {
  const symbols = scene.symbols as [string, unknown][];
  const text = JSON.stringify({ ...scene, symbols: "\u0000" }, null, 2);
  const lines = symbols.map(([id, s]) => `    ${JSON.stringify(id)}: ${JSON.stringify(s).replace(/":/g, '": ').replace(/,"/g, ', "')}`);
  return text.replace('"\\u0000"', `{\n${lines.join(",\n")}\n  }`);
}

async function prompts(dir: string): Promise<void> {
  const spec = await readSpec(dir);
  const module = await loadSlotModule(dir);
  const labels = new Map([...module.scene.symbols].map(([id, s]) => [id, s.label]));
  const path = join(dir, "art/prompts.md");
  await writeFile(path, promptsMarkdown(spec, labels, module.manifest.name));
  console.log(`Scritto ${path}`);
}

async function frames(dir: string, symbol: string | undefined, from: string | undefined): Promise<void> {
  const swallowed = ["symbol", "from"].filter((name) => process.env[`npm_config_${name}`] !== undefined);
  if (swallowed.length > 0) throw new ModuleError([`npm si è tenuto le opzioni ${swallowed.map((n) => `--${n}`).join(", ")}: in PowerShell usa npm.cmd`]);
  if (!symbol || !from) throw new ModuleError(["frames: servono --symbol <ID> e --from <cartella>"]);
  const { files, animation } = await importFrames(dir, symbol, resolve(from));
  console.log(`${files.length} fotogrammi in ${join(dir, "art/raw/anim")}`);
  console.log(`In ${ART_FILE}, nel simbolo ${symbol}: "animation": ${JSON.stringify({ ...animation, fps: 12, loop: "pingpong" }).replace(/":/g, '": ').replace(/,"/g, ', "')}`);
  console.log("Poi npm run assets -- build per rifare gli asset.");
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h", default: false },
      only: { type: "string", multiple: true, default: [] },
      force: { type: "boolean", default: false },
      variants: { type: "string", default: "1" },
      seed: { type: "string" },
      url: { type: "string", default: process.env.COMFYUI_URL ?? "http://127.0.0.1:8188" },
      symbol: { type: "string" },
      from: { type: "string" },
    },
  });
  const [command, target] = positionals;
  if (values.help || target === undefined || !["build", "prompts", "generate", "frames"].includes(command ?? "")) {
    console.log(USAGE);
    process.exitCode = values.help ? 0 : 1;
    return;
  }
  const dir = resolve(target);
  try {
    if (command === "build") await build(dir);
    else if (command === "prompts") await prompts(dir);
    else if (command === "frames") await frames(dir, values.symbol, values.from);
    else {
      // In PowerShell "npm run assets -- ..." perde il "--": npm si tiene le opzioni e le passa solo come
      // variabili npm_config_*. Meglio fermarsi che generare tutto con le impostazioni predefinite.
      const swallowed = ["only", "variants", "seed", "url"].filter((name) => process.env[`npm_config_${name}`] !== undefined);
      if (swallowed.length > 0) {
        throw new ComfyError(
          `npm si è tenuto le opzioni del comando invece di passargliele (ha visto almeno ${swallowed.map((n) => `--${n}`).join(", ")}; succede in PowerShell, che toglie il "--").\n` +
            "In PowerShell usa npm.cmd: npm.cmd run assets -- generate <cartella> ...",
        );
      }
      const variants = Number(values.variants);
      const seed = values.seed === undefined ? undefined : Number(values.seed);
      if (!Number.isInteger(variants) || variants < 1 || variants > 16) throw new ModuleError(["--variants: serve un numero intero da 1 a 16"]);
      if (seed !== undefined && (!Number.isSafeInteger(seed) || seed < 0)) throw new ModuleError(["--seed: serve un numero intero positivo"]);
      const client = new ComfyClient({ url: values.url });
      const files = await generate(dir, { only: values.only, force: values.force, variants, ...(seed !== undefined && { seed }), client });
      console.log(`${files.length} immagini generate`);
    }
  } catch (err) {
    if (!(err instanceof ModuleError) && !(err instanceof ComfyError)) throw err;
    console.error(err.message);
    process.exitCode = 1;
  }
}

await main();
