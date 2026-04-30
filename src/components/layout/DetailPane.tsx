// DetailPane — routes the currently-selected tree node to the correct detail
// component. Uses VoyageStoreContext for selection + loaded data, and the
// session context for editMode (flipped by the TopBar "Enable Edit" button).
//
// Selection shapes:
//   null                                                  → EmptyState
//   { filename, kind: 'voyage' }                          → VoyageDetail
//   { filename, kind: 'leg', legId }                      → first incomplete leg report tab
//   { filename, kind: 'departure'|'arrival', legId }      → leg report tabs + ReportDetail / ReportForm
//   { filename, kind: 'voyageReport', legId }             → leg report tabs + VoyageReportDetail / VoyageReportSection
//   { filename, kind: 'voyageEnd' }                       → VoyageEndDetail

import { useEffect, useCallback, useState, type ReactNode } from 'react';
import { useSession } from '../../hooks/useSession';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import {
  LEG_REPORT_KINDS,
  getDefaultLegReportKind,
  getLegReportCompletion,
  isLegReportKind,
  legReportLabel,
  type LegReportKind,
} from '../../domain/legReportNavigation';
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
import type { Leg, Report, ReportKind, Ship, ShipClass, Voyage } from '../../types/domain';

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
    trackPhaseEnd, select,
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

  const needsLegDefaultSelection = selected?.kind === 'leg' && !!legForEffect;
  useEffect(() => {
    if (!needsLegDefaultSelection || !selected?.filename || !legForEffect) return;
    select({
      filename: selected.filename,
      kind: getDefaultLegReportKind(legForEffect),
      legId: legForEffect.id,
    });
  }, [needsLegDefaultSelection, selected?.filename, legForEffect, select]);

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

  if (selected.kind === 'voyage') {
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
  const activeReportKind: LegReportKind =
    selected.kind === 'leg'
      ? getDefaultLegReportKind(leg)
      : isLegReportKind(selected.kind)
        ? selected.kind
        : 'departure';

  const filename = voyage.filename ?? '';
  const selectLegReport = (kind: LegReportKind) => {
    select({ filename, kind, legId: leg.id });
  };

  if (activeReportKind === 'departure' || activeReportKind === 'arrival') {
    if (canEdit) {
      const report = leg[activeReportKind];
      if (!report) {
        return (
          <div className="max-w-3xl mx-auto p-6 text-center" style={{ color: 'var(--color-dim)' }}>
            No {activeReportKind} report on this leg.
          </div>
        );
      }
      return (
        <LegReportTabs
          voyage={voyage}
          leg={leg}
          activeKind={activeReportKind}
          onSelect={selectLegReport}
        >
          <ReportForm
            report={report}
            shipClass={shipClass}
            densities={densities}
            onChange={(newReport: Report) =>
              onReportChange(filename, leg.id, activeReportKind as ReportKind, newReport)
            }
          />
          <FloatingCarryOverButton onClick={() => setCarryOverOpen(true)} />
          {carryOverOpen && (
            <ManualCarryOverModal
              shipClass={shipClass}
              onClose={() => setCarryOverOpen(false)}
            />
          )}
        </LegReportTabs>
      );
    }
    return (
      <LegReportTabs
        voyage={voyage}
        leg={leg}
        activeKind={activeReportKind}
        onSelect={selectLegReport}
      >
        <ReportDetail
          voyage={voyage}
          leg={leg}
          kind={activeReportKind}
          shipClass={shipClass}
        />
      </LegReportTabs>
    );
  }

  if (activeReportKind === 'voyageReport') {
    // Legacy legs (pre-v7 imports) may have voyageReport: null — the effect
    // above seeds one asynchronously. Until that settles we render against a
    // throwaway default so the form has something to bind to.
    const vr = leg.voyageReport || defaultVoyageReport();
    if (canEdit) {
      return (
        <LegReportTabs
          voyage={voyage}
          leg={leg}
          activeKind={activeReportKind}
          onSelect={selectLegReport}
        >
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
        </LegReportTabs>
      );
    }
    return (
      <LegReportTabs
        voyage={voyage}
        leg={leg}
        activeKind={activeReportKind}
        onSelect={selectLegReport}
      >
        <VoyageReportDetail leg={{ ...leg, voyageReport: vr }} />
      </LegReportTabs>
    );
  }

  return <EmptyState ship={ship} />;
}

interface LegReportTabsProps {
  voyage: Voyage;
  leg: Leg;
  activeKind: LegReportKind;
  onSelect: (kind: LegReportKind) => void;
  children: ReactNode;
}

function LegReportTabs({ voyage, leg, activeKind, onSelect, children }: LegReportTabsProps) {
  const legIndex = (voyage.legs || []).findIndex((l) => l.id === leg.id);
  const depPort = leg.departure?.port?.split(',')[0]?.trim() || 'Dep';
  const arrPort = leg.arrival?.port?.split(',')[0]?.trim() || 'Arr';

  return (
    <div className="max-w-5xl mx-auto">
      <div
        className="glass-card rounded-xl overflow-hidden mb-4"
        style={{ position: 'sticky', top: 0, zIndex: 5 }}
      >
        <div className="px-5 py-3.5">
          <div className="flex items-start gap-3 flex-wrap">
            <div>
              <h2 className="text-[0.95rem] font-extrabold" style={{ color: 'var(--color-text)' }}>
                Leg {legIndex >= 0 ? legIndex + 1 : leg.id} · {depPort} → {arrPort}
              </h2>
              <p className="text-[0.65rem] font-mono mt-0.5" style={{ color: 'var(--color-dim)' }}>
                {leg.departure?.date || 'No departure date'} {'·'} {leg.arrival?.date || 'No arrival date'}
              </p>
            </div>
            <div className="flex-1" />
            <div className="flex gap-1.5 flex-wrap justify-end">
              {LEG_REPORT_KINDS.map((kind) => {
                const status = getLegReportCompletion(leg, kind);
                return (
                  <span
                    key={kind}
                    className="badge"
                    style={{
                      background: status.complete ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.14)',
                      color: status.complete ? 'var(--color-mgo)' : 'var(--color-warn-fg)',
                    }}
                  >
                    {legReportLabel(kind)} {status.complete ? 'Complete' : status.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        <div
          className="px-5 pb-3 flex gap-2 overflow-x-auto"
          role="tablist"
          aria-label="Leg reports"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight'
                && e.key !== 'Home' && e.key !== 'End') return;
            e.preventDefault();
            const idx = LEG_REPORT_KINDS.indexOf(activeKind);
            if (idx < 0) return;
            const last = LEG_REPORT_KINDS.length - 1;
            const next =
              e.key === 'ArrowLeft' ? Math.max(0, idx - 1) :
              e.key === 'ArrowRight' ? Math.min(last, idx + 1) :
              e.key === 'Home' ? 0 : last;
            onSelect(LEG_REPORT_KINDS[next]);
          }}
        >
          {LEG_REPORT_KINDS.map((kind) => {
            const active = kind === activeKind;
            return (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                className={active ? 'btn-primary px-3 py-1.5 rounded-lg text-xs' : 'btn-flat px-3 py-1.5 rounded-lg text-xs'}
                onClick={() => onSelect(kind)}
              >
                {legReportLabel(kind)}
              </button>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}
