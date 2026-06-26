# Voyage Tracker v8 — Project Charter

> Engineering log for the **Celebrity Solstice-class** (5 ships).
> Codebase is **TypeScript/TSX** (migrated from the v6/v7 JS/JSX origin).
> Lineage: v6 (`~/Projects/Voyage_Tracker_v6`, single-ship, local-file storage) → fleet rewrite.

---

## 1. What this app is

A static SPA used by ECR / Chief Engineers / Bridge OOWs to log fuel + lub-oil consumption per cruise leg. Data is written as **plain JSON files to a per-ship network folder** (e.g. `Z:\voyage-tracker\solstice\`) via the browser's **File System Access API**. No backend, no cloud, no database — the app is a static bundle hosted on GitHub Pages that reads and writes the ship's own network share directly. Every save stamps a `loggedBy` attribution block (name + role + timestamp); access control is the Windows/SMB share ACL (see §4).

**Fleet (all Solstice-class, identical engine/boiler plant):**

| Code | Ship                  | Built |
|------|-----------------------|-------|
| SL   | Celebrity Solstice    | 2008  |
| EQ   | Celebrity Equinox     | 2009  |
| EC   | Celebrity Eclipse     | 2010  |
| SI   | Celebrity Silhouette  | 2011  |
| RF   | Celebrity Reflection  | 2012  |

---

## 2. Tech stack

- **React 19** + **Vite 7**
- **Tailwind CSS 4** (CSS-first config; theme tokens in `src/styles/app.css`)
- **File System Access API** for storage (per-ship network folder; handles persisted in IndexedDB)
- **IndexedDB** for: directory handles, session (`shipId`/`userName`/`role`), draft cache
- Deployment: GitHub Pages (static)

No backend. No database. No serverless functions. No auth servers. The entire app is a static bundle that writes JSON files to the ECR PC's mapped network drive.

**Browser requirement:** Chromium-based (Chrome, Edge, Brave). The File System Access API is not supported in Firefox or Safari; the landing screen detects this and shows a clear "use Chrome or Edge" message instead of crashing.

---

## 3. Storage model

Each ship owns a folder on its own network share. The crew selects that folder once per PC (via `showDirectoryPicker`) and the browser remembers the handle in IndexedDB — subsequent launches just re-request permission silently.

**Per-ship folder layout:**
```
Z:\voyage-tracker\solstice\
├── _settings.json                       # shared per-ship settings (default densities, reconcile tolerances) — chief-gated, loggedBy-stamped
├── SL_2026-01-15_MIA-FLL.json
├── SL_2026-02-04_FLL-CZM.json
└── …
```

**File naming:** `<SHIP_CODE>_<voyageStartDate>_<fromPort>-<toPort>.json` — e.g. `SL_2026-01-15_MIA-FLL.json` (Celebrity Solstice, Miami → Fort Lauderdale). Ship codes are the `code` field in [public/ships.json](public/ships.json) (`SL`, `EQ`, `EC`, `SI`, `RF`). Port codes are the 3-letter suffix of the UN/LOCODE (e.g. `USMIA` → `MIA`); the full LOCODE + country + display name are preserved inside the voyage body so the filename's truncation to 3 letters never loses context.

**File contents:** the voyage JSON plus a `loggedBy` block written on every save. `fromPort` / `toPort` are full objects, not bare strings:

```json
{
  "startDate": "2026-01-15",
  "fromPort": { "code": "MIA", "name": "Miami",           "country": "US", "locode": "USMIA" },
  "toPort":   { "code": "FLL", "name": "Fort Lauderdale", "country": "US", "locode": "USFLL" },
  "…": "…",
  "loggedBy": {
    "name": "M. Archontakis",
    "role": "Chief",
    "at": "2026-04-19T08:14:22.113Z"
  }
}
```

**Port catalog:** the UN/LOCODE-derived catalog lives at [public/ports.json](public/ports.json), built once from the open DataHub UN/LOCODE dump by [scripts/build-ports-catalog.mjs](scripts/build-ports-catalog.mjs) (re-run manually when UN/LOCODE refreshes). The New Voyage modal autocompletes against it via [src/components/ui/PortCombobox.tsx](src/components/ui/PortCombobox.tsx); if the user types an unknown 3-letter code the combobox prompts for name + country inline and persists the entry to IndexedDB under `customPorts/<shipId>` so it shows up in future autocompletes for that ship.

**Adapter contract:** the storage layer lives at `src/storage/local/` and exposes `listVoyages`, `loadVoyage`, `saveVoyage`, `deleteVoyage`, plus `loadSettings` / `saveSettings`. There is no `_index.json` and no `upsertIndex` — `listVoyages` derives the manifest by directory-listing the ship folder and reading each file's `startDate`/`voyageEnd` (cheap on a LAN share, no stale-index problem). The rest of the app depends on the interface (`src/storage/adapter.ts`), not the backend.

**Shared settings:** per-ship default densities and reconciliation tolerances live in `_settings.json` on the ship folder (not per-PC IndexedDB), read/written via the adapter's `loadSettings` / `saveSettings` ([src/storage/local/settings.ts](src/storage/local/settings.ts)). Saves are `loggedBy`-stamped (same stamp as voyages) and gated soft chief-only. When the file is absent or the share is unreachable, the app falls back to safe ship-class default densities (0.92) — never a stale per-PC value. The legacy `shipSettings` IndexedDB store is retired (dormant; no longer read or written).

**Stale-file check (the minimal safety net):**
Simultaneous edits to the same file are rare (three roles own mostly disjoint fields — see §4) but not impossible. Instead of full conflict resolution:

1. On load, we remember `file.lastModified` for each voyage.
2. Before every write, we re-fetch `file.lastModified` from disk.
3. If it's newer than what we loaded, we pause the save and surface `<StaleFileModal>` with **Reload from disk** / **Overwrite anyway** / **Cancel**.

This is cheap (one `getFile()` call, no full read) and catches the only realistic overlap case on a LAN share. There are no SHAs, no version vectors, no retries.

**Offline fallback:** if the network drive is unreachable (`NotFoundError` / `NotReadableError`), the save is cached in IndexedDB (`src/storage/indexeddb.ts`) and flushed on the next successful permission grant.

---

## 4. Access model — "The network share is the boundary"

The data is **not secret** (it's not PII or financial — just fuel counters). Access control is handled by the Windows/SMB ACL on the ship's `voyage-tracker\` share; anyone who can mount the drive can edit the data. Inside the app there is **no PIN, no password, no login, no PAT** — the landing screen asks for ship + name + role purely to stamp `loggedBy` on each save for attribution.

### Landing flow (3 steps, one-time per PC)

1. **Pick ship** — 5 tiles for the Solstice-class fleet.
2. **Identify** — type your name, pick your role (dropdown).
3. **Folder** — pick the ship's network folder (first time) or reconnect (on reload).

The `FileSystemDirectoryHandle` is stored in IndexedDB (the `handles` object store, keyed by `shipId`). On reload, Chromium auto-grants permission for persisted handles so the picker is skipped; if it reverts to "prompt" state, the landing screen offers a one-click "Reconnect folder" button.

### Edit Mode

A one-click toggle in the top bar flips between **View Only** (default on open) and **Edit Mode**. It exists purely to prevent stray clicks from a passerby at an unlocked ECR PC — it is **not** a security boundary. No PIN unlocks it; the Windows lock screen does the real access control.

**Settings are chief-gated (soft).** The Settings panel disables default-density and reconcile-tolerance edits unless the session role is `chief`. Like Edit Mode this is a workflow guard, not a security boundary — the SMB ACL and the `loggedBy` stamp on `_settings.json` are the real controls. (Anyone with drive access can edit the file directly.)

### Role partition (who writes what, by convention)

| Role                    | `role` value | Typical writes                                           |
|-------------------------|--------------|----------------------------------------------------------|
| Chief Engineer          | `chief`      | Amends anything, closes voyages (End Voyage + lub-oil).  |
| 2nd Engineer (ECR)      | `second`     | Creates voyages, writes Departure / Arrival fuel data.   |
| Bridge Officer of Watch | `bridge`     | Writes per-leg Nav Report (times, distance, speed).      |
| Other                   | `other`      | Fallback for cadets/relief crew.                         |

Stored role values are the lowercase enum from [`src/domain/constants.ts`](src/domain/constants.ts) (`EDITOR_ROLES`). The capitalized human labels (`EDITOR_ROLE_LABELS`) are only for display — the TopBar renders the first word of the label (e.g. "Chief") next to the user's name.

Nothing in the app enforces these partitions — they're workflow convention. Any role can write any field; the `loggedBy` stamp on each save records who did it. That's the audit trail.

---

## 5. Equipment & fuel rules (Solstice-class)

| Equipment | Default fuel | Allowed fuels        | Locked? |
|-----------|--------------|----------------------|---------|
| DG 1-2    | HFO          | HFO / MGO / LSFO     | no      |
| DG 4      | HFO          | HFO / MGO / LSFO     | no      |
| DG 3      | MGO          | MGO / LSFO           | no      |
| Boiler 1  | MGO          | MGO only             | **yes** |
| Boiler 2  | MGO          | MGO only             | **yes** |

**Default densities:** HFO 0.92, MGO 0.83, LSFO 0.92 kg/L. The per-ship defaults are shared in `_settings.json` (see §3/§4) and applied to new voyages at creation. A chief can also apply the current defaults to an existing **open** voyage from the Voyage Detail pane ("Apply default densities") — fuel totals recompute live; closed voyages keep their frozen `densitiesAtClose`. Numerically identical to t/m³ — the unit label flipped when counter inputs moved to litres.

**Counter inputs are in litres.** Engine and boiler counter readings (Start / End columns) are entered in L, not m³. Mass is computed as `(Δlitres × density) / 1000` in [src/domain/calculations.ts](src/domain/calculations.ts) — see `calcConsumption`. Per-row "→" arrow on EquipmentRow copies start to end (engine idle this phase); always visible while editable. The carry-over FAB carries phase END counters (in L) into the next phase's START via [src/components/modals/ManualCarryOverModal.tsx](src/components/modals/ManualCarryOverModal.tsx) — portal'd to `document.body` so it escapes AppShell's `inert={anyModalOpen}` wrapper.

**Fuel changeover phases.** Both report sections support adding extra phases for a mid-section fuel switch (e.g. HFO→MGO entering an ECA), via an "Add Fuel Changeover Phase" button in [src/components/voyage/ReportForm.tsx](src/components/voyage/ReportForm.tsx):
- The **Port / Sea (operational)** button adds a `port`/`sea` phase (named "C/O (From → To)") before the standby phase.
- The **Stand By (Maneuvering)** button adds a second `standby` phase (named "Fuel C/O") after the original standby phase.

The seed phases (one operational + one standby per report, from `phaseTemplates`) are not deletable; added changeover phases are. When a section holds 2+ phases, its **last** phase displays the **cumulative** Engine/Boiler total across every phase in that section (marked "(Cumulative)" in the phase header) via `calcCumulative(phases)` — so the standby section sums the original standby phase **plus** every changeover phase, not just the last one. The report-level total (`grandTotals`) already sums all phases regardless.

**Lub-oil:** recorded **only** at End Voyage (one entry per voyage), NOT in departure/arrival reports.

**NaOH bunkering:** the **departure** report carries an AEP/Alkali card with `aep.alkaliBunkered` (L) — NaOH is received in port, so it's logged alongside fuel/fresh-water bunkering — plus `aep.closedLoopHrs` for closed-loop scrubber hours during the port stay. The arrival report's AEP/Alkali block keeps `openLoopHrs`/`closedLoopHrs` (sea passage) and `alkaliCons`/`alkaliRob`. Chemical top-ups close the Reconciliation mass balance (see §6) the same way fuel `bunkered` and `freshWater.bunkered` do; `calcReconciliation` sums `alkaliBunkered` across both reports of every leg, so the bunkering move was data-transparent. `calcLoopHours` (Operating Profile) splits loop hours by sea vs port — see §6. Legacy arrival files that still carry `alkaliBunkered` show it on the arrival card as a "legacy" field (visible/clearable) until emptied; files without the field read as `''`.

This is data-driven via `public/ship-classes/solstice-class.json` so adding a new ship class later = drop a new JSON file.

---

## 6. UI architecture

**Layout:** persistent left tree + right detail pane (CSS Grid).

```
TopBar:  [☰] Voyage Tracker — Celebrity Solstice    [● Edit Mode | View Only]  [Enable Edit] [?] [⚙] [🌙] [⇦]

┌─ Sidebar (tree) ─────────┬─ Detail Pane ──────────────────────────────────┐
│  🔍 Search               │                                                │
│  [Active][Ended][All]    │   Selected node renders here:                  │
│                          │   • VoyageDetail (cruise card + densities      │
│  ▾ MIA-NAS-MIA           │     + summary + Legs list)                     │
│    📋 Voyage Detail      │   • Leg report workspace with sticky header    │
│    ⇆ Leg 1               │     + tabs: Departure / Arrival / Nav Report  │
│    ⇆ Leg 2               │   • VoyageEndDetail (closeout incl. lub-oil)  │
│    ⚑ Voyage End          │                                                │
└──────────────────────────┴────────────────────────────────────────────────┘
```

**Tree hierarchy:**
- Voyage
  - 📋 Voyage Detail (always present)
  - Leg 1, 2, 3, … (selecting a leg opens the right-pane report tabs)
  - ⚑ Voyage End (only after End Voyage)

**Cruise Summary aggregation (Voyage Detail pane):** Fuel totals already
sum across legs (`calcVoyageTotals`). Fresh Water *Produced* / *Consumed*
and Chemicals *NaOH cons* are likewise **summed** across every leg's
arrival report — they are flow quantities. *ROB* values (fuel ROB,
fresh-water ROB, NaOH ROB) show the **latest non-empty arrival reading**
because they are running tank levels, not additive.

**Operating Profile (Voyage Detail pane):** a second, read-only summary
section below Cruise Summary that breaks the voyage down by operating mode.
All values are **derived** from existing voyage data — no schema changes, no
new inputs — by four pure functions in [src/domain/calculations.ts](src/domain/calculations.ts):

- **Fuel by Mode** (`calcFuelByMode`) — every phase's consumption bucketed by
  `phase.type`: `sea` → Sailing, `port` → In Port, `standby` → St-By. Rendered
  as an HFO/MGO/LSFO × mode matrix; the three mode totals sum to
  `calcVoyageTotals` (an asserted invariant — built-in cross-check). St-By fuel
  includes *all* standby-phase equipment (engines **and** boilers).
- **Boiler Fuel** (`calcBoilerFuelByMode`) — boiler-only consumption (ship-class
  `category === 'boiler'`), Sailing + In Port only. St-By boiler fuel is *not*
  shown here — it already lives inside the St-By bucket of Fuel by Mode.
- **Hours & Distance** (`calcDistanceTime`) — sailed miles+hrs and St-By
  miles+hrs come from the Nav Report (`voyage.totalMiles`/`steamingTime`,
  `pierToFA`/`sbeToBerth`). **In-port hrs are derived**: for each consecutive
  call, `next departure SBE − this arrival FWE`. SBE/FWE **prefer the Nav
  Report** (Bridge-owned nav events) and fall back to engine-report
  `timeEvents`; dates come from the engine reports. The first departure and
  final arrival have no pairing, so their alongside time is excluded by design.
- **AEP Loop Hours** (`calcLoopHours`) — sums `aep` loop hours (HH:MM) across
  every leg, differentiating **sea** from **port**: sea open + sea closed come
  from the **arrival** report (sea passage), port closed comes from the
  **departure** `closedLoopHrs` (in-port scrubbing). Open loop is banned
  alongside in most ports, so there is no port-open bucket — any legacy
  departure open-loop value folds into sea-open. Returns
  `{ seaOpenHours, seaClosedHours, portClosedHours }`.

Durations display as **decimal hours** (1 dp); fuel as MT (2 dp). Helpers
`parseHHMMToMinutes` (allows elapsed >24 h) and `formatHours` are exported from
the same module. The section follows the §7 `.cat-card` motif and is
display-only (identical in View and Edit mode). Design spec:
[docs/superpowers/specs/2026-06-03-operating-mode-subsums-design.md](docs/superpowers/specs/2026-06-03-operating-mode-subsums-design.md).

**Reconciliation (Voyage Detail pane):** a third read-only collapsible section
(below Operating Profile, defaults collapsed) that cross-checks the **metered
counters against the manual ROB soundings** across consecutive cruises. For
each resource it computes, via `calcReconciliation` in
[src/domain/calculations.ts](src/domain/calculations.ts):
`expected = prevCruiseEndROB + bunkering (+ fresh-water production) − metered
consumption`, then `offset = measuredEndROB − expected`. Rows: HFO/MGO/LSFO
(MT), Fresh Water, NaOH (L). The baseline (`prevCruiseEndROB`) is the latest
non-empty **arrival** ROB of the **chronologically-previous** ended cruise — the
ended cruise that *sailed* immediately before the viewed one, via
`findPreviousEndedVoyageBefore` ([src/contexts/voyageStore.helpers.ts](src/contexts/voyageStore.helpers.ts)) +
`loadVoyage` ([src/components/detail/ReconciliationPanel.tsx](src/components/detail/ReconciliationPanel.tsx)).
Predecessor selection is sequenced by **`startDate`**, NOT `endDate`: `endDate`
is the administrative close-out date stamped at End Voyage (defaults to "today"),
which can fall *after* the next cruise's start (e.g. a cruise that arrives the
21st but is closed out the 23rd) and would otherwise exclude the genuine
predecessor and seed the baseline from a stale older cruise's ROB. For this
strictly-sequential fleet (one ship, one cruise at a time) the immediately-earlier
`startDate` reliably identifies the predecessor.
(Not the globally most-recent ended cruise — that would let a *later* cruise's
end-ROB seed the baseline when viewing an older one.)
Bunkering/production are summed across all of the current voyage's reports;
fuel/water/NaOH consumption reuse `calcVoyageTotals` /
`calcVoyageFreshWaterTotal` / summed `alkaliCons`. The **offset** is muted when
within tolerance and bold amber (with sign) beyond it. Tolerances are an
**absolute numeric offset per resource group** (Fuel MT / Fresh Water / NaOH L;
defaults 2 / 5 / 10), editable per-ship in Settings and persisted in the shared
`_settings.json` on the ship folder under `reconcileTolerances` (via the adapter's
`loadSettings` / `saveSettings`, same as default densities). First cruise (no prior ended voyage)
or a missing sounding degrades the affected row to `—` rather than a misleading
number. Design spec:
[docs/superpowers/specs/2026-06-07-cruise-reconciliation-design.md](docs/superpowers/specs/2026-06-07-cruise-reconciliation-design.md).

**Collapsible summary sections:** both Cruise Summary and Operating Profile
are wrapped in a `CollapsibleSection` ([src/components/detail/VoyageDetail.tsx](src/components/detail/VoyageDetail.tsx)) —
the section label doubles as a toggle (chevron rotates when open). Collapse
state persists per-section in `localStorage` under `vt.collapse.<id>`
(`cruiseSummary`, `operatingProfile`, `reconciliation`; `'1'` = collapsed).
**Operating Profile and Reconciliation default collapsed** so the Legs list /
Add Leg stay within reach; Cruise Summary defaults open. The detail pane is `max-w-6xl` to use ECR-monitor width,
and the `.fuel-cols` figure cluster reflows to 2×2 below 540 px so the Σ Total
never clips on the mobile drawer breakpoint.

**Leg report tabs:** Departure, Arrival, and Nav Report are not sidebar tree
children. Clicking a leg routes to the first incomplete report tab in this
order: Departure → Arrival → Nav Report, falling back to Departure when all are
complete. The sticky leg header shows report status pills; missing fuel ROB and
negative equipment counter deltas keep the relevant report in an attention
state. The internal data property remains `voyageReport`; the visible UI label
is **Nav Report**.

**Independent pane scrolling:** `html, body { overflow: hidden }`, root flex with `min-h-0` on grid children. Sidebar scrolls independently of detail; detail scrolls independently of sidebar.

**Mobile:** sidebar becomes a drawer below 900 px.

**Keyboard nav:** arrow keys, Enter, Home/End, `/` to focus search, Ctrl+B to toggle sidebar, Esc to close modals.

---

## 7. Visual design — Signal Flag Bands theme

Carried from v6, refined.

- **Fonts:** Manrope (UI) + IBM Plex Mono (numerics)
- **Color-coded category cards:** fuel (deep navy `#0F172A`), water (blue), chemicals (pink), lube (orange). Fuel bar is a single solid navy — NOT a tri-color HFO/MGO/LSFO gradient — so the card reads as a single surface even when three fuels are present inside.
- **Edit Mode badge:** amber pill in top bar
- **View Only badge:** muted gray pill
- **Buttons:** `btn-primary` (blue), `btn-warning` (amber for End Voyage / Enable Edit)

### Stratified dashboard motif (report-form summary cards)

Every `.cat-card` renders in three strata, top-down:

1. **8px top bar** (`::after` pseudo-element) — solid per-variant color (navy for fuel, `--color-water-band` for water, etc.). The pennant identity lives here.
2. **Title strip** — `.cat-label` painted with `--color-surface2` (an opaque cool off-white rail). Separates the top bar from the body with a subtle bottom border.
3. **Tinted body** — the tint (`rgba(<variant-rgb>, 0.035–0.05)`) lives on `.cat-card` itself, NOT on `.cat-body`. This is load-bearing: cards in the same CSS grid row inherit the tallest sibling's height, and the card-level tint fills that height so short cards (e.g. single-input Fresh Water Bunkered next to three-row Fuel R.O.B.) aren't half-white.

Interaction: `translateY(-3px)` hover lift + `0 8px 24px rgba(0,0,0,0.08)` shadow, mount `@keyframes slideUp` with staggered 80ms delays on `.grid > .cat-card:nth-child(N)`. All motion is auto-disabled under `prefers-reduced-motion: reduce` via the global rule at the top of `app.css`.

Σ Total column on the report-totals card uses `.fuel-col-sigma` (centered, pill-shaped, cyan-tinted gradient) — the first three columns keep the HFO/MGO/LSFO category colors.

### View ↔ edit parity (no two implementations of the same form)

`ReportForm` and `VoyageReportSection` both accept a `readOnly` prop. In read-only mode, each `<input>` is swapped for a static div with `background: transparent; border: 1px solid transparent` — same box model, same typography, same grid layout. The detail-pane wrappers (`ReportDetail`, `VoyageReportDetail`) are 20-line components that render the edit component with `readOnly`. This guarantees toggling Edit Mode doesn't reflow the page and means a single component owns the visual contract for each form.

### Dark mode

Via CSS variable redefinition in `.dark` (architectural, not per-element overrides). Tokens defined:
- Surface: `--color-bg`, `--color-surface`, `--color-surface2`
- Text: `--color-text`, `--color-dim`, `--color-faint`
- Borders: `--color-border-subtle`
- State: `--color-error-{bg,fg}`, `--color-warn-{bg,fg}`
- Landing gradient: `--color-landing-bg-{from,mid,to}`

Fuel-bar color flips to `#CBD5E1` (chalk) in dark mode so it stays legible against the navy surface. Toggle persists in localStorage; respects `prefers-color-scheme` on first visit.

---

## 8. Visual spec — the running app

The original `mockup/index.html` was the Phase 1 sign-off artifact and once governed layout, typography, colour, and interaction patterns. It has since drifted from the real app (post-pivot landing flow, Settings panel, StaleFileModal, the Signal Flag Bands refinements in §7) and has been removed.

**The running app is now the visual spec.** Surfaces under [`src/components/`](src/components) are authoritative for layout, copy, spacing, and interaction. The detailed motif rules in §7 (stratified card strata, view↔edit parity, dark mode token redefinition) remain the contract for new visual work.

---

## 9. Reuse from v6

Carried over from v6 and **rewritten in TypeScript** (and refactored to read
equipment from class config instead of hardcoded keys):

- `src/domain/factories.ts`, `calculations.ts`, `constants.ts` (validation was folded into `calculations.ts` / form-level checks — there is no standalone `validation` module)
- `src/components/voyage/ReportForm.tsx`, `PhaseSection.tsx`, `EquipmentRow.tsx`, `VoyageReportSection.tsx` (v6's `CruiseSummary` is now inlined in `detail/VoyageDetail.tsx`)
- Creation modals under `src/components/modals/` (New Voyage, Add Leg, End Voyage)
- `Icons.tsx` (extended with Anchor, Cloud, Folder, Download, Upload, etc.)
- `app.css` (Signal Flag Bands theme)
- `ThemeContext`, `ToastContext`

**Verification:** re-enter 3 v6 sample voyages, fuel totals (HFO/MGO/LSFO MT) must match v6 to 0.01.

---

## 10. Project layout

```
Voyage_Tracker_v8/
├── CLAUDE.md                           # this file
├── AGENTS.md                           # agent onboarding cheatsheet
├── public/
│   ├── ships.json                      # ship roster
│   ├── ports.json                      # UN/LOCODE seaport catalog (see scripts/build-ports-catalog.mjs)
│   └── ship-classes/
│       └── solstice-class.json         # equipment, fuels, densities, phase templates
├── scripts/
│   └── build-ports-catalog.mjs         # one-shot: fetch UN/LOCODE dump → filter → write public/ports.json
├── src/
│   ├── storage/                        # all TypeScript (.ts)
│   │   ├── adapter.ts                  # interface + shared error types (StorageError, ConflictError, NotFoundError)
│   │   ├── indexeddb.ts                # IDB helpers: handles, session, draft cache, custom ports
│   │   └── local/
│   │       ├── index.ts                # adapter install (listVoyages / loadVoyage / saveVoyage / loadSettings / saveSettings)
│   │       ├── fsHandle.ts             # directory-handle lifecycle (pick, persist, re-permission)
│   │       ├── voyages.ts              # CRUD against a per-ship folder (manifest by dir-listing, no _index.json)
│   │       ├── settings.ts             # shared _settings.json read/write (densities + reconcile tolerances)
│   │       ├── safeFilename.ts         # path-safety guard for voyage filenames
│   │       ├── errors.ts               # StaleFileError, NoDirectoryError, UnsupportedBrowserError, PathSafetyError
│   │       └── exportImport.ts         # bundle build / download / parse / import
│   ├── domain/                         # factories, calculations, constants, ports, shipClass, legReportNavigation (all .ts)
│   ├── contexts/                       # Theme, Toast, Session, VoyageStore (Context + Provider split)
│   ├── hooks/                          # useTheme, useToast, useSession, useVoyageStore, useEscapeKey, useFocusTrap
│   ├── components/                     # all .tsx (+ a few .ts)
│   │   ├── auth/                       # AuthGate (session-based router)
│   │   ├── session/                    # LandingScreen + landing/ (Steps, useFolderProbe)
│   │   ├── layout/                     # AppShell, TopBar, DetailPane
│   │   ├── tree/                       # VoyageTree, TreeNode, TreeToolbar
│   │   ├── detail/                     # VoyageDetail, ReportDetail, VoyageReportDetail, VoyageEndDetail, ReconciliationPanel, EmptyState
│   │   ├── voyage/                     # ReportForm, PhaseSection, EquipmentRow, VoyageReportSection, …
│   │   ├── modals/                     # NewVoyage, AddLeg, VoyageEnd, DeleteVoyage, DeleteLeg, StaleFile, SettingsPanel, ManualCarryOver, ImportCounters, Help
│   │   ├── ui/                         # PortCombobox, FloatingCarryOverButton, DurationPicker, TimePicker6Min
│   │   └── Icons.tsx
│   ├── styles/
│   │   └── app.css
│   ├── App.tsx
│   └── main.tsx
└── .github/workflows/deploy.yml
```

---

## 11. Build phases

1. ~~**Mockup**~~ — DONE.
2. ~~**Scaffold + v6 domain carry-over**~~ — DONE.
3. ~~**Tree UI + forms + creation modals**~~ — DONE (GitHub-backed first cut).
4. ~~**Local-file pivot**~~ — DONE. Replaced GitHub/PAT/PIN model with File System Access API + per-ship network folder + `loggedBy` attribution.
5. ~~**One-shot data migration**~~ — DONE. Legacy `voyage-tracker-data` GitHub repo is stale and no longer in use.
6. **Deploy polish** — Lighthouse a11y ≥ 95, GitHub Pages deploy smoke test on a Windows PC with a mapped network drive.

---

## 12. Operating principles

- **No code changes for new ships of the same class** — drop an entry in `ships.json`, that's it.
- **No code changes for cosmetic data tweaks** — densities, phase labels, etc. all live in class config JSON.
- **No backend, ever** — this is now literally true. No PATs, no API keys, no auth servers. The app only talks to the local filesystem via the File System Access API.
- **The running app is the visual contract** — the original mockup has been retired (see §8). Layout / copy / spacing for new work follows what's already on screen, with the motif rules in §7.
- **Attribution lives in `loggedBy`** — every voyage file carries the `{ name, role, at }` of whoever last saved it. There is no git-based audit log; the on-disk file *is* the record. Ship IT is responsible for backing up the network share.

---

*Last updated: 2026-06-23.*
