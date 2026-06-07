# Cruise Reconciliation — design

> Counter-vs-sounding mass balance across consecutive cruises.
> Date: 2026-06-07

## Goal

Surface the **offset** between what the metered counters say should be on board
at the finish of a cruise and what the manual sounding (ROB) actually measures —
carried across from the finish of the *previous* cruise, and accounting for
bunkering (and, for fresh water, production).

For each resource:

```
expected_end_ROB = prev_cruise_end_ROB
                 + Σ bunkered (this voyage)
                 + Σ production (this voyage, fresh water only)
                 − consumption (this voyage, metered)

offset = measured_end_ROB − expected_end_ROB
```

A non-zero offset is the drift between the counters and the physical soundings:
counter error, unrecorded transfer, leak, or sounding error. Positive = more
aboard than the counters predict; negative = a loss / over-metering.

## Data model context

Per `Report` (departure + arrival), today:

| Resource | Manual (sounding) | Metered (counter) | Bunkering field |
|---|---|---|---|
| Fuel HFO/MGO/LSFO | `rob.{hfo,mgo,lsfo}` | Δcounters → `calcVoyageTotals` (MT) | `bunkered.{hfo,mgo,lsfo}` |
| Fresh Water | `freshWater.rob` | `freshWater.consumption` + `freshWater.production` | `freshWater.bunkered` |
| Chemicals (NaOH) | `aep.alkaliRob` (L) | `aep.alkaliCons` (L) | **(new)** `aep.alkaliBunkered` (L) |

Units (confirmed): fuel all MT; fresh water in its entered unit; NaOH all L.
The balance is unit-consistent within each resource, so no conversion.

## Schema change

Add `alkaliBunkered: string` to `aep` on `Report`:

- `src/types/domain.ts` — extend the `aep` shape (`alkaliBunkered: string`).
- `src/domain/factories.ts` — seed `alkaliBunkered: ''` in the report factory
  (alongside `alkaliCons` / `alkaliRob`).
- `src/components/voyage/ReportForm.tsx` — add a numeric input in the Chemicals
  block, next to the existing NaOH fields, with its read-only twin (view↔edit
  parity per CLAUDE.md §7).
- Existing on-disk files lack the field → reads default to `''`. No migration;
  the factory default + `?? ''` guards cover it.

## Domain: `calcReconciliation`

New pure function in `src/domain/calculations.ts`:

```ts
calcReconciliation(
  voyage: Voyage,
  prevVoyage: Voyage | null,
  shipClass: ShipClass,
  tolerances: ReconcileTolerances,
): ReconciliationResult
```

Returns one row per resource line (`hfo`, `mgo`, `lsfo`, `water`, `naoh`), each:

```ts
interface ReconRow {
  key: 'hfo' | 'mgo' | 'lsfo' | 'water' | 'naoh';
  label: string;            // "HFO", "Fresh Water", "NaOH"
  unit: string;             // "MT", "", "L"
  prevRob: number | null;   // baseline; null when no prior cruise / no sounding
  bunker: number;
  production: number | null; // null (—) for fuel + NaOH
  consumption: number;
  expected: number | null;  // null when prevRob is null
  measured: number | null;  // null when this cruise has no end sounding
  offset: number | null;    // null when expected or measured is null
  withinTolerance: boolean;  // |offset| <= pct * expected
}
```

Component sourcing:

- **prevRob** — latest non-empty arrival ROB of `prevVoyage`. Lift the existing
  `lastReportRob` logic out of `VoyageDetail.tsx` into the domain module
  (`latestArrivalRob(voyage)`), and add the fresh-water / NaOH equivalents
  (`latestArrivalFreshWaterRob`, `latestArrivalAlkaliRob`). Reuse in the panel.
- **bunker / production** — summed across *all* reports (departure + arrival of
  every leg) of the current voyage.
- **consumption** — fuel from `calcVoyageTotals`; water from
  `calcVoyageFreshWaterTotal`; NaOH summed `alkaliCons` across arrivals (mirror
  the existing `aggregateAep` consumption sum).
- **measured** — latest non-empty arrival ROB of the current voyage.

Empty/partial handling: if `prevVoyage` is null (first ever cruise) every row's
`expected`/`offset` is null. If a specific resource has no end sounding on either
cruise, only that row degrades to `—`; the others still compute.

## Tolerances + Settings

