import { describe, it, expect } from 'vitest';
import {
  calcConsumption,
  formatMT,
  calcVoyageTotals,
  calcVoyageFreshWaterTotal,
  calcPhaseTotals,
  calcFuelByMode,
  calcBoilerFuelByMode,
} from './calculations';
import solsticeClassRaw from '../../public/ship-classes/solstice-class.json';
import type { Phase, ShipClass, Voyage } from '../types/domain';

const solsticeClass = solsticeClassRaw as unknown as ShipClass;

describe('calcConsumption', () => {
  it('computes MT from (Δlitres × density) / 1000', () => {
    expect(calcConsumption('100000', '105000', 'HFO', { HFO: 0.92 })).toBeCloseTo(4.6, 2);
  });

  it('normalizes lowercase fuel keys', () => {
    expect(calcConsumption('100000', '105000', 'hfo', { HFO: 0.92 })).toBeCloseTo(4.6, 2);
  });

  it('returns null on missing inputs', () => {
    expect(calcConsumption('', '105000', 'HFO', { HFO: 0.92 })).toBeNull();
    expect(calcConsumption('100000', '', 'HFO', { HFO: 0.92 })).toBeNull();
    expect(calcConsumption(null, '105000', 'HFO', { HFO: 0.92 })).toBeNull();
    expect(calcConsumption('100000', null, 'HFO', { HFO: 0.92 })).toBeNull();
  });

  it('returns null on negative diff', () => {
    expect(calcConsumption('105000', '100000', 'HFO', { HFO: 0.92 })).toBeNull();
  });

  it('returns null when density for the requested fuel is missing', () => {
    expect(calcConsumption('100000', '105000', 'HFO', { MGO: 0.83 })).toBeNull();
  });

  it('returns null on non-numeric inputs', () => {
    expect(calcConsumption('abc', '105000', 'HFO', { HFO: 0.92 })).toBeNull();
    expect(calcConsumption('100000', 'xyz', 'HFO', { HFO: 0.92 })).toBeNull();
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
                  dg12: { start: '100000', end: '105000', fuel: 'HFO' }, // 5000 L × 0.92 / 1000 = 4.60
                  dg3:  { start: '50000',  end: '52000',  fuel: 'MGO' }, // 2000 L × 0.83 / 1000 = 1.66
                },
              },
            ],
          },
          arrival: {
            phases: [
              {
                equipment: {
                  dg12: { start: '200000', end: '210000', fuel: 'LSFO' }, // 10000 L × 0.92 / 1000 = 9.20
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
            phases: [{ equipment: { dg12: { start: '0', end: '10000', fuel: 'HFO' } } }],
          },
          arrival: { phases: [] },
        },
      ],
    };
    const totals = calcVoyageTotals(voyage as unknown as Voyage, solsticeClass);
    expect(totals.hfo).toBeCloseTo(9.2, 2); // 10000 L × 0.92 / 1000
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
                  dg4:  { start: '0', end: '5000', fuel: 'HFO' },
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

describe('calcVoyageFreshWaterTotal', () => {
  it('sums arrival fresh-water consumption across legs', () => {
    const voyage = {
      legs: [
        { arrival: { freshWater: { consumption: '12.5' } } },
        { arrival: { freshWater: { consumption: '8.25' } } },
        { arrival: { freshWater: { consumption: '5' } } },
      ],
    };
    expect(calcVoyageFreshWaterTotal(voyage as unknown as Voyage)).toBeCloseTo(25.75, 2);
  });

  it('skips legs with missing / non-numeric / blank consumption', () => {
    const voyage = {
      legs: [
        { arrival: { freshWater: { consumption: '10' } } },
        { arrival: { freshWater: { consumption: '' } } },
        { arrival: { freshWater: { consumption: 'oops' } } },
        { arrival: {} },
        {},
      ],
    };
    expect(calcVoyageFreshWaterTotal(voyage as unknown as Voyage)).toBe(10);
  });

  it('returns 0 on empty / missing voyage', () => {
    expect(calcVoyageFreshWaterTotal({ legs: [] } as unknown as Voyage)).toBe(0);
    expect(calcVoyageFreshWaterTotal(null)).toBe(0);
    expect(calcVoyageFreshWaterTotal(undefined)).toBe(0);
  });
});

