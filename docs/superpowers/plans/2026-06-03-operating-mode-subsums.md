# Operating-Mode Sub-Sums Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Operating Profile" section to the Voyage Detail pane that breaks the voyage down by operating mode (Sailing / In Port / St-By), plus AEP loop hours and boiler fuel — all derived from existing voyage data.

**Architecture:** Four new pure functions in `src/domain/calculations.ts` (unit-tested like the existing `calcVoyageTotals`), consumed by a new read-only section in `src/components/detail/VoyageDetail.tsx` built from the existing `.cat-card` motif. No schema changes, no new inputs.

**Tech Stack:** React 19 + TypeScript, Vitest, Tailwind 4 + custom CSS tokens.

**Spec:** `docs/superpowers/specs/2026-06-03-operating-mode-subsums-design.md`

---

## File Structure

- **Modify** `src/domain/calculations.ts` — add `FuelByMode` + `DistanceTime` interfaces and functions `calcFuelByMode`, `calcBoilerFuelByMode`, `calcDistanceTime`, `calcLoopHours`, plus helpers `parseHHMMToMinutes`, `formatHours` (exported) and `dateTimeToEpoch` (module-private). Add `import { sortLegsByDate } from './factories'` and `Leg` to the type import.
- **Modify** `src/domain/calculations.test.ts` — add `describe` blocks for the four new functions.
- **Modify** `src/components/detail/VoyageDetail.tsx` — import the new functions, compute them, render the "Operating Profile" section after the Cruise Summary `</section>`.

Test command: `npx vitest run src/domain/calculations.test.ts`. Full suite: `npm test`. Lint: `npm run lint`.

---

## Task 1: `calcFuelByMode` — fuel split by operating mode

**Files:**
- Modify: `src/domain/calculations.ts`
- Test: `src/domain/calculations.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/domain/calculations.test.ts`. First add `calcFuelByMode` to the import block at the top (line 2-8):

```ts
import {
  calcConsumption,
  formatMT,
  calcVoyageTotals,
  calcVoyageFreshWaterTotal,
  calcPhaseTotals,
  calcFuelByMode,
} from './calculations';
```

Then append this block:

```ts
describe('calcFuelByMode', () => {
  const densities = { HFO: 0.92, MGO: 0.83, LSFO: 0.92 };

  it('buckets consumption by phase type and the three modes sum to calcVoyageTotals', () => {
    const voyage = {
      densities,
      legs: [
        {
          departure: {
            phases: [
              { type: 'port',    equipment: { dg12: { start: '0', end: '10000', fuel: 'HFO' } } }, // 9.20 port
              { type: 'standby', equipment: { dg4:  { start: '0', end: '5000',  fuel: 'HFO' } } }, // 4.60 standby
            ],
          },
          arrival: {
            phases: [
              { type: 'sea',     equipment: { dg12: { start: '0', end: '20000', fuel: 'LSFO' } } }, // 18.40 sailing
              { type: 'standby', equipment: { dg3:  { start: '0', end: '10000', fuel: 'MGO' } } },  // 8.30 standby
            ],
          },
        },
      ],
    };
    const m = calcFuelByMode(voyage as unknown as Voyage, solsticeClass);
    expect(m.port.hfo).toBeCloseTo(9.2, 2);
    expect(m.sailing.lsfo).toBeCloseTo(18.4, 2);
    expect(m.standby.hfo).toBeCloseTo(4.6, 2);
    expect(m.standby.mgo).toBeCloseTo(8.3, 2);
    expect(m.port.total).toBeCloseTo(9.2, 2);
    expect(m.sailing.total).toBeCloseTo(18.4, 2);
    expect(m.standby.total).toBeCloseTo(12.9, 2);

    const t = calcVoyageTotals(voyage as unknown as Voyage, solsticeClass);
    expect(m.sailing.total + m.port.total + m.standby.total).toBeCloseTo(t.total, 2);
  });

  it('ignores phases with unknown / missing type and returns zeros on empty voyage', () => {
    const voyage = {
      densities,
      legs: [
        { departure: { phases: [{ type: 'mystery', equipment: { dg12: { start: '0', end: '10000', fuel: 'HFO' } } }] }, arrival: { phases: [] } },
      ],
    };
    const m = calcFuelByMode(voyage as unknown as Voyage, solsticeClass);
    expect(m.sailing.total).toBe(0);
    expect(m.port.total).toBe(0);
    expect(m.standby.total).toBe(0);

    const empty = calcFuelByMode({ legs: [] } as unknown as Voyage, solsticeClass);
    expect(empty.port).toEqual({ hfo: 0, mgo: 0, lsfo: 0, total: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/calculations.test.ts -t calcFuelByMode`
