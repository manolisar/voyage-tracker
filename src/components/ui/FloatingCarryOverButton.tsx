// FloatingCarryOverButton — bottom-right FAB that opens ManualCarryOverModal.
// Source phase is either the most-recently-edited phase OR (fallback) the last
// viable phase in the current view supplied via `sourceOverride`. Label echoes
// the source phase name so it's clear what's being carried.

import { useVoyageStore } from '../../hooks/useVoyageStore';
import type { PhaseSource } from '../../contexts/voyageStore.helpers';

interface Props {
  onClick: () => void;
  // Fallback source from the current view; used when no phase has been edited
  // this session.
  sourceOverride?: PhaseSource | null;
}

export function FloatingCarryOverButton({ onClick, sourceOverride }: Props) {
  const { lastEditedPhase, findNextPhaseFor } = useVoyageStore();
  const source = lastEditedPhase ?? sourceOverride ?? null;
  const hasSource = !!source;
  const target = hasSource ? findNextPhaseFor(source) : null;
  const enabled = hasSource && !!target;

  const title = enabled
    ? `Carry Over — from: ${source!.phaseName || 'phase'} → ${target!.phaseName || 'next phase'}`
    : hasSource
      ? 'No next phase to carry into'
      : 'No phase data available to carry over';

  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={enabled ? onClick : undefined}
      title={title}
      aria-label={title}
      className="fixed z-40 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg transition-all font-semibold text-[0.78rem]"
      style={{
        right: '1.5rem',
        bottom: '1.5rem',
        background: enabled ? 'var(--color-ocean-500)' : 'var(--color-surface2)',
        color: enabled ? 'white' : 'var(--color-faint)',
        border: enabled ? 'none' : '1px solid var(--color-border-subtle)',
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? 1 : 0.7,
      }}
    >
      <span aria-hidden>⇪</span>
      <span className="flex flex-col items-start leading-tight">
        <span>Carry Over</span>
        <span className="text-[0.62rem] font-normal" style={{ opacity: 0.85 }}>
          {enabled
            ? `from: ${source!.phaseName || 'phase'}`
            : hasSource
              ? 'no next phase'
              : 'no phase data'}
        </span>
      </span>
    </button>
  );
}
