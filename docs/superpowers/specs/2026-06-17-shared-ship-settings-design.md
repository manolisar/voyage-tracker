# Shared, chief-gated ship settings on the network share

> Design spec — 2026-06-17
> Branch: `feat/shared-ship-settings`

## Problem

Per-ship settings (default fuel densities + reconciliation tolerances) live in
each browser's IndexedDB (`shipSettings` store, keyed by `shipId`). This has two
consequences that bit us in production:

1. **Per-PC drift.** Each ECR PC carries its own copy. A stray
   `defaultDensities.HFO = 0.90` set on one PC silently flows into every new
   voyage created on that PC, while voyages created elsewhere use 0.92. There is
   no single source of truth.
2. **No audit trail.** `putShipSettings` writes to IndexedDB with **no stamp**.
   Unlike voyage files (which carry `loggedBy`), a settings change records
   nothing — who set 0.90, or when, is unrecoverable.

Concrete incident: `EC_2026-06-14_AMS-AMS.json` carries
`densities.HFO = 0.90`. Its top-level `loggedBy` names the last *file* saver
(M. Archontakis), not whoever set the 0.90 density override — because the
override came in at voyage-creation time from this PC's untracked IndexedDB
setting.

## Goal

Move ship settings off per-PC IndexedDB and onto a **single shared file on the
ship's network share**, so every PC reads the same values; gate edits behind a
**soft chief-only guard** with a `loggedBy` stamp; and let a chief change the
values **on the fly**, including fixing the density of an already-created
voyage.

This stays inside the project charter: **no backend, no server, no auth
servers** (CLAUDE.md §12). The share is the boundary (§4); the file *is* the
record (§12).

## Non-goals (YAGNI)

- **Real authentication / hard role enforcement.** Roles are self-selected on
  the landing screen and unauthenticated (§4). The chief-only gate is a
  workflow guardrail, not a security control — identical in spirit to Edit
  Mode. Real enforcement would require a backend, which the charter forbids.
- **"Recompute everything live / no per-voyage density."** Each voyage keeps its
  own `densities` block; we are not centralizing density storage out of the
  voyage files.
- **Offline write-queue for settings.** Settings changes are rare and made by a
  chief at the ECR PC with the drive mounted. Writes require share
  connectivity. (Reads degrade gracefully — see §3.)
- **Per-voyage density fix for *closed* voyages.** `densitiesAtClose` is frozen
  by design. Out of v1; can extend later.

## Decisions (locked during brainstorming)

| Fork | Decision |
|------|----------|
| Where settings live | Shared `_settings.json` on the ship's network share (not per-PC IndexedDB). |
| Role restriction | Soft chief-only gate on settings saves + `loggedBy` stamp. Not real auth. |
| On-the-fly behavior | Central setting drives new voyages live; **plus** a per-voyage "apply current default densities" action to fix existing open voyages. |
| Existing IndexedDB settings | Shared file becomes the single source of truth. `shipSettings` IndexedDB store is **retired entirely** (no read cache). When the share is unreachable or the file is absent, the app falls back to safe **class defaults** (0.92). The existing 0.90 is **not** migrated. |

## Design

### 1. The settings file

`_settings.json` in each ship's share folder (e.g.
`Z:\voyage-tracker\eclipse\_settings.json`). The leading underscore marks it as
clearly not a voyage file.

```json
{
  "defaultDensities": { "HFO": 0.92, "MGO": 0.83, "LSFO": 0.92 },
  "reconcileTolerances": { "fuel": 2, "freshWater": 5, "naoh": 10 },
  "lastModified": "2026-06-17T12:28:00.425Z",
  "loggedBy": { "name": "M. Archontakis", "role": "chief", "at": "2026-06-17T12:28:00.425Z" }
}
```

`listVoyages` gets an explicit skip so `_settings.json` never appears as a junk
voyage in the tree. The skip is by exact name (`_settings.json`) and, defensively,
any name beginning with `_`.

### 2. Storage adapter additions

Two new methods on the adapter contract (`src/storage/adapter.js`):

- `loadSettings(shipId)` → `{ settings, mtime } | null` (null when the file is
  absent).
- `saveSettings(shipId, settings, prevMtime)` → stamps `loggedBy` (reusing
  `stampLoggedBy`), runs the **same mtime stale-file check** as voyages, writes.

Implemented in a new `src/storage/local/settings.ts` that reuses the existing
ship directory handle (`getHandleForShip`) and mirrors the read/write/mtime
patterns in `voyages.ts`. Filename safety reuses `ensureSafeFilename`.

**Resolution order on read:**

1. Shared `_settings.json` (authoritative).
2. Otherwise — file absent, **or** the share is unreachable
   (`NotFoundError` / `NotReadableError` on the directory handle) — fall back to
   safe **class defaults** (0.92) from `solstice-class.json`.

There is **no IndexedDB read cache**: an unreachable share yields safe class
defaults, never a stale per-PC value. A voyage created during a transient
outage gets 0.92 (the chief can correct it later via the per-voyage action in
§5). Writes always require the share.

### 3. Live behavior — new voyages

