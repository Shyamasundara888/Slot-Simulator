import { Game } from "./game.js";
import { deleteMod, listMods, saveMod } from "./mod-store.js";
import { errorText, loadBundledModules, parseModZip, validateModZip } from "./modules.js";
import { paytableHtml } from "./paytable.js";
import { StatsStore, statsHtml } from "./stats.js";
import type { SlotModule } from "../../src/module/parse.js";

const stage = document.getElementById("stage")!;
const picker = document.getElementById("slot") as HTMLSelectElement;
const status = document.getElementById("status")!;
const title = document.getElementById("title")!;
const dialog = document.getElementById("paytable") as HTMLDialogElement;
const statsDialog = document.getElementById("stats") as HTMLDialogElement;
const stats = new StatsStore();

const removeButton = document.getElementById("mod-remove") as HTMLButtonElement;
const fileInput = document.getElementById("mod-file") as HTMLInputElement;

const loaded = loadBundledModules();
for (const { folder, error } of loaded) if (error) console.error(`Modulo ${folder} non caricato:\n${error}`);
const modules = loaded.flatMap(({ module }) => (module ? [module] : []));
const bundled = new Set(modules.map((m) => m.manifest.id));
/** Id dei mod importati dal browser: si possono rimuovere, quelli inclusi nel sito no. */
const imported = new Set<string>();

for (const { id, zip } of await listMods()) {
  try {
    const module = parseModZip(zip);
    if (bundled.has(module.manifest.id)) continue;
    modules.push(module);
    imported.add(module.manifest.id);
  } catch (err) {
    console.error(`Mod ${id} non caricato:\n${errorText(err)}`);
  }
}

let game: Game | null = null;
let current: { id: string; name: string } | null = null;
const names = new Map(modules.map((m) => [m.manifest.id, m.manifest.name]));

function fillPicker(selected: string): void {
  picker.replaceChildren(
    ...modules.map((m) => new Option(imported.has(m.manifest.id) ? `${m.manifest.name} (mod)` : m.manifest.name, m.manifest.id)),
  );
  picker.value = selected;
}

async function importMod(file: File): Promise<void> {
  if (game?.isBusy) return;
  let module: SlotModule;
  const zip = new Uint8Array(await file.arrayBuffer());
  try {
    module = await validateModZip(zip);
  } catch (err) {
    console.error(err);
    alert(`${file.name} non è un mod valido:\n\n${errorText(err)}`);
    return;
  }
  const { id, name } = module.manifest;
  if (bundled.has(id)) {
    alert(`${name}: l'id "${id}" è già usato da una slot inclusa nel sito.`);
    return;
  }
  if (imported.has(id) && !confirm(`${name} è già installato. Sostituirlo con questa versione?`)) return;
  try {
    await saveMod({ id, zip });
  } catch (err) {
    console.error(err);
    alert("Il browser non permette di salvare il mod: resterà disponibile solo fino alla chiusura della pagina.");
  }
  const at = modules.findIndex((m) => m.manifest.id === id);
  if (at >= 0) modules[at] = module;
  else modules.push(module);
  imported.add(id);
  names.set(id, name);
  fillPicker(id);
  await open(id);
}

function showStats(): void {
  if (!current) return;
  document.getElementById("stats-body")!.innerHTML = statsHtml(stats, current, names);
  if (!statsDialog.open) statsDialog.showModal();
}

async function open(id: string): Promise<void> {
  const module = modules.find((m) => m.manifest.id === id) ?? modules[0];
  if (!module || game?.isBusy) return;
  game?.destroy();
  game = null;
  title.textContent = module.manifest.name;
  current = { id: module.manifest.id, name: module.manifest.name };
  document.getElementById("paytable-body")!.innerHTML = paytableHtml(module);
  // ?seed=... rende ripetibile la sequenza dei round, utile per provare una slot.
  const seed = new URLSearchParams(location.search).get("seed") ?? undefined;
  try {
    game = await Game.start(stage, module, stats, seed);
  } catch (err) {
    console.error(err);
    status.textContent = `Modulo ${module.manifest.name} non avviato: controlla la console.`;
    return;
  }
  removeButton.hidden = !imported.has(module.manifest.id);
  const url = new URL(location.href);
  url.searchParams.set("slot", module.manifest.id);
  history.replaceState(null, "", url);
}

if (modules.length === 0) {
  status.textContent = "Nessun modulo valido in slots/: controlla la console.";
} else {
  const requested = new URLSearchParams(location.search).get("slot");
  const initial = modules.some((m) => m.manifest.id === requested) ? requested! : modules[0]!.manifest.id;
  fillPicker(initial);
  picker.onchange = () => {
    if (game?.isBusy) picker.value = new URLSearchParams(location.search).get("slot") ?? picker.value;
    else void open(picker.value);
  };
  document.getElementById("mod-import")!.onclick = () => fileInput.click();
  fileInput.onchange = () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) void importMod(file);
  };
  removeButton.onclick = async () => {
    const id = current?.id;
    if (!id || !imported.has(id) || game?.isBusy || !confirm(`Rimuovere il mod ${current!.name}? Le sue statistiche restano.`)) return;
    await deleteMod(id).catch((err: unknown) => console.error(err));
    modules.splice(modules.findIndex((m) => m.manifest.id === id), 1);
    imported.delete(id);
    fillPicker(modules[0]!.manifest.id);
    await open(modules[0]!.manifest.id);
  };
  document.getElementById("paytable-open")!.onclick = () => dialog.showModal();
  document.getElementById("stats-open")!.onclick = showStats;
  document.getElementById("stats-reset")!.onclick = () => {
    if (game?.isBusy || !confirm("Azzerare le statistiche di tutte le slot? Il saldo non cambia.")) return;
    stats.reset();
    showStats();
    game?.refresh();
  };
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || dialog.open || statsDialog.open || e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement) return;
    e.preventDefault();
    void game?.spin();
  });
  await open(initial);
}
