// VoyageDetail — the "Voyage Detail" node in the tree.
// Cruise card (name, dates, status) + Cruise Summary cards (fuel/water/chem/lube)
// + Densities + Legs list.

import type { FocusEvent, KeyboardEvent } from 'react';
import { calcVoyageTotals, type FuelTotals } from '../../domain/calculations';
import { formatMT } from '../../domain/calculations';
import { sortLegsByDate, voyageRouteLongLabel } from '../../domain/factories';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { useToast } from '../../hooks/useToast';
import { Trash2, Unlock } from '../Icons';
import type { FuelKey, Leg, Ship, ShipClass, Voyage } from '../../types/domain';

const FUEL_COLS: { key: keyof FuelTotals & string; label: FuelKey }[] = [
  { key: 'hfo',  label: 'HFO'  },
  { key: 'mgo',  label: 'MGO'  },
  { key: 'lsfo', label: 'LSFO' },
];

function lastReportRob(voyage: Voyage): Record<string, string> {
  // Walk legs in order; pick the latest arrival ROB, falling back to last
  // departure ROB. Used for the "ROB" hint on the fuel summary cards.
  // Skip ROB objects whose every fuel is empty — defaultReport() seeds
  // `{ hfo: '', mgo: '', lsfo: '' }`, so without this guard an empty
  // arrival ROB would mask a populated departure ROB on the same leg.
  const hasAny = (r: Record<string, string> | undefined): boolean =>
    !!r && (!!r.hfo || !!r.mgo || !!r.lsfo);
  const reports: Record<string, string>[] = [];
  for (const leg of voyage.legs || []) {
    if (hasAny(leg.departure?.rob)) reports.push(leg.departure!.rob);
    if (hasAny(leg.arrival?.rob)) reports.push(leg.arrival!.rob);
  }
  return reports[reports.length - 1] || {};
}

function aggregateFreshWater(
  voyage: Voyage,
): { rob: string; production: string; consumption: string } | null {
  // Production + consumption sum across every leg's arrival; ROB is the
  // latest non-empty arrival value (running tank level, not additive).
  let prod = 0;
  let cons = 0;
  let any = false;
  let lastRob = '';
  for (const leg of voyage.legs || []) {
    const fw = leg.arrival?.freshWater;
    if (!fw) continue;
    if (fw.production) {
      const n = Number(fw.production);
      if (Number.isFinite(n)) { prod += n; any = true; }
    }
    if (fw.consumption) {
      const n = Number(fw.consumption);
      if (Number.isFinite(n)) { cons += n; any = true; }
    }
    if (fw.rob) { lastRob = fw.rob; any = true; }
  }
  if (!any) return null;
  const fmt = (v: number) =>
    v ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : '';
  return { rob: lastRob, production: fmt(prod), consumption: fmt(cons) };
}

function aggregateAep(voyage: Voyage): { alkaliCons: string; alkaliRob: string } | null {
  // NaOH consumption sums across every leg's arrival report; ROB is the
  // latest non-empty arrival value (a running tank level, not additive).
  let sum = 0;
  let any = false;
  let lastRob = '';
  for (const leg of voyage.legs || []) {
    const a = leg.arrival?.aep;
    if (!a) continue;
    if (a.alkaliCons) {
      const n = Number(a.alkaliCons);
      if (Number.isFinite(n)) {
        sum += n;
        any = true;
      }
    }
    if (a.alkaliRob) {
      lastRob = a.alkaliRob;
      any = true;
    }
  }
  if (!any) return null;
  return {
    alkaliCons: sum ? (Number.isInteger(sum) ? String(sum) : sum.toFixed(1)) : '',
    alkaliRob: lastRob,
  };
}

interface Props {
  voyage: Voyage;
  shipClass: ShipClass;
  ship: Ship | null | undefined;
  editMode: boolean;
  onAddLeg?: (filename: string) => void;
  onEndVoyage?: (filename: string) => void;
  onDeleteVoyage?: (filename: string) => void;
  onDeleteLeg?: (filename: string, legId: number) => void;
}

