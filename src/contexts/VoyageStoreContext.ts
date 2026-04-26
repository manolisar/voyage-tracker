// Context object only. Provider lives in VoyageStoreProvider.tsx.
import { createContext } from 'react';
import type {
  Selection,
  ShipClass,
  Voyage,
  VoyageManifestEntry,
} from '../types/domain';
import type { PortRef } from '../types/domain';
import type { FilterMode, PhaseSource, PhaseTarget } from './voyageStore.helpers';

export interface VoyageConflict {
  filename: string;
  currentVoyage: unknown;
  currentMtime: number | null;
}

export interface CreateVoyageInput {
  shipClass: ShipClass;
  shipCode: string;
  fromPort: PortRef;
  toPort: PortRef;
  startDate: string;
  endDate?: string;
}

export interface AddLegInput {
  shipClass: ShipClass;
  fromPort?: string;
  toPort?: string;
  depDate?: string;
  arrDate?: string;
  carryOverFrom?: { arrival?: { phases?: unknown[] } } | null;
  // Optional pre-baked start values for the new leg's first departure phase.
  // Used by the New-Voyage Import-Counters flow (voyage→voyage carry-over).
  // Wins over carryOverFrom when both are provided.
  initialCounters?: Record<string, string> | null;
}

export interface EndVoyageInput {
  shipClass: ShipClass;
  endDate?: string;
  engineer?: string;
  notes?: string;
  lubeOil?: { meCons: string; lo13s14s: string; usedLo13c: string } | null;
}

export type VoyageMutator = Voyage | ((v: Voyage) => Voyage);

export interface VoyageStoreContextValue {
  // Manifest
  voyages: VoyageManifestEntry[];
  visibleVoyages: VoyageManifestEntry[];
  listLoading: boolean;
  listError: string | null;
  refreshList: () => Promise<void>;

  // Per-file load state
  loadedById: Record<string, Voyage>;
  loadingFiles: Record<string, boolean>;
  loadVoyage: (filename: string) => Promise<Voyage | null>;

  // Editing
  dirty: Set<string>;
  saving: Set<string>;
  updateVoyage: (filename: string, mutator: VoyageMutator) => void;
  createVoyage: (partial: CreateVoyageInput) => Promise<string>;
  addLeg: (filename: string, input: AddLegInput) => number;
  // Removes a leg from the voyage. Refuses (throws) when the voyage is closed
  // — the chief must reopen first. Goes through the standard updateVoyage +
  // autosave path; the on-disk file is rewritten with the leg gone.
  deleteLeg: (filename: string, legId: number) => void;
  endVoyage: (filename: string, input: EndVoyageInput) => void;
  // Reopens a previously-ended voyage so it can be amended. Clears
  // voyageEnd + endDate; the chief must explicitly re-close (calling
  // endVoyage again) to lock it once amendments are done.
  reopenVoyage: (filename: string) => void;
  deleteVoyage: (filename: string) => Promise<void>;
  discardDraft: (filename: string) => void;
  flushSave: (filename: string, opts?: { forceOverwrite?: boolean }) => Promise<void>;

  // Manual carry-over (phase END → next phase START)
  lastEditedPhase: PhaseSource | null;
  trackPhaseEnd: (source: PhaseSource | null) => void;
  findNextPhaseFor: (source: PhaseSource | null) => PhaseTarget | null;
  applyCarryOver: (
    target: PhaseTarget,
    counters: Record<string, string | number | null | undefined>,
  ) => void;

  // Conflict (stale-file modal)
  conflict: VoyageConflict | null;
  reloadFromRemote: () => Promise<void>;
  forceOverwrite: () => Promise<void>;
  cancelConflict: () => void;

  // Tree selection / expansion
  selected: Selection | null;
  expanded: Set<string>;
  select: (sel: Selection | null) => Promise<void>;
  toggleExpand: (key: string) => void;
  expand: (key: string) => void;
  expandAll: () => void;
  collapseAll: () => void;

  // Filters
  filter: FilterMode;
  setFilter: (f: FilterMode) => void;
  search: string;
  setSearch: (s: string) => void;
}

export const VoyageStoreContext = createContext<VoyageStoreContextValue | null>(null);
