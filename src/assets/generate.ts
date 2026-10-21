import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ModuleError } from "../module/build.js";
import { loadSlotModule } from "../module/load.js";
import { backgroundPrompt, symbolPrompt } from "./build.js";
import { pngSize, prepareWorkflow, removeFragments, workflowCheckpoint, type ComfyClient, type Workflow } from "./comfyui.js";
import { artSchema, framePaths, type ArtSpec } from "./spec.js";

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
/** Qualità WebP: i PNG di ComfyUI pesano 400-550 KB a 512 px, in WebP restano poche decine di KB. */
const WEBP_QUALITY = 88;

export type GenerateOptions = {
  only: string[];
  force: boolean;
  variants: number;
  seed?: number;
  client: ComfyClient;
  log?: (line: string) => void;
};

type GeneratedRecord = {
  prompt: string;
  seed: number;
  workflow: string;
  checkpoint?: string | undefined;
  reference?: string | undefined;
  referenceWeight?: number | undefined;
  referenceMode?: string | undefined;
  shape?: string | undefined;
  shapeStrength?: number | undefined;
  generator: "ComfyUI";
  date: string;
};

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

/**
 * Ritaglia i bordi trasparenti e ricentra il soggetto in un quadrato `size`x`size`
 * con un margine sottile: SDXL lascia molto spazio attorno all'oggetto, che nella
 * tessera del rullo sembrerebbe piccolo.
 */
export async function fitSymbol(png: Uint8Array, size: number, margin = 0.04): Promise<sharp.Sharp> {
  let trimmed: Buffer;
  try {
    trimmed = await sharp(png).trim({ threshold: 4 }).png().toBuffer();
  } catch {
    // Immagine tutta trasparente o tutta uguale: niente da ritagliare.
    return sharp(png);
  }
  const inner = Math.round(size * (1 - 2 * margin));
  const pad = Math.floor((size - inner) / 2);
  return sharp(
    await sharp(trimmed)
      .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
      .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer(),
  );
}

/**
 * Come fitSymbol, ma per i fotogrammi di un'animazione: il ritaglio è uno solo, quello che
 * contiene il soggetto in tutti i fotogrammi, così il soggetto non balla da un fotogramma all'altro.
 */
export async function fitFrames(images: readonly Uint8Array[], size: number, margin = 0.04): Promise<Buffer[]> {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const image of images) {
    const { info } = await sharp(image).trim({ threshold: 4 }).toBuffer({ resolveWithObject: true });
    const x = -(info.trimOffsetLeft ?? 0);
    const y = -(info.trimOffsetTop ?? 0);
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + info.width);
    bottom = Math.max(bottom, y + info.height);
  }
  const inner = Math.round(size * (1 - 2 * margin));
  const pad = Math.floor((size - inner) / 2);
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  return Promise.all(
    images.map(async (image) =>
      sharp(
        await sharp(image)
          .ensureAlpha()
          .extract({ left, top, width: right - left, height: bottom - top })
          .resize(inner, inner, { fit: "contain", background: transparent, kernel: "lanczos3" })
          .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad, background: transparent })
          .png()
          .toBuffer(),
      )
        .webp({ quality: WEBP_QUALITY, alphaQuality: 100, effort: 6 })
        .toBuffer(),
    ),
  );
}

const FRAME_FILE = /\.(png|webp)$/i;

/**
 * Porta nel modulo i fotogrammi già scontornati di un'animazione (per esempio da una clip
 * image-to-video): li ritaglia tutti allo stesso modo, li salva in art/raw/anim/<id>-NN.webp
 * e restituisce il campo animation da mettere nel simbolo in art.json.
 */
export async function importFrames(dir: string, id: string, from: string): Promise<{ files: string[]; animation: { frames: string; count: number } }> {
  const spec = await readSpec(dir);
  if (!spec.symbols[id]) throw new ModuleError([`${ART_FILE}: il simbolo ${id} non c'è`]);
  const sources = existsSync(from) ? (await readdir(from)).filter((f) => FRAME_FILE.test(f)).sort() : [];
  if (sources.length < 2) throw new ModuleError([`${from}: servono almeno 2 fotogrammi PNG o WebP`]);
  if (sources.length > 120) throw new ModuleError([`${from}: al massimo 120 fotogrammi, ce ne sono ${sources.length}`]);
  const images = await Promise.all(sources.map((f) => readFile(join(from, f))));
  const fitted = await fitFrames(images, spec.generate.size);
  const digits = String(fitted.length - 1).length;
  const pattern = `art/raw/anim/${id.toLowerCase()}-${"#".repeat(Math.max(2, digits))}.webp`;
  const files = framePaths(pattern, fitted.length);
  await mkdir(join(dir, "art/raw/anim"), { recursive: true });
  await Promise.all(files.map((file, k) => writeFile(join(dir, file), fitted[k]!)));
  return { files, animation: { frames: pattern, count: files.length } };
}

