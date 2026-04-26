// DetailPane — routes the currently-selected tree node to the correct detail
// component. Uses VoyageStoreContext for selection + loaded data, and the
// session context for editMode (flipped by the TopBar "Enable Edit" button).
//
// Selection shapes:
//   null                                                  → EmptyState
//   { filename, kind: 'voyage' }                          → VoyageDetail
//   { filename, kind: 'leg', legId }                      → VoyageDetail (leg has no own page)
//   { filename, kind: 'departure'|'arrival', legId }      → ReportDetail / ReportForm
//   { filename, kind: 'voyageReport', legId }             → VoyageReportDetail / VoyageReportSection
//   { filename, kind: 'voyageEnd' }                       → VoyageEndDetail

import { useEffect, useCallback, useState } from 'react';
import { useSession } from '../../hooks/useSession';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { defaultDensities } from '../../domain/shipClass';
import { defaultVoyageReport, inheritedCounter } from '../../domain/factories';
import { EmptyState } from '../detail/EmptyState';
import { VoyageDetail } from '../detail/VoyageDetail';
import { ReportDetail } from '../detail/ReportDetail';
import { VoyageReportDetail } from '../detail/VoyageReportDetail';
import { VoyageEndDetail } from '../detail/VoyageEndDetail';
import { ReportForm } from '../voyage/ReportForm';
import { VoyageReportSection } from '../voyage/VoyageReportSection';
import { FloatingCarryOverButton } from '../ui/FloatingCarryOverButton';
import { ManualCarryOverModal } from '../modals/ManualCarryOverModal';
import type { Report, ReportKind, Ship, ShipClass, Voyage } from '../../types/domain';

interface Props {
  ship: Ship | null | undefined;
  shipClass: ShipClass | null;
  onAddLeg?: (filename: string) => void;
  onEndVoyage?: (filename: string) => void;
  onDeleteVoyage?: (filename: string) => void;
  onDeleteLeg?: (filename: string, legId: number) => void;
}

