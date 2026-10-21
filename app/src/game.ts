import { attemptRound } from "../../src/core/engine.js";
import { createReplayableRng, createRng, type Rng } from "../../src/core/rng.js";
import type { Mode, RoundAttempt, RoundHooks, RoundResult, SpinResult, UiEvent } from "../../src/core/types.js";
import type { SlotModule } from "../../src/module/parse.js";
import { ScriptRuntime } from "../../src/script/runtime.js";
import { initialValues, type UiValues } from "../../src/ui/values.js";
import wasmUri from "wasmoon/dist/glue.wasm?url";
import { wait } from "./anim.js";
import { money, signedMoney, trend } from "./format.js";
import { t } from "./i18n/index.js";
import type { ClientModule } from "./modules.js";
import { SlotView } from "./slot-view.js";
import { setMuted, Sounds } from "./sound.js";
import { net, type StatsStore } from "./stats.js";

/** Da questa vincita, in multipli della puntata totale, si sente il suono della vincita grande e parte la schermata. */
const BIG_WIN = 20;
/** Soglie dei titoli della schermata, in multipli della puntata totale, dalla più alta. */
const WIN_TITLES: [number, "game.epicWin" | "game.megaWin" | "game.bigWin"][] = [
  [100, "game.epicWin"],
  [50, "game.megaWin"],
  [BIG_WIN, "game.bigWin"],
];

/** Puntate totali disponibili, in crediti. */
const BET_LEVELS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
const START_BALANCE = 1000;
const STORAGE_KEY = "slot-simulator:balance";


function readBalance(): number {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : START_BALANCE;
  } catch {
    return START_BALANCE;
  }
}

