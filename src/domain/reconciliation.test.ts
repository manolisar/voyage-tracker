import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RECONCILE_TOLERANCES,
  resolveReconcileTolerances,
  latestArrivalRob,
  latestArrivalFreshWaterRob,
  latestArrivalAlkaliRob,
  calcReconciliation,
} from './calculations';
import type { ShipClass, Voyage } from '../types/domain';

// Minimal voyage builder for these helpers — only the fields they read.
function voyageWith(legs: Array<{ arrRob?: Record<string, string>; fwRob?: string; alkRob?: string }>): Voyage {
  return {
    legs: legs.map((l, i) => ({
      id: i,
      departure: { aep: {}, rob: {}, freshWater: {} },
      arrival: {
        rob: l.arrRob ?? { hfo: '', mgo: '', lsfo: '' },
        freshWater: { rob: l.fwRob ?? '' },
        aep: { alkaliRob: l.alkRob ?? '' },
      },
      voyageReport: null,
    })),
  } as unknown as Voyage;
}

describe('resolveReconcileTolerances', () => {
  it('returns defaults when nothing is set', () => {
    expect(resolveReconcileTolerances(undefined)).toEqual(DEFAULT_RECONCILE_TOLERANCES);
    expect(resolveReconcileTolerances(null)).toEqual(DEFAULT_RECONCILE_TOLERANCES);
    expect(resolveReconcileTolerances({})).toEqual(DEFAULT_RECONCILE_TOLERANCES);
  });

  it('overrides only the provided keys', () => {
    expect(resolveReconcileTolerances({ fuel: 0.5 })).toEqual({
      fuel: 0.5,
      water: DEFAULT_RECONCILE_TOLERANCES.water,
      naoh: DEFAULT_RECONCILE_TOLERANCES.naoh,
    });
  });

  it('defaults the default values to 2 / 5 / 10', () => {
    expect(DEFAULT_RECONCILE_TOLERANCES).toEqual({ fuel: 2, water: 5, naoh: 10 });
  });
});

describe('latestArrivalRob', () => {
  it('returns the last non-empty arrival fuel ROB', () => {
    const v = voyageWith([
      { arrRob: { hfo: '100', mgo: '', lsfo: '' } },
      { arrRob: { hfo: '90', mgo: '5', lsfo: '' } },
    ]);
    expect(latestArrivalRob(v)).toEqual({ hfo: '90', mgo: '5', lsfo: '' });
  });

  it('skips all-empty arrival ROB objects', () => {
    const v = voyageWith([
      { arrRob: { hfo: '100', mgo: '', lsfo: '' } },
      { arrRob: { hfo: '', mgo: '', lsfo: '' } },
    ]);
    expect(latestArrivalRob(v)).toEqual({ hfo: '100', mgo: '', lsfo: '' });
  });

  it('returns an empty object when no leg has an arrival ROB', () => {
    expect(latestArrivalRob(voyageWith([{}]))).toEqual({});
    expect(latestArrivalRob(null as unknown as Voyage)).toEqual({});
  });
});

describe('latestArrivalFreshWaterRob / latestArrivalAlkaliRob', () => {
  it('returns the latest non-empty values', () => {
    const v = voyageWith([
      { fwRob: '300', alkRob: '50' },
      { fwRob: '280', alkRob: '' },
    ]);
    expect(latestArrivalFreshWaterRob(v)).toBe('280');
    expect(latestArrivalAlkaliRob(v)).toBe('50');
  });
});

const SHIP_CLASS = {
  id: 'test', displayName: 'Test', fuels: ['HFO', 'MGO', 'LSFO'],
  defaultDensities: { HFO: 0.92, MGO: 0.83, LSFO: 0.92 }, equipment: [],
} as unknown as ShipClass;

const TOL = { fuel: 2, water: 5, naoh: 10 };

