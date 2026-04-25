// Pure helpers extracted from VoyageStoreProvider for unit testability.
// All logic in here is React-free — no hooks, no refs, no state.
// Consumed by VoyageStoreProvider.

import type {
  Phase,
  Voyage,
  VoyageManifestEntry,
} from '../types/domain';

const EMPTY_PORT = { code: '', name: '', country: '', locode: '' } as const;

// Filename: <SHIP_CODE>_<startDate>_<fromPort>-<toPort>.json
// Ship code comes from ships.json (`code` field). Port codes are the 3-letter
// UN/LOCODE suffix. See CLAUDE.md §3 for the full contract.
export function buildFilename(
  shipCode: string,
  startDate: string | null | undefined,
  fromPort: string,
  toPort: string,
): string {
  const date = (startDate || '').trim() || new Date().toISOString().slice(0, 10);
  return `${shipCode}_${date}_${fromPort}-${toPort}.json`;
}

export function manifestEntryFrom(voyage: Voyage): VoyageManifestEntry {
  return {
    filename: voyage.filename ?? '',
    id: voyage.id,
    fromPort: voyage.fromPort || { ...EMPTY_PORT },
    toPort: voyage.toPort || { ...EMPTY_PORT },
    startDate: voyage.startDate || '',
    endDate: voyage.endDate || '',
    ended: !!voyage.voyageEnd,
  };
}

export type ReportKind = 'departure' | 'arrival';

export interface PhaseSource {
  filename: string;
  legId: number;
  kind: ReportKind;
  phaseId: number;
}

export interface PhaseTarget {
  filename: string;
  legId: number;
  kind: ReportKind;
  phaseId: number;
  phaseName: string;
}

// Find the next phase to apply a counter-end carry-over to:
//   1. Next phase within the same report
//   2. First phase of the same leg's arrival report (if source was departure)
//   3. First phase of the next leg's departure report (if source was arrival)
//   else null
export function findNextPhaseFor(
  voyage: Voyage | null | undefined,
  source: PhaseSource | null,
): PhaseTarget | null {
  if (!source || !voyage?.legs) return null;
  const legIdx = voyage.legs.findIndex((l) => l.id === source.legId);
  if (legIdx < 0) return null;
  const leg = voyage.legs[legIdx];
  const report = source.kind === 'departure' ? leg.departure : leg.arrival;
  if (!report?.phases) return null;
  const phaseIdx = report.phases.findIndex((p) => p.id === source.phaseId);
  if (phaseIdx < 0) return null;

  const buildTarget = (destLegId: number, destKind: ReportKind, destPhase: Phase): PhaseTarget => ({
    filename: source.filename,
    legId: destLegId,
    kind: destKind,
    phaseId: destPhase.id,
    phaseName:
      destPhase.name ||
      (destKind === 'departure' ? 'Departure Phase' : 'Arrival Phase'),
  });

  if (phaseIdx < report.phases.length - 1) {
    return buildTarget(leg.id, source.kind, report.phases[phaseIdx + 1]);
  }
  if (source.kind === 'departure' && leg.arrival?.phases?.length) {
    return buildTarget(leg.id, 'arrival', leg.arrival.phases[0]);
  }
  if (source.kind === 'arrival' && legIdx < voyage.legs.length - 1) {
    const nextLeg = voyage.legs[legIdx + 1];
    const destPhase = nextLeg?.departure?.phases?.[0];
    if (destPhase) return buildTarget(nextLeg.id, 'departure', destPhase);
  }
  return null;
}

export type FilterMode = 'active' | 'ended' | 'all';

export interface VoyageListFilters {
  filter: FilterMode;
  search: string;
}

export function filterVoyages(
  voyages: VoyageManifestEntry[],
  { filter, search }: VoyageListFilters,
): VoyageManifestEntry[] {
  const q = search.trim().toLowerCase();
  return voyages.filter((v) => {
    if (filter === 'active' && v.ended) return false;
    if (filter === 'ended' && !v.ended) return false;
    if (q) {
      const hay = [
        v.fromPort?.code,
        v.fromPort?.name,
        v.fromPort?.locode,
        v.toPort?.code,
        v.toPort?.name,
        v.toPort?.locode,
        v.startDate,
        v.endDate,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
