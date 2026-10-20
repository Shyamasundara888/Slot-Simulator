import type { SlotModule } from "../../src/module/parse.js";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Paytable in HTML, generata dalla matematica del modulo. */
export function paytableHtml({ math, scene }: SlotModule, assets: ReadonlyMap<string, string>): string {
  const counts = Array.from({ length: math.reelCount - 1 }, (_, i) => i + 2);
  const name = (id: string) => {
    const style = scene.symbols.get(id)!;
    const url = style.image && assets.get(style.image);
    const icon = url
      ? `<img class="icon" src="${esc(url)}" alt="">`
      : `<span class="swatch" style="background:${style.color}"></span>`;
    return `${icon}${esc(style.label)}`;
  };
  // Nell'ordine della paytable del modulo, non in quello delle chiavi dell'oggetto.
  const rows = [...math.symbols.keys()]
    .flatMap((id) => {
      const pays = math.linePays.get(id);
      return pays ? [[id, pays] as const] : [];
    })
    .map(([id, pays]) => `<tr><td>${name(id)}</td>${counts.map((n) => `<td>${pays[n] || "–"}</td>`).join("")}</tr>`)
    .join("");
  const parts = [
    `<table><thead><tr><th>Simbolo</th>${counts.map((n) => `<th>${n}×</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`,
    `<ul>`,
    `<li>Vincite su linea in multipli della puntata per linea (${math.lines.length} linee), da sinistra a destra.</li>`,
  ];
  if (math.wild) parts.push(`<li>${name(math.wild)} sostituisce tutti i simboli tranne lo scatter.</li>`);
  if (math.expandingWildReels.size > 0) {
    const reels = [...math.expandingWildReels].map((r) => r + 1).join(", ");
    parts.push(`<li>Sui rulli ${reels} il wild si espande su tutto il rullo.</li>`);
  }
  if (math.scatter) {
    const pays = math.scatter.pays
      .map((p, n) => ({ p, n }))
      .filter(({ p, n }) => p > 0 && math.scatter!.pays[n - 1] !== p)
      .map(({ p, n }) => `${n}: ${p}×`)
      .join(", ");
    parts.push(`<li>${name(math.scatter.symbol)} paga ovunque, in multipli della puntata totale: ${pays}.</li>`);
  }
  const fs = math.freeSpins;
  if (fs) {
    // Solo i numeri di scatter in cui cambia il premio: l'ultimo vale anche per tutti quelli dopo.
    const awards = fs.awards
      .map((spins, n) => ({ spins, n }))
      .filter(({ spins, n }) => n >= fs.minScatters && spins !== fs.awards[n - 1]);
    const text =
      awards.length === 1
        ? `${fs.minScatters} o più scatter danno ${awards[0]!.spins} free spin`
        : `Gli scatter danno free spin: ${awards.map(({ n, spins }, i) => `${n}${i === awards.length - 1 ? " o più" : ""}: ${spins}`).join(", ")}`;
    parts.push(`<li>${text}${fs.retrigger ? ", riattivabili" : ""}.</li>`);
    if (fs.extraSpinsPerExpandedWild > 0 || fs.upgradeOnExpandedWild || fs.multiplierPerExpandedWild > 0) {
      const what = [
        fs.extraSpinsPerExpandedWild > 0 ? `${fs.extraSpinsPerExpandedWild} free spin in più` : "",
        fs.multiplierPerExpandedWild > 0
          ? `+${fs.multiplierPerExpandedWild} al moltiplicatore delle vincite (parte da ×1, al massimo ×${fs.maxMultiplier}, vale già per lo spin in cui il wild compare)`
          : "",
        fs.upgradeOnExpandedWild ? `un upgrade dei simboli (${fs.upgradeLadder.map((s) => esc(scene.symbols.get(s)!.label)).join(" → ")})` : "",
      ].filter(Boolean);
      parts.push(`<li>Durante i free spin ogni wild espanso dà ${what.length > 1 ? `${what.slice(0, -1).join(", ")} e ${what.at(-1)}` : what[0]}.</li>`);
    }
  }
  for (const { label, description } of scene.modes.values()) {
    if (description) parts.push(`<li><strong>${esc(label)}</strong>: ${esc(description)}</li>`);
  }
  if (Number.isFinite(math.maxWin)) parts.push(`<li>Vincita massima per round: ${math.maxWin}× la puntata totale.</li>`);
  parts.push(`</ul>`);
  return parts.join("");
}
