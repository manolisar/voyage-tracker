import { describe, it, expect } from 'vitest';
import {
  calcConsumption,
  formatMT,
  calcVoyageTotals,
  calcPhaseTotals,
} from './calculations';
import solsticeClassRaw from '../../public/ship-classes/solstice-class.json';
import type { Phase, ShipClass, Voyage } from '../types/domain';

const solsticeClass = solsticeClassRaw as unknown as ShipClass;

describe('calcConsumption', () => {
  it('computes MT from m³ × density', () => {
    expect(calcConsumption('100', '105', 'HFO', { HFO: 0.92 })).toBeCloseTo(4.6, 2);
  });

  it('normalizes lowercase fuel keys', () => {
    expect(calcConsumption('100', '105', 'hfo', { HFO: 0.92 })).toBeCloseTo(4.6, 2);
  });

  it('returns null on missing inputs', () => {
    expect(calcConsumption('', '105', 'HFO', { HFO: 0.92 })).toBeNull();
    expect(calcConsumption('100', '', 'HFO', { HFO: 0.92 })).toBeNull();
    expect(calcConsumption(null, '105', 'HFO', { HFO: 0.92 })).toBeNull();
    expect(calcConsumption('100', null, 'HFO', { HFO: 0.92 })).toBeNull();
  });

  it('returns null on negative diff', () => {
    expect(calcConsumption('105', '100', 'HFO', { HFO: 0.92 })).toBeNull();
  });

  it('returns null when density for the requested fuel is missing', () => {
    expect(calcConsumption('100', '105', 'HFO', { MGO: 0.83 })).toBeNull();
  });

  it('returns null on non-numeric inputs', () => {
    expect(calcConsumption('abc', '105', 'HFO', { HFO: 0.92 })).toBeNull();
    expect(calcConsumption('100', 'xyz', 'HFO', { HFO: 0.92 })).toBeNull();
  });
});

describe('formatMT', () => {
  it('formats positive numbers to 2 decimals', () => {
    expect(formatMT(4.6)).toBe('4.60');
    expect(formatMT(123.456)).toBe('123.46');
    expect(formatMT(0)).toBe('0.00');
  });

  it('handles null / NaN / undefined safely', () => {
    expect(formatMT(null)).toBe('0.00');
    expect(formatMT(NaN)).toBe('0.00');
    expect(formatMT(undefined)).toBe('0.00');
  });
});

describe('calcVoyageTotals', () => {
  it('sums HFO+MGO+LSFO across legs and reports', () => {
    const voyage = {
      densities: { HFO: 0.92, MGO: 0.83, LSFO: 0.92 },
      legs: [
        {
          departure: {
            phases: [
              {
                equipment: {
                  dg12: { start: '100', end: '105', fuel: 'HFO' }, // 5 × 0.92 = 4.60
                  dg3:  { start: '50',  end: '52',  fuel: 'MGO' }, // 2 × 0.83 = 1.66
                },
              },
            ],
          },
          arrival: {
            phases: [
              {
                equipment: {
                  dg12: { start: '200', end: '210', fuel: 'LSFO' }, // 10 × 0.92 = 9.20
                },
              },
            ],
          },
        },
      ],
    };
    const totals = calcVoyageTotals(voyage as unknown as Voyage, solsticeClass);
    expect(totals.hfo).toBeCloseTo(4.6, 2);
    expect(totals.mgo).toBeCloseTo(1.66, 2);
    expect(totals.lsfo).toBeCloseTo(9.2, 2);
    expect(totals.total).toBeCloseTo(15.46, 2);
  });

  it('returns zeroed totals on empty voyage', () => {
    expect(calcVoyageTotals({ legs: [] } as unknown as Voyage, solsticeClass)).toEqual({
      hfo: 0, mgo: 0, lsfo: 0, total: 0,
    });
  });

  it('falls back to ship-class default densities when voyage has none', () => {
    const voyage = {
      legs: [
        {
          departure: {
            phases: [{ equipment: { dg12: { start: '0', end: '10', fuel: 'HFO' } } }],
          },
          arrival: { phases: [] },
        },
      ],
    };
    const totals = calcVoyageTotals(voyage as unknown as Voyage, solsticeClass);
    expect(totals.hfo).toBeCloseTo(9.2, 2); // 10 × 0.92
  });

  it('skips equipment rows with incomplete inputs without crashing', () => {
    const voyage = {
      densities: { HFO: 0.92, MGO: 0.83, LSFO: 0.92 },
      legs: [
        {
          departure: {
            phases: [
              {
                equipment: {
                  dg12: { start: '', end: '', fuel: 'HFO' },
                  dg4:  { start: '0', end: '5', fuel: 'HFO' },
                },
              },
            ],
          },
          arrival: { phases: [] },
        },
      ],
    };
    const totals = calcVoyageTotals(voyage as unknown as Voyage, solsticeClass);
    expect(totals.hfo).toBeCloseTo(4.6, 2);
    expect(totals.total).toBeCloseTo(4.6, 2);
  });
});

describe('calcPhaseTotals', () => {
  it('sums consumption for a single phase, by fuel', () => {
    const phase = {
      equipment: {
        dg12: { start: '0', end: '10', fuel: 'HFO' }, // 9.20
        dg3:  { start: '0', end: '5',  fuel: 'MGO' }, // 4.15
      },
    };
    const totals = calcPhaseTotals(phase as unknown as Phase, { HFO: 0.92, MGO: 0.83 });
    expect(totals.hfo).toBeCloseTo(9.2, 2);
    expect(totals.mgo).toBeCloseTo(4.15, 2);
    expect(totals.total).toBeCloseTo(13.35, 2);
  });

  it('returns zeros for empty phase', () => {
    expect(calcPhaseTotals({ equipment: {} } as unknown as Phase, { HFO: 0.92 })).toEqual({
      hfo: 0, mgo: 0, lsfo: 0, total: 0,
    });
  });
});
