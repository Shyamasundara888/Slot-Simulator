import {
  addLine,
  addMode,
  duplicateLines,
  type ModuleDraft,
  reelCount,
  reelModes,
  removeLine,
  removeMode,
  setExpandingWild,
  setFreeSpins,
  setFreeSpinsAward,
  setLineRow,
  setMaxWin,
  setStrip,
  setSymbolCount,
  stripCounts,
  toggleExpandingReel,
  updateFreeSpins,
} from "../../../src/edit/draft.js";
import { locale, t } from "../i18n/index.js";
import { h, numberValue } from "./dom.js";
import { numberField, row, type TabContext, textField } from "./tabs.js";

const MODE_ID = /^[a-z][a-z0-9_]*$/;

/** Nome di una modalità dei rulli per chi usa l'editor. */
export function modeName(draft: ModuleDraft, mode: string): string {
  if (mode === "base") return t("editor.reels.base");
  if (mode === "free") return t("editor.reels.free");
  return draft.scene.modes?.[mode]?.label ?? mode;
}

export const checkbox = (key: string, checked: boolean, label: string, onChange: (on: boolean) => void, disabled = false) =>
  h(
    "label",
    { class: "ed-check" },
    h("input", {
      type: "checkbox", checked, disabled, "data-key": key,
      onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked),
    }),
    ` ${label}`,
  );

export function linesTab(ctx: TabContext): HTMLElement {
  const { draft } = ctx;
  const rows = draft.reels.rows;
  const duplicates = duplicateLines(draft);
  const only = draft.lines.lines.length === 1;
  const cards = draft.lines.lines.map((line, i) =>
    h(
      "div",
      { class: duplicates.has(i) ? "ed-line duplicate" : "ed-line" },
      h(
        "div",
        { class: "ed-line-head" },
        h("strong", {}, t("editor.lines.line", { n: i + 1 })),
        h(
          "button",
          {
            type: "button", class: "ed-danger", "data-key": `line-remove-${i}`, disabled: only,
            title: t("editor.lines.remove"), "aria-label": t("editor.lines.remove"),
            onclick: () => ctx.apply((d) => removeLine(d, i)),
          },
          "✕",
        ),
      ),
      h(
        "div",
        { class: "ed-line-grid", style: `grid-template-columns: repeat(${line.length}, 1fr)` },
        // Righe dall'alto: ogni casella sposta la linea su quella riga del suo rullo.
        ...Array.from({ length: rows }, (_, r) =>
          line.map((at, reel) =>
            h("button", {
              type: "button",
              class: at === r ? "on" : "",
              "data-key": `line-${i}-${reel}-${r}`,
              "aria-pressed": String(at === r),
              "aria-label": t("editor.lines.cell", { line: i + 1, reel: reel + 1, row: r + 1 }),
              onclick: () => ctx.apply((d) => setLineRow(d, i, reel, r)),
            }),
          ),
        ).flat(),
      ),
      duplicates.has(i) ? h("small", { class: "ed-warn" }, t("editor.lines.duplicate", { n: duplicates.get(i)! + 1 })) : null,
    ),
  );
  return h(
    "div",
    {},
    h("p", { class: "ed-hint" }, t("editor.lines.hint", { lines: draft.lines.lines.length })),
    h("div", { class: "ed-lines" }, ...cards),
    h("button", { type: "button", "data-key": "line-add", onclick: () => ctx.apply((d) => addLine(d)) }, t("editor.lines.add")),
  );
}

