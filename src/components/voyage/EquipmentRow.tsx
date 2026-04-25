// EquipmentRow — one tr per equipment item.
// v7 refactor: takes a `def` from shipClass.equipment so allowedFuels / locked /
// label / category are all data-driven. Counter inputs in m³, MT computed from
// per-voyage densities.

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
  const consumption = calcConsumption(data.start, data.end, data.fuel, densities);
  const diff =
    data.start !== '' &&
    data.end !== '' &&
    !isNaN(parseFloat(data.start)) &&
    !isNaN(parseFloat(data.end))
      ? (parseFloat(data.end) - parseFloat(data.start)).toFixed(1)
      : '–';
  const isZero = consumption == null || consumption === 0;

  // Equipment is locked if explicitly disabled, readOnly, OR if its def says so.
  const fuelLocked = readOnly || disabled || def?.locked === true;
  const allowed: FuelKey[] = def?.allowedFuels || ['HFO', 'MGO', 'LSFO'];
  const rowClass = FUEL_ROW_CLASS[data.fuel] || '';
  const fuelLower = FUEL_LOWER[data.fuel] || 'hfo';

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
        )}
      </td>
      <td className="py-3 px-4 text-right font-mono text-sm" style={{ color: 'var(--color-dim)' }}>{diff}</td>
      <td className="py-3 px-4 text-right font-mono text-sm font-bold">
        <span className={`eq-mt ${isZero ? 'zero' : ''}`}>
          {isZero ? '—' : formatMT(consumption)}
        </span>
      </td>
    </tr>
  );
}