export function DetailPane({
  ship,
  shipClass,
  onAddLeg,
  onEndVoyage,
  onDeleteVoyage,
  onDeleteLeg,
}: Props) {
  const { editMode } = useSession();
  const {
    selected, loadedById, loadVoyage, loadingFiles, updateVoyage,
    trackPhaseEnd,
  } = useVoyageStore();

  const [carryOverOpen, setCarryOverOpen] = useState(false);

  // Lazily make sure the selected voyage is loaded.
  useEffect(() => {
    if (selected?.filename && !loadedById[selected.filename]) {
      loadVoyage(selected.filename);
    }
  }, [selected, loadedById, loadVoyage]);

  // Helper: produce an `onChange` for a given leg's report (departure|arrival).
  // Also diffs the incoming report against the previous one to detect the
  // LATEST phase whose equipment END value changed — when we find one, we
  // stamp it into `lastEditedPhase` so the floating carry-over button knows
  // where to carry from.
  const onReportChange = useCallback(
    (filename: string, legId: number, kind: ReportKind, newReport: Report) => {
      updateVoyage(filename, (v) => {
        const oldLeg = v.legs.find((l) => l.id === legId);
        const oldReport = oldLeg?.[kind];
        // Find the phase whose equipment END value just changed, if any.
        if (oldReport?.phases && newReport?.phases) {
          for (const newPhase of newReport.phases) {
            const oldPhase = oldReport.phases.find((p) => p.id === newPhase.id);
            if (!oldPhase) continue;
            let changedEndKey: string | null = null;
            for (const eqKey of Object.keys(newPhase.equipment || {})) {
              const newEnd = newPhase.equipment?.[eqKey]?.end;
              const oldEnd = oldPhase.equipment?.[eqKey]?.end;
              if (newEnd !== oldEnd) {
                changedEndKey = eqKey;
                break;
              }
            }
            if (changedEndKey) {
              // Snapshot inherited values (end || start) from the NEW phase so
              // the carry-over modal can offer every equipment with a known
              // position — equipment whose end is empty but whose start is set
              // (idle for this phase) still carries forward its last known
              // counter, instead of being silently blanked downstream.
              const equipmentSnapshot: Record<string, string> = {};
              for (const [k, eq] of Object.entries(newPhase.equipment || {})) {
                const v = inheritedCounter(eq);
                if (v) equipmentSnapshot[k] = v;
              }
              trackPhaseEnd({
                filename,
                legId,
                kind,
                phaseId: newPhase.id,
                phaseName:
                  newPhase.name || (kind === 'departure' ? 'Departure Phase' : 'Arrival Phase'),
                equipment: equipmentSnapshot,
              });
              break;
            }
          }
        }
        return {
          ...v,
          legs: v.legs.map((l) => (l.id === legId ? { ...l, [kind]: newReport } : l)),
        };
      });
    },
    [updateVoyage, trackPhaseEnd],
  );

  const onVoyageReportChange = useCallback(
    (filename: string, legId: number, newVR: Voyage['legs'][number]['voyageReport']) => {
      updateVoyage(filename, (v) => ({
        ...v,
        legs: v.legs.map((l) => (l.id === legId ? { ...l, voyageReport: newVR } : l)),
      }));
    },
    [updateVoyage],
  );

  // Seed an empty voyageReport on first visit for legacy legs (pre-v7 imports).
  // Must run in an effect — doing this during render would trigger a setState
  // on the store provider while DetailPane is still rendering.
  const voyageForEffect = selected?.filename ? loadedById[selected.filename] : undefined;
  const legForEffect = voyageForEffect?.legs?.find((l) => l.id === selected?.legId);
  const needsVRSeed =
    editMode &&
    selected?.kind === 'voyageReport' &&
    legForEffect &&
    !legForEffect.voyageReport &&
    !voyageForEffect?.voyageEnd; // skip seeding into a locked voyage
  useEffect(() => {
    if (!needsVRSeed || !voyageForEffect?.filename || !legForEffect) return;
    onVoyageReportChange(voyageForEffect.filename, legForEffect.id, defaultVoyageReport());
  }, [needsVRSeed, voyageForEffect?.filename, legForEffect, onVoyageReportChange]);

  if (!selected) return <EmptyState ship={ship} />;

  const voyage = loadedById[selected.filename];
  const isLoading = loadingFiles[selected.filename];

  if (!voyage) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center" style={{ color: 'var(--color-dim)' }}>
        {isLoading ? 'Loading voyage…' : 'Voyage not loaded.'}
      </div>
    );
  }

  if (!shipClass) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center" style={{ color: 'var(--color-dim)' }}>
        Loading ship class…
      </div>
    );
  }

  // Voyage is locked from edits once it's been ended; the chief reopens it
  // (clears voyageEnd) to amend. The form-level read-only flag below
  // honours both editMode AND lock state.
  const isLocked = !!voyage.voyageEnd;
  const canEdit = editMode && !isLocked;

  if (selected.kind === 'voyage' || selected.kind === 'leg') {
    return (
      <VoyageDetail
        voyage={voyage}
        shipClass={shipClass}
        ship={ship}
        editMode={editMode}
        onAddLeg={onAddLeg}
        onEndVoyage={onEndVoyage}
        onDeleteVoyage={onDeleteVoyage}
        onDeleteLeg={onDeleteLeg}
      />
    );
  }

  if (selected.kind === 'voyageEnd') {
    return <VoyageEndDetail voyage={voyage} />;
  }

  const leg = voyage.legs?.find((l) => l.id === selected.legId) || null;
  if (!leg) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center" style={{ color: 'var(--color-error-fg)' }}>
        Leg not found in this voyage.
      </div>
    );
  }

  const densities = voyage.densities || defaultDensities(shipClass);

  if (selected.kind === 'departure' || selected.kind === 'arrival') {
    if (canEdit) {
      const report = leg[selected.kind];
      if (!report) {
        return (
          <div className="max-w-3xl mx-auto p-6 text-center" style={{ color: 'var(--color-dim)' }}>
            No {selected.kind} report on this leg.
          </div>
        );
      }
      const filename = voyage.filename ?? '';
      return (
        <div className="max-w-5xl mx-auto">
          <ReportForm
            report={report}
            shipClass={shipClass}
            densities={densities}
            onChange={(newReport: Report) =>
              onReportChange(filename, leg.id, selected.kind as ReportKind, newReport)
            }
          />
          <FloatingCarryOverButton onClick={() => setCarryOverOpen(true)} />
          {carryOverOpen && (
            <ManualCarryOverModal
              shipClass={shipClass}
              onClose={() => setCarryOverOpen(false)}
            />
          )}
        </div>
      );
    }
    return (
      <ReportDetail
        voyage={voyage}
        leg={leg}
        kind={selected.kind}
        shipClass={shipClass}
      />
    );
  }

  if (selected.kind === 'voyageReport') {
    // Legacy legs (pre-v7 imports) may have voyageReport: null — the effect
    // above seeds one asynchronously. Until that settles we render against a
    // throwaway default so the form has something to bind to.
    const vr = leg.voyageReport || defaultVoyageReport();
    if (canEdit) {
      const filename = voyage.filename ?? '';
      return (
        <div className="max-w-5xl mx-auto">
          <VoyageReportSection
            voyageReport={vr}
            depPort={leg.departure?.port}
            arrPort={leg.arrival?.port}
            depDate={leg.departure?.date}
            arrDate={leg.arrival?.date}
            onChange={(newVR: Voyage['legs'][number]['voyageReport']) =>
              onVoyageReportChange(filename, leg.id, newVR)
            }
            onDelete={null}
          />
        </div>
      );
    }
    return <VoyageReportDetail leg={{ ...leg, voyageReport: vr }} />;
  }

  return <EmptyState ship={ship} />;
}
