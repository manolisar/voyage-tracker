# E2E Exploratory Findings — 2026-04-26

Walked the full voyage workflow against the dev server using Playwright MCP +
an OPFS-backed `showDirectoryPicker` stub. Five scenarios covered:

1. Landing → create voyage → add leg → fill counters → autosave
2. Out-of-order legs render in chronological order (date sort)
3. Delete-leg removes the leg from tree, voyage detail, and disk
4. End voyage locks edits; reopen restores them
5. State survives a full page reload (OPFS persistence)

All five scenarios pass and zero runtime errors/warnings appeared in the
console. The new delete-leg + chronological-sort feature works end-to-end.

The flow turned up four issues — none are showstoppers, but they're real
quality issues worth fixing.

---

## Issue 1 (data quality, real bug) — `voyageEnd.totals` stores raw IEEE floats

**Where:** [src/contexts/VoyageStoreProvider.tsx:704-722](../../../src/contexts/VoyageStoreProvider.tsx)
(the `endVoyage` callback) writes `calcVoyageTotals(...)` directly into
`voyageEnd.totals` without rounding.

**What I saw:** with simple integer counters (1000→1010, 800→805, etc.) the
saved file contained:

```json
"totals": {
  "hfo": 23.000000000000004,
  "mgo": 3.32,
  "lsfo": 0,
  "freshWaterCons": 0
}
```

The on-screen value (rendered through `formatMT`) is fine — it shows `23.00 MT`.
But the persisted JSON carries the IEEE noise forever. Anything that reads the
file later (export, audit, future v9 import, or a chief eyeballing the JSON
on the share) sees the garbage tail.

**Fix:** round to a sensible precision (2 decimals matches the display) when
stamping `totals` at end-of-voyage. One-line change inside `endVoyage`.

**Severity:** low/medium. Doesn't break anything functional but it's ugly and
a long-tail data hygiene issue.

---

## Issue 2 (real bug) — Cruise-summary "ROB" hint shows "—" when departure has data

**Where:** [src/components/detail/VoyageDetail.tsx:19-28](../../../src/components/detail/VoyageDetail.tsx)
`lastReportRob`.

**What I saw:** I filled `rob: { hfo: 500, mgo: 200, lsfo: 100 }` on the
departure report. The cruise summary card shows `ROB —` for every fuel.
Reason: `lastReportRob` walks legs in order, pushing both `leg.departure?.rob`
and `leg.arrival?.rob`, then returns the last one. The default arrival ROB
is `{ hfo: '', mgo: '', lsfo: '' }` — truthy, but every value is empty — so
the function returns it, masking the populated departure ROB.

The sister helper `lastFreshWater` ([same file:30-36](../../../src/components/detail/VoyageDetail.tsx))
got this right with `if (fw && (fw.rob || fw.production || fw.consumption))`.
ROB just needs the same guard:

```ts
if (leg.departure?.rob && (leg.departure.rob.hfo || leg.departure.rob.mgo || leg.departure.rob.lsfo)) {
  reports.push(leg.departure.rob);
}
```

**Severity:** medium. This is a visible incorrect rendering — the user sees
"no fuel ROB" when they just entered ROB.

---

## Issue 3 (UX) — End Voyage hides the voyage from the tree without telling you

**Where:** the `ACTIVE`/`ENDED`/`ALL` filter tabs default to ACTIVE. After
clicking End Voyage the voyage flips to ended and disappears from view. The
detail panel still shows it (because selection is still valid), but the
sidebar tree shows "No voyages match this filter."

**What's missing:** a toast/breadcrumb after the close, or auto-flip the
filter to ALL on close, or auto-select the voyage detail (already done) and
ensure the tree filter shows the active selection.

**Severity:** low — it's disorienting on first use but the data is fine.

---

## Issue 4 (UX) — Sidebar footer "N voyages" reflects the filtered count, not total

**Where:** the `N voyages` label at the bottom of the sidebar mirrors
`visibleVoyages`, not `voyages`. When the user reloads with all-ended voyages
on the ACTIVE filter, they see "0 voyages" + "No voyages match this filter"
and have to switch tabs to find their data.

