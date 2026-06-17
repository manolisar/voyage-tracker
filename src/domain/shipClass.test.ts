import { describe, it, expect } from 'vitest';
import { resolveDefaultDensities } from './shipClass';
import type { ShipClass } from '../types/domain';

// NOTE: defaultDensities() reads shipClass.defaultDensities (not .densities),
// so the mock uses that property name.
const shipClass = {
  defaultDensities: { HFO: 0.92, MGO: 0.83, LSFO: 0.92 },
} as unknown as ShipClass;

describe('resolveDefaultDensities', () => {
  it('returns class baseline when there are no overrides', () => {
    expect(resolveDefaultDensities(shipClass, undefined)).toEqual({ HFO: 0.92, MGO: 0.83, LSFO: 0.92 });
  });

  it('applies overrides on top of the baseline', () => {
    expect(resolveDefaultDensities(shipClass, { HFO: 0.9 })).toEqual({ HFO: 0.9, MGO: 0.83, LSFO: 0.92 });
  });

  it('ignores a null shipClass by returning the overrides alone', () => {
    expect(resolveDefaultDensities(null, { HFO: 0.9 })).toEqual({ HFO: 0.9 });
  });
});
