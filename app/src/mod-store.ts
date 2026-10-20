/** Mod importati dal browser, salvati come zip in IndexedDB, e bozze dell'editor. */
import type { ModuleDraft } from "../../src/edit/draft.js";

const DB = "slot-simulator";
const STORE = "mods";
const DRAFTS = "drafts";

export interface StoredMod {
  id: string;
  zip: Uint8Array;
}

/** Bozza dell'editor, salvata a ogni modifica. `key` indica da dove parte: una slot o una slot nuova. */
export interface StoredDraft {
  key: string;
  draft: ModuleDraft;
  assets: Record<string, Uint8Array>;
  /** Istante del salvataggio, in millisecondi. */
  saved: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>, name = STORE): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = action(db.transaction(name, mode).objectStore(name));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Tutti i mod salvati; senza IndexedDB (per esempio in navigazione privata) nessuno. */
export async function listMods(): Promise<StoredMod[]> {
  try {
    return await run("readonly", (store) => store.getAll() as IDBRequest<StoredMod[]>);
  } catch (err) {
    console.warn("Mod salvati non disponibili:", err);
    return [];
  }
}

export const saveMod = (mod: StoredMod) => run("readwrite", (store) => store.put(mod)).then(() => undefined);
export const deleteMod = (id: string) => run("readwrite", (store) => store.delete(id)).then(() => undefined);

/** La bozza salvata per `key`, se c'è; senza IndexedDB nessuna. */
export async function loadDraft(key: string): Promise<StoredDraft | undefined> {
  try {
    return await run("readonly", (store) => store.get(key) as IDBRequest<StoredDraft | undefined>, DRAFTS);
  } catch (err) {
    console.warn("Bozze non disponibili:", err);
    return undefined;
  }
}

export const saveDraft = (draft: StoredDraft) => run("readwrite", (store) => store.put(draft), DRAFTS).then(() => undefined);
export const deleteDraft = (key: string) => run("readwrite", (store) => store.delete(key), DRAFTS).then(() => undefined);
