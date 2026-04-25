// VoyageEndDetail — close-out node. Slimmed in v8 to only show what's
// UNIQUE to closing the voyage (i.e. not already on VoyageDetail):
//   • Who closed it and when
//   • Notes
//   • Reopen affordance — when in edit mode, the chief can lift the lock
//     to amend; re-closing re-locks.
//
// Lub-oil and densities-at-close used to live here too, but VoyageDetail
// already shows both (lub-oil in the Cruise Summary lube card; densities
// in the Fuel Densities card), so duplicating them here was just noise.
// The underlying voyageEnd.lubeOil and voyageEnd.densitiesAtClose fields
// are still written on close — they sit on disk for audit, just aren't
// re-rendered on this page.

import { useSession } from '../../hooks/useSession';
import { useToast } from '../../hooks/useToast';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { voyageRouteLongLabel } from '../../domain/factories';
import { Unlock } from '../Icons';
import type { Voyage } from '../../types/domain';

interface Props {
  voyage: Voyage;
}

export function VoyageEndDetail({ voyage }: Props) {
  const end = voyage.voyageEnd;
  const { editMode } = useSession();
  const { reopenVoyage } = useVoyageStore();
  const toast = useToast();

  if (!end) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <p style={{ color: 'var(--color-dim)' }}>This voyage has not been ended yet.</p>
      </div>
    );
  }

  const filename = voyage.filename ?? '';
  const handleReopen = () => {
    if (!filename) return;
    reopenVoyage(filename);
    toast.addToast('Voyage reopened — edits enabled. Re-close when finished.', 'info');
  };

  return (
    <div className="max-w-5xl mx-auto">
      <section className="glass-card rounded-2xl overflow-hidden mb-5">
        <div className="leg-head px-5 py-4 flex items-center gap-3">
          <span
            className="text-[0.6rem] font-bold tracking-wider uppercase px-2 py-0.5 rounded"
            style={{ background: 'rgba(217,119,6,0.10)', color: 'var(--color-hfo)' }}
          >
            ⚑ Voyage End
          </span>
          <div className="text-[1.05rem] font-extrabold" style={{ color: 'var(--color-text)' }}>
            {voyageRouteLongLabel(voyage)}
          </div>
          <div className="flex-1" />
          {editMode && (
            <button
              type="button"
              onClick={handleReopen}
              className="btn-warning px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
              title="Reopen voyage to allow edits — re-close when finished"
            >
              <Unlock className="w-3.5 h-3.5" />
              Reopen voyage
            </button>
          )}
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Engineer" value={end.engineer} />
          <Field
            label="Completed at"
            value={end.completedAt ? new Date(end.completedAt).toLocaleString() : '—'}
            mono
          />
        </div>
      </section>

      {end.notes && (
        <section className="glass-card rounded-2xl p-5">
          <div className="section-label mb-2">Notes</div>
          <p
            className="text-[0.85rem] whitespace-pre-wrap"
            style={{ color: 'var(--color-text)' }}
          >
            {end.notes}
          </p>
        </section>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}

function Field({ label, value, mono }: FieldProps) {
  return (
    <div>
      <div className="form-label">{label}</div>
      <div
        className={`form-input ${mono ? 'font-mono' : ''}`}
        style={{ background: 'var(--color-surface2)', cursor: 'default' }}
      >
        {value || '—'}
      </div>
    </div>
  );
}
