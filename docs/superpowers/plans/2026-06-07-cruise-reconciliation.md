# Cruise Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-cruise Reconciliation panel to the Voyage Detail pane that shows the offset between metered consumption and manual ROB soundings, carried across from the previous cruise's finish and accounting for bunkering (and fresh-water production).

**Architecture:** A pure domain function `calcReconciliation` computes a mass balance per resource (`expected = prevEndROB + bunker + production − consumption`, `offset = measured − expected`). A `ReconciliationPanel` component loads the previous ended voyage on demand and renders the breakdown. Absolute numeric tolerances (Fuel MT / Fresh Water / NaOH L) persist per-ship in IndexedDB and are editable in Settings.

**Tech Stack:** React 19 + TypeScript, Vitest (`npm test`), Tailwind 4, File System Access API + IndexedDB. Reference spec: `docs/superpowers/specs/2026-06-07-cruise-reconciliation-design.md`.

---

## File Structure

- **Modify** `src/types/domain.ts` — add `alkaliBunkered` to `Report.aep`; add `ReconcileTolerances` interface.
- **Modify** `src/domain/factories.ts:73` — seed `alkaliBunkered: ''`.
- **Modify** `src/domain/factories.test.ts` — assert the new seed.
- **Modify** `src/storage/indexeddb.ts:62` — add `reconcileTolerances?` to `ShipSettings`.
- **Modify** `src/domain/calculations.ts` — add tolerance defaults/resolver, latest-arrival ROB helpers, and `calcReconciliation` (+ exported result types).
- **Create** `src/domain/reconciliation.test.ts` — tests for the helpers + `calcReconciliation`.
- **Modify** `src/components/voyage/ReportForm.tsx:358` — add NaOH Bunkered input (+ read-only twin).
- **Modify** `src/components/modals/SettingsPanel.tsx` — add a Reconciliation tolerance block.
- **Create** `src/components/detail/ReconciliationPanel.tsx` — loads prev voyage, renders the table + empty/loading states.
- **Modify** `src/components/detail/VoyageDetail.tsx` — add the `Reconciliation` collapsible section.

Run all commands from the repo root `/Users/Manos/Projects/Voyage_Tracker_v8`.

---

### Task 1: Schema — add `alkaliBunkered` to the report `aep` block

**Files:**
- Modify: `src/types/domain.ts` (the `Report.aep` shape)
- Modify: `src/domain/factories.ts:73`
- Test: `src/domain/factories.test.ts`

- [ ] **Step 1: Add the failing factory test**

In `src/domain/factories.test.ts`, find the existing test `seeds rob/bunkered as empty strings (not zero, not null)` (around line 115) and add this test directly after it:

```ts
  it('seeds aep.alkaliBunkered as an empty string', () => {
    const cls = sampleShipClass();
    const r = defaultReport(cls, 'arrival');
    expect(r.aep.alkaliBunkered).toBe('');
  });
```

