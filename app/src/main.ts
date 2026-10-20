import { draftFromFiles } from "../../src/edit/draft.js";
import { Editor, type EditorSource } from "./editor/editor.js";
import { Game } from "./game.js";
import { LANGUAGES, type Language, language, setLanguage, t, translatePage } from "./i18n/index.js";
import { deleteMod, listMods, saveMod } from "./mod-store.js";
import { assetBytes, type ClientModule, errorText, loadBundledModules, loadModZip, releaseAssets, slotTemplate } from "./modules.js";
import { paytableHtml } from "./paytable.js";
import { StatsStore, statsHtml } from "./stats.js";

translatePage();

const stage = document.getElementById("stage")!;
const picker = document.getElementById("slot") as HTMLSelectElement;
const status = document.getElementById("status")!;
const title = document.getElementById("title")!;
const dialog = document.getElementById("paytable") as HTMLDialogElement;
const statsDialog = document.getElementById("stats") as HTMLDialogElement;
const editorRoot = document.getElementById("editor")!;
const stats = new StatsStore();
/** Le partite dell'anteprima dell'editor non toccano statistiche e saldo. */
const previewStats = new StatsStore(false);

const removeButton = document.getElementById("mod-remove") as HTMLButtonElement;
const fileInput = document.getElementById("mod-file") as HTMLInputElement;
const languagePicker = document.getElementById("language") as HTMLSelectElement;

languagePicker.replaceChildren(...Object.entries(LANGUAGES).map(([code, { name }]) => new Option(name, code, false, code === language)));
languagePicker.onchange = () => setLanguage(languagePicker.value as Language);

const loaded = loadBundledModules();
for (const { folder, error } of loaded) if (error) console.error(`Modulo ${folder} non caricato:\n${error}`);
const modules: ClientModule[] = loaded.flatMap(({ loaded }) => (loaded ? [loaded] : []));
const idOf = (m: ClientModule) => m.module.manifest.id;
const bundled = new Set(modules.map(idOf));
/** Id dei mod importati dal browser: si possono rimuovere, quelli inclusi nel sito no. */
const imported = new Set<string>();

for (const { id, zip } of await listMods()) {
  try {
    const mod = await loadModZip(zip);
    if (bundled.has(idOf(mod))) {
      releaseAssets(mod);
      continue;
    }
    modules.push(mod);
    imported.add(idOf(mod));
  } catch (err) {
    console.error(`Mod ${id} non caricato:\n${errorText(err)}`);
  }
}

let game: Game | null = null;
let current: { id: string; name: string } | null = null;
let editor: Editor | null = null;
/** Vero mentre gira l'anteprima dell'editor: le statistiche vanno nel registro temporaneo. */
let previewing = false;
const names = new Map(modules.map(({ module }) => [module.manifest.id, module.manifest.name]));

function fillPicker(selected: string): void {
  picker.replaceChildren(
    ...modules.map(({ module: { manifest } }) => new Option(imported.has(manifest.id) ? t("mod.suffix", { name: manifest.name }) : manifest.name, manifest.id)),
  );
  picker.value = selected;
}

/** Installa uno zip come mod e lo apre. `label` è il nome da mostrare negli errori, per esempio il nome del file. */
async function installZip(zip: Uint8Array, label: string): Promise<void> {
  if (game?.isBusy) return;
  let mod: ClientModule;
  try {
    mod = await loadModZip(zip, true);
  } catch (err) {
    console.error(err);
    alert(t("mod.invalid", { file: label, error: errorText(err) }));
    return;
  }
  const { id, name } = mod.module.manifest;
  if (bundled.has(id) || (imported.has(id) && !confirm(t("mod.replace", { name })))) {
    if (bundled.has(id)) alert(t("mod.bundledId", { name, id }));
    releaseAssets(mod);
    return;
  }
  try {
    await saveMod({ id, zip });
  } catch (err) {
    console.error(err);
    alert(t("mod.noStorage"));
  }
  const at = modules.findIndex((m) => idOf(m) === id);
  if (at >= 0) {
    game?.destroy();
    game = null;
    releaseAssets(modules[at]!);
    modules[at] = mod;
  } else modules.push(mod);
  imported.add(id);
  names.set(id, name);
  fillPicker(id);
  if (!editor) await open(id);
}

function showStats(): void {
  if (!current) return;
  document.getElementById("stats-body")!.innerHTML = statsHtml(previewing ? previewStats : stats, current, names);
  if (!statsDialog.open) statsDialog.showModal();
}

