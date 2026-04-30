// CRUD against a per-ship network folder via the File System Access API.
// Implements the storage adapter contract defined in ../adapter so the
// rest of the app depends on the interface, not the backend.
//
// Concurrency semantics: mtime-based stale-file check on saveVoyage. The
// caller passes the mtime it remembered at load time; if the on-disk mtime
// is newer we throw StaleFileError for the UI to resolve. See CLAUDE.md
// §3 ("Stale-file check") for the rationale.

import { NotFoundError } from '../adapter';
import { getHandleForShip } from './fsHandle';
import { StaleFileError } from './errors';
import { ensureSafeFilename } from './safeFilename';
import type { PortRef, Voyage, VoyageManifestEntry } from '../../types/domain';
import { createLogger } from '../../util/log';

const log = createLogger('local/voyages');

// Filename safety lives in ./safeFilename.ts — re-export so existing imports
// (used by tests and a couple of helpers) keep working without a churn pass.
export { ensureSafeFilename };

// ── Small helpers ────────────────────────────────────────────────────────

async function tryGetFileHandle(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  { create = false }: { create?: boolean } = {},
): Promise<FileSystemFileHandle | null> {
  try {
    return await dirHandle.getFileHandle(filename, { create });
  } catch (e) {
    if ((e as DOMException).name === 'NotFoundError') return null;
    throw e;
  }
}

