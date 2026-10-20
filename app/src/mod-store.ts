/** Mod importati dal browser, salvati come zip in IndexedDB. */
const DB = "slot-simulator";
const STORE = "mods";

export interface StoredMod {
  id: string;
  zip: Uint8Array;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = action(db.transaction(STORE, mode).objectStore(STORE));
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
