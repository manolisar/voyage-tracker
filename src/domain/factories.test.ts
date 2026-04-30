import { describe, it, expect } from 'vitest';
import {
  defaultVoyage,
  defaultLeg,
  defaultReport,
  defaultEquipment,
  defaultVoyageEnd,
  voyageRouteLabel,
  voyageRouteLongLabel,
  inheritedCounter,
  sortLegsByDate,
} from './factories';
import { APP_VERSION, REPORT_TYPES } from './constants';
import solsticeClassRaw from '../../public/ship-classes/solstice-class.json';
import type { ShipClass } from '../types/domain';

const solsticeClass = solsticeClassRaw as unknown as ShipClass;

describe('inheritedCounter', () => {
  it('returns end when end is non-empty', () => {
    expect(inheritedCounter({ start: '100', end: '105' })).toBe('105');
    expect(inheritedCounter({ start: '', end: '105' })).toBe('105');
    expect(inheritedCounter({ start: '100', end: '0' })).toBe('0'); // '0' is a valid end value
  });

  it('falls back to start when end is empty (counter idle = position preserved)', () => {
    expect(inheritedCounter({ start: '100', end: '' })).toBe('100');
    expect(inheritedCounter({ start: '0', end: '' })).toBe('0');
  });

  it('returns "" when both start and end are empty', () => {
    expect(inheritedCounter({ start: '', end: '' })).toBe('');
  });

  it('returns "" for null / undefined inputs', () => {
    expect(inheritedCounter(null)).toBe('');
    expect(inheritedCounter(undefined)).toBe('');
  });

  it('treats null/undefined fields as empty', () => {
    expect(inheritedCounter({ start: null as unknown as string, end: null as unknown as string })).toBe('');
    expect(inheritedCounter({ start: '100', end: undefined as unknown as string })).toBe('100');
    expect(inheritedCounter({ start: undefined as unknown as string, end: '105' })).toBe('105');
  });
});

describe('defaultVoyage', () => {
  it('returns a complete voyage shell', () => {
    const v = defaultVoyage('SL', solsticeClass);
    expect(v.shipId).toBe('SL');
    expect(v.classId).toBe('solstice-class');
    expect(v.version).toBe(APP_VERSION);
    expect(v.voyageEnd).toBeNull();
    expect(v.legs).toEqual([]);
    expect(v.filename).toBeNull();
    expect(v.startDate).toBe('');
    expect(v.endDate).toBe('');
  });

  it('returns fromPort/toPort as PortRef objects (not strings)', () => {
    const v = defaultVoyage('SL', solsticeClass);
    expect(v.fromPort).toEqual({ code: '', name: '', country: '', locode: '' });
    expect(v.toPort).toEqual({ code: '', name: '', country: '', locode: '' });
  });

  it('seeds densities from ship-class defaults', () => {
    const v = defaultVoyage('SL', solsticeClass);
    expect(v.densities.HFO).toBe(0.92);
    expect(v.densities.MGO).toBe(0.83);
    expect(v.densities.LSFO).toBe(0.92);
  });

  it('clones densities (mutating voyage does not mutate class config)', () => {
    const v = defaultVoyage('SL', solsticeClass);
    v.densities.HFO = 0.5;
    expect(solsticeClass.defaultDensities.HFO).toBe(0.92);
  });
});

describe('defaultEquipment', () => {
  it('produces an entry for each piece of equipment with the correct default fuel', () => {
    const eq = defaultEquipment(solsticeClass);
    expect(eq.dg12.fuel).toBe('HFO');
    expect(eq.dg4.fuel).toBe('HFO');
    expect(eq.dg3.fuel).toBe('MGO');
    expect(eq.boiler1.fuel).toBe('MGO');
    expect(eq.boiler2.fuel).toBe('MGO');
  });

  it('seeds start/end as empty strings (not zero, not null)', () => {
    const eq = defaultEquipment(solsticeClass);
    expect(eq.dg12.start).toBe('');
    expect(eq.dg12.end).toBe('');
  });
});

describe('defaultReport', () => {
  it('builds a departure report with 2 phases (FWE→SBE port, SBE→FA standby)', () => {
    const r = defaultReport(solsticeClass, REPORT_TYPES.DEPARTURE);
    expect(r.type).toBe('departure');
    expect(r.phases).toHaveLength(2);
    expect(r.phases[0].type).toBe('port');
    expect(r.phases[1].type).toBe('standby');
  });

  it('builds an arrival report with 2 phases (FA→SBE sea, SBE→FWE standby)', () => {
    const r = defaultReport(solsticeClass, REPORT_TYPES.ARRIVAL);
    expect(r.type).toBe('arrival');
    expect(r.phases).toHaveLength(2);
    expect(r.phases[0].type).toBe('sea');
    expect(r.phases[1].type).toBe('standby');
  });

  it('seeds rob/bunkered as empty strings (not zero, not null)', () => {
    const r = defaultReport(solsticeClass, REPORT_TYPES.DEPARTURE);
    expect(r.rob).toEqual({ hfo: '', mgo: '', lsfo: '' });
    expect(r.bunkered).toEqual({ hfo: '', mgo: '', lsfo: '' });
  });

  it('does NOT include lubeOil (recorded only at End Voyage)', () => {
    const r = defaultReport(solsticeClass, REPORT_TYPES.DEPARTURE);
    expect((r as unknown as Record<string, unknown>).lubeOil).toBeUndefined();
  });

  it('seeds equipment on every phase from class config', () => {
    const r = defaultReport(solsticeClass, REPORT_TYPES.DEPARTURE);
    for (const phase of r.phases) {
      expect(Object.keys(phase.equipment).sort()).toEqual(
        ['boiler1', 'boiler2', 'dg12', 'dg3', 'dg4'],
      );
    }
  });
});

