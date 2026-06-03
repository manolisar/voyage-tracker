# Operating-Mode Sub-Sums in Voyage Detail

> Status: approved-pending-review
> Date: 2026-06-03
> Surface: `src/components/detail/VoyageDetail.tsx` (the "Voyage Detail" tree node), `src/domain/calculations.ts`

## Goal

Add an **Operating Profile** section to the Voyage Detail pane that breaks the
voyage down by operating mode. All values are **derived from data already in the
voyage files** — no schema changes, no new input fields.

New sub-sums requested:

1. **Fuel by mode** — Sailing / In Port / St-By, each split HFO / MGO / LSFO.
2. **Distance & hours** — miles + hrs sailed, hrs in port, miles + hrs in St-By.
3. **AEP loop hours** — total Open Loop and Closed Loop hours.
4. **Boiler fuel** — Sailing and In Port (St-By boiler fuel is folded into the
   general St-By fuel sub-sum, not shown separately).

## Data model (existing, unchanged)

- A `Voyage` has `legs[]`. Each `Leg` has `departure: Report`, `arrival: Report`,
  and `voyageReport: VoyageReport | null` (the Nav Report).
- `Report.phases[]`; each `Phase` has `type` and `equipment: Record<key, {start,end,fuel}>`.
- Phase types come from `solstice-class.json` templates:
  - departure report → phases of type `port` and `standby`
  - arrival report → phases of type `sea` and `standby`
- `Report.timeEvents: { sbe, fwe, fa }` (HH:MM) and `Report.date` (YYYY-MM-DD) —
  always present, entered on the engine reports.
- `Report.aep: { openLoopHrs, closedLoopHrs, ... }` — HH:MM strings, per report.
- `VoyageReport` (optional per leg):
  - `voyage: { totalMiles, steamingTime, averageSpeed }` — sea passage
  - `departure.pierToFA: { distance, time, avgSpeed }` — St-By departure
  - `arrival.sbeToBerth: { distance, time, avgSpeed }` — St-By arrival
- Ship-class `equipment[]` each carry `category` (`engine` | `boiler`).

## Mode mapping

| Phase `type` | Operating mode |
|--------------|----------------|
| `sea`        | Sailing        |
| `port`       | In Port        |
| `standby`    | St-By          |

Unknown/other types are ignored (templates only emit the three above).

## New pure functions (in `src/domain/calculations.ts`)

All functions are pure, side-effect-free, and unit-tested in
`calculations.test.ts` alongside the existing `calcVoyageTotals` tests. They
reuse `calcConsumption` and the voyage's `densities` (falling back to
`defaultDensities(shipClass)`), exactly like `calcVoyageTotals`.

### 1. `calcFuelByMode(voyage, shipClass): FuelByMode`

```ts
interface FuelByMode {
  sailing: FuelTotals;  // { hfo, mgo, lsfo, total }
  port:    FuelTotals;
  standby: FuelTotals;
}
```

Walk every leg's `departure` and `arrival` reports, every phase, every
equipment reading. Bucket each reading's consumption into `sailing` / `port` /
`standby` by `phase.type`, accumulating per fuel key and `total`. The three
mode totals sum to `calcVoyageTotals` (cross-check, asserted in a test).

### 2. `calcBoilerFuelByMode(voyage, shipClass): { sailing: number; port: number }`

Same walk, but only equipment whose ship-class `category === 'boiler'`, and
only the `sea` (sailing) and `port` buckets. Returns MT numbers (boilers are
MGO-only, so a single number per mode is sufficient).

### 3. `calcDistanceTime(voyage): DistanceTime`

```ts
interface DistanceTime {
  sailedMiles: number;   // Σ voyage.totalMiles
  sailedHours: number;   // Σ steamingTime (decimal hours)
  stbyMiles:   number;   // Σ pierToFA.distance + sbeToBerth.distance
  stbyHours:   number;   // Σ pierToFA.time + sbeToBerth.time (decimal hours)
  portHours:   number;   // derived, see below
}
```

- Miles: parse + sum the Nav Report distance fields; skip legs without a
  `voyageReport` or with blank/non-numeric values.
- Hours: parse HH:MM (steaming time may exceed 24 h, e.g. `144:30`) → minutes,
  sum, convert to decimal hours.
