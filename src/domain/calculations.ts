// Pure consumption math. Counter readings are entered in litres; MT is
// computed as (Δlitres × density) / 1000, where density is numerically the
// same kg/L value that's stored as t/m³ in the ship-class config.

import { defaultDensities } from './shipClass';
import { sortLegsByDate } from './factories';
import type { FuelKey, FuelStorageKey, Leg, Phase, ReconcileTolerances, Report, ShipClass, Voyage } from '../types/domain';

export const DEFAULT_RECONCILE_TOLERANCES: ReconcileTolerances = {
  fuel: 2,
  water: 5,
  naoh: 10,
};

export function resolveReconcileTolerances(
  t?: Partial<ReconcileTolerances> | null,
): ReconcileTolerances {
  return {
    fuel: t?.fuel ?? DEFAULT_RECONCILE_TOLERANCES.fuel,
    water: t?.water ?? DEFAULT_RECONCILE_TOLERANCES.water,
    naoh: t?.naoh ?? DEFAULT_RECONCILE_TOLERANCES.naoh,
  };
}

// Latest non-empty ARRIVAL fuel ROB across a voyage's legs — the cruise's
// finishing sounding. Arrival-only by design (departure ROB is the start).
export function latestArrivalRob(
  voyage: Pick<Voyage, 'legs'> | null | undefined,
): Partial<Record<FuelStorageKey, string>> {
  const hasAny = (r: Record<string, string> | undefined): boolean =>
    !!r && (!!r.hfo || !!r.mgo || !!r.lsfo);
  let last: Partial<Record<FuelStorageKey, string>> = {};
  for (const leg of voyage?.legs || []) {
    if (hasAny(leg.arrival?.rob)) last = leg.arrival!.rob;
  }
  return last;
}

export function latestArrivalFreshWaterRob(
  voyage: Pick<Voyage, 'legs'> | null | undefined,
): string {
  let last = '';
  for (const leg of voyage?.legs || []) {
    const v = leg.arrival?.freshWater?.rob;
    if (v) last = v;
  }
  return last;
}

export function latestArrivalAlkaliRob(
  voyage: Pick<Voyage, 'legs'> | null | undefined,
): string {
  let last = '';
  for (const leg of voyage?.legs || []) {
    const v = leg.arrival?.aep?.alkaliRob;
    if (v) last = v;
  }
  return last;
}

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

// Boiler-only consumption, Sailing + In Port (St-By boiler fuel is intentionally
// excluded here — it's already inside calcFuelByMode().standby). Boilers are
// MGO-only, so a single MT number per mode suffices.
export function calcBoilerFuelByMode(
  voyage: Pick<Voyage, 'legs' | 'densities'> | null | undefined,
  shipClass: ShipClass,
): { sailing: number; port: number } {
  const out = { sailing: 0, port: 0 };
  if (!voyage?.legs) return out;
  const densities: DensityMap = voyage.densities || defaultDensities(shipClass);
  const boilerKeys = new Set(
    (shipClass.equipment || []).filter((e) => e.category === 'boiler').map((e) => e.key),
  );

  for (const leg of voyage.legs) {
    for (const report of [leg.departure, leg.arrival]) {
      if (!report?.phases) continue;
      for (const phase of report.phases) {
        const t = String(phase?.type || '').toLowerCase();
        const mode: 'sailing' | 'port' | null =
          t === 'sea' ? 'sailing' : t === 'port' ? 'port' : null;
        if (!mode || !phase.equipment) continue;
        for (const [key, eq] of Object.entries(phase.equipment)) {
          if (!boilerKeys.has(key)) continue;
          const cons = calcConsumption(eq.start, eq.end, eq.fuel, densities);
          if (cons == null) continue;
          out[mode] += cons;
        }
      }
    }
  }
  return out;
}

// Parse an elapsed duration "HH:MM" (hours may exceed 24, e.g. "144:30") to
// minutes. Returns null on blank/invalid input. Distinct from `parseHHMM`
// (wall-clock, 0-23 h) in VoyageReportSection.tsx; see also
// `steamingTimeToDecimalHours` there, which uses the same arbitrary-hours
// regex but returns a decimal-hours string instead of minutes.
export function parseHHMMToMinutes(s: string | null | undefined): number | null {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d+):(\d{2})$/);
  if (!m) return null;
  const mm = parseInt(m[2], 10);
  if (mm > 59) return null;
  return parseInt(m[1], 10) * 60 + mm;
}

// Decimal hours (1dp) for display, e.g. 142.5. Returns '0.0' on null/NaN.
export function formatHours(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '0.0';
  return Number(n).toFixed(1);
}

// Combine "YYYY-MM-DD" + "HH:MM" (wall-clock, 0-23h) into epoch ms (local).
// Returns null if either part is missing or unparseable.
function dateTimeToEpoch(
  dateYMD: string | null | undefined,
  hhmm: string | null | undefined,
): number | null {
  if (!dateYMD || !hhmm) return null;
  const d = dateYMD.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !t) return null;
  const hh = parseInt(t[1], 10);
  const mm = parseInt(t[2], 10);
  if (hh > 23 || mm > 59) return null;
  const ms = new Date(+d[1], +d[2] - 1, +d[3], hh, mm, 0, 0).getTime();
  return isNaN(ms) ? null : ms;
}

