import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RECONCILE_TOLERANCES,
  resolveReconcileTolerances,
  latestArrivalRob,
  latestArrivalFreshWaterRob,
  latestArrivalAlkaliRob,
} from './calculations';
import type { Voyage } from '../types/domain';

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
