import { describe, it, expect } from 'vitest';
import { validateVoyageData, isShipPath } from './validation';
import { APP_VERSION } from './constants';
import solsticeClassRaw from '../../public/ship-classes/solstice-class.json';
import type { ShipClass } from '../types/domain';

const solsticeClass = solsticeClassRaw as unknown as ShipClass;

describe('validateVoyageData', () => {
  it('rejects null / undefined / non-object input', () => {
    expect(validateVoyageData(null).valid).toBe(false);
    expect(validateVoyageData(undefined).valid).toBe(false);
    expect(validateVoyageData('voyage').valid).toBe(false);
    expect(validateVoyageData(42).valid).toBe(false);
  });

  it('flags missing voyage id, legs, shipId', () => {
    const r = validateVoyageData({}, { shipClass: solsticeClass });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('Missing voyage id');
    expect(r.errors).toContain('Invalid legs array');
    expect(r.errors).toContain('Missing shipId');
  });

  it('flags shipId mismatch when expectedShipId is provided', () => {
    const r = validateVoyageData(
      { id: 1, legs: [], shipId: 'EQ' },
      { shipClass: solsticeClass, expectedShipId: 'SL' },
    );
    expect(r.errors.some((e) => e.includes('mismatch'))).toBe(true);
  });

  it('backfills missing densities from ship-class defaults', () => {
    const r = validateVoyageData(
      { id: 1, legs: [], shipId: 'SL' },
      { shipClass: solsticeClass },
    );
    expect(r.data!.densities.HFO).toBe(0.92);
    expect(r.data!.densities.MGO).toBe(0.83);
    expect(r.data!.densities.LSFO).toBe(0.92);
  });

  it('preserves user-provided densities, only filling gaps', () => {
    const r = validateVoyageData(
      { id: 1, legs: [], shipId: 'SL', densities: { HFO: 0.95 } },
      { shipClass: solsticeClass },
    );
    expect(r.data!.densities.HFO).toBe(0.95);
    expect(r.data!.densities.MGO).toBe(0.83);
    expect(r.data!.densities.LSFO).toBe(0.92);
  });

  it('backfills missing fromPort/toPort as empty PortRef (not undefined)', () => {
    const r = validateVoyageData(
      { id: 1, legs: [], shipId: 'SL' },
      { shipClass: solsticeClass },
    );
    expect(r.data!.fromPort).toEqual({ code: '', name: '', country: '', locode: '' });
    expect(r.data!.toPort).toEqual({ code: '', name: '', country: '', locode: '' });
  });

  it('backfills leg.voyageReport to null when missing', () => {
    const r = validateVoyageData(
      { id: 1, shipId: 'SL', legs: [{ id: 1, departure: {}, arrival: {} }] },
      { shipClass: solsticeClass },
    );
    expect(r.data!.legs[0].voyageReport).toBeNull();
  });

  it('flags out-of-range densities (zero, > 2)', () => {
    const rZero = validateVoyageData(
      { id: 1, shipId: 'SL', legs: [], densities: { HFO: 0 } },
      { shipClass: solsticeClass },
    );
    expect(rZero.errors.some((e) => e.includes('HFO'))).toBe(true);

    const rHigh = validateVoyageData(
      { id: 1, shipId: 'SL', legs: [], densities: { HFO: 3.0 } },
      { shipClass: solsticeClass },
    );
    expect(rHigh.errors.some((e) => e.includes('HFO'))).toBe(true);
  });

  it('flags non-numeric densities', () => {
    const r = validateVoyageData(
      { id: 1, shipId: 'SL', legs: [], densities: { HFO: 'abc' } },
      { shipClass: solsticeClass },
    );
    expect(r.errors.some((e) => e.includes('HFO'))).toBe(true);
  });

  it('always sets version to current APP_VERSION (overwrites stale versions)', () => {
    const r = validateVoyageData(
      { id: 1, shipId: 'SL', legs: [], version: '6.0.0' },
      { shipClass: solsticeClass },
    );
    expect(r.data!.version).toBe(APP_VERSION);
  });

  it('returns valid=true when all required fields are present and densities are sane', () => {
    const r = validateVoyageData(
      {
        id: 1,
        shipId: 'SL',
        classId: 'solstice-class',
        legs: [],
        densities: { HFO: 0.92, MGO: 0.83, LSFO: 0.92 },
        fromPort: { code: 'MIA', name: 'Miami', country: 'US', locode: 'USMIA' },
        toPort: { code: 'FLL', name: 'Fort Lauderdale', country: 'US', locode: 'USFLL' },
        startDate: '2026-01-15',
        endDate: '',
      },
      { shipClass: solsticeClass },
    );
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });
});

describe('isShipPath', () => {
  it('only accepts paths under data/<shipId>/', () => {
    expect(isShipPath('data/SL/voyage.json', 'SL')).toBe(true);
    expect(isShipPath('data/EQ/voyage.json', 'SL')).toBe(false);
    expect(isShipPath('voyage.json', 'SL')).toBe(false);
    expect(isShipPath('data/SLX/voyage.json', 'SL')).toBe(false); // trailing slash in prefix prevents partial matches
  });

  it('returns false for non-string inputs', () => {
    expect(isShipPath(null, 'SL')).toBe(false);
    expect(isShipPath('data/SL/', null)).toBe(false);
    expect(isShipPath(42, 'SL')).toBe(false);
  });
});
