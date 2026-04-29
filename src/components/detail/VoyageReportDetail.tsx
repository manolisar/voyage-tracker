// VoyageReportDetail — read-only Nav Report.
// Renders the exact same <VoyageReportSection> used in edit mode but with
// `readOnly`, guaranteeing pixel-level parity between view and edit.

import { VoyageReportSection } from '../voyage/VoyageReportSection';
import type { Leg } from '../../types/domain';

interface Props {
  leg: Leg | null | undefined;
}

export function VoyageReportDetail({ leg }: Props) {
  const vr = leg?.voyageReport;
  if (!vr) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <p style={{ color: 'var(--color-dim)' }}>No nav report on this leg.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <VoyageReportSection
        voyageReport={vr}
        onChange={() => {}}
        onDelete={() => {}}
        depPort={leg.departure?.port}
        arrPort={leg.arrival?.port}
        depDate={leg.departure?.date}
        arrDate={leg.arrival?.date}
        readOnly
      />
    </div>
  );
}
