import { describe, expect, it } from 'vitest';
import { flattenVoyageTreeRows } from './voyageTreeRows';
import type { Voyage, VoyageManifestEntry } from '../../types/domain';

const entry: VoyageManifestEntry = {
  filename: 'SL_2026-01-15_MIA-NAS.json',
  id: 1,
  fromPort: { code: 'MIA', name: 'Miami', country: 'US', locode: 'USMIA' },
  toPort: { code: 'NAS', name: 'Nassau', country: 'BS', locode: 'BSNAS' },
  startDate: '2026-01-15',
  endDate: '',
  ended: false,
};

const voyage = {
  filename: entry.filename,
  legs: [
    { id: 10 },
    { id: 20 },
  ],
  voyageEnd: null,
} as unknown as Voyage;

describe('flattenVoyageTreeRows', () => {
  it('keeps keyboard navigation at voyage and leg level when legs are expanded', () => {
    const rows = flattenVoyageTreeRows(
      [entry],
      new Set([entry.filename, `${entry.filename}::10`, `${entry.filename}::20`]),
      { [entry.filename]: voyage },
    );

    expect(rows.map((row) => row.sel.kind)).toEqual(['voyage', 'leg', 'leg']);
    expect(rows.map((row) => row.sel.legId || null)).toEqual([null, 10, 20]);
  });

  it('still includes Voyage End when the voyage has been ended', () => {
    const rows = flattenVoyageTreeRows(
      [entry],
      new Set([entry.filename]),
      { [entry.filename]: { ...voyage, voyageEnd: { completedAt: '2026-01-20' } } as unknown as Voyage },
    );

    expect(rows.map((row) => row.sel.kind)).toEqual(['voyage', 'leg', 'leg', 'voyageEnd']);
  });
});
