// @ts-nocheck
// VoyageEndDetail — final voyage close-out node (lub-oil + verified totals).
// Lub-oil is recorded ONLY here per the spec, never in dep/arrival reports.

import { formatMT } from '../../domain/calculations';
import { voyageRouteLongLabel } from '../../domain/factories';

export function VoyageEndDetail({ voyage }) {
  const end = voyage.voyageEnd;
  if (!end) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <p style={{ color: 'var(--color-dim)' }}>This voyage has not been ended yet.</p>
      </div>
    );
  }

  const t = end.totals || {};

  return (
    <div className="max-w-5xl mx-auto">
      <section className="glass-card rounded-2xl overflow-hidden mb-5">
        <div className="leg-head px-5 py-4 flex items-center gap-3">
          <span className="text-[0.6rem] font-bold tracking-wider uppercase px-2 py-0.5 rounded"
            style={{ background: 'rgba(217,119,6,0.10)', color: 'var(--color-hfo)' }}>
            ⚑ Voyage End
          </span>
          <div className="text-[1.05rem] font-extrabold" style={{ color: 'var(--color-text)' }}>
            {voyageRouteLongLabel(voyage)}
          </div>
          <div className="flex-1" />
          {end.completedAt && (
            <div className="total-pill">
              {new Date(end.completedAt).toLocaleString()}
            </div>
          )}
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Engineer" value={end.engineer} />
          <Field label="Completed at" value={end.completedAt ? new Date(end.completedAt).toLocaleString() : '—'} mono />
        </div>
      </section>

      {/* Verified totals snapshot */}
      <div className="section-label mb-3">Verified Totals (snapshot at close)</div>
      <section className="cat-card fuel mb-5">
        <div className="cat-label">Fuel Consumption — Final</div>
        <div className="cat-body">
          <div className="fuel-cols">
            <div className="fuel-col hfo">
              <div className="fc-type"><span className="fc-dot" />HFO</div>
              <div className="fc-big">{t.hfo != null ? formatMT(t.hfo) : '—'}</div>
              <div className="fc-rob">MT</div>
            </div>
            <div className="fuel-col mgo">
              <div className="fc-type"><span className="fc-dot" />MGO</div>
              <div className="fc-big">{t.mgo != null ? formatMT(t.mgo) : '—'}</div>
              <div className="fc-rob">MT</div>
            </div>
            <div className="fuel-col lsfo">
              <div className="fc-type"><span className="fc-dot" />LSFO</div>
              <div className="fc-big">{t.lsfo != null ? formatMT(t.lsfo) : '—'}</div>
              <div className="fc-rob">MT</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div className="cat-card water">
          <div className="cat-label">Fresh Water — Total</div>
          <div className="cat-body">
            <Mini label="Total consumption (m³)" value={t.freshWaterCons != null ? String(t.freshWaterCons) : null} />
          </div>
        </div>

        <div className="cat-card lube">
          <div className="cat-label">Lub-Oil (recorded only here)</div>
          <div className="cat-body">
            <Mini label="ME consumption" value={end.lubeOil?.meCons}    suffix="L" />
            <Mini label="13S/14S"        value={end.lubeOil?.lo13s14s}  suffix="L" />
            <Mini label="13C used"       value={end.lubeOil?.usedLo13c} suffix="L" />
          </div>
        </div>
      </section>

      {/* Densities at close */}
      {end.densitiesAtClose && (
        <section className="glass-card rounded-2xl p-5 mb-5">
          <div className="section-label mb-3">
            Densities at Close <span className="font-mono ml-2" style={{ color: 'var(--color-dim)' }}>t/m³</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="HFO"  value={end.densitiesAtClose.HFO?.toFixed(3)}  mono />
            <Field label="MGO"  value={end.densitiesAtClose.MGO?.toFixed(3)}  mono />
            <Field label="LSFO" value={end.densitiesAtClose.LSFO?.toFixed(3)} mono />
          </div>
        </section>
      )}

      {/* Notes */}
      {end.notes && (
        <section className="glass-card rounded-2xl p-5">
          <div className="section-label mb-2">Notes</div>
          <p className="text-[0.85rem] whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>
            {end.notes}
          </p>
        </section>
      )}
    </div>
  );
}

function Field({ label, value, mono }) {
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

function Mini({ label, value, suffix }) {
  return (
    <div className="mini-row">
      <span className="mr-label">{label}</span>
      <span className="mr-val">{value ? `${value}${suffix ? ` ${suffix}` : ''}` : '—'}</span>
    </div>
  );
}
