import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ComfyClient, ComfyError, pngSize, prepareWorkflow, workflowCheckpoint, type Workflow } from "../src/assets/comfyui.js";
import { generate } from "../src/assets/generate.js";

const simbolo = JSON.parse(readFileSync("tools/comfyui/workflows/simbolo.json", "utf8")) as Workflow;
const sfondo = JSON.parse(readFileSync("tools/comfyui/workflows/sfondo.json", "utf8")) as Workflow;

/** PNG minimo con le misure scritte nell'intestazione IHDR. */
function fakePng(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

type Sent = { workflow: Workflow };

/** Finto server ComfyUI: accoda, dopo un controllo dichiara il lavoro finito e serve un PNG. */
function fakeComfy(options: { fail?: string } = {}) {
  const sent: Sent[] = [];
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
    if (url.pathname === "/view") return new Response(fakePng(512, 512));
    return new Response("non trovato", { status: 404 });
  }) as typeof globalThis.fetch;
  return { sent, client: new ComfyClient({ url: "http://comfy.test:8188/", fetch, pollMs: 0 }) };
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

describe("npm run assets -- generate", () => {
  let dir = "";
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  const copy = () => {
    dir = join(mkdtempSync(join(tmpdir(), "generate-")), "tempio-del-sole");
    cpSync("slots/tempio-del-sole", dir, { recursive: true });
    return dir;
  };

  it("genera simboli e sfondo in art/raw e registra prompt e seed", async () => {
    copy();
    const { sent, client } = fakeComfy();
    const lines: string[] = [];
    const files = await generate(dir, { only: ["FARAONE", "background"], force: false, variants: 1, client, log: (l) => lines.push(l) });
    expect(files).toEqual(["art/raw/faraone.png", "art/raw/background.png"]);
    expect(pngSize(readFileSync(join(dir, "art/raw/faraone.png")))).toEqual({ width: 512, height: 512 });

    const [symbol, background] = sent.map((s) => s.workflow);
    expect(symbol!["2"]!.inputs.text).toMatch(/^Ancient Egyptian temple theme.*A golden pharaoh mask.*plain light grey background/);
    expect(symbol!["11"]!.inputs.filename_prefix).toBe("slot/tempio-del-sole/faraone");
    expect(Object.values(symbol!).some((n) => n.class_type === "ImageScale")).toBe(true);
    // Lo sfondo resta alla misura del workflow se generate.backgroundSize non c'è.
    expect(Object.values(background!).some((n) => n.class_type === "ImageScale")).toBe(false);
    expect(background!["2"]!.inputs.text).toContain("desert at dusk");

    const records = JSON.parse(readFileSync(join(dir, "art/raw/generated.json"), "utf8"));
    expect(records["art/raw/faraone.png"]).toMatchObject({ seed: 777, workflow: "tools/comfyui/workflows/simbolo.json", checkpoint: "sd_xl_base_1.0.safetensors", generator: "ComfyUI" });
    expect(lines.join("\n")).toContain('FARAONE: "image": "art/raw/faraone.png"');

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
    expect(files).toEqual(["art/raw/varianti/ankh-100.png", "art/raw/varianti/ankh-101.png", "art/raw/varianti/ankh-102.png"]);
    expect(sent.map((s) => s.workflow["5"]!.inputs.seed)).toEqual([100, 101, 102]);
    expect(Object.values(sent[0]!.workflow).find((n) => n.class_type === "ImageScale")!.inputs.width).toBe(256);
    expect(existsSync(join(dir, "art/raw/ankh.png"))).toBe(false);
  });

  it("rifiuta simboli sconosciuti", async () => {
    copy();
    const { client } = fakeComfy();
    await expect(generate(dir, { only: ["DRAGO"], force: false, variants: 1, client, log: () => {} })).rejects.toThrow(/DRAGO/);
  });
});