export interface DistanceTime {
  sailedMiles: number; // Σ Nav Report voyage.totalMiles
  sailedHours: number; // Σ steamingTime, decimal hours
  stbyMiles: number;   // Σ pierToFA.distance + sbeToBerth.distance
  stbyHours: number;   // Σ pierToFA.time + sbeToBerth.time, decimal hours
  portHours: number;   // derived alongside gaps between consecutive calls
}

// Aggregate distance + time from the Nav Reports, and derive in-port hours
// from the alongside gap between consecutive calls (arrival FWE -> next
// departure SBE). SBE/FWE prefer the Nav Report (Bridge-owned) and fall back
// to engine-report timeEvents; dates come from the engine reports.
export function calcDistanceTime(
  voyage: Pick<Voyage, 'legs'> | null | undefined,
): DistanceTime {
  const out: DistanceTime = {
    sailedMiles: 0, sailedHours: 0, stbyMiles: 0, stbyHours: 0, portHours: 0,
  };
  if (!voyage?.legs) return out;

  const addMiles = (v: string | null | undefined, into: 'sailedMiles' | 'stbyMiles') => {
    const n = parseFloat(String(v ?? ''));
    if (Number.isFinite(n) && n > 0) out[into] += n;
  };

  let sailedMins = 0;
  let stbyMins = 0;
  for (const leg of voyage.legs) {
    const vr = leg.voyageReport;
    if (!vr) continue;
    addMiles(vr.voyage?.totalMiles, 'sailedMiles');
    const sm = parseHHMMToMinutes(vr.voyage?.steamingTime);
    if (sm != null) sailedMins += sm;

    addMiles(vr.departure?.pierToFA?.distance, 'stbyMiles');
    addMiles(vr.arrival?.sbeToBerth?.distance, 'stbyMiles');
    const pm = parseHHMMToMinutes(vr.departure?.pierToFA?.time);
    const am = parseHHMMToMinutes(vr.arrival?.sbeToBerth?.time);
    if (pm != null) stbyMins += pm;
    if (am != null) stbyMins += am;
  }

  // Port (alongside) hours: for each consecutive call, next departure SBE minus
  // this arrival FWE. First departure and final arrival have no pairing, so the
  // loop runs over legs[0..n-2] only.
  const legs = sortLegsByDate(voyage.legs as Leg[]);
  let portMins = 0;
  for (let i = 0; i < legs.length - 1; i++) {
    const arrLeg = legs[i];
    const depLeg = legs[i + 1];
    const fwe = arrLeg.voyageReport?.arrival?.fwe || arrLeg.arrival?.timeEvents?.fwe;
    const sbe = depLeg.voyageReport?.departure?.sbe || depLeg.departure?.timeEvents?.sbe;
    const arrEpoch = dateTimeToEpoch(arrLeg.arrival?.date, fwe);
    const depEpoch = dateTimeToEpoch(depLeg.departure?.date, sbe);
    if (arrEpoch == null || depEpoch == null) continue;
    const diffMin = (depEpoch - arrEpoch) / 60000;
    if (diffMin > 0) portMins += diffMin;
  }

  out.sailedHours = sailedMins / 60;
  out.stbyHours = stbyMins / 60;
  out.portHours = portMins / 60;
  return out;
}

// Sum AEP Open/Closed loop hours (entered HH:MM per report) across every leg,
// differentiating sea passage from in-port scrubbing. Returns decimal hours.
//
//   - Sea passage scrubbing lives on the ARRIVAL report (open + closed at sea).
//   - In-port closed-loop scrubbing lives on the DEPARTURE report (received/run
//     alongside). Open loop is banned alongside in most ports, so there is no
//     "port open" bucket; any legacy departure open-loop value is folded into
//     sea-open since open loop only ever happens underway.
export function calcLoopHours(
  voyage: Pick<Voyage, 'legs'> | null | undefined,
): { seaOpenHours: number; seaClosedHours: number; portClosedHours: number } {
  let seaOpenMins = 0;
  let seaClosedMins = 0;
  let portClosedMins = 0;
  if (!voyage?.legs) return { seaOpenHours: 0, seaClosedHours: 0, portClosedHours: 0 };
  for (const leg of voyage.legs) {
    const aOpen = parseHHMMToMinutes(leg.arrival?.aep?.openLoopHrs);
    const aClosed = parseHHMMToMinutes(leg.arrival?.aep?.closedLoopHrs);
    if (aOpen != null) seaOpenMins += aOpen;
    if (aClosed != null) seaClosedMins += aClosed;

    const dClosed = parseHHMMToMinutes(leg.departure?.aep?.closedLoopHrs);
    if (dClosed != null) portClosedMins += dClosed;
    // Legacy: open loop only happens at sea — fold any departure open-loop in.
    const dOpen = parseHHMMToMinutes(leg.departure?.aep?.openLoopHrs);
    if (dOpen != null) seaOpenMins += dOpen;
  }
  return {
    seaOpenHours: seaOpenMins / 60,
    seaClosedHours: seaClosedMins / 60,
    portClosedHours: portClosedMins / 60,
  };
}