describe('calcPhaseTotals', () => {
  it('sums consumption for a single phase, by fuel', () => {
    const phase = {
      equipment: {
        dg12: { start: '0', end: '10000', fuel: 'HFO' }, // 10000 × 0.92 / 1000 = 9.20
        dg3:  { start: '0', end: '5000',  fuel: 'MGO' }, // 5000 × 0.83 / 1000 = 4.15
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

describe('calcFuelByMode', () => {
  const densities = { HFO: 0.92, MGO: 0.83, LSFO: 0.92 };

  it('buckets consumption by phase type and the three modes sum to calcVoyageTotals', () => {
    const voyage = {
      densities,
      legs: [
        {
          departure: {
            phases: [
              { type: 'port',    equipment: { dg12: { start: '0', end: '10000', fuel: 'HFO' } } }, // 9.20 port
              { type: 'standby', equipment: { dg4:  { start: '0', end: '5000',  fuel: 'HFO' } } }, // 4.60 standby
            ],
          },
          arrival: {
            phases: [
              { type: 'sea',     equipment: { dg12: { start: '0', end: '20000', fuel: 'LSFO' } } }, // 18.40 sailing
              { type: 'standby', equipment: { dg3:  { start: '0', end: '10000', fuel: 'MGO' } } },  // 8.30 standby
            ],
          },
        },
      ],
    };
    const m = calcFuelByMode(voyage as unknown as Voyage, solsticeClass);
    expect(m.port.hfo).toBeCloseTo(9.2, 2);
    expect(m.sailing.lsfo).toBeCloseTo(18.4, 2);
    expect(m.standby.hfo).toBeCloseTo(4.6, 2);
    expect(m.standby.mgo).toBeCloseTo(8.3, 2);
    expect(m.port.total).toBeCloseTo(9.2, 2);
    expect(m.sailing.total).toBeCloseTo(18.4, 2);
    expect(m.standby.total).toBeCloseTo(12.9, 2);

    const t = calcVoyageTotals(voyage as unknown as Voyage, solsticeClass);
    expect(m.sailing.total + m.port.total + m.standby.total).toBeCloseTo(t.total, 2);
  });

  it('ignores phases with unknown / missing type and returns zeros on empty voyage', () => {
    const voyage = {
      densities,
      legs: [
        { departure: { phases: [{ type: 'mystery', equipment: { dg12: { start: '0', end: '10000', fuel: 'HFO' } } }] }, arrival: { phases: [] } },
      ],
    };
    const m = calcFuelByMode(voyage as unknown as Voyage, solsticeClass);
    expect(m.sailing.total).toBe(0);
    expect(m.port.total).toBe(0);
    expect(m.standby.total).toBe(0);

    const empty = calcFuelByMode({ legs: [] } as unknown as Voyage, solsticeClass);
    expect(empty.port).toEqual({ hfo: 0, mgo: 0, lsfo: 0, total: 0 });
  });
});

describe('calcBoilerFuelByMode', () => {
  const densities = { HFO: 0.92, MGO: 0.83, LSFO: 0.92 };

  it('counts only boiler equipment, only in sailing and port phases', () => {
    const voyage = {
      densities,
      legs: [
        {
          departure: {
            phases: [
              { type: 'port', equipment: {
                boiler1: { start: '0', end: '10000', fuel: 'MGO' }, // 8.30 port boiler
                dg12:    { start: '0', end: '10000', fuel: 'HFO' }, // engine, ignored
              } },
            ],
          },
          arrival: {
            phases: [
              { type: 'sea',     equipment: { boiler2: { start: '0', end: '20000', fuel: 'MGO' } } }, // 16.60 sailing boiler
              { type: 'standby', equipment: { boiler1: { start: '0', end: '5000',  fuel: 'MGO' } } }, // standby, ignored
            ],
          },
        },
      ],
    };
    const b = calcBoilerFuelByMode(voyage as unknown as Voyage, solsticeClass);
    expect(b.port).toBeCloseTo(8.3, 2);
    expect(b.sailing).toBeCloseTo(16.6, 2);
  });

  it('returns zeros on empty voyage', () => {
    expect(calcBoilerFuelByMode({ legs: [] } as unknown as Voyage, solsticeClass)).toEqual({
      sailing: 0, port: 0,
    });
  });
});
