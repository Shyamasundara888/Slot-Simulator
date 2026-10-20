/**
 * Generazione di immagini con l'API locale di ComfyUI (`npm run assets -- generate`).
 *
 * Un workflow in formato API è un oggetto { idNodo: { class_type, inputs } }.
 * Qui non si conta sugli id dei nodi: il prompt positivo è il CLIPTextEncode
 * collegato all'ingresso `positive` del campionatore, il seed è quello del
 * campionatore, le uscite sono i nodi SaveImage. Così si può usare qualsiasi
 * workflow che abbia questa forma, non solo quelli di tools/comfyui.
 */

export type WorkflowNode = { class_type: string; inputs: Record<string, unknown>; _meta?: unknown };
export type Workflow = Record<string, WorkflowNode>;

const SAMPLERS = ["KSampler", "KSamplerAdvanced"];

export class ComfyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComfyError";
  }
}

/** Riferimento a un'uscita di un altro nodo: ["idNodo", indice]. */
function isLink(value: unknown): value is [string, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "number";
}

export type PrepareOptions = {
  prompt: string;
  seed: number;
  /** Sottocartella e nome nell'output di ComfyUI, per esempio "slot/tempio-del-sole/faraone". */
  filenamePrefix: string;
  /** Nome dell'immagine di riferimento già caricata in ComfyUI (vedi ComfyClient.upload), per il nodo LoadImage. */
  reference?: string | undefined;
  /** Se c'è, l'immagine viene ridimensionata a questa misura prima di salvarla. */
  size?: { width: number; height: number } | undefined;
};

/** Copia del workflow con prompt, seed, nome dei file ed eventuale ridimensionamento. */
export function prepareWorkflow(source: Workflow, options: PrepareOptions): Workflow {
  const workflow = structuredClone(source);
  const samplers = Object.entries(workflow).filter(([, n]) => SAMPLERS.includes(n.class_type));
  if (samplers.length !== 1) throw new ComfyError(`il workflow deve avere un solo campionatore (${SAMPLERS.join(" o ")}), ne ha ${samplers.length}`);
  const [, sampler] = samplers[0]!;

  const positive = sampler.inputs.positive;
  const encoder = isLink(positive) ? workflow[positive[0]] : undefined;
  if (!encoder || encoder.class_type !== "CLIPTextEncode") throw new ComfyError("l'ingresso positive del campionatore deve venire da un nodo CLIPTextEncode");
  encoder.inputs.text = options.prompt;

  const seedKey = "seed" in sampler.inputs ? "seed" : "noise_seed" in sampler.inputs ? "noise_seed" : undefined;
  if (!seedKey) throw new ComfyError("il campionatore non ha un ingresso seed");
  sampler.inputs[seedKey] = options.seed;

  const loads = Object.values(workflow).filter((n) => n.class_type === "LoadImage");
  if (options.reference !== undefined) {
    if (loads.length !== 1) throw new ComfyError(`per usare un riferimento il workflow deve avere un solo nodo LoadImage, ne ha ${loads.length}`);
    loads[0]!.inputs.image = options.reference;
  } else if (loads.length > 0) {
    throw new ComfyError("il workflow carica un'immagine di riferimento (LoadImage): indica generate.reference in art.json");
  }

  const saves = Object.entries(workflow).filter(([, n]) => n.class_type === "SaveImage");
  if (saves.length !== 1) throw new ComfyError(`il workflow deve avere un solo nodo SaveImage, ne ha ${saves.length}`);
  const [, save] = saves[0]!;
  save.inputs.filename_prefix = options.filenamePrefix;
  if (options.size) {
    // ImageScale è un nodo nativo; "area" è il metodo adatto per rimpicciolire e conserva il canale alfa.
    let id = "scala";
    while (workflow[id]) id += "_";
    workflow[id] = {
      class_type: "ImageScale",
      inputs: { image: save.inputs.images, upscale_method: "area", width: options.size.width, height: options.size.height, crop: "disabled" },
    };
    save.inputs.images = [id, 0];
  }
  return workflow;
}

