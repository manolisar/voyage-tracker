import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RECONCILE_TOLERANCES,
  resolveReconcileTolerances,
} from './calculations';

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
