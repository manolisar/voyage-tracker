// ReportForm — editable Departure or Arrival report form.
// v7 refactor:
//   - equipment list driven by `shipClass.equipment` (passed down to PhaseSection).
//   - engine/boiler partition uses each item's `category`.
//   - SBE/FA/FWE time pickers use <TimePicker6Min> (two-select compound
//     picker restricted to 6-min slots). Native <input type="time"
//     step="360"> was the v7 attempt but Chromium's popup ignores step.

import { useState } from 'react';
import { ChevronRight, Plus } from '../Icons';
import { useToast } from '../../hooks/useToast';
import { calcConsumption } from '../../domain/calculations';
import { PHASE_TYPES, REPORT_TYPES } from '../../domain/constants';
import { createPhase } from '../../domain/factories';
import { PhaseSection } from './PhaseSection';
import { TimePicker6Min } from '../ui/TimePicker6Min';
import type {
  FuelKey,
  FuelStorageKey,
  Phase,
  Report,
  ShipClass,
} from '../../types/domain';

const FUELS: FuelStorageKey[] = ['hfo', 'mgo', 'lsfo'];

interface Props {
  report: Report;
  onChange: (next: Report) => void;
  densities: Partial<Record<FuelKey, number>>;
  shipClass: ShipClass;
  readOnly?: boolean;
}

type FuelTotals = Record<FuelKey, number>;