export function VoyageDetail({
  voyage,
  shipClass,
  ship,
  editMode,
  onAddLeg,
  onEndVoyage,
  onDeleteVoyage,
  onDeleteLeg,
}: Props) {
  const { reopenVoyage, updateVoyage } = useVoyageStore();
  const toast = useToast();
  const totals = calcVoyageTotals(voyage, shipClass);
  const ended = !!voyage.voyageEnd;
  const rob = lastReportRob(voyage);
  const water = aggregateFreshWater(voyage);
  const aep = aggregateAep(voyage);
  const lubeOil = voyage.voyageEnd?.lubeOil || null;

  const filename = voyage.filename ?? '';

  const handleReopen = () => {
    reopenVoyage(filename);
    toast.addToast('Voyage reopened — edits enabled. Re-close when finished.', 'info');
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Cruise info card */}
      <section className="glass-card rounded-2xl overflow-hidden mb-5">
        <div className="leg-head px-5 py-4 flex flex-col gap-2">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <CruiseNameHeading
                voyage={voyage}
                editMode={editMode && !ended}
                onSave={(name) =>
                  updateVoyage(filename, (v) => ({ ...v, cruiseName: name }))
                }
              />
              <div
                className="text-[0.78rem] font-semibold mt-0.5"
                style={{ color: 'var(--color-dim)' }}
              >
                {voyageRouteLongLabel(voyage)}
              </div>
            </div>
            {ended ? (
              <span
                className="badge"
                style={{ background: 'rgba(107,123,143,0.15)', color: 'var(--color-dim)' }}
              >
                Ended
              </span>
            ) : (
              <span
                className="badge"
                style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--color-mgo)' }}
              >
                Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {ship && (
              <span
                className="text-[0.65rem] font-mono px-2 py-0.5 rounded"
                style={{ background: 'var(--color-surface)', color: 'var(--color-dim)', border: '1px solid var(--color-border-subtle)' }}
                title="Ship"
              >
                {ship.code} · {ship.displayName}
              </span>
            )}
            <div className="flex-1" />
            <div className="total-pill" title="Storage filename">{filename}</div>
          </div>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-5">
          <Field
            label="Embark"
            value={voyage.fromPort?.name || voyage.fromPort?.code || '—'}
            hint={voyage.fromPort?.locode}
          />
          <Field
            label="Disembark"
            value={voyage.toPort?.name || voyage.toPort?.code || '—'}
            hint={voyage.toPort?.locode}
          />
          <Field label="Start date" value={voyage.startDate} mono />
          <Field label="End date"   value={voyage.endDate || '—'} mono />
        </div>
      </section>

      {/* Cruise summary */}
      <div className="section-label mb-3">Cruise Summary</div>
      <section className="grid grid-cols-1 md:grid-cols-3 gap-[14px] mb-5">
        <div className="cat-card fuel md:col-span-3">
          <div className="cat-label">
            Fuel Consumption
            <span className="ml-auto font-mono text-[0.65rem] font-semibold" style={{ color: 'var(--color-dim)' }}>
              MT · all legs
            </span>
          </div>
          <div className="cat-body">
            <div className="fuel-cols with-sigma">
              {FUEL_COLS.map(({ key, label }) => (
                <div key={key} className={`fuel-col ${key}`}>
                  <div className="fc-type"><span className="fc-dot" />{label}</div>
                  <div className="fc-big">{formatMT(totals[key])}</div>
                  <div className="fc-rob">ROB {rob?.[key] ? `${rob[key]} MT` : '—'}</div>
                </div>
              ))}
              <div className="fuel-col fuel-col-sigma">
                <div className="fc-type">Σ Total</div>
                <div className="fc-big">
                  {formatMT(
                    (Number(totals.hfo) || 0)
                    + (Number(totals.mgo) || 0)
                    + (Number(totals.lsfo) || 0),
                  )}
                </div>
                <div className="fc-rob">all fuels</div>
              </div>
            </div>
          </div>
        </div>

        <div className="cat-card water">
          <div className="cat-label">Fresh Water</div>
          <div className="cat-body">
            <Mini label="ROB"      value={water?.rob} />
            <Mini label="Produced" value={water?.production} />
            <Mini label="Consumed" value={water?.consumption} />
          </div>
        </div>

        <div className="cat-card chem">
          <div className="cat-label">Chemicals</div>
          <div className="cat-body">
            <Mini label="NaOH cons" value={aep?.alkaliCons} suffix="L" />
            <Mini label="NaOH ROB"  value={aep?.alkaliRob}  suffix="L" />
          </div>
        </div>

        <div className="cat-card lube">
          <div className="cat-label">Lub-Oil</div>
          <div className="cat-body">
            {lubeOil ? (
              <>
                <Mini label="ME cons"   value={lubeOil.meCons}   suffix="L" />
                <Mini label="13S/14S"   value={lubeOil.lo13s14s} suffix="L" />
                <Mini label="13C used"  value={lubeOil.usedLo13c} suffix="L" />
              </>
            ) : (
              <p className="text-[0.7rem] italic" style={{ color: 'var(--color-dim)' }}>
                Recorded at End Voyage.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Densities */}
      <section className="glass-card rounded-2xl p-5 mb-5">
        <div className="flex items-center mb-3">
          <div className="section-label">
            Fuel Densities <span className="font-mono ml-2" style={{ color: 'var(--color-dim)' }}>kg/L @ Counters</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {FUEL_COLS.map(({ key, label }) => (
            <Field
              key={key}
              label={label}
              value={voyage.densities?.[label] != null
                ? Number(voyage.densities[label]).toFixed(3)
                : '—'}
              mono
            />
          ))}
        </div>
      </section>

      {/* Legs list */}
      <div className="flex items-center mb-3">
        <div className="section-label">Legs</div>
        <div className="flex-1" />
        {editMode && (
          <div className="flex gap-2">
            {ended ? (
              <button
                type="button"
                className="btn-warning px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
                onClick={handleReopen}
                title="Reopen voyage to allow edits — re-close when finished"
              >
                <Unlock className="w-3.5 h-3.5" />
                Reopen voyage
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-primary px-3 py-1.5 rounded-lg text-xs"
                  onClick={() => onAddLeg?.(filename)}
                  title="Append a new leg to this voyage"
                >
                  + Add Leg
                </button>
                <button
                  type="button"
                  className="btn-warning px-3 py-1.5 rounded-lg text-xs"
                  onClick={() => onEndVoyage?.(filename)}
                  title="Finalize voyage and record lub-oil"
                >
                  ⚑ End Voyage
                </button>
              </>
            )}
            <button
              type="button"
              className="btn-flat px-3 py-1.5 rounded-lg text-xs flex items-center gap-1"
              onClick={() => onDeleteVoyage?.(filename)}
              title="Delete this voyage permanently"
              style={{ color: 'var(--color-error-fg)' }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete voyage
            </button>
          </div>
        )}
      </div>
      <div className="cat-card legs">
        <div className="cat-label">{voyage.legs?.length || 0} Legs</div>
        <div className="cat-body">
          {!voyage.legs?.length ? (
            <p className="text-[0.78rem]" style={{ color: 'var(--color-dim)' }}>
              No legs yet.
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--color-border-subtle)' }}>
              {sortLegsByDate(voyage.legs).map((leg, i) => (
                <LegRow
                  key={leg.id}
                  leg={leg}
                  index={i}
                  onDelete={
                    editMode && !ended && onDeleteLeg
                      ? () => onDeleteLeg(filename, leg.id)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CruiseNameHeadingProps {
  voyage: Voyage;
  editMode: boolean;
  onSave: (name: string) => void;
}

// Read-only mode renders the cruise name as the cruise card's primary heading.
// Edit Mode renders the same large text inside an inline form input so the
// Chief can rename a voyage without leaving the detail pane. Save commits on
// blur (and Enter); Escape reverts. Empty values are rejected to match the
// "required at creation" contract — they revert to the previous name.
//
// The input is uncontrolled and keyed on `saved` so an external rename (e.g.
// pulled from disk, or undone elsewhere) remounts the field with the new
// value, avoiding a useEffect→setState round-trip.
function CruiseNameHeading({ voyage, editMode, onSave }: CruiseNameHeadingProps) {
  const saved = voyage.cruiseName || '';

  if (!editMode) {
    return (
      <div
        className="text-[1.25rem] font-extrabold tracking-tight truncate"
        style={{ color: 'var(--color-text)' }}
        title={saved || undefined}
      >
        {saved || <span style={{ color: 'var(--color-faint)' }}>Unnamed cruise</span>}
      </div>
    );
  }

  const commit = (e: FocusEvent<HTMLInputElement>) => {
    const next = e.currentTarget.value.trim();
    if (!next) {
      e.currentTarget.value = saved;
      return;
    }
    if (next !== saved) onSave(next);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.currentTarget.value = saved;
      e.currentTarget.blur();
    }
  };

  return (
    <input
      key={saved}
      type="text"
      className="form-input text-[1.25rem] font-extrabold tracking-tight"
      style={{ background: 'var(--color-surface2)' }}
      defaultValue={saved}
      onBlur={commit}
      onKeyDown={onKey}
      placeholder="e.g. Best of Scandinavia"
      aria-label="Cruise name"
      maxLength={80}
    />
  );
}

interface FieldProps {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  hint?: string;
}

function Field({ label, value, mono, hint }: FieldProps) {
  return (
    <div>
      <div className="form-label">{label}</div>
      <div
        className={`form-input ${mono ? 'font-mono' : ''}`}
        style={{ background: 'var(--color-surface2)', cursor: 'default' }}
      >
        {value || '—'}
      </div>
      {hint && (
        <div className="text-[0.65rem] font-mono mt-0.5" style={{ color: 'var(--color-faint)' }}>
          {hint}
        </div>
      )}
    </div>
  );
}

interface MiniProps {
  label: string;
  value: string | null | undefined;
  suffix?: string;
}

function Mini({ label, value, suffix }: MiniProps) {
  return (
    <div className="mini-row">
      <span className="mr-label">{label}</span>
      <span className="mr-val">
        {value ? `${value}${suffix ? ` ${suffix}` : ''}` : '—'}
      </span>
    </div>
  );
}

function LegRow({
  leg,
  index,
  onDelete,
}: {
  leg: Leg;
  index: number;
  onDelete?: () => void;
}) {
  const dep = leg.departure?.port?.split(',')[0]?.trim() || 'Dep';
  const arr = leg.arrival?.port?.split(',')[0]?.trim() || 'Arr';
  return (
    <div className="py-2.5 flex items-center gap-3">
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center font-mono text-[0.7rem] font-bold"
        style={{ background: 'var(--color-surface2)', color: 'var(--color-dim)' }}
      >
        {index + 1}
      </div>
      <div className="flex-1">
        <div className="font-semibold text-[0.88rem]" style={{ color: 'var(--color-text)' }}>
          {dep} → {arr}
        </div>
        <div className="text-[0.7rem] font-mono" style={{ color: 'var(--color-dim)' }}>
          {leg.departure?.date || '—'} → {leg.arrival?.date || '—'}
        </div>
      </div>
      {leg.voyageReport && (
        <span
          className="text-[0.55rem] font-bold tracking-wider px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(3,105,161,0.18)', color: '#0369A1' }}
          title="Has nav report"
        >
          VR
        </span>
      )}
      {onDelete && (
        <button
          type="button"
          className="p-1.5 rounded hover:bg-black/5"
          style={{ color: 'var(--color-error-fg)' }}
          onClick={onDelete}
          aria-label={`Delete leg ${index + 1}`}
          title="Delete this leg"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
