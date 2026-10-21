import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ComfyClient, ComfyError, pngSize, prepareWorkflow, removeFragments, workflowCheckpoint, type Workflow } from "../src/assets/comfyui.js";
import { fitFrames, fitSymbol, generate } from "../src/assets/generate.js";

const simbolo = JSON.parse(readFileSync("tools/comfyui/workflows/simbolo.json", "utf8")) as Workflow;
const sfondo = JSON.parse(readFileSync("tools/comfyui/workflows/sfondo.json", "utf8")) as Workflow;
const stile = JSON.parse(readFileSync("tools/comfyui/workflows/simbolo-stile.json", "utf8")) as Workflow;

/** PNG minimo con le misure scritte nell'intestazione IHDR. */
function fakePng(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** PNG vero con trasparenza, come quelli che salva il workflow dei simboli. */
let realPng: Uint8Array<ArrayBuffer>;
beforeAll(async () => {
  const buffer = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: { create: { width: 256, height: 256, channels: 4, background: { r: 212, g: 160, b: 23, alpha: 1 } } }, gravity: "center" }])
    .png()
    .toBuffer();
  realPng = new Uint8Array(buffer);
});

type Sent = { workflow: Workflow };

/** Finto server ComfyUI: accoda, dopo un controllo dichiara il lavoro finito e serve un PNG. */
function fakeComfy(options: { fail?: string } = {}) {
  const sent: Sent[] = [];
  const uploads: string[] = [];
  const pending = new Map<string, number>();
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/prompt") {
      const body = JSON.parse(String(init?.body)) as { prompt: Workflow };
      sent.push({ workflow: body.prompt });
      const id = `p${sent.length}`;
      pending.set(id, 0);
      return Response.json({ prompt_id: id, number: sent.length });
    }
    if (url.pathname.startsWith("/history/")) {
      const id = decodeURIComponent(url.pathname.slice("/history/".length));
      const checks = (pending.get(id) ?? 0) + 1;
      pending.set(id, checks);
      if (checks < 2) return Response.json({});
      if (options.fail) {
        return Response.json({ [id]: { status: { status_str: "error", completed: false, messages: [["execution_error", { exception_message: options.fail }]] } } });
      }
      const save = Object.entries(sent[Number(id.slice(1)) - 1]!.workflow).find(([, n]) => n.class_type === "SaveImage")!;
      const prefix = String(save[1].inputs.filename_prefix);
      const slash = prefix.lastIndexOf("/");
      return Response.json({
        [id]: {
          status: { status_str: "success", completed: true },
          outputs: { [save[0]]: { images: [{ filename: `${prefix.slice(slash + 1)}_00001_.png`, subfolder: prefix.slice(0, slash), type: "output" }] } },
        },
      });
    }
    if (url.pathname === "/upload/image") {
      const form = init?.body as FormData;
      const file = form.get("image") as File;
      uploads.push(`${String(form.get("subfolder"))}/${file.name}`);
      return Response.json({ name: file.name, subfolder: form.get("subfolder"), type: "input" });
    }
    if (url.pathname === "/view") return new Response(realPng);
    return new Response("non trovato", { status: 404 });
  }) as typeof globalThis.fetch;
  return { sent, uploads, client: new ComfyClient({ url: "http://comfy.test:8188/", fetch, pollMs: 0 }) };
}