export function reelsTab(ctx: TabContext): HTMLElement {
  const { draft } = ctx;
  const modes = reelModes(draft);
  const mode = modes.includes(ctx.view.mode) ? ctx.view.mode : "base";
  const strips = draft.reels.modes[mode]!;
  const reels = strips.length;
  const counts = strips.map(stripCounts);
  const ids = draft.paytable.symbols.map((s) => s.id);
  // Simboli sulle strisce ma non nella paytable: li mostra per poterli togliere.
  for (const c of counts) for (const id of c.keys()) if (!ids.includes(id)) ids.push(id);
  const label = (id: string) => draft.scene.symbols?.[id]?.label ?? id;

  const addModePrompt = () => {
    const id = prompt(t("editor.reels.newModePrompt"))?.trim();
    if (!id) return;
    if (!MODE_ID.test(id) || id === "base" || id === "free") return ctx.notify(t("editor.reels.modeInvalid", { id }));
    if (modes.includes(id)) return ctx.notify(t("editor.reels.modeTaken", { id }));
    ctx.apply((d) => addMode(d, id, mode, id));
    ctx.setView({ mode: id });
  };

  const tabs = h(
    "div",
    { class: "ed-modes" },
    ...modes.map((m) =>
      h(
        "button",
        { type: "button", class: m === mode ? "active" : "", "data-key": `mode-${m}`, "aria-pressed": String(m === mode), onclick: () => ctx.setView({ mode: m }) },
        modeName(draft, m),
      ),
    ),
    draft.features.freeSpins && !modes.includes("free")
      ? h(
          "button",
          { type: "button", "data-key": "mode-add-free", onclick: () => (ctx.apply((d) => addMode(d, "free", "base")), ctx.setView({ mode: "free" })) },
          t("editor.reels.addFree"),
        )
      : null,
    h("button", { type: "button", "data-key": "mode-add", onclick: addModePrompt }, t("editor.reels.addMode")),
  );

  const about: (HTMLElement | null)[] = [];
  if (mode === "base") about.push(h("p", { class: "ed-hint" }, t("editor.reels.baseHint")));
  else if (mode === "free") about.push(h("p", { class: "ed-hint" }, t("editor.reels.freeHint")));
  else {
    const scene = draft.scene.modes?.[mode];
    about.push(
      h("p", { class: "ed-hint" }, t("editor.reels.scriptHint", { mode })),
      row(
        t("editor.reels.modeLabel"),
        textField(`scenes/main.json#modes.${mode}.label`, scene?.label ?? "", (v) =>
          ctx.apply((d) => {
            d.scene.modes ??= {};
            d.scene.modes[mode] = { ...d.scene.modes[mode], label: v.trim() || mode };
          }),
        ),
      ),
      row(
        t("editor.reels.modeDescription"),
        h("textarea", {
          rows: 2, value: scene?.description ?? "", "data-key": `mode-description-${mode}`, "data-path": `scenes/main.json#modes.${mode}.description`,
          onchange: (e: Event) =>
            ctx.apply((d) => {
              const value = (e.target as HTMLTextAreaElement).value.trim();
              d.scene.modes ??= {};
              const next = { label: d.scene.modes[mode]?.label ?? mode, ...(value ? { description: value } : {}) };
              d.scene.modes[mode] = next;
            }),
        }),
        t("editor.reels.modeDescriptionHint"),
      ),
    );
  }
  if (mode !== "base") {
    about.push(
      h(
        "button",
        {
          type: "button", class: "ed-danger", "data-key": "mode-remove",
          onclick: () => {
            if (!confirm(t("editor.reels.removeConfirm", { mode: modeName(draft, mode) }))) return;
            ctx.apply((d) => removeMode(d, mode));
            ctx.setView({ mode: "base" });
          },
        },
        t("editor.reels.remove"),
      ),
    );
  }

  const header = h("thead", {}, h("tr", {}, h("th", {}, t("pt.symbol")), ...strips.map((_, r) => h("th", {}, t("editor.reels.reel", { n: r + 1 })))));
  const body = h(
    "tbody",
    {},
    ...ids.map((id) =>
      h(
        "tr",
        {},
        h("td", {}, label(id)),
        ...counts.map((c, reel) => {
          const n = c.get(id) ?? 0;
          const share = ((n / strips[reel]!.length) * 100).toLocaleString(locale, { maximumFractionDigits: 1 });
          return h(
            "td",
            {},
            h("input", {
              type: "number", min: 0, step: 1, value: n, title: `${share}%`,
              "data-key": `count-${mode}-${reel}-${id}`,
              "aria-label": t("editor.reels.countLabel", { symbol: label(id), reel: reel + 1 }),
              onchange: (e: Event) => {
                const value = numberValue(e.target as HTMLInputElement);
                if (value === null || value < 0 || !Number.isInteger(value)) return ctx.notify(t("editor.reels.countInvalid"));
                ctx.apply((d) => setSymbolCount(d, mode, reel, id, value));
              },
            }),
          );
        }),
      ),
    ),
    h("tr", { class: "ed-total" }, h("td", {}, t("editor.reels.length")), ...strips.map((s) => h("td", { class: "num" }, String(s.length)))),
  );

  const manual = ctx.view.manualStrips
    ? h(
        "div",
        { class: "ed-strips" },
        ...strips.map((strip, reel) =>
          row(
            t("editor.reels.reel", { n: reel + 1 }),
            h("textarea", {
              rows: 3, value: strip.join(" "), "data-key": `strip-${mode}-${reel}`, "data-path": `math/reels.json#modes.${mode}.${reel}`,
              onchange: (e: Event) => {
                const symbols = (e.target as HTMLTextAreaElement).value.toUpperCase().split(/[\s,]+/).filter(Boolean);
                ctx.apply((d) => setStrip(d, mode, reel, symbols));
              },
            }),
          ),
        ),
      )
    : null;

  return h(
    "div",
    {},
    tabs,
    ...about,
    h("h3", {}, t("editor.reels.counts", { mode: modeName(draft, mode), reels })),
    h("table", { class: "ed-table ed-counts" }, header, body),
    h("p", { class: "ed-hint" }, t("editor.reels.countsHint")),
    checkbox("manual-strips", ctx.view.manualStrips, t("editor.reels.manual"), (on) => ctx.setView({ manualStrips: on })),
    manual,
  );
}

