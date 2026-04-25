// Directory-handle lifecycle for the local storage adapter.
//
// On first launch per ship, the UI calls pickDirectoryForShip() which opens
// showDirectoryPicker() and persists the returned FileSystemDirectoryHandle
// in IndexedDB (see ../indexeddb `handles` store). On subsequent launches
// getHandleForShip() pulls the handle back out and re-requests permission —
// on Chromium this is silent as long as the handle is to the same folder
// on the same origin.
//
// Permission is scoped per tab: closing the tab forgets permission state;
// the handle persists. A re-permission call is always needed after reload.

import {
  putDirHandle,
  getDirHandle,
  deleteDirHandle,
  listDirHandles,
} from '../indexeddb';
import { NoDirectoryError, UnsupportedBrowserError } from './errors';

export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
  );
}

function assertSupported(): void {
  if (!isFileSystemAccessSupported()) throw new UnsupportedBrowserError();
}

// Re-assert readwrite permission on a stored handle. `query` first (cheap,
// no prompt); only call `request` if needed. Returns true if granted.
async function ensureReadWritePermission(
  handle: FileSystemDirectoryHandle | null | undefined,
): Promise<boolean> {
  if (!handle) return false;
  const opts = { mode: 'readwrite' as const };
  const queried = await handle.queryPermission?.(opts);
  if (queried === 'granted') return true;
  const requested = await handle.requestPermission?.(opts);
  return requested === 'granted';
}

/**
 * Open the folder-picker and persist the chosen directory for this ship.
 */
export async function pickDirectoryForShip(shipId: string): Promise<FileSystemDirectoryHandle> {
  assertSupported();
  const handle = await window.showDirectoryPicker!({
    id: `voyage-tracker-${shipId}`, // Chrome remembers per-id start location
    mode: 'readwrite',
    startIn: 'documents',
  });
  const granted = await ensureReadWritePermission(handle);
  if (!granted) {
    throw new NoDirectoryError('Write permission denied for chosen folder', { shipId });
  }
  await putDirHandle(shipId, handle);
  return handle;
}

/**
 * Returns the persisted handle for a ship, or throws if it can't be used
 * right now (no handle stored, or user denied permission on reload).
 *
 * If `prompt` is false, only uses the already-granted state (no native dialog).
 */
export async function getHandleForShip(
  shipId: string,
  { prompt = true }: { prompt?: boolean } = {},
): Promise<FileSystemDirectoryHandle> {
  assertSupported();
  const handle = await getDirHandle(shipId);
  if (!handle) throw new NoDirectoryError('No folder chosen for this ship yet', { shipId });
  const queried = await handle.queryPermission?.({ mode: 'readwrite' });
  if (queried === 'granted') return handle;
  if (!prompt) throw new NoDirectoryError('Folder permission not granted', { shipId });
  const granted = await ensureReadWritePermission(handle);
  if (!granted) throw new NoDirectoryError('Folder permission denied', { shipId });
  return handle;
}

/**
 * Returns true if we have a handle stored AND permission is already granted.
 * Does NOT prompt — use this for UI gating ("show 'Change folder' button vs
 * 'Pick folder' button").
 */
export async function hasGrantedHandleForShip(shipId: string): Promise<boolean> {
  if (!isFileSystemAccessSupported()) return false;
  const handle = await getDirHandle(shipId);
  if (!handle) return false;
  const queried = await handle.queryPermission?.({ mode: 'readwrite' });
  return queried === 'granted';
}

/**
 * Returns true if we have a handle stored at all (permission may be stale).
 */
export async function hasHandleForShip(shipId: string): Promise<boolean> {
  const handle = await getDirHandle(shipId);
  return handle != null;
}

/**
 * Forget the folder for this ship. User will be prompted again on next
 * save/list. Does NOT delete files on disk.
 */
export async function clearHandleForShip(shipId: string): Promise<void> {
  await deleteDirHandle(shipId);
}

export { listDirHandles };