/** Nome del modello (checkpoint) usato dal workflow, da registrare con le immagini. */
export function workflowCheckpoint(workflow: Workflow): string | undefined {
  for (const node of Object.values(workflow)) {
    const name = node.inputs.ckpt_name ?? node.inputs.unet_name;
    if (typeof name === "string") return name;
  }
  return undefined;
}

type HistoryImage = { filename: string; subfolder: string; type: string };
type HistoryEntry = {
  status?: { completed?: boolean; status_str?: string; messages?: [string, { exception_message?: string }][] };
  outputs?: Record<string, { images?: HistoryImage[] }>;
};

export type ComfyClientOptions = {
  url: string;
  fetch?: typeof fetch;
  /** Attesa tra due controlli di /history, in millisecondi. */
  pollMs?: number;
  /** Tempo massimo per un'immagine, in millisecondi. */
  timeoutMs?: number;
};

/** Client minimo per l'API di ComfyUI: /prompt, /history e /view. */
export class ComfyClient {
  private readonly url: string;
  private readonly fetch: typeof fetch;
  private readonly pollMs: number;
  private readonly timeoutMs: number;

  constructor(options: ComfyClientOptions) {
    this.url = options.url.replace(/\/+$/, "");
    this.fetch = options.fetch ?? globalThis.fetch;
    this.pollMs = options.pollMs ?? 1000;
    this.timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetch(`${this.url}${path}`, init);
    } catch (err) {
      throw new ComfyError(`ComfyUI non risponde su ${this.url} (${(err as Error).message}): è avviato?`);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new ComfyError(`ComfyUI ${path.split("?")[0]}: errore ${response.status}${body ? ` (${body.slice(0, 500)})` : ""}`);
    }
    return response;
  }

  /** Carica un'immagine nella cartella input di ComfyUI e restituisce il nome da dare a LoadImage. */
  async upload(bytes: Uint8Array, filename: string, subfolder: string): Promise<string> {
    const form = new FormData();
    form.append("image", new Blob([bytes as Uint8Array<ArrayBuffer>]), filename);
    form.append("subfolder", subfolder);
    form.append("overwrite", "true");
    const result = (await (await this.request("/upload/image", { method: "POST", body: form })).json()) as { name?: string; subfolder?: string };
    if (!result.name) throw new ComfyError("ComfyUI non ha restituito il nome dell'immagine caricata");
    return result.subfolder ? `${result.subfolder}/${result.name}` : result.name;
  }

  /** Mette in coda il workflow, aspetta che finisca e restituisce le immagini salvate. */
  async run(workflow: Workflow): Promise<Uint8Array[]> {
    const queued = (await (
      await this.request("/prompt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow }) })
    ).json()) as { prompt_id?: string };
    const id = queued.prompt_id;
    if (!id) throw new ComfyError("ComfyUI non ha restituito un prompt_id");

    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      const history = (await (await this.request(`/history/${encodeURIComponent(id)}`)).json()) as Record<string, HistoryEntry>;
      const entry = history[id];
      if (entry?.status?.status_str === "error") {
        const error = entry.status.messages?.find(([kind]) => kind === "execution_error")?.[1].exception_message;
        throw new ComfyError(`ComfyUI ha interrotto il workflow${error ? `: ${error.trim()}` : ""}`);
      }
      if (entry?.status?.completed) {
        const images = Object.values(entry.outputs ?? {}).flatMap((o) => o.images ?? []).filter((i) => i.type === "output");
        if (images.length === 0) throw new ComfyError("il workflow è finito senza immagini salvate");
        const files: Uint8Array[] = [];
        for (const image of images) {
          const query = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder, type: image.type });
          files.push(new Uint8Array(await (await this.request(`/view?${query}`)).arrayBuffer()));
        }
        return files;
      }
      if (Date.now() > deadline) throw new ComfyError(`nessun risultato da ComfyUI dopo ${Math.round(this.timeoutMs / 1000)} s`);
      await new Promise((r) => setTimeout(r, this.pollMs));
    }
  }
}

/** Larghezza e altezza di un PNG, lette dall'intestazione IHDR. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