**Suggested fix:** "1 of 3 voyages" when filtered, or "3 voyages" when not.
Cheap clarity win.

**Severity:** low.

---

## Issue 5 (UX) — Modal copy says "and voyage report" even when it's empty

**Where:** [src/components/modals/DeleteLegModal.tsx](../../../src/components/modals/DeleteLegModal.tsx)
line 37 sets `hasVR = !!leg?.voyageReport`.

`defaultLeg()` always seeds an empty `voyageReport` object, so `hasVR` is true
even when the user never filled it in. The modal then says "and voyage
report" in the warning copy regardless. Mild UX honesty issue.

**Suggested fix:** require at least one populated field before showing the
"and voyage report" clause. Same shape as Issue 2's fix.

**Severity:** very low — purely cosmetic.

---

## Issue 6 (UX) — Port autocomplete: typing "MIA" surfaces "Mesia, ES" before "Miami, US"

**Where:** [src/components/ui/PortCombobox.jsx](../../../src/components/ui/PortCombobox.tsx)
ranks matches alphabetically by LOCODE, so a tiny Spanish port (`ESMIA`,
"Mesia") beats Miami (`USMIA`) even though Miami is the obvious target for a
Solstice-class fleet.

**Suggested fix:** a small recency / popularity bias would help, or a fixed
allowlist of "common ports" that always rank first. Or even just sort by
LOCODE country-then-code with US/MX/AG/etc. up top for cruise lanes.

**Severity:** low — ergonomic friction, not a bug.

---

## Issue 7 (consistency) — AddLeg modal uses plain text inputs for ports while New Voyage uses LOCODE combobox

**Where:** [src/components/modals/AddLegModal.tsx](../../../src/components/modals/AddLegModal.tsx)
has plain text inputs ("e.g. Hong Kong", "e.g. Shanghai") for `from`/`to`
ports. The New Voyage modal uses `PortCombobox`. The on-disk leg `port`
field is just a string, so this doesn't break the data model — but it does
mean the chief gets free-text ports per leg ("Miami", "miami", "Miami, FL")
and proper UN/LOCODE only on the voyage envelope.

**Suggested fix:** use `PortCombobox` here too. The leg's `port` field can
keep being a string — just feed it `port.name` or a `${name}, ${country}`
format from the picked option.

**Severity:** medium — affects long-term data quality.

---

## What ran clean

- Voyage filename derived correctly: `SL_2026-01-15_MIA-FLL.json`.
- `loggedBy` stamp present and fresh on every save (creation, edit, delete).
- Calculations on populated counters match expectations
  (HFO 23 MT from 25 m³ × 0.92 density, MGO 3.32 MT from 4 m³ × 0.83).
- Lock-on-close correctly: when `voyageEnd` is set, the trash buttons,
  Add Leg, and End Voyage buttons all hide; departure/arrival reports render
  via `ReportDetail` (zero editable inputs).
- Reopen restores all editing affordances.
- OPFS persistence works after a full reload — landing screen is skipped,
  voyages reload from disk, all data intact.
- Chronological sort verified end-to-end: a leg added second but dated
  earlier gets `L1` in both the tree and the leg list while the on-disk
  array stays in insertion order.
- Delete-leg flow rewrites the file with the leg gone and a fresh
  `loggedBy` stamp.
- Zero console errors or warnings across the full session.

---

## Test artifacts

The exploratory walkthrough is now a checked-in Playwright suite:

- [tests/e2e/voyage-flow.spec.ts](../../../tests/e2e/voyage-flow.spec.ts) — five smoke scenarios
- [tests/e2e/helpers.ts](../../../tests/e2e/helpers.ts) — OPFS stub + landing helpers
- [playwright.config.ts](../../../playwright.config.ts)
- New scripts: `npm run test:e2e` (CLI) and `npm run test:e2e:ui` (interactive)

The five scenarios run in ~16 seconds total against an auto-spawned dev
server. They isolate per-test by wiping OPFS + IndexedDB in `beforeEach`.
