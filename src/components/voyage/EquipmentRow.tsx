// EquipmentRow — one or two tr per equipment item.
// v7 refactor: takes a `def` from shipClass.equipment so allowedFuels / locked /
// label / category are all data-driven. Counter inputs in litres; MT computed
// as (Δlitres × density) / 1000 using per-voyage densities.
//
// Three row-level UX affordances:
//   • Copy-from-start arrow — small "→" button beside the END input, visible
//     whenever START has a numeric value (in edit mode). Clicking sets
//     end := start, i.e. "engine didn't move during this phase". Overwrites
//     END if it already had a value. Hidden in read-only or disabled rows.
//   • Negative-consumption flag — when end < start (likely a mistyped
//     counter), the MT cell renders the raw negative value in bold red so
//     the chief can spot the typo at a glance. The voyage / phase totals
//     still skip negatives (calcConsumption returns null in that case),
//     because we'd rather under-count by a known-bad row than carry a
//     negative through every roll-up.
//   • Fuel changeover (standby phases only) — a "C/O" toggle splits the row
//     into two sub-rows: start→changeOverCounter on the original fuel, then
//     changeOverCounter→end on the new fuel.

import { calcConsumption, formatMT } from '../../domain/calculations';
import { PHASE_TYPES } from '../../domain/constants';
import type { EquipmentDefinition, EquipmentReading, FuelKey } from '../../types/domain';

const FUEL_ROW_CLASS: Record<FuelKey, string> = {
  HFO: 'fuel-row-hfo',
  MGO: 'fuel-row-mgo',
  LSFO: 'fuel-row-lsfo',
};
const FUEL_LOWER: Record<FuelKey, string> = { HFO: 'hfo', MGO: 'mgo', LSFO: 'lsfo' };

interface Props {
  def: EquipmentDefinition;
  data: EquipmentReading;
  onChange: (next: EquipmentReading) => void;
  densities: Partial<Record<FuelKey, number>>;
  disabled?: boolean;
  readOnly?: boolean;
  phaseType?: string;
}

function computeRow(
  start: string,
  end: string,
  fuel: FuelKey,
  densities: Partial<Record<FuelKey, number>>,
) {
  const startNum = parseFloat(start);
  const endNum = parseFloat(end);
  const startNumeric = start !== '' && start != null && !isNaN(startNum);
  const endNumeric = end !== '' && end != null && !isNaN(endNum);
  const bothNumeric = startNumeric && endNumeric;

  const consumption = calcConsumption(start, end, fuel, densities);
  const diff = bothNumeric
    ? (endNum - startNum).toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
    : '–';

  const densityRaw = densities?.[fuel];
  const density = parseFloat(String(densityRaw ?? ''));
  const negativeMT = bothNumeric && endNum < startNum && density > 0
    ? (endNum - startNum) * density
    : null;

  const isZero = consumption == null || consumption === 0;

  return { startNum, endNum, startNumeric, endNumeric, bothNumeric, consumption, diff, negativeMT, isZero };
}