(Use the same `sampleShipClass` / import style already present at the top of the file — do not invent a new helper.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/domain/factories.test.ts`
Expected: FAIL — `alkaliBunkered` is `undefined` (and a TS error that the property does not exist on the `aep` type).

- [ ] **Step 3: Add the type field**

In `src/types/domain.ts`, change the `aep` member of `Report` from:

```ts
  aep: { openLoopHrs: string; closedLoopHrs: string; alkaliCons: string; alkaliRob: string };
```

to:

```ts
  aep: { openLoopHrs: string; closedLoopHrs: string; alkaliCons: string; alkaliRob: string; alkaliBunkered: string };
```

- [ ] **Step 4: Seed it in the factory**

In `src/domain/factories.ts:73`, change:

```ts
    aep: { openLoopHrs: '', closedLoopHrs: '', alkaliCons: '', alkaliRob: '' },
```

to:

```ts
    aep: { openLoopHrs: '', closedLoopHrs: '', alkaliCons: '', alkaliRob: '', alkaliBunkered: '' },
```

- [ ] **Step 5: Fix any other object literals that build an `aep`**

Run: `grep -rn "alkaliRob: ''" src --include=*.ts --include=*.tsx`
For every hit that is a full `aep` object literal (e.g. `src/domain/legReportNavigation.test.ts`), add `alkaliBunkered: ''` to that literal so TypeScript stays happy.

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test -- src/domain/factories.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/types/domain.ts src/domain/factories.ts src/domain/factories.test.ts src/domain/legReportNavigation.test.ts
git commit -m "feat: add aep.alkaliBunkered field to report schema"
```

---

### Task 2: Tolerance type + defaults resolver

**Files:**
- Modify: `src/types/domain.ts` (add `ReconcileTolerances`)
- Modify: `src/storage/indexeddb.ts:62` (extend `ShipSettings`)
- Modify: `src/domain/calculations.ts` (add defaults + resolver)
- Test: `src/domain/reconciliation.test.ts` (new)

- [ ] **Step 1: Add the type**

In `src/types/domain.ts`, add at the end of the file:

```ts
export interface ReconcileTolerances {
  fuel: number;  // MT — applies to HFO/MGO/LSFO
  water: number; // fresh-water unit
  naoh: number;  // L
}
```

- [ ] **Step 2: Extend ShipSettings**

In `src/storage/indexeddb.ts`, add the import for the type at the top (next to the existing `FuelKey` import from `../types/domain`):

```ts
import type { FuelKey, ReconcileTolerances } from '../types/domain';
```

(If `FuelKey` is already imported from `../types/domain`, just add `ReconcileTolerances` to that import list rather than adding a second import line.)

Then in the `ShipSettings` interface (line 62) add the field above the index signature:

```ts
export interface ShipSettings {
  defaultDensities?: Partial<Record<FuelKey, number>>;
  reconcileTolerances?: ReconcileTolerances;
  [key: string]: unknown;
}
```

- [ ] **Step 3: Write the failing resolver test**

Create `src/domain/reconciliation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RECONCILE_TOLERANCES,
  resolveReconcileTolerances,
} from './calculations';

describe('resolveReconcileTolerances', () => {
  it('returns defaults when nothing is set', () => {
    expect(resolveReconcileTolerances(undefined)).toEqual(DEFAULT_RECONCILE_TOLERANCES);
    expect(resolveReconcileTolerances(null)).toEqual(DEFAULT_RECONCILE_TOLERANCES);
    expect(resolveReconcileTolerances({})).toEqual(DEFAULT_RECONCILE_TOLERANCES);
  });

  it('overrides only the provided keys', () => {
    expect(resolveReconcileTolerances({ fuel: 0.5 })).toEqual({
      fuel: 0.5,
      water: DEFAULT_RECONCILE_TOLERANCES.water,
      naoh: DEFAULT_RECONCILE_TOLERANCES.naoh,
    });
  });

  it('defaults the default values to 2 / 5 / 10', () => {
    expect(DEFAULT_RECONCILE_TOLERANCES).toEqual({ fuel: 2, water: 5, naoh: 10 });
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- src/domain/reconciliation.test.ts`
Expected: FAIL — `DEFAULT_RECONCILE_TOLERANCES` / `resolveReconcileTolerances` are not exported.

- [ ] **Step 5: Implement defaults + resolver**

In `src/domain/calculations.ts`, add the import (extend the existing `import type { … } from '../types/domain'` line to include the new types) and append these exports near the top of the module (after the existing imports, before `calcConsumption`):

```ts
import type { ReconcileTolerances } from '../types/domain';

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
```

(If `src/domain/calculations.ts` already imports from `../types/domain`, merge `ReconcileTolerances` into that existing import instead of adding a new line.)

- [ ] **Step 6: Run test + typecheck**

Run: `npm test -- src/domain/reconciliation.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/domain.ts src/storage/indexeddb.ts src/domain/calculations.ts src/domain/reconciliation.test.ts
git commit -m "feat: add reconcile tolerance type, defaults, and resolver"
```

---

### Task 3: Latest-arrival ROB domain helpers

**Files:**
- Modify: `src/domain/calculations.ts`
- Test: `src/domain/reconciliation.test.ts`

These read the "finish of cruise" sounding: the latest non-empty **arrival** ROB across a voyage's legs (arrival-only — departure ROB is the start, not the finish).

- [ ] **Step 1: Write failing tests**

Append to `src/domain/reconciliation.test.ts`:

```ts
import {
  latestArrivalRob,
  latestArrivalFreshWaterRob,
  latestArrivalAlkaliRob,
} from './calculations';
import type { Voyage } from '../types/domain';

// Minimal voyage builder for these helpers — only the fields they read.
function voyageWith(legs: Array<{ arrRob?: Record<string, string>; fwRob?: string; alkRob?: string }>): Voyage {
  return {
    legs: legs.map((l, i) => ({
      id: i,
      departure: { aep: {}, rob: {}, freshWater: {} },
      arrival: {
        rob: l.arrRob ?? { hfo: '', mgo: '', lsfo: '' },
        freshWater: { rob: l.fwRob ?? '' },
        aep: { alkaliRob: l.alkRob ?? '' },
      },
      voyageReport: null,
    })),
  } as unknown as Voyage;
}

describe('latestArrivalRob', () => {
  it('returns the last non-empty arrival fuel ROB', () => {
    const v = voyageWith([
      { arrRob: { hfo: '100', mgo: '', lsfo: '' } },
      { arrRob: { hfo: '90', mgo: '5', lsfo: '' } },
    ]);
    expect(latestArrivalRob(v)).toEqual({ hfo: '90', mgo: '5', lsfo: '' });
  });

  it('skips all-empty arrival ROB objects', () => {
    const v = voyageWith([
      { arrRob: { hfo: '100', mgo: '', lsfo: '' } },
      { arrRob: { hfo: '', mgo: '', lsfo: '' } },
    ]);
    expect(latestArrivalRob(v)).toEqual({ hfo: '100', mgo: '', lsfo: '' });
  });

  it('returns an empty object when no leg has an arrival ROB', () => {
    expect(latestArrivalRob(voyageWith([{}]))).toEqual({});
    expect(latestArrivalRob(null as unknown as Voyage)).toEqual({});
  });
});

describe('latestArrivalFreshWaterRob / latestArrivalAlkaliRob', () => {
  it('returns the latest non-empty values', () => {
    const v = voyageWith([
      { fwRob: '300', alkRob: '50' },
      { fwRob: '280', alkRob: '' },
    ]);
    expect(latestArrivalFreshWaterRob(v)).toBe('280');
    expect(latestArrivalAlkaliRob(v)).toBe('50');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/domain/reconciliation.test.ts`
Expected: FAIL — helpers not exported.

- [ ] **Step 3: Implement the helpers**

In `src/domain/calculations.ts`, add (the `FuelStorageKey` type is already in `../types/domain` — include it in the import if not present):

```ts
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
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- src/domain/reconciliation.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/calculations.ts src/domain/reconciliation.test.ts
git commit -m "feat: add latest-arrival ROB domain helpers"
```

---

### Task 4: `calcReconciliation`

**Files:**
- Modify: `src/domain/calculations.ts`
- Test: `src/domain/reconciliation.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/domain/reconciliation.test.ts`:

```ts
import { calcReconciliation } from './calculations';
import type { ShipClass } from '../types/domain';

const SHIP_CLASS = {
  id: 'test', displayName: 'Test', fuels: ['HFO', 'MGO', 'LSFO'],
  defaultDensities: { HFO: 0.92, MGO: 0.83, LSFO: 0.92 }, equipment: [],
} as unknown as ShipClass;

const TOL = { fuel: 2, water: 5, naoh: 10 };

// Voyage with one leg: arrival fuel ROB + bunkered + freshWater + aep.
// No equipment phases → metered fuel consumption is 0 (keeps the math simple
// so the test asserts the balance wiring, not calcConsumption which is tested
// elsewhere).
function makeVoyage(over: {
  arrRob?: Record<string, string>;
  bunker?: Record<string, string>;
  fw?: Record<string, string>;
  aep?: Record<string, string>;
}): Voyage {
  return {
    filename: 'cur.json', densities: { HFO: 0.92, MGO: 0.83, LSFO: 0.92 },
    legs: [{
      id: 1,
      departure: {
        phases: [], rob: { hfo: '', mgo: '', lsfo: '' },
        bunkered: over.bunker ?? { hfo: '', mgo: '', lsfo: '' },
        freshWater: { rob: '', bunkered: over.fw?.bunkered ?? '', production: '', consumption: '' },
        aep: { alkaliCons: '', alkaliRob: '', alkaliBunkered: over.aep?.alkaliBunkered ?? '' },
      },
      arrival: {
        phases: [], rob: over.arrRob ?? { hfo: '', mgo: '', lsfo: '' },
        bunkered: { hfo: '', mgo: '', lsfo: '' },
        freshWater: {
          rob: over.fw?.rob ?? '', bunkered: '',
          production: over.fw?.production ?? '', consumption: over.fw?.consumption ?? '',
        },
        aep: {
          alkaliCons: over.aep?.alkaliCons ?? '', alkaliRob: over.aep?.alkaliRob ?? '',
          alkaliBunkered: '',
        },
      },
      voyageReport: null,
    }],
  } as unknown as Voyage;
}

describe('calcReconciliation', () => {
  it('flags no-prev-voyage with hasPrev=false and null expecteds', () => {
    const cur = makeVoyage({ arrRob: { hfo: '100', mgo: '', lsfo: '' } });
    const res = calcReconciliation(cur, null, SHIP_CLASS, TOL);
    expect(res.hasPrev).toBe(false);
    const hfo = res.rows.find((r) => r.key === 'hfo')!;
    expect(hfo.expected).toBeNull();
    expect(hfo.offset).toBeNull();
    expect(hfo.withinTolerance).toBe(true);
  });

  it('computes the fuel balance: measured − (prev + bunker − cons)', () => {
    // prev end HFO = 400; this voyage bunkers 300 HFO, consumes 0 (no phases),
    // measured end HFO = 690 → expected 700 → offset −10 (outside 2 MT tol).
    const prev = makeVoyage({ arrRob: { hfo: '400', mgo: '', lsfo: '' } });
    const cur = makeVoyage({
      arrRob: { hfo: '690', mgo: '', lsfo: '' },
      bunker: { hfo: '300', mgo: '', lsfo: '' },
    });
    const res = calcReconciliation(cur, prev, SHIP_CLASS, TOL);
    const hfo = res.rows.find((r) => r.key === 'hfo')!;
    expect(hfo.prevRob).toBe(400);
    expect(hfo.bunker).toBe(300);
    expect(hfo.production).toBeNull();
    expect(hfo.consumption).toBe(0);
    expect(hfo.expected).toBe(700);
    expect(hfo.measured).toBe(690);
    expect(hfo.offset).toBe(-10);
    expect(hfo.withinTolerance).toBe(false);
  });

  it('adds production for the water row and respects the water tolerance', () => {
    // prev FW 200, bunker 50, production 1000, consumption 1200 → expected 50,
    // measured 53 → offset +3 (inside 5 tol).
    const prev = makeVoyage({ fw: { rob: '200' } });
    const cur = makeVoyage({
      fw: { rob: '53', bunkered: '50', production: '1000', consumption: '1200' },
    });
    const res = calcReconciliation(cur, prev, SHIP_CLASS, TOL);
    const water = res.rows.find((r) => r.key === 'water')!;
    expect(water.production).toBe(1000);
    expect(water.expected).toBe(50);
    expect(water.offset).toBe(3);
    expect(water.withinTolerance).toBe(true);
  });

  it('computes NaOH with its bunkered field and tolerance', () => {
    // prev NaOH 500, bunker 200, cons 150 → expected 550, measured 535 →
    // offset −15 (outside 10 tol).
    const prev = makeVoyage({ aep: { alkaliRob: '500' } });
    const cur = makeVoyage({
      aep: { alkaliRob: '535', alkaliBunkered: '200', alkaliCons: '150' },
    });
    const res = calcReconciliation(cur, prev, SHIP_CLASS, TOL);
    const naoh = res.rows.find((r) => r.key === 'naoh')!;
    expect(naoh.expected).toBe(550);
    expect(naoh.offset).toBe(-15);
    expect(naoh.withinTolerance).toBe(false);
  });

  it('leaves a row null when this cruise has no end sounding', () => {
    const prev = makeVoyage({ arrRob: { hfo: '400', mgo: '', lsfo: '' } });
    const cur = makeVoyage({ bunker: { hfo: '300', mgo: '', lsfo: '' } }); // no arrRob
    const res = calcReconciliation(cur, prev, SHIP_CLASS, TOL);
    const hfo = res.rows.find((r) => r.key === 'hfo')!;
    expect(hfo.measured).toBeNull();
    expect(hfo.offset).toBeNull();
    expect(hfo.withinTolerance).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/domain/reconciliation.test.ts`
Expected: FAIL — `calcReconciliation` not exported.

- [ ] **Step 3: Implement `calcReconciliation` + result types**

In `src/domain/calculations.ts`, append:

```ts
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
```

Ensure `Report` is imported from `../types/domain` in this file (add to the existing type import if missing).

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- src/domain/reconciliation.test.ts && npm run typecheck`
Expected: PASS (all `calcReconciliation` tests green).

- [ ] **Step 5: Commit**

```bash
git add src/domain/calculations.ts src/domain/reconciliation.test.ts
git commit -m "feat: add calcReconciliation mass-balance domain function"
```

---

### Task 5: NaOH Bunkered input in the report form

**Files:**
- Modify: `src/components/voyage/ReportForm.tsx` (the AEP/Alkali card, arrival branch)

The AEP/Alkali card renders only on the arrival report. Add a NaOH Bunkered (L) input next to NaOH Cons / NaOH ROB, matching the existing read-only/edit pattern.

- [ ] **Step 1: Add the Bunkered input**

In `src/components/voyage/ReportForm.tsx`, find the NaOH `grid grid-cols-2 gap-2` block (around line 358) that contains "NaOH Cons (L)" and "NaOH ROB (L)". Immediately **after** that closing `</div>` of the `grid grid-cols-2` block (and before the card's closing `</div>`s), add:

```tsx
                  <div>
                    <label className="form-label">NaOH Bunkered (L)</label>
                    {readOnly ? (
                      <ReadOnlyField value={report.aep?.alkaliBunkered} mono smaller />
                    ) : (
                      <input type="number" step="0.1" value={report.aep.alkaliBunkered}
                        onChange={(e) => onChange({ ...report, aep: { ...report.aep, alkaliBunkered: e.target.value }})}
                        className="form-input font-mono text-[0.72rem]" />
                    )}
                  </div>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors; `alkaliBunkered` exists on the type from Task 1).