describe('defaultLeg', () => {
  it('always seeds a non-null voyageReport', () => {
    const leg = defaultLeg(solsticeClass);
    expect(leg.voyageReport).not.toBeNull();
    expect(leg.voyageReport!.voyage).toBeDefined();
    expect(leg.voyageReport!.departure).toBeDefined();
    expect(leg.voyageReport!.arrival).toBeDefined();
  });
});

describe('defaultVoyageEnd', () => {
  it('seeds zero numeric totals (not strings)', () => {
    const ve = defaultVoyageEnd(solsticeClass);
    expect(ve.totals.hfo).toBe(0);
    expect(ve.totals.mgo).toBe(0);
    expect(ve.totals.lsfo).toBe(0);
    expect(ve.totals.freshWaterCons).toBe(0);
  });

  it('snapshots ship-class densities on close', () => {
    const ve = defaultVoyageEnd(solsticeClass);
    expect(ve.densitiesAtClose).toEqual(solsticeClass.defaultDensities);
  });
});

describe('voyageRouteLabel', () => {
  it('returns em-dash on missing/null voyage or ports', () => {
    expect(voyageRouteLabel({})).toBe('—');
    expect(voyageRouteLabel(null)).toBe('—');
    expect(voyageRouteLabel({ fromPort: { code: 'MIA' } })).toBe('—');
  });

  it('returns "FROM → TO" with codes', () => {
    expect(
      voyageRouteLabel({
        fromPort: { code: 'MIA' },
        toPort: { code: 'FLL' },
      }),
    ).toBe('MIA → FLL');
  });
});

describe('sortLegsByDate', () => {
  // Build a fake Leg with just enough shape to satisfy the type. The sort
  // only reads departure.date, so the rest can be cast through unknown.
  const leg = (id: number, depDate: string) =>
    ({ id, departure: { date: depDate }, arrival: {} } as unknown as import('../types/domain').Leg);

  it('returns [] for null/undefined/empty input', () => {
    expect(sortLegsByDate(null)).toEqual([]);
    expect(sortLegsByDate(undefined)).toEqual([]);
    expect(sortLegsByDate([])).toEqual([]);
  });

  it('sorts ascending by departure date', () => {
    const out = sortLegsByDate([
      leg(3, '2026-03-01'),
      leg(1, '2026-01-01'),
      leg(2, '2026-02-01'),
    ]);
    expect(out.map((l) => l.id)).toEqual([1, 2, 3]);
  });

  it('leaves an already-sorted list unchanged', () => {
    const ls = [leg(1, '2026-01-01'), leg(2, '2026-02-01'), leg(3, '2026-03-01')];
    expect(sortLegsByDate(ls).map((l) => l.id)).toEqual([1, 2, 3]);
  });

  it('does not mutate the input array', () => {
    const ls = [leg(3, '2026-03-01'), leg(1, '2026-01-01'), leg(2, '2026-02-01')];
    const before = ls.map((l) => l.id);
    sortLegsByDate(ls);
    expect(ls.map((l) => l.id)).toEqual(before);
  });

  it('sinks empty-date legs to the bottom', () => {
    const out = sortLegsByDate([
      leg(2, ''),
      leg(1, '2026-01-01'),
      leg(3, '2026-02-01'),
    ]);
    expect(out.map((l) => l.id)).toEqual([1, 3, 2]);
  });

  it('keeps relative order between two empty-date legs (stable enough for display)', () => {
    const out = sortLegsByDate([leg(1, ''), leg(2, ''), leg(3, '2026-01-01')]);
    expect(out[0].id).toBe(3);
    // Empty-date entries follow; both ordered after the dated leg.
    expect(out.slice(1).map((l) => l.id).sort()).toEqual([1, 2]);
  });
});

describe('voyageRouteLongLabel', () => {
  it('uses port name when present, falls back to code', () => {
    expect(
      voyageRouteLongLabel({
        fromPort: { code: 'MIA', name: 'Miami' },
        toPort: { code: 'FLL' },
      }),
    ).toBe('Miami → FLL');
  });
});
