import { describe, it, expect } from 'vitest';
import {
  buildFilename,
  manifestEntryFrom,
  findNextPhaseFor,
  filterVoyages,
  type PhaseSource,
} from './voyageStore.helpers';
import type { Voyage, VoyageManifestEntry } from '../types/domain';

describe('buildFilename', () => {
  it('produces the v7 filename shape', () => {
    expect(buildFilename('SL', '2026-01-15', 'MIA', 'FLL'))
      .toBe('SL_2026-01-15_MIA-FLL.json');
  });

  it('falls back to today when startDate is empty/whitespace', () => {
    const f = buildFilename('SL', '', 'MIA', 'FLL');
    expect(f).toMatch(/^SL_\d{4}-\d{2}-\d{2}_MIA-FLL\.json$/);

    const f2 = buildFilename('SL', '   ', 'MIA', 'FLL');
    expect(f2).toMatch(/^SL_\d{4}-\d{2}-\d{2}_MIA-FLL\.json$/);
  });

  it('falls back to today when startDate is null/undefined', () => {
    expect(buildFilename('SL', null, 'MIA', 'FLL')).toMatch(/^SL_\d{4}-\d{2}-\d{2}_MIA-FLL\.json$/);
    expect(buildFilename('SL', undefined, 'MIA', 'FLL')).toMatch(/^SL_\d{4}-\d{2}-\d{2}_MIA-FLL\.json$/);
  });
});

describe('manifestEntryFrom', () => {
  const fullVoyage = {
    id: 1,
    filename: 'SL_2026-01-15_MIA-FLL.json',
    fromPort: { code: 'MIA', name: 'Miami', country: 'US', locode: 'USMIA' },
    toPort: { code: 'FLL', name: 'Fort Lauderdale', country: 'US', locode: 'USFLL' },
    startDate: '2026-01-15',
    endDate: '2026-01-22',
    voyageEnd: { completedAt: '2026-01-22T18:00:00Z' },
  } as unknown as Voyage;

  it('copies the fields the manifest cares about', () => {
    const m = manifestEntryFrom(fullVoyage);
    expect(m.filename).toBe('SL_2026-01-15_MIA-FLL.json');
    expect(m.id).toBe(1);
    expect(m.fromPort.code).toBe('MIA');
    expect(m.toPort.code).toBe('FLL');
    expect(m.startDate).toBe('2026-01-15');
    expect(m.endDate).toBe('2026-01-22');
    expect(m.ended).toBe(true);
  });

  it('marks ended=false when voyageEnd is null/missing', () => {
    const v = { ...fullVoyage, voyageEnd: null } as unknown as Voyage;
    expect(manifestEntryFrom(v).ended).toBe(false);
  });

  it('substitutes empty PortRef when fromPort/toPort are falsy', () => {
    const v = {
      id: 1,
      filename: 'x.json',
      startDate: '2026-01-15',
    } as unknown as Voyage;
    const m = manifestEntryFrom(v);
    expect(m.fromPort).toEqual({ code: '', name: '', country: '', locode: '' });
    expect(m.toPort).toEqual({ code: '', name: '', country: '', locode: '' });
  });

  it('substitutes empty filename when voyage.filename is null', () => {
    const v = {
      id: 1,
      filename: null,
      fromPort: { code: 'MIA' },
      toPort: { code: 'FLL' },
    } as unknown as Voyage;
    expect(manifestEntryFrom(v).filename).toBe('');
  });
});

