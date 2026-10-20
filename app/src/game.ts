import { playRound } from "../../src/core/engine.js";
import { createRng, type Rng } from "../../src/core/rng.js";
import type { RoundHooks, RoundResult, SpinResult } from "../../src/core/types.js";
import type { SlotModule } from "../../src/module/parse.js";
import { ScriptRuntime } from "../../src/script/runtime.js";
import wasmUri from "wasmoon/dist/glue.wasm?url";
import { wait } from "./anim.js";
import { money, signedMoney, trend } from "./format.js";
import type { ClientModule } from "./modules.js";
import { SlotView } from "./slot-view.js";
import { setMuted, Sounds } from "./sound.js";
import { net, type StatsStore } from "./stats.js";

/** Da questa vincita, in multipli della puntata totale, si sente il suono della vincita grande. */
const BIG_WIN = 20;

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
  private balance = readBalance();
  private betIndex = BET_LEVELS.indexOf(1);
  private busy = false;
  private readonly rng: Rng;
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
  ) {
    this.rng = createRng(seed);
    this.ui.spin.onclick = () => void this.spin();
    this.ui.betDown.onclick = () => this.changeBet(-1);
    this.ui.betUp.onclick = () => this.changeBet(1);
    this.ui.mute.hidden = !sounds.available;
    this.ui.mute.onclick = () => {
      sounds.muted = !sounds.muted;
      setMuted(sounds.muted);
      this.render();
    };
    this.ui.reset.onclick = () => {
      if (this.busy) return;
      this.balance = START_BALANCE;
      saveBalance(this.balance);
      this.render();
    };
    this.render();
  }

  /** Senza seed ne sceglie uno casuale; con lo stesso seed la sequenza dei round si ripete. */
  static async start(host: HTMLElement, { module, assets }: ClientModule, stats: StatsStore, seed?: number | string): Promise<Game> {
    // Lo script si carica prima della vista: se non è valido il modulo non parte.
    const hooks = module.script === null ? undefined : await ScriptRuntime.create(module.math, module.script, { wasmUri });
    const sounds = new Sounds(module.scene, assets);
    const view = await SlotView.create(host, module, assets, () => sounds.play("stop"));
    return new Game(module, view, hooks, stats, sounds, seed ?? crypto.getRandomValues(new Uint32Array(1))[0]!);
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
    this.ui.mute.textContent = this.sounds.muted ? "Audio: no" : "Audio: sì";
    this.ui.mute.setAttribute("aria-pressed", String(!this.sounds.muted));
    const { session, total } = this.stats.get(this.module.manifest.id);
    for (const [el, s] of [[this.ui.netSession, session], [this.ui.netTotal, total]] as const) {
      el.textContent = signedMoney(net(s));
      el.className = `net ${trend(net(s))}`.trim();
    }
  }

  private setStatus(text: string, tone: "" | "win" | "feature" = ""): void {
    this.ui.status.textContent = text;
    this.ui.status.className = `status ${tone}`.trim();
  }

  /** Gioca uno spin già deciso dal motore: rulli, trasformazioni, vincite. */
  /** Mostra uno spin; `onRevealed` viene chiamata quando griglia ed espansioni sono visibili, prima delle vincite. */
  private async present(spin: SpinResult, turbo: boolean, onRevealed?: () => void): Promise<number> {
    this.sounds.play("spin");
    await this.view.spin(spin.reelGrid, turbo);
    if (spin.grid.some((column, reel) => column.some((s, row) => s !== spin.reelGrid[reel]![row]))) {
      await this.view.reveal(spin.reelGrid, spin.grid, turbo);
    }
    onRevealed?.();
    const credits = spin.win * this.bet;
    if (credits > 0) {
      this.sounds.play(spin.win >= BIG_WIN ? "bigWin" : "win");
      const multiplier = spin.multiplier > 1 ? ` (×${spin.multiplier})` : "";
      this.view.showWins(spin.lineWins, spin.scatterWin, spin.reelGrid, `${money(credits)}${multiplier}`);
      await wait(turbo ? 450 : 1100);
    }
    return credits;
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

    // L'esito dell'intero round è deciso qui; da ora in poi è solo presentazione.
    let round: RoundResult;
    try {
      round = playRound(this.module.math, this.rng, this.hooks);
    } catch (err) {
      console.error(err);
      this.balance += bet;
      this.setStatus(`Round annullato, errore del modulo: ${(err as Error).message}`);
      this.busy = false;
      this.render();
      return;
    }
    let shown = await this.present(round.base, turbo);
    this.ui.win.textContent = money(shown);

    const free = round.freeSpins;
    if (free) {
      this.setStatus(`${free.initial} free spin!`, "feature");
      this.sounds.play("feature");
      await wait(turbo ? 600 : 1500);
      const ladder = this.module.math.freeSpins?.upgradeLadder ?? [];
      for (let i = 0; i < free.spins.length; i++) {
        const spin = free.spins[i]!;
        const total = i === 0 ? free.initial : free.awardedAfter[i - 1]!;
        const label = (id: string) => this.module.scene.symbols.get(id)?.label ?? id;
        const level =
          spin.upgradeLevel > 0
            ? ` · upgrade: ${ladder.slice(0, spin.upgradeLevel).map(label).join(", ")} → ${label(ladder[spin.upgradeLevel]!)}`
            : "";
        // Prima dello spin si vede il moltiplicatore già raggiunto: quello nuovo arriva con i wild di questo spin.
        const status = (m: number) => `Free spin ${i + 1} di ${total}${m > 1 ? ` · moltiplicatore ×${m}` : ""}${level}`;
        const before = i === 0 ? 1 : free.spins[i - 1]!.multiplier;
        this.setStatus(status(before), "feature");
        shown += await this.present(spin, turbo, () => {
          if (spin.multiplier !== before) this.setStatus(status(spin.multiplier), "feature");
        });
        this.ui.win.textContent = money(Math.min(shown, round.totalWin * bet));
      }
    }

    for (const sequence of round.extra) {
      const label = this.module.scene.modes.get(sequence.mode)?.label ?? `Giri ${sequence.mode}`;
      const intro = sequence.multiplier > 1 ? `, con moltiplicatore ×${sequence.multiplier}` : "";
      this.setStatus(`${sequence.spins.length} × ${label}${intro}!`, "feature");
      this.sounds.play("feature");
      await wait(turbo ? 600 : 1500);
      for (let i = 0; i < sequence.spins.length; i++) {
        const multiplier = sequence.multiplier > 1 ? ` · moltiplicatore ×${sequence.multiplier}` : "";
        this.setStatus(`${label} ${i + 1} di ${sequence.spins.length}${multiplier}`, "feature");
        shown += await this.present(sequence.spins[i]!, turbo);
        this.ui.win.textContent = money(Math.min(shown, round.totalWin * bet));
      }
    }

    const won = round.totalWin * bet;
    this.balance += won;
    saveBalance(this.balance);
    this.stats.record(this.module.manifest.id, bet, won, free !== null || round.extra.length > 0);
    this.ui.win.textContent = money(won);
    if (round.capped) this.setStatus(`Vincita massima raggiunta: ${money(won)}`, "win");
    else if (free || round.extra.length > 0) this.setStatus(`Bonus finito: vinti ${money(won - round.base.win * bet)}`, "win");
    else if (won > 0) this.setStatus(`Hai vinto ${money(won)}`, "win");
    else this.setStatus("Nessuna vincita");
    this.busy = false;
    this.render();
  }

  destroy(): void {
    this.view.destroy();
  }
}