export function EquipmentRow({
  def,
  data,
  onChange,
  densities,
  disabled = false,
  readOnly = false,
  phaseType,
}: Props) {
  const isStandby = phaseType === PHASE_TYPES.STANDBY;
  const fuelLocked = readOnly || disabled || def?.locked === true;
  const allowed: FuelKey[] = def?.allowedFuels || ['HFO', 'MGO', 'LSFO'];
  const canChangeover = isStandby && !fuelLocked && allowed.length > 1;

  const hasChangeover = !!(data.changeOverCounter != null && data.changeOverCounter !== '' || data.changeOverFuel);
  const coActive = canChangeover && hasChangeover;

  const coCounter = data.changeOverCounter ?? '';
  const coFuel = data.changeOverFuel ?? (allowed.find((f) => f !== data.fuel) || allowed[0]);

  const readonlyCellStyle = {
    background: 'transparent',
    border: '1px solid transparent',
    color: 'var(--color-text)',
  };

  const inputStyle = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border-subtle)',
    color: 'var(--color-text)',
  };

  const toggleChangeover = () => {
    if (coActive) {
      onChange({ ...data, changeOverCounter: undefined, changeOverFuel: undefined });
    } else {
      const newFuel = allowed.find((f) => f !== data.fuel) || allowed[0];
      onChange({ ...data, changeOverCounter: '', changeOverFuel: newFuel });
    }
  };

  // --- Non-changeover: single row (original behaviour) ---
  if (!coActive) {
    const r = computeRow(data.start, data.end, data.fuel, densities);
    const rowClass = FUEL_ROW_CLASS[data.fuel] || '';
    const fuelLower = FUEL_LOWER[data.fuel] || 'hfo';
    const canCopyStartToEnd = !readOnly && !disabled && r.startNumeric;

    return (
      <tr className={`table-row border-b ${rowClass}`} style={{ borderColor: 'var(--color-border-subtle)' }}>
        <td className="py-3 px-4 font-bold" style={{ color: 'var(--color-text)' }}>
          {def?.label}
          {def?.locked && <span title="Fuel locked" className="ml-1">🔒</span>}
        </td>
        <td className="py-2 px-2">
          <div className="eq-fuel-cell">
            <span className={`flag-band ${fuelLower}`}></span>
            <span className={`eq-fuel-label ${fuelLower} mono`}>{data.fuel}</span>
            {fuelLocked ? null : (
              <select
                value={data.fuel}
                onChange={(e) => onChange({ ...data, fuel: e.target.value as FuelKey })}
                className="ml-1 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                style={inputStyle}
                aria-label={`Fuel for ${def?.label}`}
              >
                {allowed.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            )}
            {canChangeover && !readOnly && (
              <button
                type="button"
                onClick={toggleChangeover}
                title="Enable fuel changeover"
                className="ml-1.5 px-1.5 py-0.5 rounded text-[0.6rem] font-bold leading-none transition-colors"
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border-subtle)',
                  color: 'var(--color-dim)',
                  cursor: 'pointer',
                }}
              >
                C/O
              </button>
            )}
          </div>
        </td>
        <td className="py-2 px-2">
          {readOnly ? (
            <div className="w-full px-3 py-2 rounded-lg text-sm font-mono" style={readonlyCellStyle}
              aria-label={`${def?.label} start (L)`}>
              {data.start === '' || data.start == null ? '—' : data.start}
            </div>
          ) : (
            <input type="number" step="0.1" value={data.start}
              onChange={(e) => onChange({ ...data, start: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono input-field"
              style={inputStyle} placeholder="0.0" aria-label={`${def?.label} start (L)`} />
          )}
        </td>
        <td className="py-2 px-2">
          {readOnly ? (
            <div className="w-full px-3 py-2 rounded-lg text-sm font-mono" style={readonlyCellStyle}
              aria-label={`${def?.label} end (L)`}>
              {data.end === '' || data.end == null ? '—' : data.end}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {canCopyStartToEnd ? (
                <button type="button" onClick={() => onChange({ ...data, end: data.start })}
                  title={`Copy start (${data.start}) to end — engine idle this phase`}
                  aria-label={`Copy start to end for ${def?.label}`}
                  className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-xs font-bold leading-none transition-colors"
                  style={{ background: 'var(--color-surface2)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-dim)', cursor: 'pointer' }}>
                  →
                </button>
              ) : (
                <span className="shrink-0 w-6 h-6" aria-hidden="true" />
              )}
              <input type="number" step="0.1" value={data.end}
                onChange={(e) => onChange({ ...data, end: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm font-mono input-field"
                style={inputStyle} placeholder="0.0" aria-label={`${def?.label} end (L)`} />
            </div>
          )}
        </td>
        <td className="py-3 px-4 text-right font-mono text-sm"
          style={{ color: r.negativeMT != null ? 'var(--color-error-fg)' : 'var(--color-dim)' }}>
          {r.diff}
        </td>
        <td className="py-3 px-4 text-right font-mono text-sm font-bold">
          {r.negativeMT != null ? (
            <span className="eq-mt" title="Negative consumption — likely a mistyped counter (end < start)"
              style={{ color: 'var(--color-error-fg)' }}>
              −{formatMT(Math.abs(r.negativeMT))}
            </span>
          ) : (
            <span className={`eq-mt ${r.isZero ? 'zero' : ''}`}>
              {r.isZero ? '—' : formatMT(r.consumption)}
            </span>
          )}
        </td>
      </tr>
    );
  }

  // --- Changeover active: two sub-rows ---
  const r1 = computeRow(data.start, coCounter, data.fuel, densities);
  const r2 = computeRow(coCounter, data.end, coFuel, densities);
  const fuelLower1 = FUEL_LOWER[data.fuel] || 'hfo';
  const fuelLower2 = FUEL_LOWER[coFuel] || 'hfo';
  const rowClass1 = FUEL_ROW_CLASS[data.fuel] || '';
  const rowClass2 = FUEL_ROW_CLASS[coFuel] || '';

  return (
    <>
      {/* Segment 1: start → C/O counter on original fuel */}
      <tr className={`table-row ${rowClass1}`} style={{ borderColor: 'var(--color-border-subtle)' }}>
        <td className="py-3 px-4 font-bold" style={{ color: 'var(--color-text)' }} rowSpan={2}>
          {def?.label}
        </td>
        <td className="py-2 px-2">
          <div className="eq-fuel-cell">
            <span className={`flag-band ${fuelLower1}`}></span>
            <span className={`eq-fuel-label ${fuelLower1} mono`}>{data.fuel}</span>
            {!readOnly && (
              <select
                value={data.fuel}
                onChange={(e) => onChange({ ...data, fuel: e.target.value as FuelKey })}
                className="ml-1 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                style={inputStyle}
                aria-label={`Fuel for ${def?.label} (before C/O)`}
              >
                {allowed.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            )}
            {!readOnly && (
              <button type="button" onClick={toggleChangeover}
                title="Disable fuel changeover"
                className="ml-1.5 px-1.5 py-0.5 rounded text-[0.6rem] font-bold leading-none transition-colors"
                style={{
                  background: 'var(--color-warn-bg)',
                  border: '1px solid var(--color-warn-fg)',
                  color: 'var(--color-warn-fg)',
                  cursor: 'pointer',
                }}>
                C/O
              </button>
            )}
          </div>
        </td>
        <td className="py-2 px-2">
          {readOnly ? (
            <div className="w-full px-3 py-2 rounded-lg text-sm font-mono" style={readonlyCellStyle}
              aria-label={`${def?.label} start (L)`}>
              {data.start === '' || data.start == null ? '—' : data.start}
            </div>
          ) : (
            <input type="number" step="0.1" value={data.start}
              onChange={(e) => onChange({ ...data, start: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono input-field"
              style={inputStyle} placeholder="0.0" aria-label={`${def?.label} start (L)`} />
          )}
        </td>
        <td className="py-2 px-2">
          {readOnly ? (
            <div className="w-full px-3 py-2 rounded-lg text-sm font-mono" style={readonlyCellStyle}
              aria-label={`${def?.label} C/O counter (L)`}>
              {coCounter === '' ? '—' : coCounter}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-[0.55rem] font-bold px-1 rounded"
                style={{ background: 'var(--color-warn-bg)', color: 'var(--color-warn-fg)' }}>C/O</span>
              <input type="number" step="0.1" value={coCounter}
                onChange={(e) => onChange({ ...data, changeOverCounter: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm font-mono input-field"
                style={inputStyle} placeholder="0.0" aria-label={`${def?.label} changeover counter (L)`} />
            </div>
          )}
        </td>
        <td className="py-3 px-4 text-right font-mono text-sm"
          style={{ color: r1.negativeMT != null ? 'var(--color-error-fg)' : 'var(--color-dim)' }}>
          {r1.diff}
        </td>
        <td className="py-3 px-4 text-right font-mono text-sm font-bold">
          {r1.negativeMT != null ? (
            <span className="eq-mt" style={{ color: 'var(--color-error-fg)' }}>
              −{formatMT(Math.abs(r1.negativeMT))}
            </span>
          ) : (
            <span className={`eq-mt ${r1.isZero ? 'zero' : ''}`}>
              {r1.isZero ? '—' : formatMT(r1.consumption)}
            </span>
          )}
        </td>
      </tr>
      {/* Segment 2: C/O counter → end on new fuel */}
      <tr className={`table-row border-b ${rowClass2}`} style={{ borderColor: 'var(--color-border-subtle)' }}>
        {/* Equipment cell is rowSpan'd from above */}
        <td className="py-2 px-2">
          <div className="eq-fuel-cell">
            <span className={`flag-band ${fuelLower2}`}></span>
            <span className={`eq-fuel-label ${fuelLower2} mono`}>{coFuel}</span>
            {!readOnly && (
              <select
                value={coFuel}
                onChange={(e) => onChange({ ...data, changeOverFuel: e.target.value as FuelKey })}
                className="ml-1 px-2 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                style={inputStyle}
                aria-label={`Fuel for ${def?.label} (after C/O)`}
              >
                {allowed.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            )}
          </div>
        </td>
        <td className="py-2 px-2">
          {readOnly ? (
            <div className="w-full px-3 py-2 rounded-lg text-sm font-mono" style={readonlyCellStyle}>
              {coCounter === '' ? '—' : coCounter}
            </div>
          ) : (
            <div className="w-full px-3 py-2 rounded-lg text-sm font-mono" style={{ ...readonlyCellStyle, color: 'var(--color-dim)' }}>
              {coCounter || '—'}
            </div>
          )}
        </td>
        <td className="py-2 px-2">
          {readOnly ? (
            <div className="w-full px-3 py-2 rounded-lg text-sm font-mono" style={readonlyCellStyle}
              aria-label={`${def?.label} end (L)`}>
              {data.end === '' || data.end == null ? '—' : data.end}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 w-6 h-6" aria-hidden="true" />
              <input type="number" step="0.1" value={data.end}
                onChange={(e) => onChange({ ...data, end: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm font-mono input-field"
                style={inputStyle} placeholder="0.0" aria-label={`${def?.label} end (L)`} />
            </div>
          )}
        </td>
        <td className="py-3 px-4 text-right font-mono text-sm"
          style={{ color: r2.negativeMT != null ? 'var(--color-error-fg)' : 'var(--color-dim)' }}>
          {r2.diff}
        </td>
        <td className="py-3 px-4 text-right font-mono text-sm font-bold">
          {r2.negativeMT != null ? (
            <span className="eq-mt" style={{ color: 'var(--color-error-fg)' }}>
              −{formatMT(Math.abs(r2.negativeMT))}
            </span>
          ) : (
            <span className={`eq-mt ${r2.isZero ? 'zero' : ''}`}>
              {r2.isZero ? '—' : formatMT(r2.consumption)}
            </span>
          )}
        </td>
      </tr>
    </>
  );
}