/** Lato dell'immagine della forma passata a ControlNet, come le immagini dei simboli di SDXL. */
const SHAPE_SIZE = 1024;

/**
 * Immagine della forma per ControlNet: il disegno (anche SVG) centrato su un quadrato grigio chiaro,
 * con un margine come quello che SDXL lascia attorno ai simboli.
 */
export async function shapeImage(source: Uint8Array): Promise<Buffer> {
  const inner = Math.round(SHAPE_SIZE * 0.8);
  const pad = Math.floor((SHAPE_SIZE - inner) / 2);
  const grey = { r: 208, g: 208, b: 208, alpha: 1 };
  const drawing = await sharp(source, { density: 300 })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({ create: { width: SHAPE_SIZE, height: SHAPE_SIZE, channels: 4, background: grey } })
    .composite([{ input: drawing, left: pad, top: pad }])
    .flatten({ background: grey })
    .png()
    .toBuffer();
}

/** Genera con ComfyUI le immagini di simboli e sfondo in art/raw/ e restituisce i file scritti. */
export async function generate(dir: string, options: GenerateOptions): Promise<string[]> {
  const log = options.log ?? console.log;
  const spec = await readSpec(dir);
  const module = await loadSlotModule(dir);
  const labels = new Map([...module.scene.symbols].map(([id, s]) => [id, s.label]));
  const settings = spec.generate;

  const targets = [...Object.keys(spec.symbols).filter((id) => spec.symbols[id]!.generate), ...(spec.background ? ["background"] : [])];
  const unknown = options.only.filter((id) => !targets.includes(id));
  if (unknown.length > 0) {
    throw new ModuleError(
      unknown.map((id) =>
        spec.symbols[id]
          ? `--only ${id}: in ${ART_FILE} ha "generate": false`
          : `--only ${id}: non è un simbolo di ${ART_FILE}${id === "background" ? " (manca background)" : ""}`,
      ),
    );
  }
  const chosen = options.only.length > 0 ? targets.filter((id) => options.only.includes(id)) : targets;

  // Con un riferimento di stile il workflow predefinito è quello con IP-Adapter.
  const reference = settings.reference;
  // Il riferimento può mancare solo se si genera proprio lui (il primo passo della serie).
  const needsReference = chosen.some(
    (id) => id !== "background" && !spec.symbols[id]!.shape && spec.symbols[id]!.reference !== false && `art/raw/${id.toLowerCase()}.webp` !== reference,
  );
  if (reference && needsReference && !existsSync(join(dir, reference))) {
    throw new ModuleError([`${ART_FILE}: generate.reference: manca ${reference} (generalo prima con --only)`]);
  }
  const symbolFlow = await readWorkflow(dir, settings.workflow, reference ? "simbolo-stile.json" : "simbolo.json");
  const plainFlow = reference && !settings.workflow ? await readWorkflow(dir, undefined, "simbolo.json") : symbolFlow;
  const shapeFlow = chosen.some((id) => spec.symbols[id]?.shape) ? await readWorkflow(dir, settings.shapeWorkflow, "simbolo-forma.json") : undefined;
  const backgroundFlow = spec.background ? await readWorkflow(dir, settings.backgroundWorkflow, "sfondo.json") : undefined;

  const recordPath = join(dir, "art/raw/generated.json");
  const records = existsSync(recordPath) ? (JSON.parse(await readFile(recordPath, "utf8")) as Record<string, GeneratedRecord>) : {};
  const written: string[] = [];
  const slot = basename(dir);
  let uploaded: string | undefined;

  for (const id of chosen) {
    const isBackground = id === "background";
    const name = isBackground ? "background" : id.toLowerCase();
    // Il simbolo che fa da riferimento non si rigenera guardando se stesso.
    const ownFile = `art/raw/${name}.webp`;
    const art = isBackground ? undefined : spec.symbols[id];
    // Con una forma il simbolo segue il disegno (ControlNet) e non usa il riferimento di stile.
    const shape = art?.shape;
    const styled = !isBackground && !shape && reference !== undefined && reference !== ownFile && art?.reference !== false;
    const referenceWeight = art?.referenceWeight ?? settings.referenceWeight;
    const shapeStrength = art?.shapeStrength ?? settings.shapeStrength;
    const flow = isBackground ? backgroundFlow! : shape ? shapeFlow! : styled ? symbolFlow : plainFlow;
    let shapeName: string | undefined;
    const prompt = isBackground ? backgroundPrompt(spec) : symbolPrompt(spec, id, labels, "plain light grey background");
    const ownSeed = isBackground ? spec.background?.seed : spec.symbols[id]?.seed;
    const firstSeed = options.seed ?? ownSeed ?? settings.seed;
    const size = isBackground
      ? settings.backgroundSize && { width: settings.backgroundSize[0], height: settings.backgroundSize[1] }
      : { width: settings.size, height: settings.size };

    for (let v = 0; v < options.variants; v++) {
      const seed = firstSeed + v;
      const file = options.variants > 1 ? `art/raw/varianti/${name}-${seed}.webp` : `art/raw/${name}.webp`;
      if (!options.force && existsSync(join(dir, file))) {
        log(`  ${file}: c'è già (usa --force per rifarlo)`);
        continue;
      }
      if (styled && uploaded === undefined) {
        uploaded = await options.client.upload(await readFile(join(dir, reference)), `${slot}-${basename(reference)}`, "slot");
      }
      if (shape && shapeName === undefined) {
        if (!existsSync(join(dir, shape))) throw new ModuleError([`${ART_FILE}: symbols.${id}.shape: manca ${shape}`]);
        shapeName = await options.client.upload(await shapeImage(await readFile(join(dir, shape))), `${slot}-forma-${name}.png`, "slot");
      }
      const workflow = prepareWorkflow(flow.workflow, {
        prompt,
        seed,
        filenamePrefix: `slot/${slot}/${name}`,
        size,
        ...(styled && { reference: uploaded, referenceWeight, referenceMode: settings.referenceMode }),
        ...(shape && { shape: shapeName, shapeStrength, shapeEnd: settings.shapeEnd }),
      });
      const started = Date.now();
      const [png] = await options.client.run(workflow);
      const dims = pngSize(png!);
      let pixels = sharp(png!);
      let cleaned = 0;
      if (!isBackground && settings.cleanup) {
        const { data, info } = await sharp(png!).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        cleaned = removeFragments(data, info.width, info.height);
        pixels = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
      }
      if (!isBackground && settings.fit) pixels = await fitSymbol(await pixels.png().toBuffer(), settings.size);
      const image = await pixels.webp({ quality: WEBP_QUALITY, alphaQuality: 100, effort: 6 }).toBuffer();
      await mkdir(dirname(join(dir, file)), { recursive: true });
      await writeFile(join(dir, file), image);
      const kb = image.length / 1024;
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      log(`  ${file}: ${dims ? `${dims.width}x${dims.height}, ` : ""}${kb.toFixed(0)} KB, seed ${seed}, ${seconds} s${cleaned > 0 ? `, tolti ${cleaned} pixel di frammenti` : ""}${!isBackground && kb > MAX_KB ? ` (oltre ${MAX_KB} KB: riduci generate.size)` : ""}`);
      records[file] = {
        prompt,
        seed,
        workflow: flow.name,
        checkpoint: workflowCheckpoint(flow.workflow),
        ...(styled && { reference, referenceWeight, referenceMode: settings.referenceMode }),
        ...(shape && { shape, shapeStrength }),
        generator: "ComfyUI",
        date: new Date().toISOString(),
      };
      written.push(file);
      // Registro aggiornato a ogni immagine, così un'interruzione non perde quelle già fatte.
      await writeFile(recordPath, `${JSON.stringify(records, null, 2)}\n`);
    }
  }

  const unlinked = chosen.filter((id) =>
    id === "background" ? spec.background?.image !== "art/raw/background.webp" : spec.symbols[id]?.image !== `art/raw/${id.toLowerCase()}.webp`,
  );
  if (options.variants > 1) {
    log("Varianti in art/raw/varianti/. Per sceglierne una metti il suo seed nel simbolo in art.json e rilancia con --only <ID> --force.");
  } else if (unlinked.length > 0) {
    log(`Per usarle aggiungi in ${ART_FILE}:`);
    for (const id of unlinked) log(id === "background" ? `  background: "image": "art/raw/background.webp"` : `  ${id}: "image": "art/raw/${id.toLowerCase()}.webp"`);
    log("poi npm run assets -- build (in PowerShell: npm.cmd run assets -- build).");
  }
  return written;
}

