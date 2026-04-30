// Export / import voyage bundles.
//
// A bundle is a JSON file containing every voyage for a single ship. We use it
// for two things:
//   1. Ad-hoc backup / hand-off (Settings → Export).
//   2. One-shot migration from the old GitHub data repo (Settings → Import).
//
// Bundle shape (kept intentionally flat):
//
// {
//   "bundleVersion": 1,
//   "shipId":        "solstice",
//   "exportedAt":    "2026-04-19T12:34:56Z",
//   "appVersion":    "8.0.0",
//   "voyages": [
//     { "filename": "2026-01-15_MIA-NAS-MIA.json", "content": { ...voyage JSON... } },
//     ...
//   ]
// }
//
// Import behaviour is append-only: files whose names already exist in the
// target folder are skipped (listed in the return summary). This keeps v1
// simple; conflict-on-import can be added later if it turns out to be
// needed, but typical usage is importing into an empty folder.
//
// Permissive single-voyage import: if the user picks a plain voyage JSON
// file (no `bundleVersion`, but has a `legs` array) we wrap it on the fly
// as a synthetic one-voyage bundle. This is the common case when a crew
// member hand-copies one voyage file out of the share and then wants to
// import it elsewhere — strict bundle-only validation was hostile for
// what's unambiguously a voyage.

import { getHandleForShip } from './fsHandle';
import { ensureSafeFilename } from './safeFilename';
import { APP_VERSION } from '../../domain/constants';

const BUNDLE_VERSION = 1;
// 25 MB cap on imported bundles. A real export with thousands of voyages is
// nowhere near this; the cap exists so a malformed / hostile multi-MB file
// can't OOM the tab during JSON.parse and so a runaway bundle can't fill
// the SMB share. The legitimate ceiling is ~5 MB for several years of data.
const MAX_BUNDLE_BYTES = 25 * 1024 * 1024;
// _index.json is a reserved name on disk; we filter it from buildBundle and
// must filter it from importBundle as well so a malicious bundle can't seed
// attacker-controlled data into a future read-side index path.
const RESERVED_FILENAMES = new Set(['_index.json']);

export interface BundleEntry {
  filename: string;
  content: unknown;
}

export interface Bundle {
  bundleVersion: number;
  shipId: string;
  exportedAt: string;
  appVersion: string;
  voyages: BundleEntry[];
}

export interface ImportSummary {
  written: string[];
  skipped: string[];
}

// Subset of the File API used by parseBundleFile — accepts real File objects
// or test fakes that implement just .text() and .name (and optional .size).
interface FileLike {
  text: () => Promise<string>;
  name: string;
  size?: number;
}

// Bundle entries should look like a Voyage on the wire — at minimum a `legs`
// array. We don't run the full schema validator here (validateVoyageData is
// for the per-file load path); this is a structural shape check so a hostile
// bundle can't drop arbitrary objects into the share.
function ensureVoyageShape(content: unknown, filename: string): void {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new Error(`Voyage ${filename} must have a content object`);
  }
  const c = content as Record<string, unknown>;
  if (!Array.isArray(c.legs)) {
    throw new Error(`Voyage ${filename} is missing a legs array`);
  }
}

/**
 * Read every `.json` file in the ship's folder and pack it into a single
 * bundle object. Returns the bundle (caller decides how to deliver it —
 * typically via `downloadBundle`).
 */
export async function buildBundle(shipId: string): Promise<Bundle> {
  const dir = await getHandleForShip(shipId);
  const voyages: BundleEntry[] = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file') continue;
    if (!name.endsWith('.json')) continue;
    if (name === '_index.json') continue;
    const file = await (handle as FileSystemFileHandle).getFile();
    const text = await file.text();
    let content: unknown;
    try {
      content = JSON.parse(text);
    } catch (e) {
      throw new Error(`Corrupt JSON in ${name}: ${(e as Error).message}`);
    }
    voyages.push({ filename: name, content });
  }
  voyages.sort((a, b) => a.filename.localeCompare(b.filename));
  return {
    bundleVersion: BUNDLE_VERSION,
    shipId,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    voyages,
  };
}

/**
 * Trigger a browser download of the bundle as `voyages-<shipId>-<date>.json`.
 * Uses a throwaway anchor + object URL — no external dependency.
 */
export function downloadBundle(bundle: Bundle): string {
  const date = bundle.exportedAt.slice(0, 10);
  const filename = `voyages-${bundle.shipId}-${date}.json`;
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return filename;
}