- [ ] **Step 3: Verify in the preview**

Start the dev server (preview_start with the `vite dev` config). Open a voyage → a leg → the **Arrival** report in Edit Mode. Confirm a "NaOH Bunkered (L)" numeric input appears under NaOH Cons / NaOH ROB, accepts a value, and that toggling to View Only renders it as static text (parity). Capture a screenshot as proof.

- [ ] **Step 4: Commit**

```bash
git add src/components/voyage/ReportForm.tsx
git commit -m "feat: add NaOH bunkered input to the arrival report form"
```

---

### Task 6: Reconciliation tolerance block in Settings

**Files:**
- Modify: `src/components/modals/SettingsPanel.tsx`

Add a tolerance editor modeled on the existing densities block. It reads `reconcileTolerances` from ship settings and writes it back.

- [ ] **Step 1: Import the resolver + defaults**

In `src/components/modals/SettingsPanel.tsx`, add to the imports:

```ts
import { DEFAULT_RECONCILE_TOLERANCES, resolveReconcileTolerances } from '../../domain/calculations';
import type { ReconcileTolerances } from '../../types/domain';
```

- [ ] **Step 2: Add state + load effect**

Below the existing density state/effect (after the `densityDirty` effect, before `dialogRef`), add:

```ts
  const [tol, setTol] = useState<Record<keyof ReconcileTolerances, string>>({
    fuel: String(DEFAULT_RECONCILE_TOLERANCES.fuel),
    water: String(DEFAULT_RECONCILE_TOLERANCES.water),
    naoh: String(DEFAULT_RECONCILE_TOLERANCES.naoh),
  });
  const [tolDirty, setTolDirty] = useState(false);
  useEffect(() => {
    if (!shipId) return undefined;
    let alive = true;
    (async () => {
      const settings = await getShipSettings(shipId);
      if (!alive) return;
      const r = resolveReconcileTolerances(settings?.reconcileTolerances);
      setTol({ fuel: String(r.fuel), water: String(r.water), naoh: String(r.naoh) });
      setTolDirty(false);
    })();
    return () => { alive = false; };
  }, [shipId]);
```

