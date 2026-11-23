/**
 * Keeps your processed history on this device only (IndexedDB), so you don't
 * have to load the Google export again. Every call tolerates storage being
 * unavailable (private windows, blocked site data).
 */
import type { Profile } from "../core/types";

const DB = "incommon";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveProfile(p: Profile): Promise<boolean> {
  try {
    await tx("readwrite", (s) => s.put(p, "profile"));
    return true;
  } catch {
    return false;
  }
}

export async function loadProfile(): Promise<Profile | undefined> {
  try {
    const p = await tx<Profile | undefined>("readonly", (s) => s.get("profile"));
    return p?.version === 1 ? p : undefined;
  } catch {
    return undefined;
  }
}

export async function forgetProfile(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete("profile"));
  } catch {
    /* nothing stored */
  }
}

export function getPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`incommon:${key}`);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function setPref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`incommon:${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function clearPrefs(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("incommon:")) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