`createVoyage` ([VoyageStoreProvider.tsx](../../../src/contexts/VoyageStoreProvider.tsx))
reads `getStorageAdapter().loadSettings(shipId)` instead of
`getShipSettings(shipId)`. The override merge stays the same:
`{ ...classBase, ...sharedDefaults }`. A chief changes the shared file from any
PC; the next voyage created anywhere picks it up immediately — no redeploy.

Reconciliation tolerances (`ReconciliationPanel` / `VoyageDetail`) read from the
same shared settings via the adapter.

A lightweight in-memory settings cache lives in `VoyageStoreProvider` (loaded on
ship connect, refreshed whenever Settings saves) so the app isn't re-reading the
file on every render. This is a render-perf optimization only — not an offline
fallback. `createVoyage` reads fresh at creation time to guarantee liveness for
the field that matters most.

### 4. Soft chief-only gate

In `SettingsPanel`:

- Density + tolerance **Save** controls are disabled unless
  `session.role === 'chief'`.
- Non-chiefs see the values read-only (same swap-input-for-static-div pattern
  used elsewhere — CLAUDE.md §7 view↔edit parity).
- Honest inline copy near the controls:
  > "Only the Chief Engineer can change fleet defaults — this is a workflow
  > guard, not a lock. Anyone with drive access can edit the file directly."
- Every save writes `loggedBy`, so the shared file always records who changed
  what and when.

### 5. Per-voyage "apply current default densities"

On an **open** voyage's detail pane, shown only to `chief` in Edit Mode:

- Button label includes the live defaults, e.g.
  *"Apply default densities (HFO 0.92 · MGO 0.83 · LSFO 0.92)."*
- Click → small confirm modal showing before → after density values and a note
  that all fuel totals will recompute.
- On confirm: set `voyage.densities` to the current shared defaults, save
  (`loggedBy`-stamped, mtime-checked). Fuel masses recompute automatically on
  next render — they are computed live as `(Δlitres × density)/1000`
  ([calculations.ts](../../../src/domain/calculations.ts) `calcConsumption`),
  not stored.
- Closed voyages: button shown disabled with tooltip "voyage closed —
  density at close is frozen."

This is the operator path to fix the stuck-at-0.90 `EC_2026-06-14_AMS-AMS`
voyage.

### 6. Concurrency

Reuse the existing stale-file mechanism. `saveSettings` takes the `mtime`
remembered at load; if the on-disk mtime is newer, throw `StaleFileError` and
surface the existing Reload / Overwrite / Cancel resolution (same UX as voyage
saves). Settings edits are infrequent, so this lightweight check is sufficient.

## Rollout / migration

1. Deploy. No `_settings.json` exists yet → every PC reads **class defaults**
   (0.92), *not* its local IndexedDB 0.90. The drift is abandoned immediately.
2. A chief opens Settings, reviews defaults, edits if needed, saves → creates
   the shared `_settings.json`.
3. Existing voyages keep their baked-in densities. The chief uses the
   per-voyage "apply default densities" action to correct any wrong ones
   (e.g. the 0.90 EC voyage).
4. IndexedDB `shipSettings` is retired entirely — no longer read or written.
   `getShipSettings` / `putShipSettings` are removed from the app's paths.

## Testing

- **Adapter:** `loadSettings` / `saveSettings` round-trip; missing file returns
  null; `saveSettings` stamps `loggedBy`; stale mtime throws `StaleFileError`;
  read falls back to cache then class defaults.
- **Listing:** `listVoyages` skips `_settings.json` (and `_`-prefixed names).
- **Creation:** a new voyage created after a settings change picks up the new
  default density.
- **Gate:** `SettingsPanel` disables save controls for non-chief roles; chief
  can save.
- **Per-voyage apply:** applying defaults overwrites `voyage.densities`,
  recomputes totals, and stamps `loggedBy`; hidden/disabled for non-chief and
  for closed voyages.
- **Fallback:** `loadSettings` returns class defaults when the file is absent
  or the share is unreachable (no stale cache).

## Docs to update

- CLAUDE.md §3 — add `_settings.json` to the per-ship folder layout and storage
  model; note the adapter's `loadSettings` / `saveSettings`.
- CLAUDE.md §4 — document the soft chief-only settings gate.
- CLAUDE.md §5–6 — centralized default densities + the per-voyage "apply default
  densities" action.

## Files touched (anticipated)

- `src/storage/adapter.js` — interface: `loadSettings`, `saveSettings`.
- `src/storage/local/settings.ts` — new: file CRUD + mtime check.
- `src/storage/local/index.ts` — wire new methods; reuse `stampLoggedBy`.
- `src/storage/local/voyages.ts` — `listVoyages` skip `_settings.json`.
- `src/storage/indexeddb.ts` — retire the `shipSettings` store and its
  `getShipSettings` / `putShipSettings` helpers entirely.
- `src/contexts/VoyageStoreProvider.tsx` — settings cache; `createVoyage` reads
  shared settings; per-voyage apply action.
- `src/components/modals/SettingsPanel.tsx` — chief-only gate + shared-file save.
- `src/components/detail/VoyageDetail.tsx` — per-voyage "apply default
  densities" button + confirm.
- `src/components/detail/ReconciliationPanel.tsx` — read tolerances from shared
  settings.
- Tests alongside the above.