- [ ] **Step 3: Add handlers**

Add `'tolerances'` to the `BusyState` union at the top of the file:

```ts
type BusyState = 'folder' | 'export' | 'import' | 'densities' | 'tolerances' | null;
```

Then add, next to `handleDensitySave`:

```ts
  function handleTolChange(key: keyof ReconcileTolerances, raw: string) {
    setTol((prev) => ({ ...prev, [key]: raw }));
    setTolDirty(true);
  }

  function handleTolReset() {
    setTol({
      fuel: String(DEFAULT_RECONCILE_TOLERANCES.fuel),
      water: String(DEFAULT_RECONCILE_TOLERANCES.water),
      naoh: String(DEFAULT_RECONCILE_TOLERANCES.naoh),
    });
    setTolDirty(true);
  }

  async function handleTolSave() {
    if (!shipId) return;
    const parsed: Record<string, number> = {};
    for (const key of ['fuel', 'water', 'naoh'] as const) {
      const n = Number(tol[key]);
      if (!Number.isFinite(n) || n < 0) {
        toast.addToast(`Invalid ${key} tolerance`, 'error');
        return;
      }
      parsed[key] = n;
    }
    setBusy('tolerances');
    try {
      await putShipSettings(shipId, { reconcileTolerances: parsed as unknown as ReconcileTolerances });
      setTolDirty(false);
      toast.addToast('Reconciliation tolerances saved', 'success');
    } catch (e) {
      toast.addToast((e as Error).message || 'Could not save tolerances', 'error');
    } finally {
      setBusy(null);
    }
  }
```

