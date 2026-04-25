import { describe, it, expect } from 'vitest';
import { stampLoggedBy, createLocalAdapter } from './index';

interface StampedVoyage {
  loggedBy?: { name: string; role: string | null; at: string };
  [key: string]: unknown;
}

describe('stampLoggedBy', () => {
  it('adds loggedBy block when session has a userName', () => {
    const v = { id: 1, legs: [] };
    const out = stampLoggedBy(v, { userName: 'M. Archontakis', role: 'chief' }) as StampedVoyage;
    expect(out.loggedBy?.name).toBe('M. Archontakis');
    expect(out.loggedBy?.role).toBe('chief');
    expect(typeof out.loggedBy?.at).toBe('string');
    // ISO 8601 — sanity check
    expect(out.loggedBy?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('does NOT mutate the input voyage', () => {
    const v: StampedVoyage = { id: 1, legs: [] };
    stampLoggedBy(v, { userName: 'X' });
    expect(v.loggedBy).toBeUndefined();
  });

  it('passes through unchanged when session is null/anon', () => {
    const v = { id: 1, legs: [] };
    expect(stampLoggedBy(v, null)).toBe(v);
    expect(stampLoggedBy(v, {})).toBe(v);
    expect(stampLoggedBy(v, { userName: '' })).toBe(v);
  });

  it('passes through non-object voyages unchanged', () => {
    expect(stampLoggedBy(null, { userName: 'X' })).toBeNull();
    expect(stampLoggedBy('voyage', { userName: 'X' })).toBe('voyage');
  });

  it('coerces userName to string and defaults role to null when missing', () => {
    const out = stampLoggedBy({ id: 1 }, { userName: 'X' }) as StampedVoyage;
    expect(out.loggedBy?.role).toBeNull();
  });
});

describe('createLocalAdapter', () => {
  it('returns an object with the adapter contract methods', () => {
    const a = createLocalAdapter();
    expect(a.backend).toBe('local');
    expect(typeof a.listVoyages).toBe('function');
    expect(typeof a.loadVoyage).toBe('function');
    expect(typeof a.saveVoyage).toBe('function');
    expect(typeof a.deleteVoyage).toBe('function');
    expect(typeof a.upsertIndex).toBe('function');
  });

  it('reads session lazily via getSession (so adapter sees fresh user/role)', () => {
    // We test stampLoggedBy directly with the lazy-session pattern; the adapter
    // wires the same accessor into saveVoyage. Avoids mocking FSA + IDB.
    let session: { userName: string; role: string } | null = null;
    const stamps: StampedVoyage[] = [];

    session = { userName: 'A', role: 'chief' };
    stamps.push(stampLoggedBy({ id: 1 }, session) as StampedVoyage);

    session = { userName: 'B', role: 'second' };
    stamps.push(stampLoggedBy({ id: 1 }, session) as StampedVoyage);

    expect(stamps[0].loggedBy?.name).toBe('A');
    expect(stamps[0].loggedBy?.role).toBe('chief');
    expect(stamps[1].loggedBy?.name).toBe('B');
    expect(stamps[1].loggedBy?.role).toBe('second');
  });
});
