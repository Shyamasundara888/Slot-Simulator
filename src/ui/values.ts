import { UI_VALUES, type UiValue } from "../module/schema.js";

/**
 * Valori che gli elementi di interfaccia mostrano, aggiornati dal client
 * mentre mette in scena un round già deciso dal motore. Le vincite e la
 * puntata sono in crediti, gli altri valori sono numeri puri.
 */
export type UiValues = Record<UiValue, number>;

/** Valori mostrati in crediti, quindi con il formato della valuta. */
export const MONEY_VALUES: ReadonlySet<UiValue> = new Set(["win.spin", "win.feature", "win.round", "bet"]);

const KNOWN: ReadonlySet<string> = new Set(UI_VALUES);

/** Valori all'inizio di un round: niente free spin, moltiplicatore ×1, nessuna vincita. */
export function initialValues(bet: number, maxWin: number): UiValues {
  const values = Object.fromEntries(UI_VALUES.map((key) => [key, 0])) as UiValues;
  values.multiplier = 1;
  values.bet = bet;
  values.maxWin = Number.isFinite(maxWin) ? maxWin : 0;
  return values;
}

/** Nomi tra graffe in un testo, come "value" e "free.total" in "{value} / {free.total}". */
export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]!);
}

/** Segnaposto che un testo non può usare: `value` vale solo per gli elementi collegati a un valore. */
export function unknownPlaceholders(template: string, hasValue: boolean): string[] {
  return placeholders(template).filter((name) => !(KNOWN.has(name) || (hasValue && name === "value")));
}

/**
 * Sostituisce i segnaposto con i valori; `own` è il valore dell'elemento
 * (per {value}), `show` scrive un valore come testo.
 */
export function formatTemplate(
  template: string,
  values: UiValues,
  own: UiValue | null,
  show: (key: UiValue, value: number) => string,
): string {
  return template.replace(/\{([^{}]+)\}/g, (whole, name: string) => {
    const key = name === "value" ? own : KNOWN.has(name) ? (name as UiValue) : null;
    return key === null ? whole : show(key, values[key]);
  });
}

/**
 * Gradino acceso di una scala. Se tutti i gradini sono numeri si accende
 * l'ultimo non oltre il valore (×1 ×2 ×5 ×10 con moltiplicatore 7 accende
 * ×5), altrimenti quello in posizione `value`, da 0. -1 se nessuno.
 */
export function ladderIndex(steps: readonly string[], value: number): number {
  const numbers = steps.map((step) => Number(step.replace(/^[x×]/i, "")));
  if (numbers.every((n) => Number.isFinite(n))) {
    let index = -1;
    numbers.forEach((n, i) => {
      if (n <= value) index = i;
    });
    return index;
  }
  return Math.max(-1, Math.min(steps.length - 1, Math.floor(value)));
}