- [ ] **Step 4: Render the block**

In the `<div className="p-6 space-y-6">` body, after the densities block's closing `)}` and before the Export `<Row>`, add:

```tsx
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--color-dim)' }} aria-hidden="true">
              <Settings className="w-4 h-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                Reconciliation tolerance
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--color-dim)' }}>
                Offset (counter vs sounding) below this is treated as normal noise. Absolute units.
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                {([['fuel', 'Fuel (MT)'], ['water', 'Fresh Water'], ['naoh', 'NaOH (L)']] as const).map(
                  ([key, label]) => (
                    <label key={key} className="flex flex-col gap-1">
                      <span className="form-label">{label}</span>
                      <input
                        type="number" inputMode="decimal" step="0.1" min="0"
                        className="form-input font-mono"
                        value={tol[key]} disabled={disabled}
                        onChange={(e) => handleTolChange(key, e.target.value)}
                      />
                    </label>
                  ),
                )}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button" className="btn-primary px-3 py-1.5 rounded-lg text-xs"
                  disabled={disabled || !tolDirty} onClick={handleTolSave}
                >
                  {busy === 'tolerances' ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button" className="btn-flat px-3 py-1.5 rounded-lg text-xs"
                  disabled={disabled} onClick={handleTolReset} title="Reset to defaults"
                >
                  Reset to defaults
                </button>
              </div>
            </div>
          </div>
```