describe("workflow di ComfyUI", () => {
  it("mette prompt, seed e nome dei file senza toccare l'originale", () => {
    const flow = prepareWorkflow(simbolo, { prompt: "a golden ankh", seed: 42, filenamePrefix: "slot/prova/ankh" });
    expect(flow["2"]!.inputs.text).toBe("a golden ankh");
    expect(flow["5"]!.inputs.seed).toBe(42);
    expect(flow["11"]!.inputs.filename_prefix).toBe("slot/prova/ankh");
    expect(simbolo["5"]!.inputs.seed).toBe(777);
    expect(Object.keys(flow)).toHaveLength(Object.keys(simbolo).length);
  });

  it("ridimensiona prima di salvare, conservando lo scontorno", () => {
    const flow = prepareWorkflow(simbolo, { prompt: "x", seed: 1, filenamePrefix: "slot/x", size: { width: 512, height: 512 } });
    const [scaleId] = flow["11"]!.inputs.images as [string, number];
    const scale = flow[scaleId]!;
    expect(scale.class_type).toBe("ImageScale");
    expect(scale.inputs).toMatchObject({ image: ["10", 0], width: 512, height: 512, upscale_method: "area" });
  });

  it("riconosce il checkpoint e rifiuta i workflow che non sa usare", () => {
    expect(workflowCheckpoint(sfondo)).toBe("sd_xl_base_1.0.safetensors");
    const noSave = structuredClone(sfondo);
    delete noSave["7"];
    expect(() => prepareWorkflow(noSave, { prompt: "x", seed: 1, filenamePrefix: "x" })).toThrow(/SaveImage/);
    const twoSamplers = { ...structuredClone(sfondo), "99": structuredClone(sfondo["5"]!) };
    expect(() => prepareWorkflow(twoSamplers, { prompt: "x", seed: 1, filenamePrefix: "x" })).toThrow(/un solo campionatore/);
  });

  it("passa il riferimento di stile al nodo LoadImage", () => {
    const flow = prepareWorkflow(stile, { prompt: "x", seed: 1, filenamePrefix: "x", reference: "slot/rif.webp" });
    expect(flow["12"]!.inputs.image).toBe("slot/rif.webp");
    expect(flow["15"]!.inputs).toMatchObject({ weight: 0.8, weight_type: "style transfer" });
    const lighter = prepareWorkflow(stile, { prompt: "x", seed: 1, filenamePrefix: "x", reference: "r", referenceWeight: 0.55, referenceMode: "strong style transfer" });
    expect(lighter["15"]!.inputs).toMatchObject({ weight: 0.55, weight_type: "strong style transfer" });
    expect(() => prepareWorkflow(stile, { prompt: "x", seed: 1, filenamePrefix: "x" })).toThrow(/generate.reference/);
    expect(() => prepareWorkflow(simbolo, { prompt: "x", seed: 1, filenamePrefix: "x", reference: "r.png" })).toThrow(/LoadImage/);
  });

  it("toglie i frammenti staccati dal soggetto e ne lascia il bordo morbido", () => {
    const w = 20;
    const rgba = new Uint8Array(w * w * 4);
    const set = (x: number, y: number, a: number) => (rgba[(y * w + x) * 4 + 3] = a);
    for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) set(x, y, 255); // soggetto 10x10
    set(4, 10, 8); // bordo sfumato del soggetto
    set(1, 1, 255); // frammento
    set(2, 1, 6); // alone del frammento
    expect(removeFragments(rgba, w, w)).toBe(2);
    expect(rgba[(1 * w + 1) * 4 + 3]).toBe(0);
    expect(rgba[(1 * w + 2) * 4 + 3]).toBe(0);
    expect(rgba[(10 * w + 4) * 4 + 3]).toBe(8);
    expect(rgba[(10 * w + 10) * 4 + 3]).toBe(255);
  });

  it("legge le misure di un PNG", () => {
    expect(pngSize(fakePng(1344, 768))).toEqual({ width: 1344, height: 768 });
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });

  it("riporta l'errore di ComfyUI", async () => {
    const { client } = fakeComfy({ fail: "CUDA out of memory" });
    await expect(client.run(simbolo)).rejects.toThrow(/CUDA out of memory/);
    const down = new ComfyClient({ url: "http://comfy.test", fetch: (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch });
    await expect(down.run(simbolo)).rejects.toBeInstanceOf(ComfyError);
  });
});