export function ReportForm({ report, onChange, densities, shipClass, readOnly = false }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const toast = useToast();

  const operationalPhases = report.phases.filter((p) => p.type !== PHASE_TYPES.STANDBY);
  const standbyPhase = report.phases.find((p) => p.type === PHASE_TYPES.STANDBY);
  const isDeparture = report.type === REPORT_TYPES.DEPARTURE;

  const handlePhaseChange = (phaseId: number, newPhase: Phase) => {
    const newPhases = report.phases.map((p) => (p.id === phaseId ? newPhase : p));
    onChange({ ...report, phases: newPhases });
  };

  const handleAddPhase = () => {
    const phaseType = isDeparture ? PHASE_TYPES.PORT : PHASE_TYPES.SEA;
    const newPhase = createPhase(shipClass, phaseType, 'C/O (From → To)');
    // Insert before standby so changeover phases stay in operational order.
    const newPhases = [...operationalPhases, newPhase];
    if (standbyPhase) newPhases.push(standbyPhase);
    onChange({ ...report, phases: newPhases });
    toast.addToast('New phase added', 'success');
  };

  const handleDeletePhase = (phaseId: number) => {
    onChange({ ...report, phases: report.phases.filter((p) => p.id !== phaseId) });
  };

  // Grand totals across ALL phases (including standby).
  const grandTotals: FuelTotals = { HFO: 0, MGO: 0, LSFO: 0 };
  for (const phase of report.phases) {
    for (const eq of Object.values(phase.equipment || {})) {
      const cons = calcConsumption(eq.start, eq.end, eq.fuel, densities);
      if (cons != null) grandTotals[eq.fuel] = (grandTotals[eq.fuel] || 0) + cons;
    }
  }
  const totalConsumption = grandTotals.HFO + grandTotals.MGO + grandTotals.LSFO;

  // Cumulative totals across operational phases only — used on the LAST
  // operational phase when there are 2+ (i.e. when changeovers exist).
  const calcCumulative = () => {
    const engineCumulative: FuelTotals = { HFO: 0, MGO: 0, LSFO: 0 };
    const boilerCumulative: FuelTotals = { HFO: 0, MGO: 0, LSFO: 0 };
    for (const phase of operationalPhases) {
      for (const def of shipClass.equipment) {
        const eq = phase.equipment?.[def.key];
        if (!eq) continue;
        const cons = calcConsumption(eq.start, eq.end, eq.fuel, densities);
        if (cons == null) continue;
        if (def.category === 'boiler') boilerCumulative[eq.fuel] = (boilerCumulative[eq.fuel] || 0) + cons;
        else engineCumulative[eq.fuel] = (engineCumulative[eq.fuel] || 0) + cons;
      }
    }
    return { engineCumulative, boilerCumulative };
  };

  const FUEL_KEYS: FuelKey[] = ['HFO', 'MGO', 'LSFO'];

  return (
    <div className="glass-card rounded-xl overflow-hidden mb-5 animate-slide-up">
      <div
        className="report-head px-5 py-3.5 cursor-pointer flex justify-between items-center transition-all"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-3">
          <span className={`transition-transform duration-300 ${collapsed ? '' : 'rotate-90'}`}
                style={{ color: 'var(--color-faint)' }}>
            <ChevronRight className="w-4 h-4" />
          </span>
          <div>
            <h2 className="text-[0.88rem] font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
              <span style={{ color: isDeparture ? 'var(--color-ocean-500)' : 'var(--color-mgo)' }}>
                {isDeparture ? '🚢' : '⚓'}
              </span>
              <span>{isDeparture ? 'Departure' : 'Arrival'}</span>
              <span style={{ color: 'var(--color-faint)' }}>{'–'}</span>
              <span>{report.port || 'No port'}</span>
            </h2>
            {collapsed && (
              <p className="text-[0.65rem] mt-0.5 font-mono" style={{ color: 'var(--color-dim)' }}>
                {report.date || 'No date'} {'•'} {report.phases.length} phases
              </p>
            )}
          </div>
        </div>
        <span className="total-pill mono">{totalConsumption.toFixed(2)} MT</span>
      </div>

      {!collapsed && (
        <div className="p-5">
          {/* Header fields: date / port / engineer / time events */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div>
              <label className="form-label">Date</label>
              {readOnly ? (
                <ReadOnlyField value={report.date} mono />
              ) : (
                <input type="date" value={report.date}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onChange({ ...report, date: e.target.value })}
                  className="form-input font-mono" />
              )}
            </div>
            <div>
              <label className="form-label">Port</label>
              {readOnly ? (
                <ReadOnlyField value={report.port} />
              ) : (
                <input type="text" value={report.port}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onChange({ ...report, port: e.target.value })}
                  className="form-input" placeholder="Singapore" />
              )}
            </div>
            <div>
              <label className="form-label">Engineer</label>
              {readOnly ? (
                <ReadOnlyField value={report.engineer} />
              ) : (
                <input type="text" value={report.engineer}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onChange({ ...report, engineer: e.target.value })}
                  className="form-input" />
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="form-label">SBE</label>
                <TimePicker6Min
                  value={report.timeEvents?.sbe || ''}
                  readOnly={readOnly}
                  onChange={(v) => onChange({ ...report, timeEvents: { ...report.timeEvents, sbe: v }})}
                />
              </div>
              {isDeparture ? (
                <div>
                  <label className="form-label">FA</label>
                  <TimePicker6Min
                    value={report.timeEvents?.fa || ''}
                    readOnly={readOnly}
                    onChange={(v) => onChange({ ...report, timeEvents: { ...report.timeEvents, fa: v }})}
                  />
                </div>
              ) : (
                <div>
                  <label className="form-label">FWE</label>
                  <TimePicker6Min
                    value={report.timeEvents?.fwe || ''}
                    readOnly={readOnly}
                    onChange={(v) => onChange({ ...report, timeEvents: { ...report.timeEvents, fwe: v }})}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Operational phases */}
          <div className="flex items-center gap-3 mb-4">
            <span className="section-label">
              {isDeparture ? '▸ Port / Changeover Phases' : '▸ Sea / Changeover Phases'}
            </span>
            <div className="flex-1 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}></div>
          </div>

          {operationalPhases.map((phase, index) => {
            const isLast = index === operationalPhases.length - 1;
            const hasMultiple = operationalPhases.length > 1;
            const cumulativeTotals = isLast && hasMultiple ? calcCumulative() : null;
            return (
              <PhaseSection
                key={phase.id}
                phase={phase}
                shipClass={shipClass}
                onChange={(p) => handlePhaseChange(phase.id, p)}
                onDelete={() => handleDeletePhase(phase.id)}
                canDelete={operationalPhases.length > 1}
                densities={densities}
                showTotals={isLast}
                cumulativeTotals={cumulativeTotals}
                readOnly={readOnly}
              />
            );
          })}

          {!readOnly && (
            <button
              onClick={handleAddPhase}
              className="w-full py-2.5 border-2 border-dashed rounded-lg font-semibold text-[0.72rem] mb-5 transition-all flex items-center justify-center gap-2"
              style={{ borderColor: 'var(--color-border-subtle)', color: 'var(--color-dim)' }}
            >
              <Plus className="w-4 h-4" /> Add Fuel Changeover Phase
            </button>
          )}

          {/* Standby */}
          <div className="flex items-center gap-3 mb-4">
            <span className="section-label">{'▸'} Stand By (Maneuvering)</span>
            <div className="flex-1 border-t" style={{ borderColor: 'var(--color-border-subtle)' }}></div>
          </div>

          {standbyPhase && (
            <PhaseSection
              key={standbyPhase.id}
              phase={standbyPhase}
              shipClass={shipClass}
              onChange={(p) => handlePhaseChange(standbyPhase.id, p)}
              onDelete={() => {}}
              canDelete={false}
              densities={densities}
              showTotals
              cumulativeTotals={null}
              readOnly={readOnly}
            />
          )}

          {/* Report totals card */}
          <div className="cat-card fuel" style={{ gridColumn: 'unset' }}>
            <div className="cat-label">{isDeparture ? '🚢' : '⚓'} {isDeparture ? 'Departure' : 'Arrival'} Totals (MT)</div>
            <div className="cat-body">
              <div className="fuel-cols" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                {FUEL_KEYS.map((f) => (
                  <div key={f} className={`fuel-col ${f.toLowerCase()}`}>
                    <div className="fc-type"><span className="fc-dot"></span>{f}</div>
                    <div className="fc-big mono">{grandTotals[f].toFixed(2)}</div>
                  </div>
                ))}
                <div className="fuel-col fuel-col-sigma">
                  <div className="fc-type">{'Σ'} Total</div>
                  <div className="fc-big mono">{totalConsumption.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Departure: Fuel ROB + Fuel Bunkered + Fresh Water Bunkered */}
          {isDeparture && (
            <div className="grid grid-cols-3 gap-4 mt-5">
              <FuelInputCard
                title="Fuel R.O.B. (MT)"
                values={report.rob}
                onChange={(v) => onChange({ ...report, rob: v })}
                readOnly={readOnly}
              />
              <FuelInputCard
                title="Fuel Bunkered (MT)"
                values={report.bunkered}
                onChange={(v) => onChange({ ...report, bunkered: v })}
                readOnly={readOnly}
              />
              <div className="cat-card water" style={{ gridColumn: 'unset' }}>
                <div className="cat-label">Fresh Water Bunkered (MT)</div>
                <div className="cat-body space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="w-10 form-label mb-0 flex-shrink-0">Bunk.</label>
                    {readOnly ? (
                      <ReadOnlyInlineField value={report.freshWater?.bunkered} />
                    ) : (
                      <input type="number" step="0.1" value={report.freshWater.bunkered}
                        onChange={(e) => onChange({ ...report, freshWater: { ...report.freshWater, bunkered: e.target.value }})}
                        className="flex-1 min-w-0 form-input font-mono text-[0.78rem]" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Arrival: ROB + Fresh Water (ROB/Prod/Cons) + AEP */}
          {!isDeparture && (
            <div className="grid grid-cols-3 gap-4 mt-5">
              <FuelInputCard
                title="R.O.B. (MT)"
                values={report.rob}
                onChange={(v) => onChange({ ...report, rob: v })}
                readOnly={readOnly}
              />
              <div className="cat-card water" style={{ gridColumn: 'unset' }}>
                <div className="cat-label">Fresh Water (MT)</div>
                <div className="cat-body space-y-2">
                  {([['rob', 'R.O.B.'], ['production', 'Prod.'], ['consumption', 'Cons.']] as const).map(
                    ([k, lbl]) => (
                      <div key={k} className="flex items-center gap-3">
                        <label className="w-10 form-label mb-0 flex-shrink-0">{lbl}</label>
                        {readOnly ? (
                          <ReadOnlyInlineField value={report.freshWater?.[k]} />
                        ) : (
                          <input type="number" step="0.1" value={report.freshWater[k]}
                            onChange={(e) => onChange({ ...report, freshWater: { ...report.freshWater, [k]: e.target.value }})}
                            className="flex-1 min-w-0 form-input font-mono text-[0.78rem]" />
                        )}
                      </div>
                    ),
                  )}
                </div>
              </div>
              <div className="cat-card chem" style={{ gridColumn: 'unset' }}>
                <div className="cat-label">AEP / Alkali</div>
                <div className="cat-body space-y-2">
                  <div>
                    <label className="form-label">Open Loop (hh:mm)</label>
                    {readOnly ? (
                      <ReadOnlyField value={report.aep?.openLoopHrs} mono smaller />
                    ) : (
                      <input type="text" value={report.aep.openLoopHrs} placeholder="00:00"
                        onChange={(e) => onChange({ ...report, aep: { ...report.aep, openLoopHrs: e.target.value }})}
                        className="form-input font-mono text-[0.72rem]" />
                    )}
                  </div>
                  <div>
                    <label className="form-label">Closed Loop (hh:mm)</label>
                    {readOnly ? (
                      <ReadOnlyField value={report.aep?.closedLoopHrs} mono smaller />
                    ) : (
                      <input type="text" value={report.aep.closedLoopHrs} placeholder="00:00"
                        onChange={(e) => onChange({ ...report, aep: { ...report.aep, closedLoopHrs: e.target.value }})}
                        className="form-input font-mono text-[0.72rem]" />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="form-label">NaOH Cons (L)</label>
                      {readOnly ? (
                        <ReadOnlyField value={report.aep?.alkaliCons} mono smaller />
                      ) : (
                        <input type="number" step="0.1" value={report.aep.alkaliCons}
                          onChange={(e) => onChange({ ...report, aep: { ...report.aep, alkaliCons: e.target.value }})}
                          className="form-input font-mono text-[0.72rem]" />
                      )}
                    </div>
                    <div>
                      <label className="form-label">NaOH ROB (L)</label>
                      {readOnly ? (
                        <ReadOnlyField value={report.aep?.alkaliRob} mono smaller />
                      ) : (
                        <input type="number" step="0.1" value={report.aep.alkaliRob}
                          onChange={(e) => onChange({ ...report, aep: { ...report.aep, alkaliRob: e.target.value }})}
                          className="form-input font-mono text-[0.72rem]" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface FuelInputCardProps {
  title: string;
  values: Record<FuelStorageKey, string>;
  onChange: (next: Record<FuelStorageKey, string>) => void;
  readOnly?: boolean;
}

function FuelInputCard({ title, values, onChange, readOnly = false }: FuelInputCardProps) {
  return (
    <div className="cat-card fuel" style={{ gridColumn: 'unset' }}>
      <div className="cat-label">{title}</div>
      <div className="cat-body space-y-2">
        {FUELS.map((fuel) => (
          <div key={fuel} className="flex items-center gap-3">
            <label className="w-10 form-label mb-0 flex-shrink-0 uppercase">{fuel}</label>
            {readOnly ? (
              <ReadOnlyInlineField value={values?.[fuel]} />
            ) : (
              <input type="number" step="0.01" value={values[fuel] ?? ''}
                onChange={(e) => onChange({ ...values, [fuel]: e.target.value })}
                className="flex-1 min-w-0 form-input font-mono text-[0.78rem]" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Static div that mimics the dimensions of a full-width `form-input`.
function ReadOnlyField({
  value,
  mono,
  smaller,
}: {
  value: string | null | undefined;
  mono?: boolean;
  smaller?: boolean;
}) {
  const v = value == null || value === '' ? '—' : value;
  return (
    <div
      className={`form-input ${mono ? 'font-mono' : ''} ${smaller ? 'text-[0.72rem]' : ''}`}
      style={{ background: 'transparent', border: '1px solid transparent', cursor: 'default' }}
    >
      {v}
    </div>
  );
}

// Static div that mimics the dimensions of an inline `form-input` inside a
// labelled flex row (FW Bunk./ROB/Prod/Cons, fuel ROB/Bunkered rows).
function ReadOnlyInlineField({ value }: { value: string | null | undefined }) {
  const v = value == null || value === '' ? '—' : value;
  return (
    <div
      className="flex-1 min-w-0 form-input font-mono text-[0.78rem]"
      style={{ background: 'transparent', border: '1px solid transparent', cursor: 'default' }}
    >
      {v}
    </div>
  );
}