- [ ] **Step 5: Typecheck + preview verify**

Run: `npm run typecheck` → PASS.
In the preview, open Settings (gear icon). Confirm the "Reconciliation tolerance" block shows three inputs (default 2 / 5 / 10), Save persists (toast), and re-opening Settings shows the saved values. Screenshot as proof.

- [ ] **Step 6: Commit**

```bash
git add src/components/modals/SettingsPanel.tsx
git commit -m "feat: add reconciliation tolerance editor to Settings"
```

---

### Task 7: ReconciliationPanel component

**Files:**
- Create: `src/components/detail/ReconciliationPanel.tsx`

Loads the previous ended voyage + tolerances, then renders the breakdown table. Loading / no-prior / ready states.

- [ ] **Step 1: Create the component**

Create `src/components/detail/ReconciliationPanel.tsx`:

```tsx
// ReconciliationPanel — counter-vs-sounding mass balance for one cruise,
// carried across from the previous ended cruise's finishing ROB. Loads the
// previous voyage on demand (one file read) and the per-ship tolerances, then
// renders the auditable breakdown. Display-only (identical in View/Edit).

import { useEffect, useState } from 'react';
import {
  calcReconciliation,
  resolveReconcileTolerances,
  DEFAULT_RECONCILE_TOLERANCES,
  type ReconRow,
} from '../../domain/calculations';
import { findPreviousEndedVoyage } from '../../contexts/voyageStore.helpers';
import { getShipSettings } from '../../storage/indexeddb';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { useSession } from '../../hooks/useSession';
import type { ReconcileTolerances, ShipClass, Voyage } from '../../types/domain';

const FUEL_TEXT: Record<string, string> = {
  hfo: 'var(--color-hfo)',
  mgo: 'var(--color-mgo)',
  lsfo: 'var(--color-lsfo)',
  water: 'var(--color-water)',
  naoh: 'var(--color-chem)',
};

function fmt(n: number | null, dp: number): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function signed(n: number | null, dp: number): string {
  if (n == null) return '—';
  const s = fmt(Math.abs(n), dp);
  return n < 0 ? `−${s}` : `+${s}`;
}

interface Props {
  voyage: Voyage;
  shipClass: ShipClass;
}

export function ReconciliationPanel({ voyage, shipClass }: Props) {
  const { voyages, loadVoyage } = useVoyageStore();
  const { shipId } = useSession();
  const [prev, setPrev] = useState<Voyage | null>(null);
  const [tol, setTol] = useState<ReconcileTolerances>(DEFAULT_RECONCILE_TOLERANCES);
  const [state, setState] = useState<'loading' | 'ready' | 'none'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    (async () => {
      let settings;
      try {
        settings = shipId ? await getShipSettings(shipId) : {};
      } catch {
        settings = {};
      }
      const tolv = resolveReconcileTolerances(settings?.reconcileTolerances);
      const prevEntry = findPreviousEndedVoyage(voyages, voyage.filename);
      if (!prevEntry) {
        if (alive) { setTol(tolv); setPrev(null); setState('none'); }
        return;
      }
      try {
        const pv = await loadVoyage(prevEntry.filename);
        if (!alive) return;
        setTol(tolv);
        setPrev(pv ?? null);
        setState(pv ? 'ready' : 'none');
      } catch {
        if (alive) { setTol(tolv); setState('none'); }
      }
    })();
    return () => { alive = false; };
  }, [voyage.filename, voyages, shipId, loadVoyage]);

  if (state === 'loading') {
    return (
      <div className="cat-card fuel">
        <div className="cat-label">Counter vs Sounding</div>
        <div className="cat-body">
          <p className="text-[0.78rem]" style={{ color: 'var(--color-dim)' }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (state === 'none' || !prev) {
    return (
      <div className="cat-card fuel">
        <div className="cat-label">Counter vs Sounding</div>
        <div className="cat-body">
          <p className="text-[0.78rem]" style={{ color: 'var(--color-dim)' }}>
            No prior cruise to reconcile against.
          </p>
        </div>
      </div>
    );
  }

  const recon = calcReconciliation(voyage, prev, shipClass, tol);
  const dp = (row: ReconRow) => (row.key === 'water' || row.key === 'naoh' ? 1 : 2);

  return (
    <div className="cat-card fuel md:col-span-3">
      <div className="cat-label">
        Counter vs Sounding
        <span className="ml-auto font-mono text-[0.65rem] font-semibold" style={{ color: 'var(--color-dim)' }}>
          vs previous cruise finish
        </span>
      </div>
      <div className="cat-body">
        <table className="w-full font-mono text-[0.8rem]">
          <thead>
            <tr style={{ color: 'var(--color-dim)' }}>
              <th scope="col" className="text-left font-semibold py-1" />
              <th scope="col" className="text-right font-semibold py-1 px-2">Prev ROB</th>
              <th scope="col" className="text-right font-semibold py-1 px-2">+Bunker</th>
              <th scope="col" className="text-right font-semibold py-1 px-2">+Prod</th>
              <th scope="col" className="text-right font-semibold py-1 px-2">−Cons</th>
              <th scope="col" className="text-right font-semibold py-1 px-2">Expected</th>
              <th scope="col" className="text-right font-semibold py-1 px-2">Measured</th>
              <th scope="col" className="text-right font-semibold py-1 px-2">Offset</th>
            </tr>
          </thead>
          <tbody>
            {recon.rows.map((row) => {
              const d = dp(row);
              const offsetColor = row.offset == null
                ? 'var(--color-faint)'
                : row.withinTolerance ? 'var(--color-faint)' : 'var(--color-warn-fg)';
              return (
                <tr key={row.key} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                  <th scope="row" className="text-left py-1 font-bold" style={{ color: FUEL_TEXT[row.key] }}>
                    {row.label}{row.unit ? ` (${row.unit})` : ''}
                  </th>
                  <td className="text-right py-1 px-2">{fmt(row.prevRob, d)}</td>
                  <td className="text-right py-1 px-2">{fmt(row.bunker, d)}</td>
                  <td className="text-right py-1 px-2">{row.production == null ? '—' : fmt(row.production, d)}</td>
                  <td className="text-right py-1 px-2">{fmt(row.consumption, d)}</td>
                  <td className="text-right py-1 px-2">{fmt(row.expected, d)}</td>
                  <td className="text-right py-1 px-2">{fmt(row.measured, d)}</td>
                  <td
                    className="text-right py-1 px-2 font-bold"
                    style={{ color: offsetColor }}
                    title={row.offset != null && !row.withinTolerance ? 'Beyond tolerance' : undefined}
                  >
                    {signed(row.offset, d)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/detail/ReconciliationPanel.tsx
git commit -m "feat: add ReconciliationPanel component"
```