// Voyage with one leg: arrival fuel ROB + bunkered + freshWater + aep.
// No equipment phases → metered fuel consumption is 0 (keeps the math simple
// so the test asserts the balance wiring, not calcConsumption which is tested
// elsewhere).
function makeVoyage(over: {
  arrRob?: Record<string, string>;
  bunker?: Record<string, string>;
  fw?: Record<string, string>;
  aep?: Record<string, string>;
}): Voyage {
  return {
    filename: 'cur.json', densities: { HFO: 0.92, MGO: 0.83, LSFO: 0.92 },
    legs: [{
      id: 1,
      departure: {
        phases: [], rob: { hfo: '', mgo: '', lsfo: '' },
        bunkered: over.bunker ?? { hfo: '', mgo: '', lsfo: '' },
        freshWater: { rob: '', bunkered: over.fw?.bunkered ?? '', production: '', consumption: '' },
        aep: { alkaliCons: '', alkaliRob: '', alkaliBunkered: over.aep?.alkaliBunkered ?? '' },
      },
      arrival: {
        phases: [], rob: over.arrRob ?? { hfo: '', mgo: '', lsfo: '' },
        bunkered: { hfo: '', mgo: '', lsfo: '' },
        freshWater: {
          rob: over.fw?.rob ?? '', bunkered: '',
          production: over.fw?.production ?? '', consumption: over.fw?.consumption ?? '',
        },
        aep: {
          alkaliCons: over.aep?.alkaliCons ?? '', alkaliRob: over.aep?.alkaliRob ?? '',
          alkaliBunkered: '',
        },
      },
      voyageReport: null,
    }],
  } as unknown as Voyage;
}

describe('calcReconciliation', () => {
  it('flags no-prev-voyage with hasPrev=false and null expecteds', () => {
    const cur = makeVoyage({ arrRob: { hfo: '100', mgo: '', lsfo: '' } });
    const res = calcReconciliation(cur, null, SHIP_CLASS, TOL);
    expect(res.hasPrev).toBe(false);
    const hfo = res.rows.find((r) => r.key === 'hfo')!;
    expect(hfo.expected).toBeNull();
    expect(hfo.offset).toBeNull();
    expect(hfo.withinTolerance).toBe(true);
  });

  it('computes the fuel balance: measured − (prev + bunker − cons)', () => {
    const prev = makeVoyage({ arrRob: { hfo: '400', mgo: '', lsfo: '' } });
    const cur = makeVoyage({
      arrRob: { hfo: '690', mgo: '', lsfo: '' },
      bunker: { hfo: '300', mgo: '', lsfo: '' },
    });
    const res = calcReconciliation(cur, prev, SHIP_CLASS, TOL);
    const hfo = res.rows.find((r) => r.key === 'hfo')!;
    expect(hfo.prevRob).toBe(400);
    expect(hfo.bunker).toBe(300);
    expect(hfo.production).toBeNull();
    expect(hfo.consumption).toBe(0);
    expect(hfo.expected).toBe(700);
    expect(hfo.measured).toBe(690);
    expect(hfo.offset).toBe(-10);
    expect(hfo.withinTolerance).toBe(false);
  });

  it('adds production for the water row and respects the water tolerance', () => {
    const prev = makeVoyage({ fw: { rob: '200' } });
    const cur = makeVoyage({
      fw: { rob: '53', bunkered: '50', production: '1000', consumption: '1200' },
    });
    const res = calcReconciliation(cur, prev, SHIP_CLASS, TOL);
    const water = res.rows.find((r) => r.key === 'water')!;
    expect(water.production).toBe(1000);
    expect(water.expected).toBe(50);
    expect(water.offset).toBe(3);
    expect(water.withinTolerance).toBe(true);
  });

  it('computes NaOH with its bunkered field and tolerance', () => {
    const prev = makeVoyage({ aep: { alkaliRob: '500' } });
    const cur = makeVoyage({
      aep: { alkaliRob: '535', alkaliBunkered: '200', alkaliCons: '150' },
    });
    const res = calcReconciliation(cur, prev, SHIP_CLASS, TOL);
    const naoh = res.rows.find((r) => r.key === 'naoh')!;
    expect(naoh.expected).toBe(550);
    expect(naoh.offset).toBe(-15);
    expect(naoh.withinTolerance).toBe(false);
  });

  it('leaves a row null when this cruise has no end sounding', () => {
    const prev = makeVoyage({ arrRob: { hfo: '400', mgo: '', lsfo: '' } });
    const cur = makeVoyage({ bunker: { hfo: '300', mgo: '', lsfo: '' } });
    const res = calcReconciliation(cur, prev, SHIP_CLASS, TOL);
    const hfo = res.rows.find((r) => r.key === 'hfo')!;
    expect(hfo.measured).toBeNull();
    expect(hfo.offset).toBeNull();
    expect(hfo.withinTolerance).toBe(true);
  });
});
