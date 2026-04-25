// EquipmentRow — one tr per equipment item.
// v7 refactor: takes a `def` from shipClass.equipment so allowedFuels / locked /
// label / category are all data-driven. Counter inputs in m³, MT computed from
// per-voyage densities.
//
// Two row-level UX affordances:
//   • Copy-from-start arrow — small "→" button beside the END input, visible
//     only when END is empty AND START has a numeric value. Clicking sets
//     end := start, i.e. "engine didn't move during this phase". Hidden in
//     read-only or disabled rows.
//   • Negative-consumption flag — when end < start (likely a mistyped
//     counter), the MT cell renders the raw negative value in bold red so
//     the chief can spot the typo at a glance. The voyage / phase totals
//     still skip negatives (calcConsumption returns null in that case),
//     because we'd rather under-count by a known-bad row than carry a
//     negative through every roll-up.

import { calcConsumption, formatMT } from '../../domain/calculations';
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
}

export function EquipmentRow({
  def,
  data,
  onChange,
  densities,
  disabled = false,
  readOnly = false,
}: Props) {
  const startNum = parseFloat(data.start);
  const endNum = parseFloat(data.end);
  const startNumeric = data.start !== '' && data.start != null && !isNaN(startNum);
  const endNumeric = data.end !== '' && data.end != null && !isNaN(endNum);
  const bothNumeric = startNumeric && endNumeric;

  const consumption = calcConsumption(data.start, data.end, data.fuel, densities);
  const diff = bothNumeric ? (endNum - startNum).toFixed(1) : '–';

  // Negative-diff display: calcConsumption returns null when end < start
  // (so totals skip it). We still want the row's MT cell to flag the typo
  // — bold red, with the minus sign. Compute the unsigned MT here.
  const densityRaw = densities?.[data.fuel];
  const density = parseFloat(String(densityRaw ?? ''));
  const negativeMT = bothNumeric && endNum < startNum && density > 0
    ? (endNum - startNum) * density
    : null;

  const isZero = consumption == null || consumption === 0;

  // Equipment is locked if explicitly disabled, readOnly, OR if its def says so.
  const fuelLocked = readOnly || disabled || def?.locked === true;
  const allowed: FuelKey[] = def?.allowedFuels || ['HFO', 'MGO', 'LSFO'];
  const rowClass = FUEL_ROW_CLASS[data.fuel] || '';
  const fuelLower = FUEL_LOWER[data.fuel] || 'hfo';

  // Show the "copy start → end" arrow only when END is empty AND START has a
  // valid numeric value AND the row is editable. Prevents accidentally
  // clobbering a typed reading.
  const canCopyStartToEnd =
    !readOnly && !disabled && startNumeric && (data.end === '' || data.end == null);

  // In read-only mode start/end render as plain monospace text so the row
  // keeps the same tint, layout, widths, and column alignment as edit mode.
  const readonlyCellStyle = {
    background: 'transparent',
    border: '1px solid transparent',
    color: 'var(--color-text)',
  };

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
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text)',
              }}
              aria-label={`Fuel for ${def?.label}`}
            >
              {allowed.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
        </div>
      </td>
      <td className="py-2 px-2">
        {readOnly ? (
          <div
            className="w-full px-3 py-2 rounded-lg text-sm font-mono"
            style={readonlyCellStyle}
            aria-label={`${def?.label} start (m³)`}
          >
            {data.start === '' || data.start == null ? '—' : data.start}
          </div>
        ) : (
          <input
            type="number"
            step="0.1"
            value={data.start}
            onChange={(e) => onChange({ ...data, start: e.target.value })}
            className="w-full px-3 py-2 rounded-lg text-sm font-mono input-field"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border-subtle)',
              color: 'var(--color-text)',
            }}
            placeholder="0.0"
            aria-label={`${def?.label} start (m³)`}
          />
        )}
      </td>
      <td className="py-2 px-2">
        {readOnly ? (
          <div
            className="w-full px-3 py-2 rounded-lg text-sm font-mono"
            style={readonlyCellStyle}
            aria-label={`${def?.label} end (m³)`}
          >
            {data.end === '' || data.end == null ? '—' : data.end}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {canCopyStartToEnd ? (
              <button
                type="button"
                onClick={() => onChange({ ...data, end: data.start })}
                title={`Copy start (${data.start}) to end — engine idle this phase`}
                aria-label={`Copy start to end for ${def?.label}`}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-xs font-bold leading-none transition-colors"
                style={{
                  background: 'var(--color-surface2)',
                  border: '1px solid var(--color-border-subtle)',
                  color: 'var(--color-dim)',
                  cursor: 'pointer',
                }}
              >
                →
              </button>
            ) : (
              // Reserve the same width when the button is hidden so the input
              // doesn't jump as the user types.
              <span className="shrink-0 w-6 h-6" aria-hidden="true" />
            )}
            <input
              type="number"
              step="0.1"
              value={data.end}
              onChange={(e) => onChange({ ...data, end: e.target.value })}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono input-field"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text)',
              }}
              placeholder="0.0"
              aria-label={`${def?.label} end (m³)`}
            />
          </div>
        )}
      </td>
      <td
        className="py-3 px-4 text-right font-mono text-sm"
        style={{ color: negativeMT != null ? 'var(--color-error-fg)' : 'var(--color-dim)' }}
      >
        {diff}
      </td>
      <td className="py-3 px-4 text-right font-mono text-sm font-bold">
        {negativeMT != null ? (
          <span
            className="eq-mt"
            title="Negative consumption — likely a mistyped counter (end < start)"
            style={{ color: 'var(--color-error-fg)' }}
          >
            −{formatMT(Math.abs(negativeMT))}
          </span>
        ) : (
          <span className={`eq-mt ${isZero ? 'zero' : ''}`}>
            {isZero ? '—' : formatMT(consumption)}
          </span>
        )}
      </td>
    </tr>
  );
}
