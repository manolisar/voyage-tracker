// PhaseSection — one phase block (port / sea / standby) inside a report.
// v7 refactor:
//   - equipment list comes from `shipClass.equipment` (no hardcoded keys).
//   - engine vs boiler partition uses each item's `category` field.
//   - delete button only shown when `canDelete`.

import { calcConsumption } from '../../domain/calculations';
import { PHASE_TYPES } from '../../domain/constants';
import { X } from '../Icons';
import { EquipmentRow } from './EquipmentRow';
import type { EquipmentReading, FuelKey, Phase, ShipClass } from '../../types/domain';

const FUEL_COLORS: Record<FuelKey, { dot: string; text: string }> = {
  HFO: { dot: 'var(--color-hfo-band)', text: 'var(--color-hfo)' },
  MGO: { dot: 'var(--color-mgo-band)', text: 'var(--color-mgo)' },
  LSFO: { dot: 'var(--color-lsfo-band)', text: 'var(--color-lsfo)' },
};

function phaseClass(type: string): string {
  if (type === PHASE_TYPES.STANDBY) return 'phase-standby';
  if (type === PHASE_TYPES.SEA) return 'phase-sea';
  return 'phase-port';
}
function phaseIcon(type: string): string {
  if (type === PHASE_TYPES.STANDBY) return '⚓'; // ⚓
  if (type === PHASE_TYPES.SEA) return '🌊'; // 🌊
  return '🏭'; // 🏭
}
function phaseLabel(type: string): string {
  if (type === PHASE_TYPES.STANDBY) return 'STANDBY';
  if (type === PHASE_TYPES.SEA) return 'SEA';
  return 'PORT';
}
function phaseTagClass(type: string): string {
  if (type === PHASE_TYPES.STANDBY) return 'ph-tag ph-tag-standby';
  if (type === PHASE_TYPES.SEA) return 'ph-tag ph-tag-sea';
  return 'ph-tag ph-tag-port';
}

type FuelTotals = Record<FuelKey, number>;

interface CumulativeTotals {
  engineCumulative: FuelTotals;
  boilerCumulative: FuelTotals;
}

interface Props {
  phase: Phase;
  shipClass: ShipClass;
  onChange: (next: Phase) => void;
  onDelete?: () => void;
  canDelete?: boolean;
  densities: Partial<Record<FuelKey, number>>;
  showTotals?: boolean;
  cumulativeTotals?: CumulativeTotals | null;
  readOnly?: boolean;
}

