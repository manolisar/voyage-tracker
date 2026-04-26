# Delete Leg + Date-Ordered Display

**Date:** 2026-04-26
**Status:** Approved (pending implementation)

## Problem

The app currently has no way to delete a leg. A user who creates a leg by mistake (wrong port, wrong date, accidental Add Leg click) is stuck with it — they can edit fields but cannot remove the row. The voyage-level delete works, but a per-leg delete is missing.

While auditing the code for this fix, a related issue surfaced: legs are rendered in `voyage.legs` array order (insertion order). In practice this is almost always chronological because legs are logged live, but it is not enforced. If a user adds a leg out of order, the displayed `L1, L2, L3` numbering no longer reflects the actual chronology. Both the tree and the Voyage Detail's Legs list are affected.

## Goals

1. Let the user delete a single leg from a voyage, with a confirmation step.
2. Make the displayed leg ordering deterministic and chronological, so the `Leg N` numbering shown in the UI always matches departure date.

## Non-Goals

- Counter back-propagation. Deleting leg N does **not** rewrite leg N+1's departure-start counters. The user can re-run the existing "Import Counters from previous voyage" flow if needed. (Same lazy stance as voyage-delete.)
- Renumbering or rewriting `leg.id` values on disk. `leg.id` stays the stable identity; the displayed `L1, L2, L3` is purely positional.
- Migrating existing files. The on-disk `voyage.legs` array stays in insertion order; the chronological sort is applied only at render time.

## Design

### 1. Sort legs by date at render time

Add a helper alongside the other voyage utilities:

```ts
// src/domain/factories.ts (or a new src/domain/legs.ts)
export function sortLegsByDate(legs: Leg[]): Leg[] {
  return [...legs].sort((a, b) => {
    const da = a.departure?.date || '';
    const db = b.departure?.date || '';
    if (!da && !db) return 0;
    if (!da) return 1;     // empty dates sink to bottom
    if (!db) return -1;
    return da.localeCompare(db); // ISO YYYY-MM-DD lexsort = ascending date
  });
}
```

Apply in two render sites:

- **`src/components/detail/VoyageDetail.tsx`** — replace `voyage.legs.map((leg, i)…)` with `sortLegsByDate(voyage.legs).map((leg, i)…)`. Same for `voyage.legs?.length` checks and the `LegRow index` prop.
- **`src/components/tree/TreeNode.tsx`** — replace `voyage.legs?.map((leg, idx)…)` in `VoyageChildren` with the sorted version.

The on-disk `voyage.legs` array is unchanged. `leg.id` remains the stable identity used for selection, expansion, and deletion.

### 2. Trash button on each `LegRow`

In `src/components/detail/VoyageDetail.tsx`, extend `LegRow` to accept an optional `onDelete` prop and render a trash icon button at the right end of the row when set.

```tsx
interface LegRowProps { leg: Leg; index: number; onDelete?: () => void; }
```

The button is rendered only when:
- `editMode === true`
- `!voyage.voyageEnd` (matches the gating already used for Add Leg / End Voyage)

Style: small icon button, `var(--color-error-fg)`, `title="Delete this leg"`.

`VoyageDetail` adds an `onDeleteLeg?: (legId: number) => void` prop and passes a click handler down to `LegRow`. The "Delete voyage" button at the section header stays where it is.

### 3. `DeleteLegModal` confirmation

New file `src/components/modals/DeleteLegModal.tsx`, near-clone of `DeleteVoyageModal`. Inputs: `filename`, `legId`, `onClose`.

The modal reads the voyage from the store, finds the leg by `legId`, and shows:
- **Title:** "Delete leg"
- **Subtitle:** `Leg N · MIA → FLL` where N is the date-sorted index (use the same `sortLegsByDate` helper so the label matches what the user just clicked)
- **Departure / arrival dates** if present
- **Warning copy:** "This will permanently remove the departure report, arrival report, and any voyage report for this leg. There is no undo."
- **Buttons:** Cancel, Delete leg (warning style)

On confirm, calls `deleteLeg(filename, legId)` from the store; closes on success.

### 4. `deleteLeg` action on `VoyageStoreProvider`

New callback in `src/contexts/VoyageStoreProvider.tsx`, exposed via `VoyageStoreContext`:

```ts
deleteLeg: (filename: string, legId: number) => void;
```

Behaviour:

1. **Lock-on-close guard:** if the voyage is ended (`voyage.voyageEnd != null`), throw `Error('Voyage is closed — reopen it before deleting a leg.')`. Mirrors `addLeg`.
2. **Mutate via `updateVoyage`** so the change goes through the standard autosave + `loggedBy` stamp path:
   ```ts
   updateVoyage(filename, v => ({ ...v, legs: v.legs.filter(l => l.id !== legId) }));
   ```
3. **Selection cleanup:** if `selected?.filename === filename && selected.legId === legId`, set selection to `{ filename, kind: 'voyage' }` so the now-orphaned leg view doesn't render against missing data.
4. **Expansion cleanup:** remove the `${filename}::${legId}` key from `expanded` so a re-added leg with the same id (theoretical) doesn't inherit stale expanded state.

No new file/storage operations — the leg removal is just a normal voyage mutation.

### 5. Wiring in `AppShell`

Mirror the existing `deleteVoyageFor` state:

```ts
const [deleteLegFor, setDeleteLegFor] = useState<{ filename: string; legId: number } | null>(null);
```

Pass `onDeleteLeg={(legId) => setDeleteLegFor({ filename, legId })}` down through `DetailPane` → `VoyageDetail`.

Render `DeleteLegModal` when `deleteLegFor` is set, mirroring the `DeleteVoyageModal` block.

### 6. Tests

Unit tests in `src/contexts/voyageStore.helpers.test.ts` (or a colocated `voyageStore.test.ts` if patterns differ):

- `deleteLeg` removes the matching leg from the array.
- `deleteLeg` is a no-op (or throws — match `addLeg`'s behaviour) when the voyage is ended.
- Selection is cleared when the deleted leg was selected.

Unit test for `sortLegsByDate`:

- Empty array → empty array.
- Already sorted → unchanged.
- Reverse sorted → reversed.
- Mix of dated and empty-date legs → empty dates sink to the bottom.

## Risks / open questions

- **Selection UX after delete.** Falling back to the voyage-detail view is the safest default, but the user might prefer landing on the previous leg's arrival report. Voyage-delete falls back to `null`, so for symmetry this can fall back to the voyage view. Flag for review during implementation if it feels jarring.
- **Stale expansion keys.** The cleanup in (4.4) is defensive — `leg.id` is monotonically generated so collisions are unlikely, but cleaning up is cheap and correct.

## Files touched

- `src/domain/factories.ts` (or new `src/domain/legs.ts`) — `sortLegsByDate` helper
- `src/contexts/VoyageStoreProvider.tsx` — `deleteLeg` callback + context wiring
- `src/contexts/VoyageStoreContext.ts` — type for `deleteLeg`
- `src/components/detail/VoyageDetail.tsx` — sort legs at render, add trash button to `LegRow`, plumb `onDeleteLeg`
- `src/components/tree/TreeNode.tsx` — sort legs at render
- `src/components/modals/DeleteLegModal.tsx` — new
- `src/components/layout/DetailPane.tsx` — pass `onDeleteLeg` through
- `src/components/layout/AppShell.tsx` — `deleteLegFor` state + modal mount
- Tests as listed above
