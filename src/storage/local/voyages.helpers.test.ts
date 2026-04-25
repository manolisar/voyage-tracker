import { describe, it, expect } from 'vitest';
import {
  ensureSafeFilename,
  parsePortsFromFilename,
  asPortObject,
  normalizeVoyageFromFilename,
} from './voyages';
import { PathSafetyError } from './errors';
import type { PortRef } from '../../types/domain';

interface NormalizedVoyage {
  fromPort: PortRef;
  toPort: PortRef;
  [key: string]: unknown;
}

describe('ensureSafeFilename', () => {
  it('accepts valid voyage filenames', () => {
    expect(() => ensureSafeFilename('SL_2026-01-15_MIA-FLL.json')).not.toThrow();
    expect(() => ensureSafeFilename('a.json')).not.toThrow();
    expect(() => ensureSafeFilename('A_B-C.0.json')).not.toThrow();
  });

  it('rejects path-traversal attempts', () => {
    expect(() => ensureSafeFilename('../etc/passwd')).toThrow(PathSafetyError);
    expect(() => ensureSafeFilename('foo..bar.json')).toThrow(PathSafetyError);
  });

  it('rejects empty / nullish input', () => {
    expect(() => ensureSafeFilename('')).toThrow(PathSafetyError);
    expect(() => ensureSafeFilename(null)).toThrow(PathSafetyError);
    expect(() => ensureSafeFilename(undefined)).toThrow(PathSafetyError);
  });

  it('rejects characters outside [A-Za-z0-9._-]', () => {
    expect(() => ensureSafeFilename('foo/bar.json')).toThrow(PathSafetyError);
    expect(() => ensureSafeFilename('foo bar.json')).toThrow(PathSafetyError);
    expect(() => ensureSafeFilename('foo\\bar.json')).toThrow(PathSafetyError);
    expect(() => ensureSafeFilename('foo:bar.json')).toThrow(PathSafetyError);
  });
});

describe('parsePortsFromFilename', () => {
  it('parses v7 filenames "<SHIP>_<DATE>_<FROM>-<TO>.json"', () => {
    expect(parsePortsFromFilename('SL_2026-01-15_MIA-FLL.json')).toEqual({
      from: 'MIA',
      to: 'FLL',
    });
    expect(parsePortsFromFilename('EQ_2026-02-04_FLL-CZM.json')).toEqual({
      from: 'FLL',
      to: 'CZM',
    });
  });

  it('handles v6-era multi-hop filenames by taking first and last port', () => {
    expect(parsePortsFromFilename('SL_2026-01-15_MIA-NAS-MIA.json')).toEqual({
      from: 'MIA',
      to: 'MIA',
    });
  });

  it('returns null on shapes that don’t match the contract', () => {
    expect(parsePortsFromFilename('not_a_voyage_file')).toBeNull(); // last segment "file" is not 3-letter
    expect(parsePortsFromFilename('foo.json')).toBeNull();
    expect(parsePortsFromFilename('SL_2026-01-15_MIA-FLLZ.json')).toBeNull(); // 4-letter port
    expect(parsePortsFromFilename('')).toBeNull();
    expect(parsePortsFromFilename(null)).toBeNull();
  });

  it('strips .json extension before parsing', () => {
    expect(parsePortsFromFilename('SL_2026-01-15_MIA-FLL')).toEqual({
      from: 'MIA',
      to: 'FLL',
    });
  });
});

describe('asPortObject', () => {
  it('keeps full PortRef objects intact', () => {
    expect(
      asPortObject({ code: 'MIA', name: 'Miami', country: 'US', locode: 'USMIA' }),
    ).toEqual({ code: 'MIA', name: 'Miami', country: 'US', locode: 'USMIA' });
  });

  it('coerces v6-legacy bare-string ports into PortRef objects', () => {
    expect(asPortObject('MIA')).toEqual({
      code: 'MIA',
      name: '',
      country: '',
      locode: '',
    });
  });

  it('coerces null/undefined to an empty PortRef', () => {
    expect(asPortObject(null)).toEqual({ code: '', name: '', country: '', locode: '' });
    expect(asPortObject(undefined)).toEqual({ code: '', name: '', country: '', locode: '' });
  });

  it('drops non-string fields silently (defensive against bad JSON)', () => {
    expect(
      asPortObject({ code: 42, name: ['x'], country: null, locode: { foo: 1 } }),
    ).toEqual({ code: '', name: '', country: '', locode: '' });
  });
});

describe('normalizeVoyageFromFilename', () => {
  it('backfills empty port codes from filename when missing in voyage body', () => {
    const v = { fromPort: { code: '', name: '' }, toPort: { code: '', name: '' } };
    const out = normalizeVoyageFromFilename(v, 'SL_2026-01-15_MIA-FLL.json') as NormalizedVoyage;
    expect(out.fromPort.code).toBe('MIA');
    expect(out.toPort.code).toBe('FLL');
  });

  it('preserves existing port codes when present (does not overwrite)', () => {
    const v = {
      fromPort: { code: 'JFK', name: 'New York' },
      toPort: { code: 'LAX', name: 'Los Angeles' },
    };
    const out = normalizeVoyageFromFilename(v, 'SL_2026-01-15_MIA-FLL.json') as NormalizedVoyage;
    expect(out.fromPort.code).toBe('JFK');
    expect(out.toPort.code).toBe('LAX');
  });

  it('migrates v6-style bare-string ports into PortRef objects', () => {
    const v = { fromPort: 'MIA', toPort: 'FLL' };
    const out = normalizeVoyageFromFilename(v, 'SL_2026-01-15_MIA-FLL.json') as NormalizedVoyage;
    expect(out.fromPort).toEqual({ code: 'MIA', name: '', country: '', locode: '' });
    expect(out.toPort).toEqual({ code: 'FLL', name: '', country: '', locode: '' });
  });

  it('creates empty PortRef when both filename parse fails AND voyage body has none', () => {
    const v = {};
    const out = normalizeVoyageFromFilename(v, 'unparseable.json') as NormalizedVoyage;
    expect(out.fromPort).toEqual({ code: '', name: '', country: '', locode: '' });
    expect(out.toPort).toEqual({ code: '', name: '', country: '', locode: '' });
  });

  it('passes through non-object voyages unchanged (no throw)', () => {
    expect(normalizeVoyageFromFilename(null, 'foo.json')).toBeNull();
    expect(normalizeVoyageFromFilename('voyage', 'foo.json')).toBe('voyage');
  });
});
