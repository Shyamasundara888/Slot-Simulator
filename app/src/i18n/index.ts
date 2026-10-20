import { en } from "./en.js";
import { it } from "./it.js";

/**
 * Testi dell'interfaccia in più lingue. Ogni lingua è un file con le stesse
 * chiavi di it.ts: il controllo dei tipi segnala le chiavi mancanti. I testi
 * scritti dai moduli (nomi, etichette, descrizioni) e i messaggi d'errore del
 * motore restano come sono.
 */
export type Key = keyof typeof it;
export type Dictionary = Readonly<Record<Key, string>>;

export const LANGUAGES = {
  it: { name: "Italiano", locale: "it-IT", dictionary: it },
  en: { name: "English", locale: "en-GB", dictionary: en },
} as const satisfies Record<string, { name: string; locale: string; dictionary: Dictionary }>;
export type Language = keyof typeof LANGUAGES;

const STORAGE_KEY = "slot-simulator:language";
const isLanguage = (value: unknown): value is Language => typeof value === "string" && value in LANGUAGES;

/** Lingua scelta: ?lang=, poi quella salvata, poi quella del browser; altrimenti italiano. */
function detect(): Language {
  const fromUrl = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("lang");
  if (isLanguage(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(saved)) return saved;
  } catch {
    // Senza storage vale la lingua del browser.
  }
  const browser = typeof navigator === "undefined" ? "" : navigator.language.slice(0, 2);
  return isLanguage(browser) ? browser : "it";
}

export const language: Language = detect();
export const locale: string = LANGUAGES[language].locale;
const dictionary: Dictionary = LANGUAGES[language].dictionary;

/** Salva la lingua e ricarica la pagina, così tutti i testi cambiano insieme. */
export function setLanguage(next: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Senza storage la scelta vale solo tramite ?lang=.
  }
  const url = new URL(location.href);
  url.searchParams.delete("lang");
  if (next !== language) url.searchParams.set("lang", next);
  location.assign(url);
}

/** Testo della chiave, con i segnaposto {nome} sostituiti dai parametri. */
export function t(key: Key, params: Readonly<Record<string, string | number>> = {}): string {
  return dictionary[key].replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : typeof value === "number" ? value.toLocaleString(locale) : value;
  });
}

/** Elenco con virgole e la congiunzione della lingua prima dell'ultimo elemento. */
export function listText(items: readonly string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")}${t("list.and")}${items.at(-1)}` : (items[0] ?? "");
}

/**
 * Traduce i testi fissi della pagina: data-i18n per il testo, data-i18n-title
 * e data-i18n-label per gli attributi title e aria-label.
 */
export function translatePage(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = t(el.dataset.i18n as Key);
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-title]")) el.title = t(el.dataset.i18nTitle as Key);
  for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-label]")) el.setAttribute("aria-label", t(el.dataset.i18nLabel as Key));
  document.documentElement.lang = language;
}