`withinTolerance = expected != null && |offset| <= (pct/100) * |expected|`.
Base is the **expected end-ROB** (the predicted level); when `expected` is 0,
the row is treated as within tolerance (nothing to measure against).

```ts
interface ReconcileTolerances {
  fuelPct: number;   // default 1   — applies to HFO/MGO/LSFO
  otherPct: number;  // default 3   — applies to Fresh Water + NaOH
}
```

Persisted per-ship in the existing IndexedDB ship-settings store, alongside
`defaultDensities`:

- `src/storage/indexeddb.ts` — `ShipSettings` gains
  `reconcileTolerances?: ReconcileTolerances`.
- `getShipSettings` returns it; `putShipSettings` already merges arbitrary keys.
- Defaults applied at read time when absent (`fuelPct: 1`, `otherPct: 3`).

Settings UI (`SettingsPanel.tsx`): a new "Reconciliation tolerance" block, same
layout idiom as the densities block — two numeric inputs (Fuel %, Other %),
Save + Reset-to-default buttons, validated as finite and > 0. Saving writes the
ship settings; the open Reconciliation panel re-reads on next render.

## UI: Reconciliation panel

Placement: a new `CollapsibleSection id="reconciliation" title="Reconciliation"`
on the Voyage Detail pane, **below Operating Profile**, defaults collapsed.
Follows the `.cat-card` motif.

A single full-width card (`cat-card fuel`, navy — it leads with fuel) holding one
table, full balance breakdown so it is auditable at a glance:

| Resource | Prev ROB | +Bunker | +Prod | −Cons | = Expected | Measured | **Offset** |
|---|---|---|---|---|---|---|---|
| HFO (MT) | 412.0 | 300.0 | — | 318.4 | 393.6 | 391.2 | **−2.4** |
| MGO (MT) | … | … | — | … | … | … | … |
| LSFO (MT) | … | … | — | … | … | … | … |
| Fresh Water | … | … | 1 240 | … | … | … | … |
| NaOH (L) | … | … | — | … | … | … | … |

- Units carried in the row label so cells stay bare numbers.
- Production cell is `—` for fuel and NaOH.
- **Offset emphasis (direction-honest, not good/bad):** within tolerance →
  muted/dim; beyond tolerance → bold amber (`--color-warn-fg` / warning tone)
  with explicit sign. Fuel rows get HFO/MGO/LSFO category colours on the label
  to match the Fuel-by-Mode matrix; water/NaOH use their category colours.
- Table headers carry `scope` attributes; row labels are `<th scope="row">`
  (a11y parity with the Fuel-by-Mode matrix).

Empty states:
- No prior ended cruise → the card body shows "No prior cruise to reconcile
  against." instead of the table.
- Per-resource missing sounding → that row's affected cells show `—`.

## Baseline loading (previous voyage)

The Detail pane has only the current `voyage`. The baseline needs the previous
ended cruise's file. Approach **(A)**: load on demand.

- A small hook/child component `ReconciliationPanel` uses
  `findPreviousEndedVoyage(voyages, filename)` (already in
  `contexts/voyageStore.helpers`) + `loadVoyage` (from `useVoyageStore`) to fetch
  the prior voyage, mirroring `NewVoyageFlow`'s pattern.
- States: loading (skeleton/placeholder), loaded (table), none (empty state).
- Reads ship settings for tolerances via `getShipSettings(shipId)`.
- One file read per Detail view; acceptable (same cost as the import flow).

Rejected **(B)** snapshot-at-close: needs migration for existing history and
double-stores data already in the arrival report.

## Testing

- `calcReconciliation` unit tests: happy path (all resources, known numbers),
  no-prev-voyage (all null), missing-sounding-on-one-resource, multi-leg bunker
  + production summation, tolerance boundary (just inside / just outside),
  zero-expected guard.
- `latestArrivalRob` / fresh-water / NaOH variants: skip all-empty ROB objects
  (the bug `lastReportRob` already guards against).
- Tolerance default resolution when ship settings absent.
- Schema: factory seeds `alkaliBunkered: ''`; reading a legacy report without it
  yields `''` not `undefined`.

## Out of scope (v1)

- Running multi-cruise trend table (explicitly deferred; per-cruise panel first).
- Tolerance as absolute units (we use %).
- Per-fuel separate tolerances (one Fuel knob covers all three).
- Reconciling intermediate legs (only cruise-finish → cruise-finish).
