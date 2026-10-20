import { money, signedMoney, trend } from "./format.js";
import { locale, t } from "./i18n/index.js";

/** Statistiche di gioco per slot, divise tra sessione corrente e totale. */
export interface SlotStats {
  rounds: number;
  /** Crediti puntati. */
  wagered: number;
  /** Crediti vinti. */
  won: number;
  /** Round in cui sono partiti free spin o sequenze degli script. */
  bonuses: number;
  /** Vincita più alta di un round, in crediti, e lo stesso valore in multipli della puntata. */
  biggestWin: number;
  biggestMultiplier: number;
}

type Table = Record<string, SlotStats>;

const TOTAL_KEY = "slot-simulator:stats";
// La sessione dura quanto la scheda del browser: sopravvive a un ricaricamento, non a una scheda nuova.
const SESSION_KEY = "slot-simulator:session-stats";

const empty = (): SlotStats => ({ rounds: 0, wagered: 0, won: 0, bonuses: 0, biggestWin: 0, biggestMultiplier: 0 });
const cents = (x: number) => Math.round(x * 100) / 100;

function read(storage: () => Storage, key: string): Table {
  try {
    const raw: unknown = JSON.parse(storage().getItem(key) ?? "{}");
    if (typeof raw !== "object" || raw === null) return {};
    const table: Table = {};
    for (const [id, value] of Object.entries(raw)) {
      const stats = empty();
      for (const field of Object.keys(stats) as (keyof SlotStats)[]) {
        const n = (value as Record<string, unknown>)?.[field];
        if (typeof n === "number" && Number.isFinite(n)) stats[field] = n;
      }
      table[id] = stats;
    }
    return table;
  } catch {
    return {};
  }
}

function write(storage: () => Storage, key: string, table: Table): void {
  try {
    storage().setItem(key, JSON.stringify(table));
  } catch {
    // Senza storage le statistiche valgono solo finché la pagina resta aperta.
  }
}

export class StatsStore {
  private total: Table;
  private session: Table;

  /** Con `persist` a false le statistiche restano in memoria: serve all'anteprima dell'editor. */
  constructor(private readonly persist = true) {
    this.total = persist ? read(() => localStorage, TOTAL_KEY) : {};
    this.session = persist ? read(() => sessionStorage, SESSION_KEY) : {};
  }

  private save(): void {
    if (!this.persist) return;
    write(() => sessionStorage, SESSION_KEY, this.session);
    write(() => localStorage, TOTAL_KEY, this.total);
  }

  get(slot: string): { session: SlotStats; total: SlotStats } {
    return { session: this.session[slot] ?? empty(), total: this.total[slot] ?? empty() };
  }

  /** Slot con almeno un round giocato, nell'ordine in cui compaiono per la prima volta. */
  slots(): string[] {
    return Object.keys(this.total).filter((id) => this.total[id]!.rounds > 0);
  }

  record(slot: string, bet: number, won: number, bonus: boolean): void {
    for (const table of [this.session, this.total]) {
      const s = (table[slot] ??= empty());
      s.rounds++;
      s.wagered = cents(s.wagered + bet);
      s.won = cents(s.won + won);
      if (bonus) s.bonuses++;
      if (won > s.biggestWin) {
        s.biggestWin = cents(won);
        s.biggestMultiplier = cents(won / bet);
      }
    }
    this.save();
  }

  reset(): void {
    this.session = {};
    this.total = {};
    this.save();
  }
}

/** Bilancio del giocatore: vinto meno puntato. */
export const net = (s: SlotStats) => cents(s.won - s.wagered);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Tabella delle statistiche: la slot corrente in dettaglio, poi il riepilogo di tutte. */
export function statsHtml(store: StatsStore, current: { id: string; name: string }, names: ReadonlyMap<string, string>): string {
  const { session, total } = store.get(current.id);
  const rtp = (s: SlotStats) => (s.wagered > 0 ? `${((s.won / s.wagered) * 100).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "–");
  const biggest = (s: SlotStats) =>
    s.biggestWin > 0 ? `${money(s.biggestWin)} <small>(${s.biggestMultiplier.toLocaleString(locale)}×)</small>` : "–";
  const balance = (s: SlotStats) => `<td class="${trend(net(s))}">${signedMoney(net(s))}</td>`;
  const row = (label: string, f: (s: SlotStats) => string) => `<tr><td>${label}</td><td>${f(session)}</td><td>${f(total)}</td></tr>`;

  const parts = [
    `<h3>${esc(current.name)}</h3>`,
    `<table><thead><tr><th></th><th>${t("stats.session")}</th><th>${t("stats.total")}</th></tr></thead><tbody>`,
    row(t("stats.rounds"), (s) => s.rounds.toLocaleString(locale)),
    row(t("stats.wagered"), (s) => money(s.wagered)),
    row(t("stats.won"), (s) => money(s.won)),
    `<tr><td>${t("stats.net")}</td>${balance(session)}${balance(total)}</tr>`,
    row(t("stats.biggest"), biggest),
    row(t("stats.bonuses"), (s) => s.bonuses.toLocaleString(locale)),
    row(t("stats.observed"), rtp),
    `</tbody></table>`,
  ];

  const slots = store.slots();
  if (slots.length > 0) {
    parts.push(
      `<h3>${t("stats.allSlots")}</h3>`,
      `<table><thead><tr><th>${t("stats.slot")}</th><th>${t("stats.roundsShort")}</th><th>${t("ui.netSession")}</th><th>${t("ui.netTotal")}</th><th>${t("stats.biggest")}</th></tr></thead><tbody>`,
      ...slots.map((id) => {
        const s = store.get(id);
        return `<tr><td>${esc(names.get(id) ?? id)}</td><td>${s.total.rounds.toLocaleString(locale)}</td>${balance(s.session)}${balance(s.total)}<td>${biggest(s.total)}</td></tr>`;
      }),
      (() => {
        const sum = (pick: "session" | "total") =>
          slots.map((id) => store.get(id)[pick]).reduce((a, b) => ({ ...a, wagered: a.wagered + b.wagered, won: a.won + b.won }), empty());
        const rounds = slots.reduce((n, id) => n + store.get(id).total.rounds, 0);
        return `<tr><th>${t("stats.total")}</th><th>${rounds.toLocaleString(locale)}</th>${balance(sum("session"))}${balance(sum("total"))}<th></th></tr>`;
      })(),
      `</tbody></table>`,
    );
  }
  parts.push(
    `<ul><li>${t("stats.noteNet")}</li>`,
    `<li>${t("stats.noteStorage")}</li></ul>`,
  );
  return parts.join("");
}
