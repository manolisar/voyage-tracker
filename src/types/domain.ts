export type FuelKey = 'HFO' | 'MGO' | 'LSFO';
export type FuelStorageKey = 'hfo' | 'mgo' | 'lsfo';
export type ReportKind = 'departure' | 'arrival';
export type SelectionKind = 'voyage' | 'leg' | 'departure' | 'arrival' | 'voyageReport' | 'voyageEnd';

export interface Ship {
  id: string;
  code: string;
  displayName: string;
  yearBuilt?: number | string;
  active?: boolean;
  classId: string;
}

export interface EquipmentDefinition {
  key: string;
  label: string;
  category: 'engine' | 'boiler' | 'generator' | 'other' | string;
  defaultFuel: FuelKey;
  allowedFuels?: FuelKey[];
  locked?: boolean;
}

export interface PhaseTemplate {
  type: string;
  name: string;
}

export interface ShipClass {
  id: string;
  displayName: string;
  fuels: FuelKey[];
  defaultDensities: Record<FuelKey, number>;
  equipment: EquipmentDefinition[];
  phaseTemplates?: {
    departure?: PhaseTemplate[];
    arrival?: PhaseTemplate[];
  };
}

export interface PortRef {
  code: string;
  name: string;
  country: string;
  locode: string;
}

export interface EquipmentReading {
  start: string;
  end: string;
  fuel: FuelKey;
}

export interface Phase {
  id: number;
  type: string;
  name: string;
  equipment: Record<string, EquipmentReading>;
  remarks: string;
}

export interface Report {
  id: number;
  type: ReportKind;
  date: string;
  port: string;
  timeEvents: { sbe: string; fwe: string; fa: string };
  phases: Phase[];
  rob: Record<FuelStorageKey, string>;
  bunkered: Record<FuelStorageKey, string>;
  freshWater: { rob: string; bunkered: string; production: string; consumption: string };
  aep: { openLoopHrs: string; closedLoopHrs: string; alkaliCons: string; alkaliRob: string };
  engineer: string;
}

export interface VoyageReport {
  departure: { sbe: string; fa: string; pierToFA: { distance: string; time: string; avgSpeed: string } };
  voyage: { totalMiles: string; steamingTime: string; averageSpeed: string };
  arrival: { sbe: string; fwe: string; sbeToBerth: { distance: string; time: string; avgSpeed: string } };
}

export interface Leg {
  id: number;
  departure: Report;
  arrival: Report;
  voyageReport: VoyageReport | null;
}

export interface VoyageEnd {
  completedAt: string;
  engineer: string;
  notes: string;
  lubeOil: { meCons: string; lo13s14s: string; usedLo13c: string };
  totals: { hfo: number; mgo: number; lsfo: number; freshWaterCons: number };
  densitiesAtClose: Record<FuelKey, number>;
}

export interface Voyage {
  id: number;
  shipId: string | null;
  classId: string | null;
  fromPort: PortRef;
  toPort: PortRef;
  startDate: string;
  endDate: string;
  legs: Leg[];
  densities: Record<FuelKey, number>;
  voyageEnd: VoyageEnd | null;
  lastModified: string;
  version: string;
  filename: string | null;
}

export interface VoyageManifestEntry {
  filename: string;
  id: number;
  fromPort: PortRef;
  toPort: PortRef;
  startDate: string;
  endDate: string;
  ended: boolean;
}

export interface Selection {
  filename: string;
  kind: SelectionKind;
  legId?: number;
}
