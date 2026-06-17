// CRUD for the per-ship shared settings file (`_settings.json`) on the ship
// network folder. Mirrors voyages.ts: handle lookup, JSON read, mtime
// stale-file check, atomic write via createWritable. See the design spec
// 2026-06-17-shared-ship-settings-design.md and CLAUDE.md §3/§4.

import { getHandleForShip } from './fsHandle';
import { StaleFileError } from './errors';
import type { FuelKey, ReconcileTolerances } from '../../types/domain';

export const SETTINGS_FILENAME = '_settings.json';

export interface ShipSettingsData {
  defaultDensities?: Partial<Record<FuelKey, number>>;
  reconcileTolerances?: ReconcileTolerances;
  // Added by stampLoggedBy at save time — never set by the editor directly.
  loggedBy?: { name: string; role: string | null; at: string };
}

async function tryGetFileHandle(
  dir: FileSystemDirectoryHandle,
): Promise<FileSystemFileHandle | null> {
  try {
    return await dir.getFileHandle(SETTINGS_FILENAME);
  } catch (e) {
    if ((e as DOMException).name === 'NotFoundError') return null;
    throw e;
  }
}

/**
 * Read the shared settings file. Returns `{ settings, mtime }`, or `null` when
 * the file does not exist yet. Throws on a genuinely unreachable directory —
 * the adapter wrapper turns that into a class-default fallback.
 */
export async function loadSettingsFile(
  shipId: string,
): Promise<{ settings: ShipSettingsData; mtime: number } | null> {
  const dir = await getHandleForShip(shipId);
  const fh = await tryGetFileHandle(dir);
  if (!fh) return null;
  const file = await fh.getFile();
  const text = await file.text();
  let settings: ShipSettingsData;
  try {
    settings = text.trim() ? (JSON.parse(text) as ShipSettingsData) : {};
  } catch (e) {
    throw new Error(`Invalid JSON in ${SETTINGS_FILENAME}: ${(e as Error).message}`);
  }
  return { settings, mtime: file.lastModified };
}

/**
 * Write the shared settings file. If `prevMtime` is non-null and the on-disk
 * file is newer, throw StaleFileError so the UI can offer Reload / Overwrite.
 * Returns the new mtime.
 */
export async function saveSettingsFile(
  shipId: string,
  settings: ShipSettingsData,
  prevMtime: number | null = null,
): Promise<{ mtime: number }> {
  const dir = await getHandleForShip(shipId);

  const existing = await tryGetFileHandle(dir);
  if (existing) {
    const f = await existing.getFile();
    let current: unknown = null;
    try {
      current = JSON.parse(await f.text());
    } catch {
      /* ignore parse */
    }
    if (prevMtime == null) {
      // Caller thinks this is a brand-new file, but one already exists on
      // disk — refuse to silently clobber it (mirrors saveVoyage pattern).
      // `currentVoyage` is the shared StaleFileError field reused here to
      // carry the current on-disk settings (the field is typed `unknown`).
      throw new StaleFileError(`Settings file already exists`, {
        loadedMtime: null,
        currentMtime: f.lastModified,
        currentVoyage: current, // carries current on-disk settings
      });
    }
    if (f.lastModified > prevMtime) {
      // `currentVoyage` is the shared StaleFileError field reused here to
      // carry the current on-disk settings (the field is typed `unknown`).
      throw new StaleFileError(`Settings changed on disk since load`, {
        loadedMtime: prevMtime,
        currentMtime: f.lastModified,
        currentVoyage: current, // carries current on-disk settings
      });
    }
  }

  const fh = existing || (await dir.getFileHandle(SETTINGS_FILENAME, { create: true }));
  const writable = await fh.createWritable();
  try {
    await writable.write(JSON.stringify(settings, null, 2) + '\n');
  } finally {
    await writable.close();
  }
  const f = await fh.getFile();
  return { mtime: f.lastModified };
}