// La conversione in WebP (sharp, effort 6) prende mezzo secondo a immagine sui runner di CI.
describe("npm run assets -- generate", { timeout: 30_000 }, () => {
  let dir = "";
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  const copy = () => {
    dir = join(mkdtempSync(join(tmpdir(), "generate-")), "tempio-del-sole");
    cpSync("slots/tempio-del-sole", dir, { recursive: true });
    // Le impostazioni di generazione della slot (riferimento di stile) le provano i singoli test.
    const artPath = join(dir, "art/art.json");
    const art = JSON.parse(readFileSync(artPath, "utf8"));
    // Si parte da una slot senza immagini generate né impostazioni di generazione.
    delete art.generate;
    for (const symbol of [...Object.values(art.symbols), art.background] as Record<string, unknown>[]) {
      for (const key of ["generate", "seed", "reference", "referenceWeight", "image", "animation"]) delete symbol[key];
    }
    writeFileSync(artPath, JSON.stringify(art));
    rmSync(join(dir, "art/raw"), { recursive: true, force: true });
    return dir;
  };

  it("genera simboli e sfondo in art/raw e registra prompt e seed", async () => {
    copy();
    const { sent, client } = fakeComfy();
    const lines: string[] = [];
    const files = await generate(dir, { only: ["FARAONE", "background"], force: false, variants: 1, client, log: (l) => lines.push(l) });
    expect(files).toEqual(["art/raw/faraone.webp", "art/raw/background.webp"]);
    // Salvato in WebP, con la trasparenza dello scontorno.
    const meta = await sharp(readFileSync(join(dir, "art/raw/faraone.webp"))).metadata();
    expect(meta).toMatchObject({ format: "webp", width: 512, height: 512, hasAlpha: true });

    const [symbol, background] = sent.map((s) => s.workflow);
    expect(symbol!["2"]!.inputs.text).toMatch(/^Premium casino slot symbol.*A golden pharaoh death mask.*plain light grey background/);
    expect(symbol!["11"]!.inputs.filename_prefix).toBe("slot/tempio-del-sole/faraone");
    expect(Object.values(symbol!).some((n) => n.class_type === "ImageScale")).toBe(true);
    // Lo sfondo resta alla misura del workflow se generate.backgroundSize non c'è.
    expect(Object.values(background!).some((n) => n.class_type === "ImageScale")).toBe(false);
    expect(background!["2"]!.inputs.text).toContain("desert at dusk");

    const records = JSON.parse(readFileSync(join(dir, "art/raw/generated.json"), "utf8"));
    expect(records["art/raw/faraone.webp"]).toMatchObject({ seed: 777, workflow: "tools/comfyui/workflows/simbolo.json", checkpoint: "sd_xl_base_1.0.safetensors", generator: "ComfyUI" });
    expect(lines.join("\n")).toContain('FARAONE: "image": "art/raw/faraone.webp"');

    // Una seconda volta non rifà ciò che c'è già.
    expect(await generate(dir, { only: ["FARAONE"], force: false, variants: 1, client, log: () => {} })).toEqual([]);
    expect(sent).toHaveLength(2);
  });

  it("crea varianti con seed consecutivi e usa il seed del simbolo", async () => {
    copy();
    const artPath = join(dir, "art/art.json");
    const art = JSON.parse(readFileSync(artPath, "utf8"));
    art.symbols.ANKH.seed = 100;
    art.generate = { size: 256 };
    writeFileSync(artPath, JSON.stringify(art));
    const { sent, client } = fakeComfy();
    const files = await generate(dir, { only: ["ANKH"], force: false, variants: 3, client, log: () => {} });
    expect(files).toEqual(["art/raw/varianti/ankh-100.webp", "art/raw/varianti/ankh-101.webp", "art/raw/varianti/ankh-102.webp"]);
    expect(sent.map((s) => s.workflow["5"]!.inputs.seed)).toEqual([100, 101, 102]);
    expect(Object.values(sent[0]!.workflow).find((n) => n.class_type === "ImageScale")!.inputs.width).toBe(256);
    expect(existsSync(join(dir, "art/raw/ankh.webp"))).toBe(false);
  });

  it("con generate.reference usa IP-Adapter, ma non per il simbolo di riferimento", async () => {
    copy();
    const { sent, uploads, client } = fakeComfy();
    const artPath = join(dir, "art/art.json");
    const art = JSON.parse(readFileSync(artPath, "utf8"));
    art.generate = { reference: "art/raw/faraone.webp" };
    writeFileSync(artPath, JSON.stringify(art));
    // Il riferimento manca ancora: si può generare lui, non gli altri.
    await expect(generate(dir, { only: ["ANKH"], force: false, variants: 1, client, log: () => {} })).rejects.toThrow(/generalo prima/);
    await generate(dir, { only: ["FARAONE"], force: false, variants: 1, client, log: () => {} });

    await generate(dir, { only: ["FARAONE", "ANKH", "SCARABEO", "background"], force: true, variants: 1, client, log: () => {} });
    const [, faraone, ankh, scarabeo, background] = sent.map((s) => s.workflow);
    const loadImage = (w: Workflow) => Object.values(w).find((n) => n.class_type === "LoadImage");
    expect(loadImage(faraone!)).toBeUndefined();
    expect(loadImage(ankh!)!.inputs.image).toBe("slot/tempio-del-sole-faraone.webp");
    expect(loadImage(scarabeo!)!.inputs.image).toBe("slot/tempio-del-sole-faraone.webp");
    expect(loadImage(background!)).toBeUndefined();
    // Il riferimento si carica una volta sola.
    expect(uploads).toEqual(["slot/tempio-del-sole-faraone.webp"]);
    const records = JSON.parse(readFileSync(join(dir, "art/raw/generated.json"), "utf8"));
    expect(records["art/raw/ankh.webp"]).toMatchObject({ workflow: "tools/comfyui/workflows/simbolo-stile.json", reference: "art/raw/faraone.webp" });
    expect(records["art/raw/faraone.webp"].reference).toBeUndefined();
  });

  it("salta i simboli con generate: false", async () => {
    copy();
    const artPath = join(dir, "art/art.json");
    const art = JSON.parse(readFileSync(artPath, "utf8"));
    for (const id of ["A", "K", "Q", "J", "10"]) art.symbols[id].generate = false;
    writeFileSync(artPath, JSON.stringify(art));
    const { sent, client } = fakeComfy();
    const files = await generate(dir, { only: [], force: false, variants: 1, client, log: () => {} });
    expect(files).toEqual(["SOLE", "PORTALE", "FARAONE", "ANKH", "SCARABEO", "GATTO"].map((id) => `art/raw/${id.toLowerCase()}.webp`).concat("art/raw/background.webp"));
    expect(sent).toHaveLength(7);
  });

  it("per simbolo si può togliere il riferimento o cambiarne il peso", async () => {
    copy();
    const artPath = join(dir, "art/art.json");
    const art = JSON.parse(readFileSync(artPath, "utf8"));
    art.generate = { reference: "art/raw/scarabeo.webp", referenceWeight: 0.5 };
    art.symbols.GATTO.reference = false;
    art.symbols.ANKH.referenceWeight = 0.3;
    writeFileSync(artPath, JSON.stringify(art));
    const { sent, client } = fakeComfy();
    // Il gatto non usa il riferimento, quindi si genera anche se lo scarabeo non c'è ancora.
    await generate(dir, { only: ["GATTO"], force: false, variants: 1, client, log: () => {} });
    await generate(dir, { only: ["SCARABEO"], force: false, variants: 1, client, log: () => {} });
    await generate(dir, { only: ["ANKH", "FARAONE"], force: false, variants: 1, client, log: () => {} });
    const [gatto, , faraone, ankh] = sent.map((s) => s.workflow);
    const ip = (w: Workflow) => Object.values(w).find((n) => n.class_type === "IPAdapterAdvanced");
    expect(ip(gatto!)).toBeUndefined();
    expect(ip(ankh!)!.inputs.weight).toBe(0.3);
    expect(ip(faraone!)!.inputs.weight).toBe(0.5);
  });

  it("ritaglia i bordi trasparenti e ricentra il soggetto", async () => {
    // Il PNG di prova ha un quadrato di 256 px al centro di 512 px trasparenti.
    const fitted = await (await fitSymbol(realPng, 512)).raw().toBuffer({ resolveWithObject: true });
    expect(fitted.info).toMatchObject({ width: 512, height: 512, channels: 4 });
    const alpha = (x: number, y: number) => fitted.data[(y * 512 + x) * 4 + 3];
    expect(alpha(256, 30)).toBe(255);
    expect(alpha(256, 5)).toBe(0);
  });

  it("ritaglia tutti i fotogrammi di un'animazione allo stesso modo", async () => {
    // Due fotogrammi 100x100: un quadrato di 20 px che si sposta da sinistra a destra.
    const square = (x: number) =>
      sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: { create: { width: 20, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }, left: x, top: 40 }])
        .png()
        .toBuffer();
    const frames = await fitFrames([await square(10), await square(70)], 100, 0);
    const alpha = async (frame: Buffer, x: number, y: number) => {
      const { data } = await sharp(frame).raw().toBuffer({ resolveWithObject: true });
      return data[(y * 100 + x) * 4 + 3];
    };
    // Il ritaglio comune va da x=10 a x=90: il primo quadrato resta a sinistra, il secondo a destra.
    expect(await alpha(frames[0]!, 5, 50)).toBeGreaterThan(200);
    expect(await alpha(frames[0]!, 95, 50)).toBe(0);
    expect(await alpha(frames[1]!, 95, 50)).toBeGreaterThan(200);
  });

  it("rifiuta simboli sconosciuti", async () => {
    copy();
    const { client } = fakeComfy();
    await expect(generate(dir, { only: ["DRAGO"], force: false, variants: 1, client, log: () => {} })).rejects.toThrow(/DRAGO/);
  });
});
