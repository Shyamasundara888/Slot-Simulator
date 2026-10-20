import type { SlotModule } from "../../src/module/parse.js";
import { listText, t } from "./i18n/index.js";

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
    `<table><thead><tr><th>${t("pt.symbol")}</th>${counts.map((n) => `<th>${n}×</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`,
    `<ul>`,
    `<li>${t("pt.lines", { lines: math.lines.length })}</li>`,
  ];
  if (math.wild) parts.push(`<li>${t("pt.wild", { wild: name(math.wild) })}</li>`);
  if (math.expandingWildReels.size > 0) {
    const reels = [...math.expandingWildReels].map((r) => r + 1).join(", ");
    parts.push(`<li>${t("pt.expanding", { reels })}</li>`);
  }
  if (math.scatter) {
    const pays = math.scatter.pays
      .map((p, n) => ({ p, n }))
      .filter(({ p, n }) => p > 0 && math.scatter!.pays[n - 1] !== p)
      .map(({ p, n }) => `${n}: ${p}×`)
      .join(", ");
    parts.push(`<li>${t("pt.scatter", { scatter: name(math.scatter.symbol), pays })}</li>`);
  }
  const fs = math.freeSpins;
  if (fs) {
    // Solo i numeri di scatter in cui cambia il premio: l'ultimo vale anche per tutti quelli dopo.
    const awards = fs.awards
      .map((spins, n) => ({ spins, n }))
      .filter(({ spins, n }) => n >= fs.minScatters && spins !== fs.awards[n - 1]);
    const text =
      awards.length === 1
        ? t("pt.freeOne", { min: fs.minScatters, spins: awards[0]!.spins })
        : t("pt.freeMany", {
            list: awards.map(({ n, spins }, i) => `${i === awards.length - 1 ? t("pt.orMore", { n }) : n}: ${spins}`).join(", "),
          });
    parts.push(`<li>${text}${fs.retrigger ? t("pt.retrigger") : ""}.</li>`);
    if (fs.extraSpinsPerExpandedWild > 0 || fs.upgradeOnExpandedWild || fs.multiplierPerExpandedWild > 0) {
      const what = [
        fs.extraSpinsPerExpandedWild > 0 ? t("pt.extraSpins", { n: fs.extraSpinsPerExpandedWild }) : "",
        fs.multiplierPerExpandedWild > 0 ? t("pt.multiplier", { n: fs.multiplierPerExpandedWild, max: fs.maxMultiplier }) : "",
        fs.upgradeOnExpandedWild ? t("pt.upgrade", { ladder: fs.upgradeLadder.map((s) => esc(scene.symbols.get(s)!.label)).join(" → ") }) : "",
      ].filter(Boolean);
      parts.push(`<li>${t("pt.perWild", { what: listText(what) })}</li>`);
    }
  }
  for (const { label, description } of scene.modes.values()) {
    if (description) parts.push(`<li><strong>${esc(label)}</strong>: ${esc(description)}</li>`);
  }
  if (Number.isFinite(math.maxWin)) parts.push(`<li>${t("pt.maxWin", { max: math.maxWin })}</li>`);
  parts.push(`</ul>`);
  return parts.join("");
}
