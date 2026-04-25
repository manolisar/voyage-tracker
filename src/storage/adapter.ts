// Storage-adapter contract.
//
// The rest of the app talks ONLY to this interface. The concrete backend is
// the local-filesystem adapter under ./local/ (File System Access API against
// a per-ship network folder — see CLAUDE.md §3).

import type { Voyage, VoyageManifestEntry } from '../types/domain';

export interface StorageAdapter {
  backend: string;
  listVoyages(shipId: string): Promise<VoyageManifestEntry[]>;
  loadVoyage(shipId: string, filename: string): Promise<{ voyage: Voyage; mtime: number }>;
  saveVoyage(
    shipId: string,
    filename: string,
    voyage: Voyage,
    prevMtime?: number | null,
  ): Promise<{ mtime: number }>;
  deleteVoyage(shipId: string, filename: string): Promise<void>;
  upsertIndex(shipId: string, filename: string, entry: VoyageManifestEntry): Promise<void>;
}

let current: StorageAdapter | null = null;

export function setStorageAdapter(adapter: StorageAdapter | null): void {
  current = adapter;
}

export function getStorageAdapter(): StorageAdapter {
  if (!current) throw new Error('Storage adapter not initialized');
  return current;
}

// Standard error shapes — both adapters throw these so the UI can match on
// `instanceof` regardless of backend.

export interface StorageErrorOptions {
  cause?: unknown;
  status?: number;
}

export class StorageError extends Error {
  override cause: unknown;
  status?: number;
  constructor(msg: string, opts: StorageErrorOptions = {}) {
    super(msg);
    this.name = 'StorageError';
    this.cause = opts.cause;
    this.status = opts.status;
  }
}

export class ConflictError extends StorageError {
  constructor(msg: string, opts: StorageErrorOptions = {}) {
    super(msg, opts);
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends StorageError {
  constructor(msg: string, opts: StorageErrorOptions = {}) {
    super(msg, opts);
    this.name = 'NotFoundError';
  }
}