- **`portHours` (derived):** sort legs by date (reuse `sortLegsByDate`). For each
  consecutive pair, compute the alongside gap:
  `leg[i+1].departure (date + timeEvents.sbe)` − `leg[i].arrival (date + timeEvents.fwe)`.
  Build a `Date`/epoch from `YYYY-MM-DD` + `HH:MM`. Skip any pair where a date or
  time is missing/unparseable, or where the diff is ≤ 0 (data error). Sum the
  positive gaps → decimal hours.
  - **Edge cases (excluded by design):** the first leg's pre-departure alongside
    time has no preceding arrival, and the final arrival has no following
    departure — neither is counted. A caption notes "alongside, between calls".

### 4. `calcLoopHours(voyage): { openHours: number; closedHours: number }`

Sum `aep.openLoopHrs` and `aep.closedLoopHrs` (HH:MM) across both reports
(`departure` + `arrival`) of every leg → minutes → decimal hours.

### Shared helpers

- `parseHHMMToMinutes(s)` — accepts arbitrary hour magnitude (`144:30` valid);
  returns `null` on bad input. (Distinct from the wall-clock 0–23h parser in
  `VoyageReportSection.tsx`; this one is for elapsed durations.)
- `dateTimeToEpoch(dateYMD, hhmm)` — combine for the port-gap diff.
- Formatting: `formatHours(n)` → `n.toFixed(1)` (decimal hours, 1 dp);
  reuse `formatMT` for fuel (2 dp).

## UI (in `VoyageDetail.tsx`)

New section titled **Operating Profile**, placed directly below the existing
Cruise Summary `</section>` and above Fuel Densities. Reuses the stratified
`.cat-card` motif (§7 of CLAUDE.md): top bar, `.cat-label` strip, tinted body.
Read-only display (no inputs) — same in View and Edit mode.

### Card A — Fuel by Mode (`.cat-card fuel`, full width)

A matrix: rows = fuels, columns = modes, with a totals row and column.

```
Fuel by Mode                                         MT · all legs
              Sailing     In Port     St-By        Σ Fuel
HFO            x.xx        x.xx        x.xx          x.xx
MGO            x.xx        x.xx        x.xx          x.xx
LSFO           x.xx        x.xx        x.xx          x.xx
Σ Mode         x.xx        x.xx        x.xx          x.xx  ← grand total
```

The right "Σ Fuel" column equals the per-fuel voyage totals; the bottom-right
cell equals the grand total in the Cruise Summary above. Σ row/column styled
with the existing `fuel-col-sigma` cyan treatment.

### Card B — Hours & Distance (`.cat-card water`, ~2 col)

```
Sailed    1234 nm    ·    56.5 h
St-By       18 nm    ·     2.2 h
In Port               ·    47.3 h        (alongside, between calls)
```

Miles shown only for Sailed and St-By; In Port shows hours only.

### Card C — Boiler Fuel (`.cat-card fuel`, ~1 col)

```
Boilers
Sailing    x.xx MT
In Port    x.xx MT
```

### Card D — AEP Loop Hours (`.cat-card chem`, ~1 col or full)

```
AEP Loop Hours
Open Loop     120.0 h
Closed Loop    22.5 h
```

### Grid

Follows the Cruise Summary pattern (`grid grid-cols-1 md:grid-cols-3`):
- Card A spans all 3 columns.
- Row 2: Card B (`md:col-span-2`) + Card C (1 col).
- Card D spans all 3 columns (full-width row 3).

Empty/zero data renders `—` or `0.00` consistent with existing Mini/fuel-col
behavior; cards always render (they're derived, never "not yet recorded").

## Testing

Add to `src/domain/calculations.test.ts`:
- `calcFuelByMode`: a fixture voyage with known readings across all three phase
  types; assert per-mode per-fuel MT, and that `sailing+port+standby === calcVoyageTotals`.
- `calcBoilerFuelByMode`: assert only boiler equipment counted, only sailing/port.
- `calcDistanceTime`: Nav Report miles/hours sums; `portHours` derivation across
  a 3-leg fixture incl. a multi-day alongside gap and a leg with a missing
  timestamp (skipped).
- `calcLoopHours`: HH:MM sums across departure + arrival, incl. > 24 h totals.

## Out of scope

- No new input fields or schema changes.
- No change to file naming, storage, or `loggedBy`.
- No export/import changes (derived values aren't persisted).
- Port-hours for the first departure and final arrival (no pairing) — excluded.