describe('findNextPhaseFor', () => {
  // Synthetic voyage: 2 legs.
  // Leg 1: departure has 2 phases (10, 11), arrival has 1 phase (20).
  // Leg 2: departure has 1 phase (30), arrival has 1 phase (40).
  const voyage = {
    legs: [
      {
        id: 1,
        departure: {
          phases: [
            { id: 10, name: 'FWE→SBE' },
            { id: 11, name: 'SBE→FA' },
          ],
        },
        arrival: {
          phases: [{ id: 20, name: 'FA→FWE' }],
        },
      },
      {
        id: 2,
        departure: {
          phases: [{ id: 30, name: 'FWE→SBE' }],
        },
        arrival: {
          phases: [{ id: 40, name: 'FA→FWE' }],
        },
      },
    ],
  } as unknown as Voyage;

  it('jumps to next phase within the same departure report', () => {
    const src: PhaseSource = { filename: 'x', legId: 1, kind: 'departure', phaseId: 10 };
    const out = findNextPhaseFor(voyage, src);
    expect(out).not.toBeNull();
    expect(out!.legId).toBe(1);
    expect(out!.kind).toBe('departure');
    expect(out!.phaseId).toBe(11);
  });

  it('jumps from last departure phase to first arrival phase of same leg', () => {
    const src: PhaseSource = { filename: 'x', legId: 1, kind: 'departure', phaseId: 11 };
    const out = findNextPhaseFor(voyage, src);
    expect(out!.legId).toBe(1);
    expect(out!.kind).toBe('arrival');
    expect(out!.phaseId).toBe(20);
  });

  it('jumps from last arrival phase of leg N to first departure phase of leg N+1', () => {
    const src: PhaseSource = { filename: 'x', legId: 1, kind: 'arrival', phaseId: 20 };
    const out = findNextPhaseFor(voyage, src);
    expect(out!.legId).toBe(2);
    expect(out!.kind).toBe('departure');
    expect(out!.phaseId).toBe(30);
  });

  it('returns null at the end (last arrival of last leg)', () => {
    const src: PhaseSource = { filename: 'x', legId: 2, kind: 'arrival', phaseId: 40 };
    expect(findNextPhaseFor(voyage, src)).toBeNull();
  });

  it('returns null when the source phase is not found', () => {
    const src: PhaseSource = { filename: 'x', legId: 1, kind: 'departure', phaseId: 999 };
    expect(findNextPhaseFor(voyage, src)).toBeNull();
  });

  it('returns null when the source leg is not found', () => {
    const src: PhaseSource = { filename: 'x', legId: 999, kind: 'departure', phaseId: 10 };
    expect(findNextPhaseFor(voyage, src)).toBeNull();
  });

  it('returns null on null source or null voyage', () => {
    expect(findNextPhaseFor(voyage, null)).toBeNull();
    const src: PhaseSource = { filename: 'x', legId: 1, kind: 'departure', phaseId: 10 };
    expect(findNextPhaseFor(null, src)).toBeNull();
    expect(findNextPhaseFor(undefined, src)).toBeNull();
  });

  it('falls back to default phaseName when target phase has no name', () => {
    const v = {
      legs: [{
        id: 1,
        departure: { phases: [{ id: 10 }, { id: 11 }] },
        arrival: { phases: [] },
      }],
    } as unknown as Voyage;
    const src: PhaseSource = { filename: 'x', legId: 1, kind: 'departure', phaseId: 10 };
    expect(findNextPhaseFor(v, src)?.phaseName).toBe('Departure Phase');
  });
});

describe('filterVoyages', () => {
  const voyages: VoyageManifestEntry[] = [
    {
      filename: 'SL_2026-01-15_MIA-FLL.json',
      id: 1,
      fromPort: { code: 'MIA', name: 'Miami', country: 'US', locode: 'USMIA' },
      toPort: { code: 'FLL', name: 'Fort Lauderdale', country: 'US', locode: 'USFLL' },
      startDate: '2026-01-15',
      endDate: '2026-01-22',
      ended: true,
    },
    {
      filename: 'SL_2026-02-04_FLL-CZM.json',
      id: 2,
      fromPort: { code: 'FLL', name: 'Fort Lauderdale', country: 'US', locode: 'USFLL' },
      toPort: { code: 'CZM', name: 'Cozumel', country: 'MX', locode: 'MXCZM' },
      startDate: '2026-02-04',
      endDate: '',
      ended: false,
    },
  ];

  it('filter=active hides ended voyages', () => {
    expect(filterVoyages(voyages, { filter: 'active', search: '' })).toHaveLength(1);
    expect(filterVoyages(voyages, { filter: 'active', search: '' })[0].id).toBe(2);
  });

  it('filter=ended hides active voyages', () => {
    expect(filterVoyages(voyages, { filter: 'ended', search: '' })).toHaveLength(1);
    expect(filterVoyages(voyages, { filter: 'ended', search: '' })[0].id).toBe(1);
  });

  it('filter=all returns everything', () => {
    expect(filterVoyages(voyages, { filter: 'all', search: '' })).toHaveLength(2);
  });

  it('search matches port code (case-insensitive)', () => {
    expect(filterVoyages(voyages, { filter: 'all', search: 'czm' })).toHaveLength(1);
    expect(filterVoyages(voyages, { filter: 'all', search: 'CZM' })).toHaveLength(1);
  });

  it('search matches port name', () => {
    expect(filterVoyages(voyages, { filter: 'all', search: 'cozumel' })).toHaveLength(1);
  });

  it('search matches LOCODE', () => {
    expect(filterVoyages(voyages, { filter: 'all', search: 'usmia' })).toHaveLength(1);
  });

  it('search matches startDate', () => {
    expect(filterVoyages(voyages, { filter: 'all', search: '2026-02' })).toHaveLength(1);
  });

  it('whitespace-only search is treated as empty', () => {
    expect(filterVoyages(voyages, { filter: 'all', search: '   ' })).toHaveLength(2);
  });

  it('filter + search combine (intersection)', () => {
    expect(filterVoyages(voyages, { filter: 'ended', search: 'cozumel' })).toHaveLength(0);
    expect(filterVoyages(voyages, { filter: 'active', search: 'cozumel' })).toHaveLength(1);
  });
});
