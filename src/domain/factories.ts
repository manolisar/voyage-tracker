// Pure factories — every blank object the app creates lives here.
// Refactored from v6 to take a `shipClass` argument so equipment keys/fuels
// are no longer hardcoded.

import { APP_VERSION, PHASE_TYPES, REPORT_TYPES } from './constants';
import { defaultDensities } from './shipClass';
import type {
  EquipmentReading,
  Leg,
  Phase,
  Report,
  ReportKind,
  ShipClass,
  Voyage,
  VoyageEnd,
  VoyageReport,
} from '../types/domain';

// stable-ish IDs without external deps
const newId = (): number => Date.now() + Math.random();

export function defaultEquipment(shipClass: ShipClass): Record<string, EquipmentReading> {
  return shipClass.equipment.reduce<Record<string, EquipmentReading>>((acc, eq) => {
    acc[eq.key] = { start: '', end: '', fuel: eq.defaultFuel };
    return acc;
  }, {});
}

export function createPhase(shipClass: ShipClass, type: string, name = ''): Phase {
  return {
    id: newId(),
    type,
    name,
    equipment: defaultEquipment(shipClass),
    remarks: '',
  };
}

export function defaultDeparturePhases(shipClass: ShipClass): Phase[] {
  const tpl = shipClass.phaseTemplates?.departure ?? [];
  return tpl.map((p) => createPhase(shipClass, p.type, p.name));
}

export function defaultArrivalPhases(shipClass: ShipClass): Phase[] {
  const tpl = shipClass.phaseTemplates?.arrival ?? [];
  return tpl.map((p) => createPhase(shipClass, p.type, p.name));
}

export function defaultReport(shipClass: ShipClass, type: ReportKind): Report {
  return {
    id: newId(),
    type,
    date: '',
    port: '',
    timeEvents: { sbe: '', fwe: '', fa: '' },
    phases:
      type === REPORT_TYPES.DEPARTURE
        ? defaultDeparturePhases(shipClass)
        : defaultArrivalPhases(shipClass),
    rob: { hfo: '', mgo: '', lsfo: '' },
    bunkered: { hfo: '', mgo: '', lsfo: '' },
    freshWater: { rob: '', bunkered: '', production: '', consumption: '' },
    aep: { openLoopHrs: '', closedLoopHrs: '', alkaliCons: '', alkaliRob: '' },
    engineer: '',
    // NB: lubeOil intentionally absent — recorded only at End Voyage in v7.
  };
}

export function defaultLeg(shipClass: ShipClass): Leg {
  return {
    id: newId(),
    departure: defaultReport(shipClass, REPORT_TYPES.DEPARTURE),
    arrival: defaultReport(shipClass, REPORT_TYPES.ARRIVAL),
    // v6 made voyageReport optional and user-created; v7 always surfaces the
    // Voyage Report tree node per leg as a first-class companion to
    // Departure/Arrival, so we always seed an empty one.
    voyageReport: defaultVoyageReport(),
  };
}

export function defaultVoyageReport(): VoyageReport {
  return {
    departure: {
      sbe: '',
      fa: '',
      pierToFA: { distance: '', time: '', avgSpeed: '' },
    },
    voyage: {
      totalMiles: '',
      // Steaming Time is entered manually as "HH:mm" — auto-deriving from
      // FA(dep)/SBE(arr) across time zones introduces edge cases that don't
      // pay for themselves.
      steamingTime: '',
      averageSpeed: '',
    },
    arrival: {
      sbe: '',
      fwe: '',
      sbeToBerth: { distance: '', time: '', avgSpeed: '' },
    },
  };
}

// End-of-voyage record. Lub-oil lives ONLY here (one per voyage).
export function defaultVoyageEnd(shipClass: ShipClass): VoyageEnd {
  return {
    completedAt: '',
    engineer: '',
    notes: '',
    lubeOil: { meCons: '', lo13s14s: '', usedLo13c: '' },
    // Aggregated totals snapshot — populated when voyage is closed.
    totals: {
      hfo: 0,
      mgo: 0,
      lsfo: 0,
      freshWaterCons: 0,
    },
    densitiesAtClose: defaultDensities(shipClass),
  };
}

// Top-level voyage object stored as one JSON file under the ship's folder.
// `fromPort` / `toPort` are full port objects (not bare codes) so the
// on-disk record preserves the full UN/LOCODE + name + country even though
// the filename is truncated to the 3-letter suffix.
export function defaultVoyage(shipId: string | null, shipClass: ShipClass): Voyage {
  return {
    id: Date.now(),
    shipId,
    classId: shipClass.id,
    fromPort: { code: '', name: '', country: '', locode: '' },
    toPort: { code: '', name: '', country: '', locode: '' },
    startDate: '',
    endDate: '',
    legs: [],
    densities: defaultDensities(shipClass),
    voyageEnd: null,
    lastModified: new Date().toISOString(),
    version: APP_VERSION,
    filename: null,
  };
}

type RouteVoyage =
  | Pick<Voyage, 'fromPort' | 'toPort'>
  | { fromPort?: Partial<Voyage['fromPort']>; toPort?: Partial<Voyage['toPort']> }
  | null
  | undefined;

// Short route label — used in dense surfaces (tree, modal subtitles).
export function voyageRouteLabel(voyage: RouteVoyage): string {
  const a = voyage?.fromPort?.code;
  const b = voyage?.toPort?.code;
  if (!a || !b) return '—';
  return `${a} → ${b}`;
}

// Long-form label — used in titles where port names fit.
export function voyageRouteLongLabel(voyage: RouteVoyage): string {
  const a = voyage?.fromPort?.name || voyage?.fromPort?.code;
  const b = voyage?.toPort?.name || voyage?.toPort?.code;
  if (!a || !b) return '—';
  return `${a} → ${b}`;
}

// Exported for tests / explicit factories
export { PHASE_TYPES, REPORT_TYPES };