// Detect a plain single-voyage JSON file and wrap it as a synthetic bundle
// so the rest of the import pipeline doesn't need to branch. A voyage file
// has no `bundleVersion` and carries a `legs` array (the defining shape
// per src/domain/factories.ts). Returns null if `parsed` doesn't look like
// a standalone voyage — caller then falls through to full bundle validation.
//
// Filename precedence: `parsed.filename` if it was stamped into the JSON,
// otherwise the upload's `file.name`. We still run `ensureSafeFilename` so
// hostile inputs (`..\..\evil`) can't slip through via this path.
export function maybeWrapSingleVoyage(parsed: unknown, file: FileLike): Bundle | null {
  if (parsed == null || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  if (p.bundleVersion != null) return null;
  if (!Array.isArray(p.legs)) return null;
  const filename =
    (typeof p.filename === 'string' && p.filename) || file.name;
  ensureSafeFilename(filename);
  return {
    bundleVersion: BUNDLE_VERSION,
    shipId: typeof p.shipId === 'string' ? p.shipId : '',
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    voyages: [{ filename, content: parsed }],
  };
}

/**
 * Parse a user-provided bundle File (from `<input type="file">`) and validate
 * its shape. Returns the bundle object. Throws with a useful message if the
 * file isn't a valid bundle.
 *
 * Accepted shapes:
 *   1. A full bundle (`{ bundleVersion: 1, shipId, voyages: [...] }`).
 *   2. A standalone voyage JSON (has `legs: [...]`, no `bundleVersion`) —
 *      wrapped on the fly; see `maybeWrapSingleVoyage` above.
 */
export async function parseBundleFile(file: FileLike): Promise<Bundle> {
  if (typeof file.size === 'number' && file.size > MAX_BUNDLE_BYTES) {
    throw new Error(
      `Bundle is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB; ` +
        `max ${MAX_BUNDLE_BYTES / (1024 * 1024)} MB). Split the export or contact IT.`,
    );
  }
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Not valid JSON: ${(e as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('File root must be an object');
  }

  // Permissive path: a single-voyage JSON gets wrapped as a synthetic bundle
  // so the rest of the import pipeline stays uniform.
  const wrapped = maybeWrapSingleVoyage(parsed, file);
  if (wrapped) return wrapped;

  const p = parsed as Record<string, unknown>;
  if (p.bundleVersion !== BUNDLE_VERSION) {
    throw new Error(
      `Unsupported file: expected a bundle with bundleVersion ${BUNDLE_VERSION} ` +
        `or a single voyage JSON (with a \`legs\` array); got bundleVersion ${String(p.bundleVersion)}`,
    );
  }
  if (typeof p.shipId !== 'string' || !p.shipId) {
    throw new Error('Bundle is missing shipId');
  }
  if (!Array.isArray(p.voyages)) {
    throw new Error('Bundle.voyages must be an array');
  }
  for (const v of p.voyages as unknown[]) {
    if (!v || typeof v !== 'object') throw new Error('Each voyage entry must be an object');
    const entry = v as Record<string, unknown>;
    ensureSafeFilename(entry.filename);
    ensureVoyageShape(entry.content, entry.filename as string);
  }
  return p as unknown as Bundle;
}

/**
 * Write each voyage in the bundle into the ship's folder. Files that already
 * exist on disk are SKIPPED (not overwritten). Returns:
 *
 *   { written: [filenames], skipped: [filenames] }
 *
 * If `bundle.shipId` doesn't match `targetShipId`, the caller is warned via
 * the `shipMismatch` flag — but import still proceeds if the caller accepts
 * it (see SettingsPanel). The ship id inside the bundle is advisory; the
 * directory handle determines where files land.
 */
export async function importBundle(bundle: Bundle, targetShipId: string): Promise<ImportSummary> {
  const dir = await getHandleForShip(targetShipId);

  const existing = new Set<string>();
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.json')) existing.add(name);
  }

  const written: string[] = [];
  const skipped: string[] = [];
  for (const v of bundle.voyages) {
    // Reserved names (e.g. _index.json) are filtered on read; mirror the
    // filter on write so a hostile bundle can't seed one regardless.
    if (RESERVED_FILENAMES.has(v.filename)) {
      skipped.push(v.filename);
      continue;
    }
    if (existing.has(v.filename)) {
      skipped.push(v.filename);
      continue;
    }
    const fh = await dir.getFileHandle(v.filename, { create: true });
    const writable = await fh.createWritable();
    try {
      await writable.write(JSON.stringify(v.content, null, 2) + '\n');
    } finally {
      await writable.close();
    }
    written.push(v.filename);
  }
  return { written, skipped };
}