export function PhaseSection({
  phase,
  shipClass,
  onChange,
  onDelete,
  canDelete,
  densities,
  showTotals,
  cumulativeTotals,
  readOnly = false,
}: Props) {
  const handleEqChange = (key: string, value: EquipmentReading) => {
    onChange({ ...phase, equipment: { ...phase.equipment, [key]: value } });
  };

  // Per-phase totals broken out by engine/boiler using the data-driven category.
  const engineTotals: FuelTotals = { HFO: 0, MGO: 0, LSFO: 0 };
  const boilerTotals: FuelTotals = { HFO: 0, MGO: 0, LSFO: 0 };
  for (const def of shipClass.equipment) {
    const eq = phase.equipment?.[def.key];
    if (!eq) continue;
    const cons = calcConsumption(eq.start, eq.end, eq.fuel, densities);
    if (cons == null) continue;
    if (def.category === 'boiler') boilerTotals[eq.fuel] = (boilerTotals[eq.fuel] || 0) + cons;
    else engineTotals[eq.fuel] = (engineTotals[eq.fuel] || 0) + cons;
  }

  const displayEngine = cumulativeTotals?.engineCumulative ?? engineTotals;
  const displayBoiler = cumulativeTotals?.boilerCumulative ?? boilerTotals;

  const engineSum = displayEngine.HFO + displayEngine.MGO + displayEngine.LSFO;
  const boilerSum = displayBoiler.HFO + displayBoiler.MGO + displayBoiler.LSFO;
  const phaseGrand = engineSum + boilerSum;
  const isStandby = phase.type === PHASE_TYPES.STANDBY;

  const renderFuelLines = (fuelTotals: FuelTotals) => {
    const fuels = (['HFO', 'MGO', 'LSFO'] as FuelKey[]).filter((f) => fuelTotals[f] > 0);
    if (fuels.length === 0) return <div className="pt-noval">No consumption</div>;
    return fuels.map((f) => (
      <div key={f} className="pt-line">
        <span className="pt-label">
          <span className="pt-dot" style={{ background: FUEL_COLORS[f].dot }}></span>
          {f}
        </span>
        <span className="pt-val mono" style={{ color: FUEL_COLORS[f].text }}>
          {fuelTotals[f].toFixed(2)} MT
        </span>
      </div>
    ));
  };

  return (
    <div className="mb-4 phase-card rounded-xl animate-fade-in" style={{ overflow: 'hidden' }}>
      <div className={`${phaseClass(phase.type)} px-5 py-3 flex justify-between items-center`}>
        <div className="flex items-center gap-2.5 flex-1">
          <span className="text-base">{phaseIcon(phase.type)}</span>
          <span className={phaseTagClass(phase.type)}>{phaseLabel(phase.type)}</span>
          {readOnly ? (
            <span
              className="phase-title-input"
              style={{ background: 'transparent', border: '1px solid transparent', cursor: 'default' }}
            >
              {phase.name || '—'}
            </span>
          ) : (
            <input
              type="text"
              value={phase.name}
              onChange={(e) => onChange({ ...phase, name: e.target.value })}
              placeholder="Enter phase name…"
              className="phase-title-input"
              aria-label="Phase name"
            />
          )}
          {cumulativeTotals && (
            <span className="text-[0.6rem] font-normal" style={{ color: 'var(--color-dim)' }}>
              (Cumulative)
            </span>
          )}
        </div>
        {canDelete && !readOnly && (
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'var(--color-faint)' }}
            aria-label="Delete this phase"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--color-surface2)' }}>
            <tr>
              <th scope="col" className="eq-th w-28">Equipment</th>
              <th scope="col" className="eq-th w-24">Fuel</th>
              <th scope="col" className="eq-th eq-th-mono w-32">Start (m³)</th>
              <th scope="col" className="eq-th eq-th-mono w-32">End (m³)</th>
              <th scope="col" className="eq-th eq-th-right eq-th-mono w-24">Diff</th>
              <th scope="col" className="eq-th eq-th-right eq-th-mono w-24">MT</th>
            </tr>
          </thead>
          <tbody>
            {shipClass.equipment.map((def) => (
              <EquipmentRow
                key={def.key}
                def={def}
                data={phase.equipment?.[def.key] || { start: '', end: '', fuel: def.defaultFuel }}
                onChange={(v) => handleEqChange(def.key, v)}
                densities={densities}
                readOnly={readOnly}
              />
            ))}
          </tbody>
        </table>
      </div>

      {showTotals && (
        <>
          <div className={`ptotals ${isStandby ? 'cols-2' : ''}`}>
            <div className="pt-block">
              <div className="pt-head">{'⚙️'} Engine</div>
              {renderFuelLines(displayEngine)}
            </div>
            <div className="pt-block">
              <div className="pt-head">{'🔥'} Boiler</div>
              {renderFuelLines(displayBoiler)}
            </div>
            {!isStandby && (
              <div className="pt-block">
                <div className="pt-head">{'Σ'} Phase Total</div>
                {phaseGrand > 0 ? (
                  <div className="pt-line">
                    <span className="pt-label">All</span>
                    <span className="pt-val mono">{phaseGrand.toFixed(2)} MT</span>
                  </div>
                ) : (
                  <div className="pt-noval">No consumption</div>
                )}
              </div>
            )}
          </div>

          {!isStandby && (readOnly ? (
            phase.remarks ? (
              <div
                className="phase-remarks"
                style={{ fontStyle: 'italic', whiteSpace: 'pre-wrap' }}
              >
                {phase.remarks}
              </div>
            ) : null
          ) : (
            <div className="phase-remarks">
              <textarea
                value={phase.remarks || ''}
                onChange={(e) => onChange({ ...phase, remarks: e.target.value })}
                placeholder="Enter remarks…"
                rows={2}
                className="w-full bg-transparent border-none resize-none text-sm rounded"
                style={{ fontStyle: 'italic', color: 'inherit' }}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