export interface ReconRow {
  key: 'hfo' | 'mgo' | 'lsfo' | 'water' | 'naoh';
  label: string;
  unit: string;
  prevRob: number | null;
  bunker: number;
  production: number | null;
  consumption: number;
  expected: number | null;
  measured: number | null;
  offset: number | null;
  withinTolerance: boolean;
}

export interface ReconciliationResult {
  hasPrev: boolean;
  rows: ReconRow[];
}

// Parse a counter/sounding string to a number, or null when blank/invalid.
function toNullableNum(s: string | null | undefined): number | null {
  if (s == null || String(s).trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Sum a numeric field picked from every report (departure + arrival) of a
// voyage. Blank/invalid entries contribute 0.
function sumReports(
  voyage: Pick<Voyage, 'legs'> | null | undefined,
  pick: (r: Report) => string | null | undefined,
): number {
  let t = 0;
  for (const leg of voyage?.legs || []) {
    for (const r of [leg.departure, leg.arrival]) {
      if (!r) continue;
      const n = parseFloat(String(pick(r) ?? ''));
      if (Number.isFinite(n)) t += n;
    }
  }
  return t;
}

export function calcReconciliation(
  voyage: Voyage,
  prevVoyage: Voyage | null,
  shipClass: ShipClass,
  tol: ReconcileTolerances,
): ReconciliationResult {
  const hasPrev = !!prevVoyage;
  const consTotals = calcVoyageTotals(voyage, shipClass); // metered fuel MT
  const prevFuel = prevVoyage ? latestArrivalRob(prevVoyage) : {};
  const curFuel = latestArrivalRob(voyage);

  const fuelRow = (
    key: 'hfo' | 'mgo' | 'lsfo',
    label: string,
  ): ReconRow => {
    const prevRob = toNullableNum(prevFuel[key]);
    const bunker = sumReports(voyage, (r) => r.bunkered?.[key]);
    const consumption = consTotals[key];
    const measured = toNullableNum(curFuel[key]);
    const expected = prevRob == null ? null : prevRob + bunker - consumption;
    const offset = expected == null || measured == null ? null : measured - expected;
    return {
      key, label, unit: 'MT',
      prevRob, bunker, production: null, consumption,
      expected, measured, offset,
      withinTolerance: offset == null ? true : Math.abs(offset) <= tol.fuel,
    };
  };

  // Water
  const waterPrev = prevVoyage ? toNullableNum(latestArrivalFreshWaterRob(prevVoyage)) : null;
  const waterBunker = sumReports(voyage, (r) => r.freshWater?.bunkered);
  const waterProd = sumReports(voyage, (r) => r.freshWater?.production);
  const waterCons = calcVoyageFreshWaterTotal(voyage);
  const waterMeasured = toNullableNum(latestArrivalFreshWaterRob(voyage));
  const waterExpected = waterPrev == null ? null : waterPrev + waterBunker + waterProd - waterCons;
  const waterOffset = waterExpected == null || waterMeasured == null ? null : waterMeasured - waterExpected;
  const waterRow: ReconRow = {
    key: 'water', label: 'Fresh Water', unit: '',
    prevRob: waterPrev, bunker: waterBunker, production: waterProd, consumption: waterCons,
    expected: waterExpected, measured: waterMeasured, offset: waterOffset,
    withinTolerance: waterOffset == null ? true : Math.abs(waterOffset) <= tol.water,
  };

  // NaOH
  const naohPrev = prevVoyage ? toNullableNum(latestArrivalAlkaliRob(prevVoyage)) : null;
  const naohBunker = sumReports(voyage, (r) => r.aep?.alkaliBunkered);
  const naohCons = sumReports(voyage, (r) => r.aep?.alkaliCons);
  const naohMeasured = toNullableNum(latestArrivalAlkaliRob(voyage));
  const naohExpected = naohPrev == null ? null : naohPrev + naohBunker - naohCons;
  const naohOffset = naohExpected == null || naohMeasured == null ? null : naohMeasured - naohExpected;
  const naohRow: ReconRow = {
    key: 'naoh', label: 'NaOH', unit: 'L',
    prevRob: naohPrev, bunker: naohBunker, production: null, consumption: naohCons,
    expected: naohExpected, measured: naohMeasured, offset: naohOffset,
    withinTolerance: naohOffset == null ? true : Math.abs(naohOffset) <= tol.naoh,
  };

  return {
    hasPrev,
    rows: [fuelRow('hfo', 'HFO'), fuelRow('mgo', 'MGO'), fuelRow('lsfo', 'LSFO'), waterRow, naohRow],
  };
}
