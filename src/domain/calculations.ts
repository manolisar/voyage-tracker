// Pure consumption math. Counter readings are entered in litres; MT is
// computed as (Δlitres × density) / 1000, where density is numerically the
// same kg/L value that's stored as t/m³ in the ship-class config.

import { defaultDensities } from './shipClass';
import type { FuelKey, Phase, ShipClass, Voyage } from '../types/domain';

export interface FuelTotals {
  hfo: number;
  mgo: number;
  lsfo: number;
  total: number;
}

type DensityMap = Partial<Record<FuelKey | string, number | string>>;

// Returns numeric MT (number, not string) or null if inputs incomplete/invalid.
// Inputs are in litres; density is kg/L (numerically identical to t/m³).
export function calcConsumption(
  start: string | number | null | undefined,
  end: string | number | null | undefined,
  fuel: string | null | undefined,
  densities: DensityMap | null | undefined,
): number | null {
  if (start === '' || end === '' || start == null || end == null) return null;
  const s = parseFloat(String(start));
  const e = parseFloat(String(end));
  if (isNaN(s) || isNaN(e)) return null;
  const diffL = e - s;
  if (diffL < 0) return null;

  const fuelKey = String(fuel || '').toUpperCase();
  const density = parseFloat(String(densities?.[fuelKey] ?? ''));
  if (!density || isNaN(density)) return null;

  return (diffL * density) / 1000;
}

// Round MT to 2 decimals for display.
export function formatMT(mt: number | null | undefined): string {
  if (mt == null || isNaN(mt)) return '0.00';
  return Number(mt).toFixed(2);
}

// Sum consumption across an entire voyage, broken down by fuel type.
// Returns { hfo, mgo, lsfo, total } as numbers (MT).
export function calcVoyageTotals(
  voyage: Pick<Voyage, 'legs' | 'densities'> | null | undefined,
  shipClass: ShipClass,
): FuelTotals {
  const out: FuelTotals = { hfo: 0, mgo: 0, lsfo: 0, total: 0 };
  if (!voyage?.legs) return out;
  const densities: DensityMap = voyage.densities || defaultDensities(shipClass);

  for (const leg of voyage.legs) {
    for (const report of [leg.departure, leg.arrival]) {
      if (!report?.phases) continue;
      for (const phase of report.phases) {
        if (!phase.equipment) continue;
        for (const eq of Object.values(phase.equipment)) {
          const cons = calcConsumption(eq.start, eq.end, eq.fuel, densities);
          if (cons == null) continue;
          const fuelKey = String(eq.fuel || '').toLowerCase();
          if (fuelKey === 'hfo' || fuelKey === 'mgo' || fuelKey === 'lsfo') {
            out[fuelKey] += cons;
          }
          out.total += cons;
        }
      }
    }
  }
  return out;
}

// Sum the per-leg arrival fresh-water consumption across a voyage. Lives on
// arrival reports only (departure has bunkered + ROB; consumption is reported
// at arrival). Returns total m³ as a number; non-numeric / missing entries
// are skipped silently.
export function calcVoyageFreshWaterTotal(
  voyage: Pick<Voyage, 'legs'> | null | undefined,
): number {
  let total = 0;
  if (!voyage?.legs) return total;
  for (const leg of voyage.legs) {
    const cons = parseFloat(leg.arrival?.freshWater?.consumption ?? '');
    if (Number.isFinite(cons)) total += cons;
  }
  return total;
}

// Sum consumption for a single phase, by fuel type.
export function calcPhaseTotals(
  phase: Pick<Phase, 'equipment'> | null | undefined,
  densities: DensityMap | null | undefined,
): FuelTotals {
  const out: FuelTotals = { hfo: 0, mgo: 0, lsfo: 0, total: 0 };
  if (!phase?.equipment) return out;
  for (const eq of Object.values(phase.equipment)) {
    const cons = calcConsumption(eq.start, eq.end, eq.fuel, densities);
    if (cons == null) continue;
    const fuelKey = String(eq.fuel || '').toLowerCase();
    if (fuelKey === 'hfo' || fuelKey === 'mgo' || fuelKey === 'lsfo') {
      out[fuelKey] += cons;
    }
    out.total += cons;
  }
  return out;
}

export interface FuelByMode {
  sailing: FuelTotals;
  port: FuelTotals;
  standby: FuelTotals;
}

// Phase `type` (from ship-class templates) → operating-mode bucket.
const MODE_BY_PHASE_TYPE: Record<string, keyof FuelByMode> = {
  sea: 'sailing',
  port: 'port',
  standby: 'standby',
};

// Split voyage consumption into Sailing / In Port / St-By by phase type.
// The three mode totals sum to calcVoyageTotals (every typed phase is counted
// exactly once). Phases whose type isn't one of sea/port/standby are ignored.
export function calcFuelByMode(
  voyage: Pick<Voyage, 'legs' | 'densities'> | null | undefined,
  shipClass: ShipClass,
): FuelByMode {
  const mk = (): FuelTotals => ({ hfo: 0, mgo: 0, lsfo: 0, total: 0 });
  const out: FuelByMode = { sailing: mk(), port: mk(), standby: mk() };
  if (!voyage?.legs) return out;
  const densities: DensityMap = voyage.densities || defaultDensities(shipClass);

  for (const leg of voyage.legs) {
    for (const report of [leg.departure, leg.arrival]) {
      if (!report?.phases) continue;
      for (const phase of report.phases) {
        const mode = MODE_BY_PHASE_TYPE[String(phase?.type || '').toLowerCase()];
        if (!mode || !phase.equipment) continue;
        const bucket = out[mode];
        for (const eq of Object.values(phase.equipment)) {
          const cons = calcConsumption(eq.start, eq.end, eq.fuel, densities);
          if (cons == null) continue;
          const fuelKey = String(eq.fuel || '').toLowerCase();
          if (fuelKey === 'hfo' || fuelKey === 'mgo' || fuelKey === 'lsfo') {
            bucket[fuelKey] += cons;
          }
          bucket.total += cons;
        }
      }
    }
  }
  return out;
}
