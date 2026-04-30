// IndexedDB — five stores, one DB.
//
//   `drafts`      keyed by `<shipId>/<filename>` — offline fallback for saves
//                 that couldn't reach the network drive. Mirrored from the
//                 in-memory draft map in VoyageStoreProvider; re-hydrated on
//                 startup and flushed on the next successful save.
//
//   `handles`     keyed by shipId — persisted FileSystemDirectoryHandle for
//                 each ship's network folder. Lets us skip the folder-picker
//                 on every tab reload; re-permissioning is a silent call on
//                 Chromium when the same handle is requested on same-origin.
//
//   `session`     keyed by 'current' — last picked ship + user name + role, so
//                 a tab refresh restores the session without making the user
//                 re-type their name. editMode is NOT persisted — always starts
//                 false on reload (accident-prevention default).
//
//   `customPorts` keyed by shipId — ports typed into the New Voyage modal
//                 that weren't in the shipped UN/LOCODE catalog. Lets the
//                 autocomplete remember obscure ports across sessions without
//                 requiring a catalog rebuild + redeploy.
//
//   `shipSettings` keyed by shipId — per-ship overrides the crew can tweak
//                 from Settings (currently: default fuel densities). Applied
//                 at voyage creation on top of the shipClass baseline.

import type { FuelKey, PortRef, Voyage } from '../types/domain';
import type { EditorRole } from '../domain/constants';

const DB_NAME = 'VoyageTrackerV7';
const DB_VERSION = 5;
const STORE_DRAFTS = 'drafts';
const STORE_HANDLES = 'handles';
const STORE_SESSION = 'session';
const STORE_CUSTOM_PORTS = 'customPorts';
const STORE_SHIP_SETTINGS = 'shipSettings';

export interface SessionRecord {
  shipId?: string | null;
  classId?: string | null;
  userName?: string;
  role?: EditorRole | string | null;
}

export interface DraftRecord {
  key: string;
  shipId: string;
  filename: string;
  voyage: Voyage;
  updatedAt: number;
}

export interface DirHandleRecord {
  shipId: string;
  handle: FileSystemDirectoryHandle;
  updatedAt: number;
}

export interface ShipSettings {
  // Per-ship overrides for the ship class's baseline fuel densities. Applied
  // at voyage creation time on top of the class baseline. The key matches
  // what's persisted on disk in IDB.
  defaultDensities?: Partial<Record<FuelKey, number>>;
  [key: string]: unknown;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.reject(new Error('IndexedDB not available'));
    return dbPromise;
  }
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // v1 → v2: `handles` store added.
      // v2 → v3: `session` store added. `drafts` keeps its shape throughout.
      // v3 → v4: `customPorts` store added.
      // v4 → v5: `shipSettings` store added (per-ship density overrides).
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES, { keyPath: 'shipId' });
      }
      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        db.createObjectStore(STORE_SESSION, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CUSTOM_PORTS)) {
        db.createObjectStore(STORE_CUSTOM_PORTS, { keyPath: 'shipId' });
      }
      if (!db.objectStoreNames.contains(STORE_SHIP_SETTINGS)) {
        db.createObjectStore(STORE_SHIP_SETTINGS, { keyPath: 'shipId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'));
  });
  return dbPromise;
}

function tx(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
  return openDb().then((db) => {
    const t = db.transaction(storeName, mode);
    return t.objectStore(storeName);
  });
}

const keyOf = (shipId: string, filename: string): string => `${shipId}/${filename}`;

function awaitRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Drafts (offline fallback) ────────────────────────────────────────────

export async function putDraft(shipId: string, filename: string, voyage: Voyage): Promise<void> {
  const store = await tx(STORE_DRAFTS, 'readwrite');
  await awaitRequest(
    store.put({
      key: keyOf(shipId, filename),
      shipId,
      filename,
      voyage,
      updatedAt: Date.now(),
    }),
  );
}

export async function deleteDraft(shipId: string, filename: string): Promise<void> {
  const store = await tx(STORE_DRAFTS, 'readwrite');
  await awaitRequest(store.delete(keyOf(shipId, filename)));
}