/** Avvia una partita con un modulo, nella pagina normale o come anteprima dell'editor. */
async function play(mod: ClientModule, seed: string | undefined, preview: boolean): Promise<void> {
  const { module } = mod;
  game?.destroy();
  game = null;
  title.textContent = preview ? t("editor.previewTitle", { name: module.manifest.name }) : module.manifest.name;
  current = { id: module.manifest.id, name: module.manifest.name };
  previewing = preview;
  document.getElementById("paytable-body")!.innerHTML = paytableHtml(module, mod.assets);
  game = await Game.start(stage, mod, preview ? previewStats : stats, seed, !preview);
}

async function open(id: string): Promise<void> {
  const mod = modules.find((m) => idOf(m) === id) ?? modules[0];
  if (!mod || game?.isBusy) return;
  // ?seed=... rende ripetibile la sequenza dei round, utile per provare una slot.
  const seed = new URLSearchParams(location.search).get("seed") ?? undefined;
  try {
    await play(mod, seed, false);
  } catch (err) {
    console.error(err);
    status.textContent = t("status.notStarted", { name: mod.module.manifest.name });
    return;
  }
  removeButton.hidden = !imported.has(mod.module.manifest.id);
  setParam("slot", mod.module.manifest.id);
}

function setParam(name: string, value: string | null): void {
  const url = new URL(location.href);
  if (value === null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  history.replaceState(null, "", url);
}

/** Sorgente di una bozza: la slot del menu con quell'id, oppure il modello per "new". */
function editorSource(id: string): EditorSource | null {
  if (id === "new") {
    return {
      key: "new",
      bundled: false,
      load: async () => {
        const draft = draftFromFiles(slotTemplate);
        draft.manifest.id = "nuova-slot";
        draft.manifest.name = t("editor.newSlotName");
        draft.manifest.version = "0.1.0";
        delete draft.manifest.description;
        return { draft, assets: {} };
      },
    };
  }
  const mod = modules.find((m) => idOf(m) === id);
  if (!mod) return null;
  return { key: `slot:${id}`, bundled: bundled.has(id), load: async () => ({ draft: draftFromFiles(mod.files), assets: await assetBytes(mod) }) };
}

async function startEditor(id: string): Promise<void> {
  const source = editorSource(id);
  if (!source || editor || game?.isBusy) return;
  document.body.classList.add("editing");
  editorRoot.hidden = false;
  editorRoot.textContent = t("editor.loading");
  setParam("edit", id);
  editor = await Editor.open(editorRoot, {
    preview: (mod, seed) => play(mod, seed, true),
    isBusy: () => game?.isBusy ?? false,
    isBundled: (slot) => bundled.has(slot),
    install: (zip) => installZip(zip, t("editor.title")),
    close: () => void closeEditor(),
  }, source);
}

async function closeEditor(): Promise<void> {
  if (!editor || game?.isBusy) return;
  await editor.dispose();
  editor = null;
  editorRoot.hidden = true;
  document.body.classList.remove("editing");
  setParam("edit", null);
  await open(picker.value);
}

if (modules.length === 0) {
  status.textContent = t("status.noModules");
} else {
  const params = new URLSearchParams(location.search);
  const requested = params.get("slot");
  const initial = modules.some((m) => idOf(m) === requested) ? requested! : idOf(modules[0]!);
  fillPicker(initial);
  picker.onchange = () => {
    if (game?.isBusy) picker.value = new URLSearchParams(location.search).get("slot") ?? picker.value;
    else void open(picker.value);
  };
  document.getElementById("edit-open")!.onclick = () => void startEditor(picker.value);
  document.getElementById("edit-new")!.onclick = () => void startEditor("new");
  document.getElementById("mod-import")!.onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) await installZip(new Uint8Array(await file.arrayBuffer()), file.name);
  };
  removeButton.onclick = async () => {
    const id = current?.id;
    if (!id || !imported.has(id) || game?.isBusy || !confirm(t("mod.removeConfirm", { name: current!.name }))) return;
    await deleteMod(id).catch((err: unknown) => console.error(err));
    game?.destroy();
    game = null;
    const [removed] = modules.splice(modules.findIndex((m) => idOf(m) === id), 1);
    releaseAssets(removed!);
    imported.delete(id);
    fillPicker(idOf(modules[0]!));
    await open(idOf(modules[0]!));
  };
  document.getElementById("paytable-open")!.onclick = () => dialog.showModal();
  document.getElementById("stats-open")!.onclick = showStats;
  document.getElementById("stats-reset")!.onclick = () => {
    if (game?.isBusy || !confirm(t("stats.resetConfirm"))) return;
    stats.reset();
    showStats();
    game?.refresh();
  };
  document.addEventListener("keydown", (e) => {
    const target = e.target as HTMLElement;
    if (e.code !== "Space" || dialog.open || statsDialog.open || target.matches("button, select, input, textarea, [contenteditable]")) return;
    e.preventDefault();
    void game?.spin();
  });
  const edit = params.get("edit");
  if (edit && editorSource(edit)) await startEditor(edit);
  else await open(initial);
}
