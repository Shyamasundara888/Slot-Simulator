type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | ((event: Event) => void)>;

/**
 * Crea un elemento: gli attributi che iniziano con "on" diventano listener,
 * `true` aggiunge un attributo vuoto, `false`, null e undefined lo omettono.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (typeof value === "function") el.addEventListener(name.slice(2), value);
    else if (value === true) el.setAttribute(name, "");
    else if (value !== false && value !== null && value !== undefined) {
      if (name === "value") {
        (el as HTMLInputElement).value = String(value);
        // Il valore già salvato nella bozza: serve a capire se il campo ha modifiche in sospeso.
        el.dataset.saved = String(value);
      }
      else el.setAttribute(name, String(value));
    }
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

/** Numero da un campo: vuoto diventa null. */
export function numberValue(input: HTMLInputElement): number | null {
  if (input.value.trim() === "") return null;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : null;
}
