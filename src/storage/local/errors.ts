// Local-storage-specific error classes. Extend the shared StorageError
// hierarchy from ../adapter so the rest of the app can stay backend-
// agnostic and `instanceof` matches across adapters.

import { ConflictError, StorageError, type StorageErrorOptions } from '../adapter';
import type { Voyage } from '../../types/domain';

export interface StaleFileErrorOptions extends StorageErrorOptions {
  loadedMtime?: number | null;
  currentMtime?: number | null;
  currentVoyage?: Voyage | unknown | null;
}

// Thrown by saveVoyage when the on-disk `lastModified` is newer than the
// mtime we recorded at load time — i.e. someone else saved between our read
// and our write. UI maps this to <StaleFileModal>. Subclasses ConflictError
// so any legacy `instanceof ConflictError` check in the voyage store still
// catches it during the transition.
export class StaleFileError extends ConflictError {
  loadedMtime: number | null;
  currentMtime: number | null;
  currentVoyage: unknown;
  constructor(msg: string, opts: StaleFileErrorOptions = {}) {
    super(msg, opts);
    this.name = 'StaleFileError';
    this.loadedMtime = opts.loadedMtime ?? null;
    this.currentMtime = opts.currentMtime ?? null;
    this.currentVoyage = opts.currentVoyage ?? null;
  }
}

export interface NoDirectoryErrorOptions extends StorageErrorOptions {
  shipId?: string | null;
}

// The user hasn't picked (or has revoked permission on) the directory for
// this ship yet. UI catches this and prompts showDirectoryPicker.
export class NoDirectoryError extends StorageError {
  shipId: string | null;
  constructor(msg: string, opts: NoDirectoryErrorOptions = {}) {
    super(msg, opts);
    this.name = 'NoDirectoryError';
    this.shipId = opts.shipId ?? null;
  }
}

// The browser doesn't expose window.showDirectoryPicker (Firefox, Safari).
// UI shows a "use Chrome/Edge" fallback screen.
export class UnsupportedBrowserError extends StorageError {
  constructor(
    msg = 'File System Access API not supported in this browser',
    opts: StorageErrorOptions = {},
  ) {
    super(msg, opts);
    this.name = 'UnsupportedBrowserError';
  }
}

// Invalid filename / shipId — same role as PathSafetyError on the github
// adapter. Filename validation still matters because these end up as actual
// filenames on the ship's network share.
export class PathSafetyError extends StorageError {
  constructor(msg: string, opts: StorageErrorOptions = {}) {
    super(msg, opts);
    this.name = 'PathSafetyError';
  }
}
