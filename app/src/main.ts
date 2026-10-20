import { Game } from "./game.js";
import { deleteMod, listMods, saveMod } from "./mod-store.js";
import { type ClientModule, errorText, loadBundledModules, loadModZip, releaseAssets } from "./modules.js";
import { paytableHtml } from "./paytable.js";
import { StatsStore, statsHtml } from "./stats.js";

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
const names = new Map(modules.map(({ module }) => [module.manifest.id, module.manifest.name]));

function fillPicker(selected: string): void {
  picker.replaceChildren(
    ...modules.map(({ module: { manifest } }) => new Option(imported.has(manifest.id) ? `${manifest.name} (mod)` : manifest.name, manifest.id)),
  );
  picker.value = selected;
}

async function importMod(file: File): Promise<void> {
  if (game?.isBusy) return;
  let mod: ClientModule;
  const zip = new Uint8Array(await file.arrayBuffer());
  try {
    mod = await loadModZip(zip, true);
  } catch (err) {
    console.error(err);
    alert(`${file.name} non è un mod valido:\n\n${errorText(err)}`);
    return;
  }
  const { id, name } = mod.module.manifest;
  if (bundled.has(id) || (imported.has(id) && !confirm(`${name} è già installato. Sostituirlo con questa versione?`))) {
    if (bundled.has(id)) alert(`${name}: l'id "${id}" è già usato da una slot inclusa nel sito.`);
    releaseAssets(mod);
    return;
  }
  try {
    await saveMod({ id, zip });
  } catch (err) {
    console.error(err);
    alert("Il browser non permette di salvare il mod: resterà disponibile solo fino alla chiusura della pagina.");
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
  await open(id);
}

function showStats(): void {
  if (!current) return;
  document.getElementById("stats-body")!.innerHTML = statsHtml(stats, current, names);
  if (!statsDialog.open) statsDialog.showModal();
}

async function open(id: string): Promise<void> {
  const mod = modules.find((m) => idOf(m) === id) ?? modules[0];
  if (!mod || game?.isBusy) return;
  const { module } = mod;
  game?.destroy();
  game = null;
  title.textContent = module.manifest.name;
  current = { id: module.manifest.id, name: module.manifest.name };
  document.getElementById("paytable-body")!.innerHTML = paytableHtml(module, mod.assets);
  // ?seed=... rende ripetibile la sequenza dei round, utile per provare una slot.
  const seed = new URLSearchParams(location.search).get("seed") ?? undefined;
  try {
    game = await Game.start(stage, mod, stats, seed);
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
  const initial = modules.some((m) => idOf(m) === requested) ? requested! : idOf(modules[0]!);
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