function saveBalance(value: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Senza storage il saldo vale solo per questa sessione.
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Collega motore, vista e controlli HTML. Il saldo è virtuale e condiviso tra le slot. */
export class Game {
  private balance: number;
  private betIndex = BET_LEVELS.indexOf(1);
  private busy = false;
  private readonly rng: Rng;
  /** Valori mostrati dagli elementi di interfaccia del modulo e modalità in corso. */
  private values: UiValues;
  private mode: Mode = "base";
  private readonly ui = {
    balance: $<HTMLElement>("balance"),
    bet: $<HTMLElement>("bet"),
    win: $<HTMLElement>("win"),
    netSession: $<HTMLElement>("net-session"),
    netTotal: $<HTMLElement>("net-total"),
    status: $<HTMLElement>("status"),
    spin: $<HTMLButtonElement>("spin"),
    betDown: $<HTMLButtonElement>("bet-down"),
    betUp: $<HTMLButtonElement>("bet-up"),
    turbo: $<HTMLInputElement>("turbo"),
    reset: $<HTMLButtonElement>("reset"),
    mute: $<HTMLButtonElement>("mute"),
  };

  private constructor(
    private readonly module: SlotModule,
    private readonly view: SlotView,
    private readonly hooks: RoundHooks | undefined,
    private readonly stats: StatsStore,
    private readonly sounds: Sounds,
    seed: number | string,
    /** Falso nell'anteprima dell'editor: il saldo riparte da capo e non viene salvato. */
    private readonly persist: boolean,
  ) {
    this.balance = persist ? readBalance() : START_BALANCE;
    this.rng = createRng(seed);
    this.values = initialValues(this.bet, module.math.maxWin);
    view.hud.update(this.values, this.mode);
    this.ui.spin.onclick = () => void this.spin();
    this.ui.betDown.onclick = () => this.changeBet(-1);
    this.ui.betUp.onclick = () => this.changeBet(1);
    this.ui.win.textContent = money(0);
    this.ui.mute.hidden = !sounds.available;
    this.ui.mute.onclick = () => {
      sounds.muted = !sounds.muted;
      setMuted(sounds.muted);
      this.render();
    };
    this.ui.reset.onclick = () => {
      if (this.busy) return;
      this.balance = START_BALANCE;
      this.saveBalance();
      this.render();
    };
    this.render();
  }

  /** Senza seed ne sceglie uno casuale; con lo stesso seed la sequenza dei round si ripete. */
  static async start(host: HTMLElement, { module, assets }: ClientModule, stats: StatsStore, seed?: number | string, persist = true): Promise<Game> {
    // Lo script si carica prima della vista: se non è valido il modulo non parte.
    const elements = module.ui.elements;
    const hooks = module.script === null ? undefined : await ScriptRuntime.create(module.math, module.script, { wasmUri, elements });
    const sounds = new Sounds(module.scene, assets, module.ui.elements.flatMap((e) => (e.sound ? [e.sound] : [])));
    const view = await SlotView.create(
      host,
      module,
      assets,
      () => sounds.play("stop"),
      (path) => sounds.playAsset(path),
    );
    return new Game(module, view, hooks, stats, sounds, seed ?? crypto.getRandomValues(new Uint32Array(1))[0]!, persist);
  }

  private saveBalance(): void {
    if (this.persist) saveBalance(this.balance);
  }

  get isBusy(): boolean {
    return this.busy;
  }

  get bet(): number {
    return BET_LEVELS[this.betIndex]!;
  }

  private changeBet(delta: number): void {
    if (this.busy) return;
    this.betIndex = Math.max(0, Math.min(BET_LEVELS.length - 1, this.betIndex + delta));
    this.showValues({ bet: this.bet });
    this.render();
  }

  /** Aggiorna i contatori, per esempio dopo aver azzerato le statistiche. */
  refresh(): void {
    this.render();
  }

  private render(): void {
    this.ui.balance.textContent = money(this.balance);
    this.ui.bet.textContent = money(this.bet);
    this.ui.spin.disabled = this.busy || this.balance < this.bet;
    this.ui.betDown.disabled = this.busy || this.betIndex === 0;
    this.ui.betUp.disabled = this.busy || this.betIndex === BET_LEVELS.length - 1;
    this.ui.reset.disabled = this.busy;
    this.ui.mute.textContent = t(this.sounds.muted ? "game.audioOff" : "game.audioOn");
    this.ui.mute.setAttribute("aria-pressed", String(!this.sounds.muted));
    const { session, total } = this.stats.get(this.module.manifest.id);
    for (const [el, s] of [[this.ui.netSession, session], [this.ui.netTotal, total]] as const) {
      el.textContent = signedMoney(net(s));
      el.className = `net ${trend(net(s))}`.trim();
    }
  }

  /** Aggiorna gli elementi di interfaccia con i valori cambiati e, se data, la modalità in corso. */
  private showValues(patch: Partial<UiValues>, mode: Mode = this.mode, turbo = false): void {
    Object.assign(this.values, patch);
    this.mode = mode;
    this.view.hud.update(this.values, mode, turbo);
  }

  /** Mette in scena le richieste di uno script all'interfaccia, nell'ordine in cui le ha fatte. */
  private async playUi(events: readonly UiEvent[] | undefined, turbo: boolean): Promise<void> {
    if (!events) return;
    const flights: Promise<void>[] = [];
    for (const event of events) {
      switch (event.kind) {
        case "set": {
          const key = `script.${event.name}` as const;
          if (!event.from) {
            this.showValues({ [key]: event.value }, this.mode, turbo);
            break;
          }
          // Le raccolte partono una dopo l'altra e il valore cambia quando l'icona arriva.
          const delay = flights.length * (turbo ? 60 : 140);
          const { from, value } = event;
          flights.push(
            wait(delay)
              .then(() => this.view.collect(from, this.view.hud.targets(key), turbo))
              .then(() => this.showValues({ [key]: value }, this.mode, turbo)),
          );
          break;
        }
        case "show":
          await Promise.all(flights);
          // Un pannello copre i rulli: le vincite dello spin lasciate in vista andrebbero sopra.
          if (this.module.ui.elements.some((e) => e.id === event.id && e.type === "panel")) this.view.clearWins();
          await this.view.hud.show(event.id, turbo);
          break;
        case "hide":
          this.view.hud.force(event.id, false, turbo);
          break;
        case "pick":
          await Promise.all(flights);
          this.view.clearWins();
          await this.view.hud.pick(event.id, event.prizes, turbo);
          break;
        case "fx":
          this.view.hud.effect(event.id, event.effect, turbo);
          break;
        case "message":
          await Promise.all(flights);
          await this.view.message(event.text, turbo);
          break;
      }
    }
    await Promise.all(flights);
  }

  private setStatus(text: string, tone: "" | "win" | "feature" = ""): void {
    this.ui.status.textContent = text;
    this.ui.status.className = `status ${tone}`.trim();
  }

  /**
   * Mostra uno spin già deciso dal motore: rulli, trasformazioni, vincite.
   * `onRevealed` viene chiamata quando griglia ed espansioni sono visibili,
   * prima delle vincite; `settle` risponde alle scelte che lo script chiede
   * dopo questo spin e restituisce lo spin del round rigiocato.
   */
  private async present(
    first: SpinResult,
    turbo: boolean,
    onRevealed?: () => void,
    settle: () => Promise<SpinResult> = async () => first,
  ): Promise<number> {
    this.sounds.play("spin");
    await this.view.spin(first.reelGrid, turbo);
    if (first.grid.some((column, reel) => column.some((s, row) => s !== first.reelGrid[reel]![row]))) {
      await this.view.reveal(first.reelGrid, first.grid, turbo);
    }
    onRevealed?.();
    const spin = await settle();
    await this.playUi(spin.ui, turbo);
    const credits = spin.win * this.bet;
    if (credits > 0) {
      this.sounds.play(spin.win >= BIG_WIN ? "bigWin" : "win");
      const multiplier = spin.multiplier > 1 ? ` (×${spin.multiplier})` : "";
      this.view.showWins(spin.lineWins, spin.scatterWin, spin.reelGrid, `${money(credits)}${multiplier}`);
      await wait(turbo ? 450 : 1100);
      await this.celebrate(spin.win, turbo);
    }
    return credits;
  }

  /** Schermata delle vincite grandi, se `win` (in multipli della puntata) arriva a una soglia. */
  private async celebrate(win: number, turbo: boolean): Promise<void> {
    const title = WIN_TITLES.find(([min]) => win >= min)?.[1];
    if (title) await this.view.celebrate(t(title), win * this.bet, money, turbo);
  }

  async spin(): Promise<void> {
    if (this.busy || this.balance < this.bet) return;
    this.busy = true;
    const turbo = this.ui.turbo.checked;
    const bet = this.bet;
    this.balance -= bet;
    this.ui.win.textContent = money(0);
    this.setStatus("");
    this.render();
    this.values = initialValues(bet, this.module.math.maxWin);
    this.view.hud.clearForced();
    this.showValues({}, "base", turbo);
    try {
      await this.playOne(bet, turbo);
    } catch (err) {
      // Un errore dello script, anche mentre il round si rigioca dopo una scelta: la puntata torna al giocatore.
      console.error(err);
      this.balance += bet;
      this.view.hud.clearForced();
      this.showValues({}, "base", turbo);
      this.setStatus(t("game.roundError", { error: (err as Error).message }));
    } finally {
      this.hooks?.setAnswers?.([]);
      this.busy = false;
      this.render();
    }
  }

  /**
   * Gioca e mette in scena un round. Il round è deciso dal motore tutto in
   * una volta; se uno script chiede una scelta al giocatore il motore si
   * ferma lì, il client mostra il round fino a quel punto, chiede la scelta e
   * fa rigiocare il round con la risposta dallo stesso stato dell'RNG: ciò
   * che è già sullo schermo resta identico.
   */
  private async playOne(bet: number, turbo: boolean): Promise<void> {
    const rng = createReplayableRng(this.rng);
    const answers: number[] = [];
    const attempt = (): RoundAttempt => {
      rng.rewind();
      this.hooks?.setAnswers?.(answers);
      return attemptRound(this.module.math, rng, this.hooks);
    };
    let state = attempt();
    /** Risponde alle scelte chieste nel punto `at` del round (vedi stopAt), finché il motore si ferma lì. */
    const settle = async (at: string): Promise<RoundResult> => {
      while (state.choice && stopAt(state) === at) {
        const before = this.ui.status.textContent ?? "";
        this.setStatus(t("game.choice"), "feature");
        this.view.clearWins();
        answers.push(await this.view.hud.choose(state.choice.id));
        this.setStatus(before, "feature");
        state = attempt();
      }
      return state.round;
    };
    const round = () => state.round;

    let shown = await this.present(round().base, turbo, undefined, async () => (await settle("base")).base);
    this.ui.win.textContent = money(shown);
    this.showValues({ "win.spin": shown, "win.round": shown }, "base", turbo);
    /** Somma le vincite di uno spin del bonus ai contatori. */
    const addWin = (credits: number) => {
      shown += credits;
      const total = Math.min(shown, round().totalWin * bet);
      this.ui.win.textContent = money(total);
      this.showValues({ "win.spin": credits, "win.feature": total - round().base.win * bet, "win.round": total }, this.mode, turbo);
    };

    if (round().freeSpins) {
      const initial = round().freeSpins!.initial;
      this.setStatus(t("game.freeStart", { n: initial }), "feature");
      this.showValues(
        { "free.total": initial, "free.played": 0, "free.remaining": initial, multiplier: 1, level: 0, "win.spin": 0 },
        "free",
        turbo,
      );
      this.sounds.play("feature");
      await wait(turbo ? 600 : 1500);
      const ladder = this.module.math.freeSpins?.upgradeLadder ?? [];
      // Le scelte possono cambiare il seguito del round: i free spin si rileggono a ogni passo.
      const free = () => round().freeSpins!;
      for (let i = 0; i < free().spins.length; i++) {
        const spin = free().spins[i]!;
        const total = i === 0 ? free().initial : free().awardedAfter[i - 1]!;
        const label = (id: string) => this.module.scene.symbols.get(id)?.label ?? id;
        const level =
          spin.upgradeLevel > 0
            ? t("game.upgrade", { from: ladder.slice(0, spin.upgradeLevel).map(label).join(", "), to: label(ladder[spin.upgradeLevel]!) })
            : "";
        // Prima dello spin si vede il moltiplicatore già raggiunto: quello nuovo arriva con i wild di questo spin.
        const status = (m: number) => `${t("game.freeSpin", { i: i + 1, n: total })}${m > 1 ? t("game.multiplier", { m }) : ""}${level}`;
        const before = i === 0 ? 1 : free().spins[i - 1]!.multiplier;
        this.setStatus(status(before), "feature");
        this.showValues({ "free.total": total, "free.played": i + 1, "free.remaining": total - i - 1, multiplier: before, level: spin.upgradeLevel }, "free", turbo);
        const credits = await this.present(
          spin,
          turbo,
          () => {
            if (spin.multiplier !== before) this.setStatus(status(spin.multiplier), "feature");
            this.showValues({ multiplier: spin.multiplier }, "free", turbo);
          },
          async () => (await settle(`free:${i}`)).freeSpins!.spins[i]!,
        );
        // Riattivazioni e spin extra arrivano con lo spin che li assegna.
        const after = free().awardedAfter[i]!;
        this.showValues({ "free.total": after, "free.remaining": after - i - 1 }, "free", turbo);
        addWin(credits);
      }
      await settle("free:end");
      await this.playUi(free().endUi, turbo);
    }

    for (let s = 0; s < round().extra.length; s++) {
      const sequence = () => round().extra[s]!;
      const { mode, multiplier: m } = sequence();
      const label = this.module.scene.modes.get(mode)?.label ?? t("game.modeFallback", { mode });
      const intro = m > 1 ? t("game.withMultiplier", { m }) : "";
      const n = () => sequence().spins.length;
      this.setStatus(t("game.sequenceStart", { n: n(), label, intro }), "feature");
      this.showValues({ "sequence.total": n(), "sequence.played": 0, "sequence.remaining": n(), multiplier: m, "win.spin": 0 }, mode, turbo);
      this.sounds.play("feature");
      await wait(turbo ? 600 : 1500);
      for (let i = 0; i < n(); i++) {
        const multiplier = m > 1 ? t("game.multiplier", { m }) : "";
        this.setStatus(`${t("game.sequenceSpin", { label, i: i + 1, n: n() })}${multiplier}`, "feature");
        this.showValues({ "sequence.played": i + 1, "sequence.remaining": n() - i - 1 }, mode, turbo);
        addWin(await this.present(sequence().spins[i]!, turbo, undefined, async () => (await settle(`extra:${s}:${i}`)).extra[s]!.spins[i]!));
      }
      await settle(`extra:${s}:end`);
      await this.playUi(sequence().endUi, turbo);
    }

    const final = round();
    const bonus = final.freeSpins !== null || final.extra.length > 0;
    const won = final.totalWin * bet;
    // A fine bonus la schermata riassume quanto ha reso, se è una vincita grande.
    if (bonus) await this.celebrate(final.totalWin - final.base.win, turbo);
    this.balance += won;
    this.saveBalance();
    this.stats.record(this.module.manifest.id, bet, won, bonus);
    this.ui.win.textContent = money(won);
    // Finito il bonus si torna al gioco base: gli elementi dei bonus si nascondono.
    this.showValues({ "win.round": won }, "base", turbo);
    if (final.capped) this.setStatus(t("game.capped", { money: money(won) }), "win");
    else if (bonus) this.setStatus(t("game.bonusEnd", { money: money(won - final.base.win * bet) }), "win");
    else if (won > 0) this.setStatus(t("game.won", { money: money(won) }), "win");
    else this.setStatus(t("game.noWin"));
  }

  destroy(): void {
    this.view.destroy();
  }
}

/**
 * Punto del round in cui il motore si è fermato per una scelta: lo spin
 * ("base", "free:3", "extra:0:2") o la fine di una feature ("free:end",
 * "extra:0:end"). Nel round parziale è sempre l'ultimo elemento giocato.
 */
function stopAt({ round, choice }: RoundAttempt): string | null {
  if (!choice) return null;
  const end = choice.at === "featureEnd";
  if (round.extra.length > 0) {
    const s = round.extra.length - 1;
    return end ? `extra:${s}:end` : `extra:${s}:${round.extra[s]!.spins.length - 1}`;
  }
  if (round.freeSpins) return end ? "free:end" : `free:${round.freeSpins.spins.length - 1}`;
  return "base";
}
