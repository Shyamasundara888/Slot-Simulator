import { type ModuleDraft, reelModes } from "../../../src/edit/draft.js";
import type { ScriptTrial } from "../../../src/script/trial.js";
import { listText, locale, t } from "../i18n/index.js";
import type { CodeEditor } from "./code.js";
import { h } from "./dom.js";
import { errorLines } from "./lua.js";
import type { TabContext } from "./tabs.js";
import { modeName } from "./tabs-math.js";

const DOCS_URL = "https://github.com/Shyamasundara888/Slot-Simulator/blob/main/docs/script-lua.md";

export type TrialState =
  | { state: "idle" }
  /** Durante la prova restano i risultati della precedente, per non far sparire e ricomparire gli errori. */
  | { state: "running"; previous: ScriptTrial | null }
  | { state: "done"; trial: ScriptTrial }
  | { state: "error"; message: string };

/** Quello che la scheda Script usa oltre al contesto delle altre schede. */
export interface ScriptPanel {
  code: CodeEditor;
  trial: TrialState;
  /** Problemi dello script, dalla prova o dall'anteprima. */
  problems: string[];
  /** Gioca nell'anteprima il round con questo seed. */
  useSeed(seed: string): void;
}

/** Modalità che si giocano solo se uno script le chiede. */
const scriptModes = (draft: ModuleDraft) => reelModes(draft).filter((m) => m !== "base" && m !== "free");

/** Esempi da inserire al cursore: codice senza commenti, quindi uguale in ogni lingua. */
function snippets(draft: ModuleDraft): [string, string][] {
  const mode = scriptModes(draft)[0] ?? (draft.reels.modes.free ? "free" : "base");
  return [
    [t("editor.script.snippet.request"), `return { mode = "${mode}", spins = 3, multiplier = 2 }`],
    [t("editor.script.snippet.counter"), "round.count = (round.count or 0) + 1"],
    [t("editor.script.snippet.chance"), "if math.random(100) == 1 then\n  \nend"],
    [t("editor.script.snippet.freeOnly"), 'if spin.mode == "free" then\n  \nend'],
    [t("editor.script.snippet.spinModes"), 'spinModes = { "free" }'],
  ];
}

export function scriptTab(ctx: TabContext, panel: ScriptPanel): HTMLElement {
  const { draft } = ctx;
  const extraModes = scriptModes(draft);
  const unused = extraModes.length > 0 ? h("p", { class: "ed-warn" }, t("editor.script.modesWithoutScript", { modes: listText(extraModes) })) : null;

  if (draft.script === null) {
    return h(
      "div",
      {},
      h("p", {}, t("editor.script.none")),
      unused,
      h("button", { type: "button", "data-key": "script-create", onclick: () => ctx.apply((d) => (d.script = t("editor.script.starter"))) }, t("editor.script.create")),
    );
  }

  const insert = h(
    "select",
    {
      "aria-label": t("editor.script.insert"), "data-key": "script-insert",
      onchange: (e: Event) => {
        const select = e.target as HTMLSelectElement;
        const code = snippets(draft)[Number(select.value)]?.[1];
        select.value = "";
        if (code) {
          panel.code.insert(code);
          panel.code.flush();
        }
      },
    },
    new Option(t("editor.script.insert"), ""),
    ...snippets(draft).map(([label], i) => new Option(label, String(i))),
  );
  const toolbar = h(
    "div",
    { class: "ed-inline ed-code-tools" },
    insert,
    h(
      "button",
      {
        type: "button", class: "ed-danger", "data-key": "script-remove",
        onclick: () => {
          if (confirm(t("editor.script.removeConfirm"))) ctx.apply((d) => (d.script = null));
        },
      },
      t("editor.script.remove"),
    ),
  );

  return h(
    "div",
    {},
    toolbar,
    panel.code.element,
    h("p", { class: "ed-hint" }, t("editor.script.keys")),
    trialView(panel),
    guide(draft),
  );
}

function trialView(panel: ScriptPanel): HTMLElement {
  const { trial: state } = panel;
  const trial = state.state === "running" && state.previous ? ({ state: "done", trial: state.previous } as const) : state;
  const running = state.state === "running" ? h("p", { class: "ed-hint" }, t("editor.script.testing")) : null;
  const lines = errorLines(panel.problems);
  const lineButtons = lines.map(({ line, message }) =>
    h(
      "li",
      {},
      h("button", { type: "button", class: "ed-link", "data-key": `script-line-${line}`, onclick: () => panel.code.goToLine(line) }, t("editor.script.goToLine", { line })),
      ` ${message}`,
    ),
  );
  if (trial.state === "running" || trial.state === "idle") {
    return h("div", { class: "ed-trial", id: "ed-trial" }, h("p", {}, t(trial.state === "running" ? "editor.script.testing" : "editor.script.waiting")), lineButtons.length ? h("ul", {}, ...lineButtons) : null);
  }
  if (trial.state === "error") return h("div", { class: "ed-trial", id: "ed-trial" }, h("p", { class: "ed-error" }, trial.message));
  const r = trial.trial;
  if (r.problems.length > 0) {
    return h(
      "div",
      { class: "ed-trial error", id: "ed-trial" },
      running,
      h("p", {}, t("editor.script.loadErrors")),
      h("ul", {}, ...(lineButtons.length ? lineButtons : r.problems.map((p) => h("li", {}, p)))),
    );
  }
  const n = (x: number) => x.toLocaleString(locale);
  const hooks = h("p", {}, t("editor.script.hooks", { hooks: listText(r.hooks) }));
  if (r.failure) {
    const seed = r.failure.seed;
    return h(
      "div",
      { class: "ed-trial error", id: "ed-trial" },
      running,
      h("p", {}, t("editor.script.failure", { seed, rounds: n(r.rounds) })),
      h("ul", {}, ...(lineButtons.length ? lineButtons : [h("li", {}, r.failure.message)])),
      h("button", { type: "button", id: "ed-trial-seed", onclick: () => panel.useSeed(seed) }, t("editor.script.playFailure")),
      hooks,
    );
  }
  return h(
    "div",
    { class: "ed-trial ok", id: "ed-trial" },
    running,
    h("p", {}, t("editor.script.testOk", { rounds: n(r.rounds) })),
    hooks,
    h(
      "p",
      {},
      r.extraRounds > 0
        ? t("editor.script.extraEvery", { n: n(r.extraRounds), rounds: n(r.rounds), every: n(Math.round(r.rounds / r.extraRounds)) })
        : t("editor.script.extraNone"),
    ),
  );
}

function guide(draft: ModuleDraft): HTMLElement {
  const modes = reelModes(draft).map((m) => (m === "base" || m === "free" ? `"${m}"` : `"${m}" (${modeName(draft, m)})`));
  return h(
    "details",
    { class: "ed-guide" },
    h("summary", {}, t("editor.script.guide")),
    h("p", {}, t("editor.script.guideOnSpin")),
    h("p", {}, t("editor.script.guideFeatureEnd")),
    h("p", {}, t("editor.script.guideReturn")),
    h("p", {}, t("editor.script.guideState")),
    h("p", {}, t("editor.script.guideModes", { modes: modes.join(", ") })),
    h("p", {}, h("a", { href: DOCS_URL, target: "_blank", rel: "noopener" }, t("editor.script.guideDocs"))),
  );
}
