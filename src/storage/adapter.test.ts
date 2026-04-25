import { describe, it, expect, beforeEach } from 'vitest';
import {
  ConflictError,
  NotFoundError,
  StorageError,
  getStorageAdapter,
  setStorageAdapter,
  type StorageAdapter,
} from './adapter';
import {
  NoDirectoryError,
  PathSafetyError,
  StaleFileError,
  UnsupportedBrowserError,
} from './local/errors';

describe('error class hierarchy', () => {
  it('all custom errors extend Error', () => {
    expect(new StorageError('x')).toBeInstanceOf(Error);
    expect(new ConflictError('x')).toBeInstanceOf(Error);
    expect(new NotFoundError('x')).toBeInstanceOf(Error);
    expect(new StaleFileError('x')).toBeInstanceOf(Error);
    expect(new NoDirectoryError('x')).toBeInstanceOf(Error);
    expect(new UnsupportedBrowserError()).toBeInstanceOf(Error);
    expect(new PathSafetyError('x')).toBeInstanceOf(Error);
  });

  it('all storage-domain errors extend StorageError', () => {
    expect(new ConflictError('x')).toBeInstanceOf(StorageError);
    expect(new NotFoundError('x')).toBeInstanceOf(StorageError);
    expect(new StaleFileError('x')).toBeInstanceOf(StorageError);
    expect(new NoDirectoryError('x')).toBeInstanceOf(StorageError);
    expect(new UnsupportedBrowserError()).toBeInstanceOf(StorageError);
    expect(new PathSafetyError('x')).toBeInstanceOf(StorageError);
  });

  it('StaleFileError extends ConflictError (so legacy ConflictError handlers still match)', () => {
    expect(new StaleFileError('x')).toBeInstanceOf(ConflictError);
  });

  it('error names match their class', () => {
    expect(new StorageError('x').name).toBe('StorageError');
    expect(new ConflictError('x').name).toBe('ConflictError');
    expect(new NotFoundError('x').name).toBe('NotFoundError');
    expect(new StaleFileError('x').name).toBe('StaleFileError');
    expect(new NoDirectoryError('x').name).toBe('NoDirectoryError');
    expect(new UnsupportedBrowserError().name).toBe('UnsupportedBrowserError');
    expect(new PathSafetyError('x').name).toBe('PathSafetyError');
  });

  it('StaleFileError threads loadedMtime / currentMtime / currentVoyage through opts', () => {
    const e = new StaleFileError('stale', {
      loadedMtime: 100,
      currentMtime: 200,
      currentVoyage: { id: 1 },
    });
    expect(e.loadedMtime).toBe(100);
    expect(e.currentMtime).toBe(200);
    expect(e.currentVoyage).toEqual({ id: 1 });
  });

  it('StaleFileError defaults loaded/current to null when opts not given', () => {
    const e = new StaleFileError('stale');
    expect(e.loadedMtime).toBeNull();
    expect(e.currentMtime).toBeNull();
    expect(e.currentVoyage).toBeNull();
  });

  it('NoDirectoryError threads shipId through opts', () => {
    const e = new NoDirectoryError('no dir', { shipId: 'SL' });
    expect(e.shipId).toBe('SL');
  });

  it('UnsupportedBrowserError defaults message', () => {
    expect(new UnsupportedBrowserError().message).toMatch(/File System Access API/);
  });
});

describe('storage adapter registry', () => {
  beforeEach(() => {
    setStorageAdapter(null);
  });

  it('throws if accessed before set', () => {
    expect(() => getStorageAdapter()).toThrow(/not initialized/);
  });

  it('returns the adapter once set', () => {
    const fake = { backend: 'fake' } as unknown as StorageAdapter;
    setStorageAdapter(fake);
    expect(getStorageAdapter()).toBe(fake);
  });

  it('replaces a previously set adapter', () => {
    const a = { backend: 'a' } as unknown as StorageAdapter;
    const b = { backend: 'b' } as unknown as StorageAdapter;
    setStorageAdapter(a);
    setStorageAdapter(b);
    expect(getStorageAdapter()).toBe(b);
  });
});