async function readJson(
  fileHandle: FileSystemFileHandle,
): Promise<{ voyage: Voyage; mtime: number }> {
  const file = await fileHandle.getFile();
  const text = await file.text();
  let voyage: unknown;
  try {
    voyage = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON in ${fileHandle.name}: ${(e as Error).message}`);
  }
  return {
    voyage: normalizeVoyageFromFilename(voyage, fileHandle.name) as Voyage,
    mtime: file.lastModified,
  };
}

// ── Defensive normalization on read ──────────────────────────────────────
//
// Voyage files in the wild sometimes have missing or malformed fromPort /
// toPort objects — imported from v6 (where they were bare strings),
// rescued from backups, or hand-edited. The v7 filename format encodes
// the 3-letter port codes per CLAUDE.md §3, so we can always reconstruct
// enough to render the route label in the tree. This doesn't touch the
// on-disk file; the normalized object is written back the next time the
// user saves the voyage.

export function parsePortsFromFilename(
  filename: string | null | undefined,
): { from: string; to: string } | null {
  if (!filename || typeof filename !== 'string') return null;
  const base = filename.replace(/\.json$/i, '');
  const parts = base.split('_');
  if (parts.length < 3) return null;
  // Ports segment is the LAST underscore-separated part. Handles odd
  // ship-code quirks defensively (v7's shipCode is always 2 letters but
  // we don't rely on that here).
  const portsPart = parts[parts.length - 1];
  const bits = portsPart.split('-');
  if (bits.length < 2) return null;
  // Two-part "FROM-TO" is the v7 shape. For defensive handling of v6-era
  // multi-hop filenames ("FROM-MID-TO") we take the first and last bits.
  const from = bits[0];
  const to = bits[bits.length - 1];
  if (!/^[A-Z0-9]{3}$/.test(from) || !/^[A-Z0-9]{3}$/.test(to)) return null;
  return { from, to };
}

export function asPortObject(p: unknown): PortRef {
  if (p && typeof p === 'object') {
    const o = p as Record<string, unknown>;
    return {
      code: typeof o.code === 'string' ? o.code : '',
      name: typeof o.name === 'string' ? o.name : '',
      country: typeof o.country === 'string' ? o.country : '',
      locode: typeof o.locode === 'string' ? o.locode : '',
    };
  }
  if (typeof p === 'string') {
    // v6 legacy: fromPort/toPort were bare code strings.
    return { code: p, name: '', country: '', locode: '' };
  }
  return { code: '', name: '', country: '', locode: '' };
}

export function normalizeVoyageFromFilename(voyage: unknown, filename: string): unknown {
  if (!voyage || typeof voyage !== 'object') return voyage;
  const v = voyage as Record<string, unknown>;
  const parsed = parsePortsFromFilename(filename);
  const fromPort = asPortObject(v.fromPort);
  const toPort = asPortObject(v.toPort);
  if (parsed) {
    if (!fromPort.code) fromPort.code = parsed.from;
    if (!toPort.code) toPort.code = parsed.to;
  }
  return { ...v, fromPort, toPort };
}

async function writeJson(
  fileHandle: FileSystemFileHandle,
  obj: unknown,
): Promise<{ mtime: number }> {
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(JSON.stringify(obj, null, 2) + '\n');
  } finally {
    // Always close — `createWritable` holds an exclusive lock on the file
    // until we do, and Chromium atomically swaps in the temp content on
    // close. If we throw before close, the file on disk is untouched.
    await writable.close();
  }
  // After close, get the new mtime so callers can track it for the next
  // stale-file check.
  const f = await fileHandle.getFile();
  return { mtime: f.lastModified };
}

// ── Operations ───────────────────────────────────────────────────────────

/**
 * List all voyages in this ship's folder.
 *
 * Unlike the github adapter we do NOT consult an `_index.json` — directory
 * listing via the FSA API is cheap on a LAN share and avoids the stale-
 * index problem entirely. We still synthesize a manifest with startDate /
 * ended derived from each file's contents.
 */
export async function listVoyages(shipId: string): Promise<VoyageManifestEntry[]> {
  const dir = await getHandleForShip(shipId);
  const entries: { name: string; handle: FileSystemFileHandle }[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file') continue;
    if (!name.endsWith('.json')) continue;
    if (name === '_index.json') continue;
    entries.push({ name, handle: handle as FileSystemFileHandle });
  }

  const emptyPort: PortRef = { code: '', name: '', country: '', locode: '' };
  const manifest: VoyageManifestEntry[] = [];
  for (const { name, handle } of entries) {
    try {
      const { voyage } = await readJson(handle);
      manifest.push({
        filename: name,
        id: (voyage?.id as number) ?? (name as unknown as number),
        fromPort: voyage?.fromPort ?? emptyPort,
        toPort: voyage?.toPort ?? emptyPort,
        startDate: voyage?.startDate ?? '',
        endDate: voyage?.endDate ?? '',
        ended: !!voyage?.voyageEnd,
      });
    } catch (e) {
      // A single corrupt file shouldn't kill the manifest. Surface it with
      // a placeholder entry so the tree can still list it; load-time errors
      // will re-surface when the user tries to open it.
      log.warn(`Failed to parse ${name}:`, e);
      manifest.push({
        filename: name,
        id: name as unknown as number,
        fromPort: emptyPort,
        toPort: emptyPort,
        startDate: '',
        endDate: '',
        ended: false,
      });
    }
  }

  manifest.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  return manifest;
}

/**
 * Load a voyage. Returns `{ voyage, mtime }` — `mtime` is the number of ms
 * since epoch as reported by `File.lastModified`, used by the caller for
 * the stale-file check on the next save.
 */
export async function loadVoyage(
  shipId: string,
  filename: string,
): Promise<{ voyage: Voyage; mtime: number }> {
  ensureSafeFilename(filename);
  const dir = await getHandleForShip(shipId);
  const fh = await tryGetFileHandle(dir, filename);
  if (!fh) throw new NotFoundError(`Not found: ${filename}`);
  return readJson(fh);
}

/**
 * Save (create or overwrite) a voyage.
 *
 * If `prevMtime` is non-null and the file already exists, we re-check the
 * on-disk `lastModified` and throw StaleFileError if it's newer — the UI
 * then offers the user Reload / Overwrite / Cancel.
 *
 * When throwing StaleFileError we include the current on-disk voyage and
 * mtime so the UI can show what changed without a second round-trip.
 *
 * Returns `{ mtime }` of the just-written file.
 */
export async function saveVoyage(
  shipId: string,
  filename: string,
  voyage: Voyage,
  prevMtime: number | null = null,
): Promise<{ mtime: number }> {
  ensureSafeFilename(filename);
  const dir = await getHandleForShip(shipId);

  const existing = await tryGetFileHandle(dir, filename);
  if (existing) {
    const f = await existing.getFile();
    if (prevMtime == null) {
      // Caller thinks this is a brand-new file, but a file with this name is
      // already on disk — refuse to silently clobber it. Surface as a stale-
      // file conflict so the UI can offer Reload / Overwrite / Cancel.
      let currentVoyage: unknown = null;
      try {
        currentVoyage = JSON.parse(await f.text());
      } catch {
        /* ignore parse */
      }
      throw new StaleFileError(`File already exists: ${filename}`, {
        loadedMtime: null,
        currentMtime: f.lastModified,
        currentVoyage,
      });
    }
    if (f.lastModified > prevMtime) {
      let currentVoyage: unknown = null;
      try {
        currentVoyage = JSON.parse(await f.text());
      } catch {
        /* ignore parse */
      }
      throw new StaleFileError(`File changed on disk since load: ${filename}`, {
        loadedMtime: prevMtime,
        currentMtime: f.lastModified,
        currentVoyage,
      });
    }
  }

  const fh = existing || (await dir.getFileHandle(filename, { create: true }));
  return writeJson(fh, voyage);
}

/**
 * Delete a voyage file. No stale-check — delete is destructive by intent.
 */
export async function deleteVoyage(shipId: string, filename: string): Promise<void> {
  ensureSafeFilename(filename);
  const dir = await getHandleForShip(shipId);
  try {
    await dir.removeEntry(filename);
  } catch (e) {
    if ((e as DOMException).name === 'NotFoundError') {
      throw new NotFoundError(`Not found: ${filename}`);
    }
    throw e;
  }
}