export function featuresTab(ctx: TabContext): HTMLElement {
  const { draft } = ctx;
  const reels = reelCount(draft);
  const kinds = new Map(draft.paytable.symbols.map((s) => [s.id, s.kind]));
  const hasWild = [...kinds.values()].includes("wild");
  const hasScatter = [...kinds.values()].includes("scatter");
  const label = (id: string) => draft.scene.symbols?.[id]?.label ?? id;
  const wild = draft.features.expandingWild;
  const fs = draft.features.freeSpins;
  const parts: (HTMLElement | null)[] = [];

  // Wild espandenti.
  parts.push(
    h("h3", {}, t("editor.features.expanding")),
    checkbox("expanding", wild !== undefined, t("editor.features.expandingOn"), (on) => ctx.apply((d) => setExpandingWild(d, on)), !hasWild && !wild),
    !hasWild ? h("p", { class: "ed-hint" }, t("editor.features.noWild")) : null,
  );
  if (wild) {
    parts.push(
      h(
        "div",
        { class: "ed-inline" },
        h("span", {}, t("editor.features.expandingReels")),
        ...Array.from({ length: reels }, (_, i) =>
          checkbox(`expanding-${i + 1}`, wild.reels.includes(i + 1), String(i + 1), (on) => ctx.apply((d) => toggleExpandingReel(d, i + 1, on))),
        ),
      ),
    );
  }

  // Free spin.
  parts.push(
    h("h3", {}, t("editor.features.free")),
    checkbox("free", fs !== undefined, t("editor.features.freeOn"), (on) => {
      if (!on && draft.reels.modes.free && !confirm(t("editor.features.freeOffConfirm"))) return ctx.notify("");
      ctx.apply((d) => setFreeSpins(d, on));
    }, !hasScatter && !fs),
    !hasScatter ? h("p", { class: "ed-hint" }, t("editor.features.noScatter")) : null,
  );
  if (fs) {
    const path = (p: string) => `math/features.json#freeSpins.${p}`;
    const keys = Object.keys(fs.trigger.spins).map(Number);
    const from = Math.min(fs.trigger.minScatters, ...keys);
    const to = Math.max(reels, fs.trigger.minScatters, ...keys);
    const counts = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const per = fs.perExpandedWild ?? {};
    const ladder = fs.upgradeLadder ?? [];
    const normals = draft.paytable.symbols.filter((s) => s.kind === "normal" && !ladder.includes(s.id));
    const setPer = (key: "extraSpins" | "multiplier") => (v: number | null) =>
      ctx.apply((d) => updateFreeSpins(d, (f) => (f.perExpandedWild = { ...f.perExpandedWild, [key]: v ?? 0 })));

    parts.push(
      row(
        t("editor.features.minScatters"),
        numberField(path("trigger.minScatters"), fs.trigger.minScatters, (v) => {
          if (v === null || !Number.isInteger(v) || v < 1) return ctx.notify(t("editor.features.minScattersInvalid"));
          ctx.apply((d) => updateFreeSpins(d, (f) => void (f.trigger.minScatters = v)));
        }, { min: 1, step: 1 }),
      ),
      h("p", { class: "ed-field-label" }, t("editor.features.awards")),
      h(
        "table",
        { class: "ed-table ed-pays" },
        h("thead", {}, h("tr", {}, h("th", {}, t("editor.features.scatters")), ...counts.map((n) => h("th", {}, String(n))))),
        h(
          "tbody",
          {},
          h(
            "tr",
            {},
            h("td", {}, t("editor.features.spins")),
            ...counts.map((n) =>
              h(
                "td",
                {},
                numberField(path(`trigger.spins.${n}`), fs.trigger.spins[String(n)], (v) => ctx.apply((d) => setFreeSpinsAward(d, n, v)), {
                  step: 1, "aria-label": t("editor.features.awardLabel", { n }),
                }),
              ),
            ),
          ),
        ),
      ),
      h("p", { class: "ed-hint" }, t("editor.features.awardsHint")),
      checkbox("retrigger", fs.retrigger ?? false, t("editor.features.retrigger"), (on) => ctx.apply((d) => updateFreeSpins(d, (f) => void (f.retrigger = on)))),
      h("p", { class: "ed-field-label" }, t("editor.features.perWild")),
      h(
        "div",
        { class: "ed-inline" },
        row(t("editor.features.extraSpins"), numberField(path("perExpandedWild.extraSpins"), per.extraSpins ?? 0, setPer("extraSpins"), { step: 1 })),
        row(t("editor.features.multiplier"), numberField(path("perExpandedWild.multiplier"), per.multiplier ?? 0, setPer("multiplier"), { step: 1 })),
        row(
          t("editor.features.maxMultiplier"),
          numberField(path("maxMultiplier"), fs.maxMultiplier ?? 10, (v) => ctx.apply((d) => updateFreeSpins(d, (f) => {
            if (v === null) delete f.maxMultiplier;
            else f.maxMultiplier = v;
          })), { min: 1, max: 1000, step: 1 }),
        ),
      ),
      checkbox("upgrade", per.upgrade ?? false, t("editor.features.upgrade"), (on) =>
        ctx.apply((d) => updateFreeSpins(d, (f) => (f.perExpandedWild = { ...f.perExpandedWild, upgrade: on }))),
      ),
      h("p", { class: "ed-field-label" }, t("editor.features.ladder")),
      h(
        "ol",
        { class: "ed-ladder", "data-path": path("upgradeLadder") },
        ...ladder.map((id, i) =>
          h(
            "li",
            {},
            label(id),
            " ",
            h("button", {
              type: "button", "data-key": `ladder-up-${id}`, disabled: i === 0, "aria-label": t("editor.symbols.up"),
              onclick: () => ctx.apply((d) => updateFreeSpins(d, (f) => {
                const l = f.upgradeLadder!;
                [l[i - 1], l[i]] = [l[i]!, l[i - 1]!];
              })),
            }, "↑"),
            h("button", {
              type: "button", class: "ed-danger", "data-key": `ladder-remove-${id}`, "aria-label": t("editor.features.ladderRemove"),
              onclick: () => ctx.apply((d) => updateFreeSpins(d, (f) => (f.upgradeLadder = f.upgradeLadder!.filter((s) => s !== id)))),
            }, "✕"),
          ),
        ),
      ),
      normals.length > 0
        ? h(
            "select",
            {
              "data-key": "ladder-add", "aria-label": t("editor.features.ladderAdd"),
              onchange: (e: Event) => {
                const id = (e.target as HTMLSelectElement).value;
                if (id) ctx.apply((d) => updateFreeSpins(d, (f) => (f.upgradeLadder = [...(f.upgradeLadder ?? []), id])));
              },
            },
            new Option(t("editor.features.ladderAdd"), ""),
            ...normals.map((s) => new Option(label(s.id), s.id)),
          )
        : null,
      h("p", { class: "ed-hint" }, t("editor.features.ladderHint")),
      row(
        t("editor.features.maxSpins"),
        numberField(path("maxSpins"), fs.maxSpins ?? 1000, (v) => ctx.apply((d) => updateFreeSpins(d, (f) => {
          if (v === null) delete f.maxSpins;
          else f.maxSpins = v;
        })), { min: 1, step: 1 }),
      ),
      h("p", { class: "ed-hint" }, t(draft.reels.modes.free ? "editor.features.ownStrips" : "editor.features.baseStrips")),
    );
  }

  // Tetto di vincita.
  parts.push(
    h("h3", {}, t("editor.features.maxWin")),
    row(
      t("editor.features.maxWinLabel"),
      numberField("math/features.json#maxWin", draft.features.maxWin, (v) => ctx.apply((d) => setMaxWin(d, v)), { min: 1, placeholder: t("editor.features.noMaxWin") }),
      t("editor.features.maxWinHint"),
    ),
  );
  return h("div", { class: "ed-form" }, ...parts);
}