Expected: FAIL — `calcFuelByMode is not a function` / import error.

- [ ] **Step 3: Write the implementation**

In `src/domain/calculations.ts`, append after `calcPhaseTotals` (end of file):

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/calculations.test.ts -t calcFuelByMode`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/calculations.ts src/domain/calculations.test.ts
git commit -m "Add calcFuelByMode: fuel split by operating mode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `calcBoilerFuelByMode` — boiler fuel Sailing + In Port

**Files:**
- Modify: `src/domain/calculations.ts`
- Test: `src/domain/calculations.test.ts`

- [ ] **Step 1: Write the failing test**

Add `calcBoilerFuelByMode` to the import block, then append:

```ts
describe('calcBoilerFuelByMode', () => {
  const densities = { HFO: 0.92, MGO: 0.83, LSFO: 0.92 };

  it('counts only boiler equipment, only in sailing and port phases', () => {
    const voyage = {
      densities,
      legs: [
        {
          departure: {
            phases: [
              { type: 'port', equipment: {
                boiler1: { start: '0', end: '10000', fuel: 'MGO' }, // 8.30 port boiler
                dg12:    { start: '0', end: '10000', fuel: 'HFO' }, // engine, ignored
              } },
            ],
          },
          arrival: {
            phases: [
              { type: 'sea',     equipment: { boiler2: { start: '0', end: '20000', fuel: 'MGO' } } }, // 16.60 sailing boiler
              { type: 'standby', equipment: { boiler1: { start: '0', end: '5000',  fuel: 'MGO' } } }, // standby, ignored
            ],
          },
        },
      ],
    };
    const b = calcBoilerFuelByMode(voyage as unknown as Voyage, solsticeClass);
    expect(b.port).toBeCloseTo(8.3, 2);
    expect(b.sailing).toBeCloseTo(16.6, 2);
  });

  it('returns zeros on empty voyage', () => {
    expect(calcBoilerFuelByMode({ legs: [] } as unknown as Voyage, solsticeClass)).toEqual({
      sailing: 0, port: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/calculations.test.ts -t calcBoilerFuelByMode`
Expected: FAIL — `calcBoilerFuelByMode is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/domain/calculations.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/calculations.test.ts -t calcBoilerFuelByMode`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/calculations.ts src/domain/calculations.test.ts
git commit -m "Add calcBoilerFuelByMode: boiler fuel for sailing and port

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Duration helpers + `calcDistanceTime`

**Files:**
- Modify: `src/domain/calculations.ts`
- Test: `src/domain/calculations.test.ts`

- [ ] **Step 1: Write the failing test**

Add `parseHHMMToMinutes`, `formatHours`, `calcDistanceTime` to the import block, then append:

```ts
describe('parseHHMMToMinutes', () => {
  it('parses elapsed durations including >24h', () => {
    expect(parseHHMMToMinutes('02:30')).toBe(150);
    expect(parseHHMMToMinutes('144:30')).toBe(8670);
  });
  it('returns null on blank / bad input', () => {
    expect(parseHHMMToMinutes('')).toBeNull();
    expect(parseHHMMToMinutes('1:2')).toBeNull();
    expect(parseHHMMToMinutes('ab:cd')).toBeNull();
    expect(parseHHMMToMinutes(null)).toBeNull();
    expect(parseHHMMToMinutes('10:60')).toBeNull();
  });
});

describe('formatHours', () => {
  it('formats decimal hours to 1dp', () => {
    expect(formatHours(142.5)).toBe('142.5');
    expect(formatHours(0)).toBe('0.0');
  });
  it('handles null / NaN', () => {
    expect(formatHours(null)).toBe('0.0');
    expect(formatHours(NaN)).toBe('0.0');
    expect(formatHours(undefined)).toBe('0.0');
  });
});

describe('calcDistanceTime', () => {
  it('sums Nav Report miles + hours and derives port hours across calls', () => {
    const voyage = {
      legs: [
        {
          // Leg 1: arrives port B on 2026-01-15 at 12:00 (FWE)
          arrival: { date: '2026-01-15', timeEvents: { sbe: '', fwe: '', fa: '' } },
          departure: { date: '2026-01-14', timeEvents: { sbe: '', fwe: '', fa: '' } },
          voyageReport: {
            departure: { sbe: '08:00', fa: '09:00', pierToFA: { distance: '5', time: '01:00', avgSpeed: '5.0' } },
            voyage: { totalMiles: '1200', steamingTime: '50:00', averageSpeed: '24.0' },
            arrival: { sbe: '11:00', fwe: '12:00', sbeToBerth: { distance: '6', time: '01:00', avgSpeed: '6.0' } },
          },
        },
        {
          // Leg 2: departs port B on 2026-01-16 at 12:00 (SBE) -> 24h alongside
          arrival: { date: '2026-01-17', timeEvents: { sbe: '', fwe: '', fa: '' } },
          departure: { date: '2026-01-16', timeEvents: { sbe: '', fwe: '', fa: '' } },
          voyageReport: {
            departure: { sbe: '12:00', fa: '13:00', pierToFA: { distance: '4', time: '01:00', avgSpeed: '4.0' } },
            voyage: { totalMiles: '800', steamingTime: '30:00', averageSpeed: '26.7' },
            arrival: { sbe: '', fwe: '', sbeToBerth: { distance: '', time: '', avgSpeed: '' } },
          },
        },
      ],
    };
    const dt = calcDistanceTime(voyage as unknown as Voyage);
    expect(dt.sailedMiles).toBeCloseTo(2000, 2);   // 1200 + 800
    expect(dt.sailedHours).toBeCloseTo(80, 2);      // 50:00 + 30:00
    expect(dt.stbyMiles).toBeCloseTo(15, 2);        // 5 + 6 + 4
    expect(dt.stbyHours).toBeCloseTo(3, 2);         // 01:00 ×3
    expect(dt.portHours).toBeCloseTo(24, 2);        // FWE 1/15 12:00 -> SBE 1/16 12:00
  });

  it('falls back to engine-report timeEvents when a leg has no voyageReport', () => {
    const voyage = {
      legs: [
        {
          arrival: { date: '2026-02-01', timeEvents: { sbe: '', fwe: '18:00', fa: '' } },
          departure: { date: '2026-01-31', timeEvents: { sbe: '', fwe: '', fa: '' } },
          voyageReport: null,
        },
        {
          arrival: { date: '2026-02-03', timeEvents: { sbe: '', fwe: '', fa: '' } },
          departure: { date: '2026-02-02', timeEvents: { sbe: '06:00', fwe: '', fa: '' } },
          voyageReport: null,
        },
      ],
    };
    const dt = calcDistanceTime(voyage as unknown as Voyage);
    expect(dt.sailedMiles).toBe(0);
    expect(dt.portHours).toBeCloseTo(12, 2); // FWE 2/1 18:00 -> SBE 2/2 06:00
  });

  it('skips port gaps with missing timestamps and ignores non-positive gaps', () => {
    const voyage = {
      legs: [
        { arrival: { date: '2026-03-01', timeEvents: { sbe: '', fwe: '', fa: '' } }, departure: { date: '2026-02-28', timeEvents: {} }, voyageReport: null },
        { arrival: { date: '2026-03-03', timeEvents: {} }, departure: { date: '2026-03-02', timeEvents: { sbe: '06:00', fwe: '', fa: '' } }, voyageReport: null },
      ],
    };
    const dt = calcDistanceTime(voyage as unknown as Voyage);
    expect(dt.portHours).toBe(0); // leg-1 arrival FWE missing -> pair skipped
  });

  it('returns zeros on empty voyage', () => {
    expect(calcDistanceTime({ legs: [] } as unknown as Voyage)).toEqual({
      sailedMiles: 0, sailedHours: 0, stbyMiles: 0, stbyHours: 0, portHours: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/calculations.test.ts -t calcDistanceTime`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Write the implementation**

First, update the imports at the top of `src/domain/calculations.ts`. Change:

```ts
import { defaultDensities } from './shipClass';
import type { FuelKey, Phase, ShipClass, Voyage } from '../types/domain';
```

to:

```ts
import { defaultDensities } from './shipClass';
import { sortLegsByDate } from './factories';
import type { FuelKey, Leg, Phase, ShipClass, Voyage } from '../types/domain';
```

Then append to the end of the file:

```ts
// Parse an elapsed duration "HH:MM" (hours may exceed 24, e.g. "144:30") to
// minutes. Returns null on blank/invalid input. Distinct from the wall-clock
// 0-23h parser in VoyageReportSection — this one allows arbitrary hour count.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/calculations.test.ts -t "calcDistanceTime|parseHHMMToMinutes|formatHours"`
Expected: PASS (all duration/distance tests green).

- [ ] **Step 5: Commit**

```bash
git add src/domain/calculations.ts src/domain/calculations.test.ts
git commit -m "Add calcDistanceTime + duration helpers (sailed/stby/port hours)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `calcLoopHours` — AEP Open/Closed loop totals

**Files:**
- Modify: `src/domain/calculations.ts`
- Test: `src/domain/calculations.test.ts`

- [ ] **Step 1: Write the failing test**

Add `calcLoopHours` to the import block, then append:

```ts
describe('calcLoopHours', () => {
  it('sums open/closed loop HH:MM across departure + arrival of every leg', () => {
    const voyage = {
      legs: [
        {
          departure: { aep: { openLoopHrs: '10:00', closedLoopHrs: '02:30' } },
          arrival:   { aep: { openLoopHrs: '08:30', closedLoopHrs: '01:00' } },
        },
        {
          departure: { aep: { openLoopHrs: '12:00', closedLoopHrs: '' } },
          arrival:   { aep: { openLoopHrs: '', closedLoopHrs: '03:00' } },
        },
      ],
    };
    const l = calcLoopHours(voyage as unknown as Voyage);
    expect(l.openHours).toBeCloseTo(30.5, 2);   // 10 + 8.5 + 12
    expect(l.closedHours).toBeCloseTo(6.5, 2);  // 2.5 + 1 + 3
  });

  it('returns zeros on empty voyage / missing aep', () => {
    expect(calcLoopHours({ legs: [] } as unknown as Voyage)).toEqual({ openHours: 0, closedHours: 0 });
    const v = { legs: [{ departure: {}, arrival: {} }] };
    expect(calcLoopHours(v as unknown as Voyage)).toEqual({ openHours: 0, closedHours: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/calculations.test.ts -t calcLoopHours`
Expected: FAIL — `calcLoopHours is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/domain/calculations.ts` (uses `parseHHMMToMinutes` from Task 3):

```ts
// Sum AEP Open/Closed loop hours (entered HH:MM per report) across both reports
// of every leg. Returns decimal hours.
export function calcLoopHours(
  voyage: Pick<Voyage, 'legs'> | null | undefined,
): { openHours: number; closedHours: number } {
  let openMins = 0;
  let closedMins = 0;
  if (!voyage?.legs) return { openHours: 0, closedHours: 0 };
  for (const leg of voyage.legs) {
    for (const report of [leg.departure, leg.arrival]) {
      const o = parseHHMMToMinutes(report?.aep?.openLoopHrs);
      const c = parseHHMMToMinutes(report?.aep?.closedLoopHrs);
      if (o != null) openMins += o;
      if (c != null) closedMins += c;
    }
  }
  return { openHours: openMins / 60, closedHours: closedMins / 60 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/calculations.test.ts -t calcLoopHours`
Expected: PASS (2 tests). Then run the whole file: `npx vitest run src/domain/calculations.test.ts` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/domain/calculations.ts src/domain/calculations.test.ts
git commit -m "Add calcLoopHours: total AEP open/closed loop hours

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Render the "Operating Profile" section

**Files:**
- Modify: `src/components/detail/VoyageDetail.tsx`

- [ ] **Step 1: Extend the imports**

In `src/components/detail/VoyageDetail.tsx`, replace the calculations import (lines 6-7):

```ts
import { calcVoyageTotals, type FuelTotals } from '../../domain/calculations';
import { formatMT } from '../../domain/calculations';
```

with:

```ts
import {
  calcVoyageTotals,
  calcFuelByMode,
  calcBoilerFuelByMode,
  calcDistanceTime,
  calcLoopHours,
  formatMT,
  formatHours,
  type FuelTotals,
} from '../../domain/calculations';
```

- [ ] **Step 2: Compute the aggregates in the component body**

In `VoyageDetail`, just after `const totals = calcVoyageTotals(voyage, shipClass);` (line 115), add:

```ts
  const fuelByMode = calcFuelByMode(voyage, shipClass);
  const boilerByMode = calcBoilerFuelByMode(voyage, shipClass);
  const distanceTime = calcDistanceTime(voyage);
  const loopHours = calcLoopHours(voyage);
  const fmtMiles = (n: number) =>
    n ? (Number.isInteger(n) ? String(n) : n.toFixed(1)) : '0';
```

- [ ] **Step 3: Add the Operating Profile section**

In the JSX, immediately after the Cruise Summary `</section>` (the one that closes at line 263, right before `{/* Densities */}`), insert:

```tsx
      {/* Operating Profile */}
      <div className="section-label mb-3">Operating Profile</div>
      <section className="grid grid-cols-1 md:grid-cols-3 gap-[14px] mb-5">
        {/* Fuel by Mode matrix */}
        <div className="cat-card fuel md:col-span-3">
          <div className="cat-label">
            Fuel by Mode
            <span className="ml-auto font-mono text-[0.65rem] font-semibold" style={{ color: 'var(--color-dim)' }}>
              MT · all legs
            </span>
          </div>
          <div className="cat-body">
            <table className="w-full font-mono text-[0.8rem]">
              <thead>
                <tr style={{ color: 'var(--color-dim)' }}>
                  <th className="text-left font-semibold py-1" />
                  <th className="text-right font-semibold py-1 px-2">Sailing</th>
                  <th className="text-right font-semibold py-1 px-2">In Port</th>
                  <th className="text-right font-semibold py-1 px-2">St-By</th>
                  <th className="text-right font-semibold py-1 px-2">Σ Fuel</th>
                </tr>
              </thead>
              <tbody>
                {FUEL_COLS.map(({ key, label }) => (
                  <tr key={key} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                    <td className="text-left py-1" style={{ color: 'var(--color-dim)' }}>{label}</td>
                    <td className="text-right py-1 px-2">{formatMT(fuelByMode.sailing[key])}</td>
                    <td className="text-right py-1 px-2">{formatMT(fuelByMode.port[key])}</td>
                    <td className="text-right py-1 px-2">{formatMT(fuelByMode.standby[key])}</td>
                    <td className="text-right py-1 px-2 font-semibold">
                      {formatMT(fuelByMode.sailing[key] + fuelByMode.port[key] + fuelByMode.standby[key])}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--color-border-subtle)' }}>
                  <td className="text-left py-1 font-semibold">Σ Mode</td>
                  <td className="text-right py-1 px-2 font-semibold">{formatMT(fuelByMode.sailing.total)}</td>
                  <td className="text-right py-1 px-2 font-semibold">{formatMT(fuelByMode.port.total)}</td>
                  <td className="text-right py-1 px-2 font-semibold">{formatMT(fuelByMode.standby.total)}</td>
                  <td className="text-right py-1 px-2 font-bold">
                    {formatMT(fuelByMode.sailing.total + fuelByMode.port.total + fuelByMode.standby.total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Hours & Distance */}
        <div className="cat-card water md:col-span-2">
          <div className="cat-label">Hours &amp; Distance</div>
          <div className="cat-body">
            <Mini label="Sailed" value={`${fmtMiles(distanceTime.sailedMiles)} nm · ${formatHours(distanceTime.sailedHours)} h`} />
            <Mini label="St-By"  value={`${fmtMiles(distanceTime.stbyMiles)} nm · ${formatHours(distanceTime.stbyHours)} h`} />
            <Mini label="In Port" value={`${formatHours(distanceTime.portHours)} h`} />
            <p className="text-[0.62rem] italic mt-1" style={{ color: 'var(--color-faint)' }}>
              Port = time alongside between calls.
            </p>
          </div>
        </div>

        {/* Boiler Fuel */}
        <div className="cat-card fuel">
          <div className="cat-label">Boiler Fuel</div>
          <div className="cat-body">
            <Mini label="Sailing" value={formatMT(boilerByMode.sailing)} suffix="MT" />
            <Mini label="In Port" value={formatMT(boilerByMode.port)} suffix="MT" />
          </div>
        </div>

        {/* AEP Loop Hours */}
        <div className="cat-card chem md:col-span-3">
          <div className="cat-label">AEP Loop Hours</div>
          <div className="cat-body">
            <Mini label="Open Loop"   value={formatHours(loopHours.openHours)}   suffix="h" />
            <Mini label="Closed Loop" value={formatHours(loopHours.closedHours)} suffix="h" />
          </div>
        </div>
      </section>
```

Note: `Mini` renders `—` when `value` is falsy. `formatMT(0)` → `"0.00"` and `formatHours(0)` → `"0.0"` are non-empty strings, so zero values display as numbers (not `—`), which is correct here.

- [ ] **Step 4: Verify build, lint, and tests**

Run: `npm run lint`
Expected: no errors in `VoyageDetail.tsx` / `calculations.ts`.

Run: `npm test`
Expected: all tests pass (existing + new).

- [ ] **Step 5: Visual verification**

Start the dev server (`preview_start` if not running), open a voyage's **Voyage Detail** node, and confirm the new "Operating Profile" section renders below Cruise Summary with: the Fuel-by-Mode matrix (Σ Mode grand total matching the Cruise Summary Σ Total), Hours & Distance, Boiler Fuel, and AEP Loop Hours. Take a `preview_screenshot` as proof. Check dark mode via `preview_resize` is unaffected (cards reuse existing tokens).

- [ ] **Step 6: Commit**

```bash
git add src/components/detail/VoyageDetail.tsx
git commit -m "Render Operating Profile section in Voyage Detail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** Fuel by mode (Task 1, Card A) · Boiler fuel sailing/port (Task 2, Card C) · sailed miles+hrs / stby miles+hrs / port hrs (Task 3, Card B) · open/closed loop hrs (Task 4, Card D) · St-By boiler fuel folded into standby bucket (Task 1, asserted via cross-check) · Nav-Report-preferred port timestamps with timeEvents fallback (Task 3 test). All covered.
- **Type consistency:** `FuelByMode` (sailing/port/standby), `DistanceTime` (sailedMiles/sailedHours/stbyMiles/stbyHours/portHours), `calcLoopHours → {openHours, closedHours}`, `calcBoilerFuelByMode → {sailing, port}` are used identically in Task 5.
- **No new persisted fields** — derived only; export/import untouched.