export async function listDraftsForShip(shipId: string): Promise<DraftRecord[]> {
  const store = await tx(STORE_DRAFTS);
  return new Promise<DraftRecord[]>((resolve, reject) => {
    const out: DraftRecord[] = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(out);
      const value = cur.value as DraftRecord;
      if (value?.shipId === shipId) out.push(value);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function clearAll(): Promise<void> {
  for (const storeName of [
    STORE_DRAFTS,
    STORE_HANDLES,
    STORE_SESSION,
    STORE_CUSTOM_PORTS,
    STORE_SHIP_SETTINGS,
  ]) {
    const store = await tx(storeName, 'readwrite');
    await awaitRequest(store.clear());
  }
}

// Best-effort wrappers — never let IDB hiccups break a save.
export async function safePutDraft(shipId: string, filename: string, voyage: Voyage): Promise<void> {
  try {
    await putDraft(shipId, filename, voyage);
  } catch (e) {
    console.warn('[idb] putDraft failed', e);
  }
}
export async function safeDeleteDraft(shipId: string, filename: string): Promise<void> {
  try {
    await deleteDraft(shipId, filename);
  } catch (e) {
    console.warn('[idb] deleteDraft failed', e);
  }
}

// ── Directory handles (persist `showDirectoryPicker` result per ship) ────
// FileSystemDirectoryHandle is structured-cloneable on Chromium, so IDB can
// store it verbatim. Permission state does NOT persist — callers must still
// call `handle.requestPermission()` on each app launch.

export async function putDirHandle(
  shipId: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const store = await tx(STORE_HANDLES, 'readwrite');
  await awaitRequest(store.put({ shipId, handle, updatedAt: Date.now() }));
}

export async function getDirHandle(shipId: string): Promise<FileSystemDirectoryHandle | null> {
  const store = await tx(STORE_HANDLES);
  const req = store.get(shipId);
  const row = (await awaitRequest(req)) as DirHandleRecord | undefined;
  return row?.handle ?? null;
}

export async function deleteDirHandle(shipId: string): Promise<void> {
  const store = await tx(STORE_HANDLES, 'readwrite');
  await awaitRequest(store.delete(shipId));
}

export async function listDirHandles(): Promise<DirHandleRecord[]> {
  const store = await tx(STORE_HANDLES);
  return new Promise<DirHandleRecord[]>((resolve, reject) => {
    const out: DirHandleRecord[] = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return resolve(out);
      const value = cur.value as DirHandleRecord;
      out.push({ shipId: value.shipId, handle: value.handle, updatedAt: value.updatedAt });
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

// ── Session (ship + user name + role) ────────────────────────────────────
// Single row with id='current'. Restored on app mount so a tab refresh
// doesn't force re-picking the ship and re-typing the user's name.

const SESSION_ID = 'current';

export async function putSession(session: SessionRecord): Promise<void> {
  const store = await tx(STORE_SESSION, 'readwrite');
  await awaitRequest(store.put({ id: SESSION_ID, ...session, updatedAt: Date.now() }));
}

export async function getSession(): Promise<SessionRecord | null> {
  const store = await tx(STORE_SESSION);
  const req = store.get(SESSION_ID);
  const row = (await awaitRequest(req)) as
    | (SessionRecord & { id: string; updatedAt: number })
    | undefined;
  if (!row) return null;
  // Strip internal fields before returning to caller.
  const { id: _id, updatedAt: _updatedAt, ...rest } = row;
  void _id;
  void _updatedAt;
  return rest;
}

export async function clearSession(): Promise<void> {
  const store = await tx(STORE_SESSION, 'readwrite');
  await awaitRequest(store.delete(SESSION_ID));
}

// ── Custom ports (per-ship user additions outside the shipped catalog) ───

export async function getCustomPorts(shipId: string): Promise<PortRef[]> {
  if (!shipId) return [];
  const store = await tx(STORE_CUSTOM_PORTS);
  const req = store.get(shipId);
  const row = (await awaitRequest(req)) as { ports?: PortRef[] } | undefined;
  return row?.ports ?? [];
}

export async function addCustomPort(shipId: string, port: Partial<PortRef>): Promise<void> {
  if (!shipId || !port?.code) return;
  const existing = await getCustomPorts(shipId);
  const upper = port.code.toUpperCase();
  // De-dup by code; newer wins on conflict.
  const next: PortRef[] = [
    ...existing.filter((p) => p.code !== upper),
    {
      code: upper,
      name: port.name || '',
      country: (port.country || '').toUpperCase(),
      locode: port.locode || '',
    },
  ];
  const store = await tx(STORE_CUSTOM_PORTS, 'readwrite');
  await awaitRequest(store.put({ shipId, ports: next, updatedAt: Date.now() }));
}

// ── Ship settings (per-ship overrides edited from Settings) ──────────────

export async function getShipSettings(shipId: string): Promise<ShipSettings> {
  if (!shipId) return {};
  const store = await tx(STORE_SHIP_SETTINGS);
  const req = store.get(shipId);
  const row = (await awaitRequest(req)) as
    | (ShipSettings & { shipId: string; updatedAt: number })
    | undefined;
  if (!row) return {};
  const { shipId: _s, updatedAt: _u, ...rest } = row;
  void _s;
  void _u;
  return rest;
}

// Shallow-merges `patch` onto the existing settings row so callers can
// update one field at a time without round-tripping the whole object.
export async function putShipSettings(shipId: string, patch: ShipSettings): Promise<void> {
  if (!shipId) return;
  const current = await getShipSettings(shipId);
  const next = { ...current, ...patch };
  const store = await tx(STORE_SHIP_SETTINGS, 'readwrite');
  await awaitRequest(store.put({ shipId, ...next, updatedAt: Date.now() }));
}
