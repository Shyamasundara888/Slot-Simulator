import type { SlotModule } from "../../src/module/parse.js";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Paytable in HTML, generata dalla matematica del modulo. */
export function paytableHtml({ math, scene }: SlotModule): string {
  const counts = Array.from({ length: math.reelCount - 1 }, (_, i) => i + 2);
  const name = (id: string) => {
    const style = scene.symbols.get(id)!;
    return `<span class="swatch" style="background:${style.color}"></span>${esc(style.label)}`;
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
    parts.push(`<li>${fs.minScatters} o più scatter danno ${fs.awards[fs.minScatters]} free spin${fs.retrigger ? ", riattivabili" : ""}.</li>`);
    if (fs.extraSpinsPerExpandedWild > 0 || fs.upgradeOnExpandedWild) {
      const what = [
        fs.extraSpinsPerExpandedWild > 0 ? `${fs.extraSpinsPerExpandedWild} free spin in più` : "",
        fs.upgradeOnExpandedWild ? `un upgrade dei simboli (${fs.upgradeLadder.map((s) => esc(scene.symbols.get(s)!.label)).join(" → ")})` : "",
      ].filter(Boolean);
      parts.push(`<li>Durante i free spin ogni wild espanso dà ${what.join(" e ")}.</li>`);
    }
  }
  if (Number.isFinite(math.maxWin)) parts.push(`<li>Vincita massima per round: ${math.maxWin}× la puntata totale.</li>`);
  parts.push(`</ul>`);
  return parts.join("");
}