---

### Task 8: Wire the Reconciliation section into Voyage Detail

**Files:**
- Modify: `src/components/detail/VoyageDetail.tsx`

- [ ] **Step 1: Import the panel**

In `src/components/detail/VoyageDetail.tsx`, add near the other component imports:

```ts
import { ReconciliationPanel } from './ReconciliationPanel';
```

- [ ] **Step 2: Add the collapsible section**

Find the end of the Operating Profile `CollapsibleSection` (the `</CollapsibleSection>` that closes `id="operatingProfile"`). Immediately after it, add:

```tsx
      {/* Reconciliation */}
      <CollapsibleSection id="reconciliation" title="Reconciliation" defaultCollapsed>
        <section className="grid grid-cols-1 md:grid-cols-3 gap-[14px]">
          <ReconciliationPanel voyage={voyage} shipClass={shipClass} />
        </section>
      </CollapsibleSection>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Verify in the preview**

In the preview, open a voyage that has a **previous ended cruise** on the same ship. Expand the **Reconciliation** section and confirm:
- The table renders five rows (HFO/MGO/LSFO/Fresh Water/NaOH) with the full breakdown columns.
- Row labels carry their category colours; the Σ math reads `Prev + Bunker (+Prod) − Cons = Expected`, with `Measured` and a signed `Offset`.
- An offset beyond the tolerance shows bold amber; within-tolerance shows muted.
- Open a voyage with **no** prior ended cruise → the panel shows "No prior cruise to reconcile against."
Capture screenshots (with-prior and no-prior) as proof.

- [ ] **Step 5: Commit**

```bash
git add src/components/detail/VoyageDetail.tsx
git commit -m "feat: add Reconciliation section to Voyage Detail"
```

---

### Task 9: Full verification + docs

**Files:**
- Modify: `CLAUDE.md` (§6 Voyage Detail panes + §3/§5 schema note)

- [ ] **Step 1: Full test + typecheck + lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all PASS. Fix any failures before continuing.

- [ ] **Step 2: Document the feature**

In `CLAUDE.md` §6, after the Operating Profile description, add a short paragraph describing the **Reconciliation** panel: per-cruise counter-vs-sounding mass balance (`expected = prevEndROB + bunker + production − consumption`, `offset = measured − expected`), absolute tolerances per ship in Settings (Fuel/Water/NaOH, defaults 2/5/10), baseline loaded from the previous ended cruise, defaults collapsed. In §5, note the new `aep.alkaliBunkered` field.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the Reconciliation panel and alkaliBunkered field"
```

- [ ] **Step 4: Finish the branch**

Invoke superpowers:finishing-a-development-branch to decide how to integrate `feat/cruise-reconciliation` (merge / PR).

---

## Notes for the implementer

- **Consolidate test imports.** Tasks 2–4 each append a new block to `src/domain/reconciliation.test.ts` with its own `import … from './calculations'` line for brevity. Before Task 9's `npm run lint`, merge those into a single `import { … } from './calculations'` statement (and a single `import type { … } from '../types/domain'`) so `no-duplicate-imports` stays green. Functionally the separate lines work; this is a lint-cleanliness step.
- **Units are consistent within each resource** — no conversions. Fuel MT, water in its entered unit, NaOH L.
- **`calcVoyageTotals` already skips negative counter deltas** (returns null per row) — reconciliation inherits that; a mistyped counter shows up as an offset, which is the point.
- **The panel re-reads tolerances on mount/filename change.** If the user edits tolerances in Settings while the panel is open, switching voyages (or reopening the section) refreshes them; a live refresh is out of scope.
- **`voyages` in the effect deps** is the manifest array; it changes reference on `refreshList`. That can re-run the load — acceptable (cheap, cached by the store's lazy voyage cache).
