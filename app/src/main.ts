import { Game } from "./game.js";
import { loadBundledModules } from "./modules.js";
import { paytableHtml } from "./paytable.js";
import { StatsStore, statsHtml } from "./stats.js";

const stage = document.getElementById("stage")!;
const picker = document.getElementById("slot") as HTMLSelectElement;
const status = document.getElementById("status")!;
const title = document.getElementById("title")!;
const dialog = document.getElementById("paytable") as HTMLDialogElement;
const statsDialog = document.getElementById("stats") as HTMLDialogElement;
const stats = new StatsStore();

const loaded = loadBundledModules();
for (const { folder, error } of loaded) if (error) console.error(`Modulo ${folder} non caricato:\n${error}`);
const modules = loaded.flatMap(({ module }) => (module ? [module] : []));

let game: Game | null = null;
let current: { id: string; name: string } | null = null;
const names = new Map(modules.map((m) => [m.manifest.id, m.manifest.name]));

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
  const url = new URL(location.href);
  url.searchParams.set("slot", module.manifest.id);
  history.replaceState(null, "", url);
}

if (modules.length === 0) {
  status.textContent = "Nessun modulo valido in slots/: controlla la console.";
} else {
  for (const m of modules) picker.add(new Option(m.manifest.name, m.manifest.id));
  const initial = new URLSearchParams(location.search).get("slot") ?? modules[0]!.manifest.id;
  picker.value = initial;
  picker.onchange = () => {
    if (game?.isBusy) picker.value = new URLSearchParams(location.search).get("slot") ?? picker.value;
    else void open(picker.value);
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
