import { Game } from "./game.js";
import { loadBundledModules } from "./modules.js";
import { paytableHtml } from "./paytable.js";

const stage = document.getElementById("stage")!;
const picker = document.getElementById("slot") as HTMLSelectElement;
const status = document.getElementById("status")!;
const title = document.getElementById("title")!;
const dialog = document.getElementById("paytable") as HTMLDialogElement;

const loaded = loadBundledModules();
for (const { folder, error } of loaded) if (error) console.error(`Modulo ${folder} non caricato:\n${error}`);
const modules = loaded.flatMap(({ module }) => (module ? [module] : []));

let game: Game | null = null;

async function open(id: string): Promise<void> {
  const module = modules.find((m) => m.manifest.id === id) ?? modules[0];
  if (!module || game?.isBusy) return;
  game?.destroy();
  title.textContent = module.manifest.name;
  document.getElementById("paytable-body")!.innerHTML = paytableHtml(module);
  // ?seed=... rende ripetibile la sequenza dei round, utile per provare una slot.
  const seed = new URLSearchParams(location.search).get("seed") ?? undefined;
  game = await Game.start(stage, module, seed);
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
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || dialog.open || e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement) return;
    e.preventDefault();
    void game?.spin();
  });
  await open(initial);
}
