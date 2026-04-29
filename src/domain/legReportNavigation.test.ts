import { describe, expect, it } from 'vitest';
import { defaultVoyageReport } from './factories';
import {
  getDefaultLegReportKind,
  getReportCompletion,
} from './legReportNavigation';
import type { Leg, Report, VoyageReport } from '../types/domain';

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: 1,
    type: 'departure',
    date: '',
    port: '',
    timeEvents: { sbe: '', fa: '', fwe: '' },
    phases: [],
    rob: { hfo: '', mgo: '', lsfo: '' },
    bunkered: { hfo: '', mgo: '', lsfo: '' },
    freshWater: { rob: '', bunkered: '', production: '', consumption: '' },
    aep: { openLoopHrs: '', closedLoopHrs: '', alkaliCons: '', alkaliRob: '' },
    engineer: '',
    ...overrides,
  };
}

function completeDeparture(): Report {
  return report({
    type: 'departure',
    date: '2026-01-15',
    port: 'Miami',
    engineer: 'ECR',
    timeEvents: { sbe: '08:00', fa: '09:00', fwe: '' },
    rob: { hfo: '420', mgo: '80', lsfo: '' },
  });
}

function completeArrival(): Report {
  return report({
    type: 'arrival',
    date: '2026-01-16',
    port: 'Nassau',
    engineer: 'ECR',
    timeEvents: { sbe: '15:00', fa: '', fwe: '16:00' },
    rob: { hfo: '390', mgo: '74', lsfo: '' },
  });
}

function completeNavReport(): VoyageReport {
  return {
    ...defaultVoyageReport(),
    departure: {
      sbe: '08:00',
      fa: '09:00',
      pierToFA: { distance: '5', time: '01:00', avgSpeed: '5.0' },
    },
    voyage: { totalMiles: '186', steamingTime: '12:00', averageSpeed: '15.5' },
    arrival: {
      sbe: '15:00',
      fwe: '16:00',
      sbeToBerth: { distance: '4', time: '01:00', avgSpeed: '4.0' },
    },
  };
}

function leg(overrides: Partial<Leg> = {}): Leg {
  return {
    id: 1,
    departure: completeDeparture(),
    arrival: completeArrival(),
    voyageReport: completeNavReport(),
    ...overrides,
  };
}

describe('getReportCompletion', () => {
  it('marks a departure report incomplete until its required header fields are present', () => {
    expect(getReportCompletion(report({ type: 'departure' }), 'departure')).toEqual({
      complete: false,
      label: 'Missing date',
    });
    expect(getReportCompletion(completeDeparture(), 'departure')).toEqual({
      complete: true,
      label: 'Complete',
    });
  });

  it('marks a report incomplete when fuel ROB is not entered', () => {
    expect(getReportCompletion({
      ...completeDeparture(),
      rob: { hfo: '', mgo: '', lsfo: '' },
    }, 'departure')).toEqual({
      complete: false,
      label: 'Missing ROB',
    });
  });

  it('marks a report incomplete when any equipment counter decreases', () => {
    expect(getReportCompletion({
      ...completeDeparture(),
      phases: [{
        id: 1,
        type: 'port',
        name: 'Port',
        remarks: '',
        equipment: {
          dg1: { start: '100', end: '99', fuel: 'HFO' },
        },
      }],
    }, 'departure')).toEqual({
      complete: false,
      label: 'Negative counter',
    });
  });

  it('marks an arrival report incomplete until FWE is present', () => {
    expect(getReportCompletion(completeArrival(), 'arrival')).toEqual({
      complete: true,
      label: 'Complete',
    });
    expect(getReportCompletion(report({
      type: 'arrival',
      date: '2026-01-16',
      port: 'Nassau',
      engineer: 'ECR',
      timeEvents: { sbe: '15:00', fa: '', fwe: '' },
    }), 'arrival')).toEqual({
      complete: false,
      label: 'Missing FWE',
    });
  });

  it('marks nav report incomplete until distance and steaming time are present', () => {
    expect(getReportCompletion(defaultVoyageReport(), 'voyageReport')).toEqual({
      complete: false,
      label: 'Missing total miles',
    });
    expect(getReportCompletion(completeNavReport(), 'voyageReport')).toEqual({
      complete: true,
      label: 'Complete',
    });
  });
});

describe('getDefaultLegReportKind', () => {
  it('opens Departure first when it is incomplete', () => {
    expect(getDefaultLegReportKind(leg({ departure: report({ type: 'departure' }) }))).toBe('departure');
  });

  it('opens Arrival when Departure is complete and Arrival is incomplete', () => {
    expect(getDefaultLegReportKind(leg({ arrival: report({ type: 'arrival' }) }))).toBe('arrival');
  });

  it('opens Nav Report when both engine reports are complete and nav data is incomplete', () => {
    expect(getDefaultLegReportKind(leg({ voyageReport: defaultVoyageReport() }))).toBe('voyageReport');
  });

  it('falls back to Departure when all reports are complete', () => {
    expect(getDefaultLegReportKind(leg())).toBe('departure');
  });
}
);
