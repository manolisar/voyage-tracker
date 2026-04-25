// ReportDetail — read-only Departure/Arrival summary.
// v7: renders the exact same <ReportForm> used in edit mode but with
// `readOnly`. This guarantees pixel-level parity between view and edit —
// same header, same phase cards (tinted rows, totals footer, remarks),
// same bottom grid. The only differences in readOnly are: inputs become
// static divs with transparent borders, the "Add Phase" button is hidden,
// and the delete-phase / phase-name editing are disabled.

import { defaultDensities } from '../../domain/shipClass';
import { ReportForm } from '../voyage/ReportForm';
import type { Leg, ReportKind, ShipClass, Voyage } from '../../types/domain';

interface Props {
  voyage: Voyage;
  leg: Leg | null | undefined;
  kind: ReportKind;
  shipClass: ShipClass;
}

export function ReportDetail({ voyage, leg, kind, shipClass }: Props) {
  const report = leg?.[kind];
  if (!report) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <p style={{ color: 'var(--color-dim)' }}>No {kind} report on this leg yet.</p>
      </div>
    );
  }

  const densities = voyage.densities || defaultDensities(shipClass);

  return (
    <div className="max-w-5xl mx-auto">
      <ReportForm
        report={report}
        onChange={() => {}}
        densities={densities}
        shipClass={shipClass}
        readOnly
      />
    </div>
  );
}
