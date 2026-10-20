import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ModuleError } from "../module/build.js";
import { loadSlotModule } from "../module/load.js";
import { backgroundPrompt, symbolPrompt } from "./build.js";
import { pngSize, prepareWorkflow, workflowCheckpoint, type ComfyClient, type Workflow } from "./comfyui.js";
import { artSchema, type ArtSpec } from "./spec.js";

export const ART_FILE = "art/art.json";

/** Legge e valida art/art.json del modulo in `dir`. */
export async function readSpec(dir: string): Promise<ArtSpec> {
  const path = join(dir, ART_FILE);
  if (!existsSync(path)) throw new ModuleError([`manca ${ART_FILE}`]);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    throw new ModuleError([`${ART_FILE}: JSON non valido (${(err as Error).message})`]);
  }
  const parsed = artSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ModuleError(parsed.error.issues.map((i) => `${ART_FILE}: ${i.path.join(".") || "(radice)"}: ${i.message}`));
  }
  return parsed.data;
}

/** Workflow predefiniti, nel repo. */
const DEFAULT_WORKFLOWS = fileURLToPath(new URL("../../tools/comfyui/workflows/", import.meta.url));
const MAX_KB = 300;

export type GenerateOptions = {
  only: string[];
  force: boolean;
  variants: number;
  seed?: number;
  client: ComfyClient;
  log?: (line: string) => void;
};

type GeneratedRecord = { prompt: string; seed: number; workflow: string; checkpoint?: string | undefined; generator: "ComfyUI"; date: string };

async function readWorkflow(dir: string, path: string | undefined, fallback: string): Promise<{ name: string; workflow: Workflow }> {
  const file = path ? join(dir, path) : join(DEFAULT_WORKFLOWS, fallback);
  const name = path ?? `tools/comfyui/workflows/${fallback}`;
  if (!existsSync(file)) throw new ModuleError([`manca il workflow ${name}`]);
  try {
    return { name, workflow: JSON.parse(await readFile(file, "utf8")) as Workflow };
  } catch (err) {
    throw new ModuleError([`${name}: JSON non valido (${(err as Error).message})`]);
  }
}

/** Genera con ComfyUI le immagini di simboli e sfondo in art/raw/ e restituisce i file scritti. */
export async function generate(dir: string, options: GenerateOptions): Promise<string[]> {
  const log = options.log ?? console.log;
  const spec = await readSpec(dir);
  const module = await loadSlotModule(dir);
  const labels = new Map([...module.scene.symbols].map(([id, s]) => [id, s.label]));
  const settings = spec.generate;

  const targets = [...Object.keys(spec.symbols), ...(spec.background ? ["background"] : [])];
  const unknown = options.only.filter((id) => !targets.includes(id));
  if (unknown.length > 0) throw new ModuleError(unknown.map((id) => `--only ${id}: non è un simbolo di ${ART_FILE}${id === "background" ? " (manca background)" : ""}`));
  const chosen = options.only.length > 0 ? targets.filter((id) => options.only.includes(id)) : targets;

  const symbolFlow = await readWorkflow(dir, settings.workflow, "simbolo.json");
  const backgroundFlow = spec.background ? await readWorkflow(dir, settings.backgroundWorkflow, "sfondo.json") : undefined;

  const recordPath = join(dir, "art/raw/generated.json");
  const records = existsSync(recordPath) ? (JSON.parse(await readFile(recordPath, "utf8")) as Record<string, GeneratedRecord>) : {};
  const written: string[] = [];
  const slot = basename(dir);

  for (const id of chosen) {
    const isBackground = id === "background";
    const name = isBackground ? "background" : id.toLowerCase();
    const flow = isBackground ? backgroundFlow! : symbolFlow;
    const prompt = isBackground ? backgroundPrompt(spec) : symbolPrompt(spec, id, labels, "plain light grey background");
    const ownSeed = isBackground ? spec.background?.seed : spec.symbols[id]?.seed;
    const firstSeed = options.seed ?? ownSeed ?? settings.seed;
    const size = isBackground
      ? settings.backgroundSize && { width: settings.backgroundSize[0], height: settings.backgroundSize[1] }
      : { width: settings.size, height: settings.size };

    for (let v = 0; v < options.variants; v++) {
      const seed = firstSeed + v;
      const file = options.variants > 1 ? `art/raw/varianti/${name}-${seed}.png` : `art/raw/${name}.png`;
      if (!options.force && existsSync(join(dir, file))) {
        log(`  ${file}: c'è già (usa --force per rifarlo)`);
        continue;
      }
      const workflow = prepareWorkflow(flow.workflow, { prompt, seed, filenamePrefix: `slot/${slot}/${name}`, size });
      const started = Date.now();
      const [image] = await options.client.run(workflow);
      await mkdir(dirname(join(dir, file)), { recursive: true });
      await writeFile(join(dir, file), image!);
      const dims = pngSize(image!);
      const kb = image!.length / 1024;
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      log(`  ${file}: ${dims ? `${dims.width}x${dims.height}, ` : ""}${kb.toFixed(0)} KB, seed ${seed}, ${seconds} s${!isBackground && kb > MAX_KB ? ` (oltre ${MAX_KB} KB: riduci generate.size)` : ""}`);
      records[file] = { prompt, seed, workflow: flow.name, checkpoint: workflowCheckpoint(flow.workflow), generator: "ComfyUI", date: new Date().toISOString() };
      written.push(file);
      // Registro aggiornato a ogni immagine, così un'interruzione non perde quelle già fatte.
      await writeFile(recordPath, `${JSON.stringify(records, null, 2)}\n`);
    }
  }

  const unlinked = chosen.filter((id) =>
    id === "background" ? spec.background?.image !== "art/raw/background.png" : spec.symbols[id]?.image !== `art/raw/${id.toLowerCase()}.png`,
  );
  if (options.variants > 1) {
    log("Varianti in art/raw/varianti/. Per sceglierne una metti il suo seed nel simbolo in art.json e rilancia con --only <ID> --force.");
  } else if (unlinked.length > 0) {
    log(`Per usarle aggiungi in ${ART_FILE}:`);
    for (const id of unlinked) log(id === "background" ? `  background: "image": "art/raw/background.png"` : `  ${id}: "image": "art/raw/${id.toLowerCase()}.png"`);
    log("poi npm run assets -- build.");
  }
  return written;
}

