# Shared, chief-gated ship settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move per-ship settings (default fuel densities + reconciliation tolerances) off per-PC IndexedDB onto a shared `_settings.json` on the ship's network share, gated soft chief-only with a `loggedBy` stamp, with a per-voyage action to apply current default densities to an open voyage.

**Architecture:** A new `src/storage/local/settings.ts` does File-System-Access CRUD on `_settings.json` using the existing ship directory handle and the same mtime stale-file check as voyages. Two new adapter methods (`loadSettings`/`saveSettings`) expose it; `saveSettings` reuses `stampLoggedBy`. The provider caches settings in memory and resolves default densities; `createVoyage` reads the shared file live. `SettingsPanel` reads/writes the shared file and disables saves for non-chiefs. The `shipSettings` IndexedDB helpers are removed. When the file is absent or the share is unreachable, the app falls back to safe class defaults (0.92).

**Tech Stack:** React 19, TypeScript, Vite, Vitest, File System Access API. Spec: [docs/superpowers/specs/2026-06-17-shared-ship-settings-design.md](2026-06-17-shared-ship-settings-design.md).

**Conventions for every task:** run a single test file with `npx vitest run <path>`. Commit after each task with the message shown. `ReconcileTolerances` keys are exactly `fuel` / `water` / `naoh` (see [src/types/domain.ts:132](../../../src/types/domain.ts#L132)) — not `freshWater`.

---

### Task 1: Skip `_settings.json` in the voyage listing

The directory listing in `listVoyages` already skips `_index.json`. Add a small tested predicate and skip our settings file (and any `_`-prefixed file) so it never appears as a junk voyage in the tree.

**Files:**
- Modify: `src/storage/local/voyages.ts` (the `listVoyages` loop near line 148)
- Test: `src/storage/local/voyages.helpers.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/storage/local/voyages.helpers.test.ts`:

```ts
import { isVoyageFile } from './voyages';

describe('isVoyageFile', () => {
  it('accepts ordinary voyage json files', () => {
    expect(isVoyageFile('SL_2026-01-15_MIA-FLL.json')).toBe(true);
  });

  it('rejects non-json, the index, the settings file, and underscore-prefixed files', () => {
    expect(isVoyageFile('notes.txt')).toBe(false);
    expect(isVoyageFile('_index.json')).toBe(false);
    expect(isVoyageFile('_settings.json')).toBe(false);
    expect(isVoyageFile('_anything.json')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage/local/voyages.helpers.test.ts`
Expected: FAIL — `isVoyageFile is not a function` (import error).

- [ ] **Step 3: Add the predicate and use it in `listVoyages`**

In `src/storage/local/voyages.ts`, add near the other exported helpers (after `ensureSafeFilename` re-export, before `tryGetFileHandle`):

```ts
// Names the voyage listing should treat as voyage files. Anything starting
// with `_` is app-internal (`_index.json`, `_settings.json`) and skipped.
export function isVoyageFile(name: string): boolean {
  if (!name.endsWith('.json')) return false;
  if (name.startsWith('_')) return false;
  return true;
}
```

Then replace the three filter lines inside `listVoyages` (currently):

```ts
    if (handle.kind !== 'file') continue;
    if (!name.endsWith('.json')) continue;
    if (name === '_index.json') continue;
```

with:

```ts
    if (handle.kind !== 'file') continue;
    if (!isVoyageFile(name)) continue;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/storage/local/voyages.helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/local/voyages.ts src/storage/local/voyages.helpers.test.ts
git commit -m "feat: skip _settings.json (and _-prefixed files) in voyage listing"
```

---

### Task 2: Settings file CRUD module (`settings.ts`)

A new module that reads/writes `_settings.json` against the ship folder, mirroring `voyages.ts` (handle lookup, JSON read, mtime stale-check, atomic write).

**Files:**
- Create: `src/storage/local/settings.ts`
- Test: `src/storage/local/settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/storage/local/settings.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SETTINGS_FILENAME, loadSettingsFile, saveSettingsFile } from './settings';
import { StaleFileError } from './errors';

// ── Minimal in-memory File System Access fakes ───────────────────────────
function makeFile(text: string, lastModified: number) {
  return { text: async () => text, lastModified } as unknown as File;
}

function makeFileHandle(store: { text: string; mtime: number }) {
  return {
    kind: 'file' as const,
    name: SETTINGS_FILENAME,
    getFile: async () => makeFile(store.text, store.mtime),
    createWritable: async () => ({
      write: async (data: string) => {
        store.text = data;
        store.mtime += 1000;
      },
      close: async () => {},
    }),
  };
}

function makeDirHandle(files: Record<string, { text: string; mtime: number }>) {
  return {
    kind: 'directory' as const,
    getFileHandle: async (name: string, opts?: { create?: boolean }) => {
      if (!files[name]) {
        if (opts?.create) files[name] = { text: '', mtime: Date.now() };
        else {
          const err = new Error('not found');
          err.name = 'NotFoundError';
          throw err;
        }
      }
      return makeFileHandle(files[name]);
    },
  } as unknown as FileSystemDirectoryHandle;
}

// getHandleForShip is the only collaborator we mock.
vi.mock('./fsHandle', () => ({
  getHandleForShip: vi.fn(),
}));
import { getHandleForShip } from './fsHandle';
const mockedGetHandle = vi.mocked(getHandleForShip);

beforeEach(() => {
  mockedGetHandle.mockReset();
});

describe('loadSettingsFile', () => {
  it('returns null when the settings file is absent', async () => {
    mockedGetHandle.mockResolvedValue(makeDirHandle({}));
    expect(await loadSettingsFile('eclipse')).toBeNull();
  });

  it('returns parsed settings + mtime when the file exists', async () => {
    const files = {
      [SETTINGS_FILENAME]: {
        text: JSON.stringify({ defaultDensities: { HFO: 0.92 } }),
        mtime: 5000,
      },
    };
    mockedGetHandle.mockResolvedValue(makeDirHandle(files));
    const res = await loadSettingsFile('eclipse');
    expect(res?.settings.defaultDensities?.HFO).toBe(0.92);
    expect(res?.mtime).toBe(5000);
  });
});

describe('saveSettingsFile', () => {
  it('writes settings and returns the new mtime', async () => {
    const files: Record<string, { text: string; mtime: number }> = {};
    mockedGetHandle.mockResolvedValue(makeDirHandle(files));
    const { mtime } = await saveSettingsFile('eclipse', { defaultDensities: { HFO: 0.91 } }, null);
    expect(typeof mtime).toBe('number');
    expect(JSON.parse(files[SETTINGS_FILENAME].text).defaultDensities.HFO).toBe(0.91);
  });

  it('throws StaleFileError when on-disk mtime is newer than prevMtime', async () => {
    const files = {
      [SETTINGS_FILENAME]: { text: JSON.stringify({ defaultDensities: {} }), mtime: 9000 },
    };
    mockedGetHandle.mockResolvedValue(makeDirHandle(files));
    await expect(saveSettingsFile('eclipse', { defaultDensities: {} }, 1000)).rejects.toBeInstanceOf(
      StaleFileError,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage/local/settings.test.ts`
Expected: FAIL — cannot resolve `./settings`.

- [ ] **Step 3: Write the module**

Create `src/storage/local/settings.ts`:

```ts
// CRUD for the per-ship shared settings file (`_settings.json`) on the ship
// network folder. Mirrors voyages.ts: handle lookup, JSON read, mtime
// stale-file check, atomic write via createWritable. See the design spec
// 2026-06-17-shared-ship-settings-design.md and CLAUDE.md §3/§4.

import { getHandleForShip } from './fsHandle';
import { StaleFileError } from './errors';
import type { FuelKey, ReconcileTolerances } from '../../types/domain';

export const SETTINGS_FILENAME = '_settings.json';

export interface ShipSettingsData {
  defaultDensities?: Partial<Record<FuelKey, number>>;
  reconcileTolerances?: ReconcileTolerances;
  // Added by stampLoggedBy at save time — never set by the editor directly.
  loggedBy?: { name: string; role: string | null; at: string };
}

async function tryGetFileHandle(
  dir: FileSystemDirectoryHandle,
): Promise<FileSystemFileHandle | null> {
  try {
    return await dir.getFileHandle(SETTINGS_FILENAME);
  } catch (e) {
    if ((e as DOMException).name === 'NotFoundError') return null;
    throw e;
  }
}

/**
 * Read the shared settings file. Returns `{ settings, mtime }`, or `null` when
 * the file does not exist yet. Throws on a genuinely unreachable directory —
 * the adapter wrapper turns that into a class-default fallback.
 */
export async function loadSettingsFile(
  shipId: string,
): Promise<{ settings: ShipSettingsData; mtime: number } | null> {
  const dir = await getHandleForShip(shipId);
  const fh = await tryGetFileHandle(dir);
  if (!fh) return null;
  const file = await fh.getFile();
  const text = await file.text();
  let settings: ShipSettingsData;
  try {
    settings = text.trim() ? (JSON.parse(text) as ShipSettingsData) : {};
  } catch (e) {
    throw new Error(`Invalid JSON in ${SETTINGS_FILENAME}: ${(e as Error).message}`);
  }
  return { settings, mtime: file.lastModified };
}

/**
 * Write the shared settings file. If `prevMtime` is non-null and the on-disk
 * file is newer, throw StaleFileError so the UI can offer Reload / Overwrite.
 * Returns the new mtime.
 */
export async function saveSettingsFile(
  shipId: string,
  settings: ShipSettingsData,
  prevMtime: number | null = null,
): Promise<{ mtime: number }> {
  const dir = await getHandleForShip(shipId);

  const existing = await tryGetFileHandle(dir);
  if (existing && prevMtime != null) {
    const f = await existing.getFile();
    if (f.lastModified > prevMtime) {
      let current: unknown = null;
      try {
        current = JSON.parse(await f.text());
      } catch {
        /* ignore parse */
      }
      throw new StaleFileError(`Settings changed on disk since load`, {
        loadedMtime: prevMtime,
        currentMtime: f.lastModified,
        currentVoyage: current,
      });
    }
  }

  const fh = existing || (await dir.getFileHandle(SETTINGS_FILENAME, { create: true }));
  const writable = await fh.createWritable();
  try {
    await writable.write(JSON.stringify(settings, null, 2) + '\n');
  } finally {
    await writable.close();
  }
  const f = await fh.getFile();
  return { mtime: f.lastModified };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/storage/local/settings.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/storage/local/settings.ts src/storage/local/settings.test.ts
git commit -m "feat: add _settings.json CRUD module with mtime stale-check"
```

---

### Task 3: Adapter contract — `loadSettings` / `saveSettings`

Add the two methods to the storage adapter interface and implement them in `createLocalAdapter`. `saveSettings` reuses `stampLoggedBy`; `loadSettings` swallows unreachable-share errors and returns `null` so callers fall back to class defaults.

**Files:**
- Modify: `src/storage/adapter.ts` (the `StorageAdapter` interface, ~line 10)
- Modify: `src/storage/local/index.ts`
- Test: `src/storage/local/index.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/storage/local/index.test.ts` inside the existing `describe('createLocalAdapter', …)`:

```ts
  it('exposes loadSettings and saveSettings', () => {
    const a = createLocalAdapter();
    expect(typeof a.loadSettings).toBe('function');
    expect(typeof a.saveSettings).toBe('function');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/storage/local/index.test.ts`
Expected: FAIL — `a.loadSettings` is not a function (and a TS error on the interface).

- [ ] **Step 3a: Extend the adapter interface**

In `src/storage/adapter.ts`, add an import and two methods. At the top imports:

```ts
import type { Voyage, VoyageManifestEntry } from '../types/domain';
import type { ShipSettingsData } from './local/settings';
```

Inside `export interface StorageAdapter { … }`, after `deleteVoyage(...)`:

```ts
  loadSettings(shipId: string): Promise<{ settings: ShipSettingsData; mtime: number } | null>;
  saveSettings(
    shipId: string,
    settings: ShipSettingsData,
    prevMtime?: number | null,
  ): Promise<{ mtime: number }>;
```

- [ ] **Step 3b: Implement in `createLocalAdapter`**

In `src/storage/local/index.ts`, extend the imports:

```ts
import {
  listVoyages,
  loadVoyage,
  saveVoyage,
  deleteVoyage,
} from './voyages';
import { loadSettingsFile, saveSettingsFile, type ShipSettingsData } from './settings';
import { StorageError } from '../adapter';
```

Then inside the returned adapter object, after `deleteVoyage: …,`:

```ts
    // Shared settings file (_settings.json). Unreachable share → null so the
    // caller falls back to safe class defaults (never a stale per-PC value).
    loadSettings: async (shipId) => {
      try {
        return await loadSettingsFile(shipId);
      } catch (e) {
        if (e instanceof StorageError || e instanceof DOMException) return null;
        throw e;
      }
    },

    // Settings get the same loggedBy stamp as voyages.
    saveSettings: (shipId, settings, prevMtime) => {
      const stamped = stampLoggedBy(settings, getSession()) as ShipSettingsData;
      return saveSettingsFile(shipId, stamped, prevMtime);
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/storage/local/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage/adapter.ts src/storage/local/index.ts src/storage/local/index.test.ts
git commit -m "feat: add loadSettings/saveSettings to storage adapter (stamped, fail-safe)"
```

---

### Task 4: Resolved default-density helper

A pure helper that merges the ship-class baseline with the shared overrides, used by the provider and the per-voyage apply action.

**Files:**
- Modify: `src/domain/shipClass.ts`
- Test: `src/domain/shipClass.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create or append to `src/domain/shipClass.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveDefaultDensities } from './shipClass';
import type { ShipClass } from '../types/domain';

const shipClass = {
  densities: { HFO: 0.92, MGO: 0.83, LSFO: 0.92 },
} as unknown as ShipClass;

describe('resolveDefaultDensities', () => {
  it('returns class baseline when there are no overrides', () => {
    expect(resolveDefaultDensities(shipClass, undefined)).toEqual({ HFO: 0.92, MGO: 0.83, LSFO: 0.92 });
  });

  it('applies overrides on top of the baseline', () => {
    expect(resolveDefaultDensities(shipClass, { HFO: 0.9 })).toEqual({ HFO: 0.9, MGO: 0.83, LSFO: 0.92 });
  });

  it('ignores a null shipClass by returning the overrides alone', () => {
    expect(resolveDefaultDensities(null, { HFO: 0.9 })).toEqual({ HFO: 0.9 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/shipClass.test.ts`
Expected: FAIL — `resolveDefaultDensities` is not exported.

- [ ] **Step 3: Implement the helper**

In `src/domain/shipClass.ts`, add (next to the existing `defaultDensities`):

```ts
import type { FuelKey } from '../types/domain';

/**
 * Merge the ship-class baseline densities with per-ship shared overrides.
 * Overrides win; missing override keys keep the baseline value.
 */
export function resolveDefaultDensities(
  shipClass: ShipClass | null,
  overrides: Partial<Record<FuelKey, number>> | undefined,
): Record<string, number> {
  const base = shipClass ? defaultDensities(shipClass) : {};
  return { ...base, ...(overrides || {}) };
}
```

(If `ShipClass` / `defaultDensities` are already imported/defined in this file, do not duplicate the imports — only add the function and the `FuelKey` import if missing.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/shipClass.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/shipClass.ts src/domain/shipClass.test.ts
git commit -m "feat: add resolveDefaultDensities (class baseline + shared overrides)"
```

---

### Task 5: Provider settings cache + live read in `createVoyage`

Cache the shared settings in `VoyageStoreProvider`, expose them and a `reloadSettings` action through context, and make `createVoyage` read the shared file live instead of IndexedDB.

**Files:**
- Modify: `src/contexts/VoyageStoreContext.ts` (add fields to `VoyageStoreContextValue`)
- Modify: `src/contexts/VoyageStoreProvider.tsx`
- Test: manual (wiring task; covered by typecheck + the SettingsPanel/VoyageDetail tasks). No new unit test — the testable logic lives in Tasks 2–4.

- [ ] **Step 1: Add context type fields**

In `src/contexts/VoyageStoreContext.ts`, add to the `VoyageStoreContextValue` interface:

```ts
  shipSettings: import('../storage/local/settings').ShipSettingsData | null;
  reloadSettings: () => Promise<void>;
```

- [ ] **Step 2: Add the cache + loader in the provider**

In `src/contexts/VoyageStoreProvider.tsx`:

a) Add imports near the existing storage imports:

```ts
import type { ShipSettingsData } from '../storage/local/settings';
```

b) Remove `getShipSettings` from the `'../storage/indexeddb'` import block (it is no longer used here — Task 8 deletes it).

c) Add state + loader (place near the other `useState`/`useCallback` declarations, e.g. just above `createVoyage`):

```ts
  const [shipSettings, setShipSettings] = useState<ShipSettingsData | null>(null);

  const reloadSettings = useCallback(async () => {
    if (!shipId) {
      setShipSettings(null);
      return;
    }
    try {
      const res = await getStorageAdapter().loadSettings(shipId);
      setShipSettings(res?.settings ?? null);
    } catch {
      setShipSettings(null); // unreachable share → class-default fallback downstream
    }
  }, [shipId]);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);
```

- [ ] **Step 3: Make `createVoyage` read the shared file live**

In `createVoyage`, replace these lines:

```ts
      const settings = await getShipSettings(shipId);
      const overrideDensities: Partial<typeof base.densities> = settings?.defaultDensities ?? {};
      const densities = { ...base.densities, ...overrideDensities };
```

with:

```ts
      const loaded = await getStorageAdapter().loadSettings(shipId);
      const overrideDensities: Partial<typeof base.densities> = loaded?.settings.defaultDensities ?? {};
      const densities = { ...base.densities, ...overrideDensities };
```

- [ ] **Step 4: Expose the new context fields**

In the provider's context value object (the `useMemo` returning `{ … }` near line 850) add `shipSettings,` and `reloadSettings,` to both the returned object and its dependency array.

- [ ] **Step 5: Verify typecheck + existing tests pass**

Run: `npx tsc --noEmit && npx vitest run src/contexts`
Expected: no type errors; existing provider tests (if any) pass.

- [ ] **Step 6: Commit**

```bash
git add src/contexts/VoyageStoreContext.ts src/contexts/VoyageStoreProvider.tsx
git commit -m "feat: cache shared ship settings in provider; createVoyage reads shared file live"
```

---

### Task 6: SettingsPanel — read/write shared file + chief-only gate

Point the panel at the shared file via the adapter, disable density + tolerance editing for non-chiefs with an honest note, handle the stale-file conflict, and refresh the provider cache after save.

**Files:**
- Modify: `src/components/modals/SettingsPanel.tsx`
- Test: `src/components/modals/SettingsPanel.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/components/modals/SettingsPanel.test.tsx`. This test renders the panel with a mocked session role and a fake adapter, and asserts the density Save button is disabled for a non-chief.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';
import type { ShipClass } from '../../types/domain';

let mockRole = 'second';
vi.mock('../../hooks/useSession', () => ({
  useSession: () => ({ shipId: 'eclipse', userName: 'A. Smith', role: mockRole }),
}));
vi.mock('../../hooks/useVoyageStore', () => ({
  useVoyageStore: () => ({ refreshList: vi.fn(), reloadSettings: vi.fn() }),
}));
vi.mock('../../hooks/useToast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('../../storage/local/fsHandle', () => ({
  pickDirectoryForShip: vi.fn(),
  getHandleForShip: vi.fn(async () => ({ name: 'eclipse' })),
}));
vi.mock('../../storage/adapter', () => ({
  getStorageAdapter: () => ({
    loadSettings: vi.fn(async () => null),
    saveSettings: vi.fn(async () => ({ mtime: 1 })),
  }),
}));

const shipClass = { densities: { HFO: 0.92, MGO: 0.83, LSFO: 0.92 } } as unknown as ShipClass;

beforeEach(() => {
  mockRole = 'second';
});

describe('SettingsPanel chief gate', () => {
  it('disables the density Save button for a non-chief and shows the guard note', async () => {
    render(<SettingsPanel shipClass={shipClass} onClose={() => {}} />);
    expect(await screen.findByText(/Only the Chief Engineer can change/i)).toBeInTheDocument();
    const saveButtons = screen.getAllByRole('button', { name: /^Save$/ });
    for (const btn of saveButtons) expect(btn).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/modals/SettingsPanel.test.tsx`
Expected: FAIL — guard note text not found; Save buttons not disabled for non-chief.

- [ ] **Step 3: Rewire the panel**

In `src/components/modals/SettingsPanel.tsx`:

a) Replace the IndexedDB import:

```ts
import { getShipSettings, putShipSettings } from '../../storage/indexeddb';
```

with:

```ts
import { getStorageAdapter } from '../../storage/adapter';
```

b) Add `getStorageAdapter` usage and the chief flag. Just after `const { refreshList } = useVoyageStore();` change to:

```ts
  const { refreshList, reloadSettings } = useVoyageStore();
```

and after the `useSession` destructure add:

```ts
  const isChief = role === 'chief';
```

c) Track the loaded settings mtime for the stale-check. Add near the other state:

```ts
  const [settingsMtime, setSettingsMtime] = useState<number | null>(null);
```

d) In the density-loading `useEffect`, replace:

```ts
      const settings = await getShipSettings(shipId);
      if (!alive) return;
      const overrides = settings?.defaultDensities || {};
```

with:

```ts
      const loaded = await getStorageAdapter().loadSettings(shipId);
      if (!alive) return;
      setSettingsMtime(loaded?.mtime ?? null);
      const overrides = loaded?.settings.defaultDensities || {};
```

e) In the tolerance-loading `useEffect`, replace:

```ts
      const settings = await getShipSettings(shipId);
      if (!alive) return;
      const r = resolveReconcileTolerances(settings?.reconcileTolerances);
```

with:

```ts
      const loaded = await getStorageAdapter().loadSettings(shipId);
      if (!alive) return;
      const r = resolveReconcileTolerances(loaded?.settings.reconcileTolerances);
```

f) Replace the body of `handleDensitySave` (the `try { … }`) so it writes both fields to the shared file and refreshes:

```ts
    setBusy('densities');
    try {
      const existing = await getStorageAdapter().loadSettings(shipId);
      const next = { ...(existing?.settings ?? {}), defaultDensities: parsed };
      const { mtime } = await getStorageAdapter().saveSettings(shipId, next, existing?.mtime ?? settingsMtime);
      setSettingsMtime(mtime);
      setDensityDirty(false);
      await reloadSettings();
      toast.addToast('Default densities saved — applied to new voyages', 'success');
    } catch (e) {
      toast.addToast((e as Error).message || 'Could not save densities', 'error');
    } finally {
      setBusy(null);
    }
```

g) Replace the body of `handleTolSave` similarly:

```ts
    setBusy('tolerances');
    try {
      const existing = await getStorageAdapter().loadSettings(shipId);
      const next = { ...(existing?.settings ?? {}), reconcileTolerances: parsed as unknown as ReconcileTolerances };
      const { mtime } = await getStorageAdapter().saveSettings(shipId, next, existing?.mtime ?? settingsMtime);
      setSettingsMtime(mtime);
      setTolDirty(false);
      await reloadSettings();
      toast.addToast('Reconciliation tolerances saved', 'success');
    } catch (e) {
      toast.addToast((e as Error).message || 'Could not save tolerances', 'error');
    } finally {
      setBusy(null);
    }
```

h) Gate the controls. In the density section, change every editable control to also respect `!isChief`:
- density `<input>`: `disabled={disabled || !isChief}`
- density Save button: `disabled={disabled || !densityDirty || !isChief}`
- density Reset button: `disabled={disabled || !isChief}`
- tolerance `<input>`: `disabled={disabled || !isChief}`
- tolerance Save button: `disabled={disabled || !tolDirty || !isChief}`
- tolerance Reset button: `disabled={disabled || !isChief}`

i) Add the guard note. Immediately under the density subtitle `<div>` (the one reading "kg/L @ Counters — applied to new voyages…"), and only when not chief, render:

```tsx
                {!isChief && (
                  <div className="text-xs mt-1" style={{ color: 'var(--color-warn-fg)' }}>
                    Only the Chief Engineer can change fleet defaults — this is a
                    workflow guard, not a lock. Anyone with drive access can edit
                    the file directly.
                  </div>
                )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/modals/SettingsPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `ReconcileTolerances` import became unused, leave it — it is still referenced by the cast in `handleTolSave`.)

- [ ] **Step 6: Commit**

```bash
git add src/components/modals/SettingsPanel.tsx src/components/modals/SettingsPanel.test.tsx
git commit -m "feat: SettingsPanel reads/writes shared _settings.json, chief-only gate"
```

---

### Task 7: ReconciliationPanel reads tolerances from the shared file

Switch the panel from `getShipSettings` to the shared settings already cached in the provider.

**Files:**
- Modify: `src/components/detail/ReconciliationPanel.tsx`
- Test: existing reconciliation tests still pass (`src/domain/reconciliation.test.ts` is unaffected — it tests `calcReconciliation`, not the panel).

- [ ] **Step 1: Rewire the tolerance read**

In `src/components/detail/ReconciliationPanel.tsx`:

a) Remove the import `import { getShipSettings } from '../../storage/indexeddb';`.

b) Pull `shipSettings` from the store. Change:

```ts
  const { voyages, loadVoyage } = useVoyageStore();
```

to:

```ts
  const { voyages, loadVoyage, shipSettings } = useVoyageStore();
```

c) Replace the `settings` lookup inside the effect:

```ts
      let settings;
      try {
        settings = shipId ? await getShipSettings(shipId) : {};
      } catch {
        settings = {};
      }
      const tolv = resolveReconcileTolerances(settings?.reconcileTolerances);
```

with:

```ts
      const tolv = resolveReconcileTolerances(shipSettings?.reconcileTolerances);
```

d) If `shipId` is now unused in this component, remove its `useSession` destructure; if still used elsewhere, leave it. Add `shipSettings` to the effect's dependency array (replacing `shipId` if it was only there for the settings read).

- [ ] **Step 2: Typecheck + run reconciliation tests**

Run: `npx tsc --noEmit && npx vitest run src/domain/reconciliation.test.ts`
Expected: no type errors; tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/detail/ReconciliationPanel.tsx
git commit -m "feat: ReconciliationPanel reads tolerances from shared settings cache"
```

---

### Task 8: Per-voyage "apply current default densities" action

On an open voyage, let a chief overwrite the voyage's densities with the current shared defaults. Fuel totals recompute automatically (mass is computed live from counters × density).

**Files:**
- Modify: `src/components/detail/VoyageDetail.tsx`
- Test: `src/components/detail/VoyageDetail.applyDensities.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/components/detail/VoyageDetail.applyDensities.test.tsx`. It mounts only the apply handler logic via a tiny harness is overkill; instead test the visible affordance + the mutation call through a render with mocks.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoyageDetail } from './VoyageDetail';
import type { ShipClass, Voyage } from '../../types/domain';

const updateVoyage = vi.fn();
let mockRole = 'chief';

vi.mock('../../hooks/useSession', () => ({ useSession: () => ({ role: mockRole, shipId: 'eclipse' }) }));
vi.mock('../../hooks/useVoyageStore', () => ({
  useVoyageStore: () => ({
    updateVoyage,
    shipSettings: { defaultDensities: { HFO: 0.92 } },
    voyages: [],
    loadVoyage: vi.fn(),
  }),
}));

const shipClass = { densities: { HFO: 0.92, MGO: 0.83, LSFO: 0.92 } } as unknown as ShipClass;
const voyage = {
  filename: 'EC_2026-06-14_AMS-AMS.json',
  startDate: '2026-06-14',
  densities: { HFO: 0.9, MGO: 0.83, LSFO: 0.92 },
  legs: [],
  voyageEnd: null,
} as unknown as Voyage;

beforeEach(() => {
  updateVoyage.mockReset();
  mockRole = 'chief';
});

describe('VoyageDetail apply default densities', () => {
  it('chief in edit mode on an open voyage sees the action and applies defaults', () => {
    render(<VoyageDetail voyage={voyage} shipClass={shipClass} editMode={true} />);
    const btn = screen.getByRole('button', { name: /apply default densities/i });
    fireEvent.click(btn);
    // confirm dialog → click confirm
    fireEvent.click(screen.getByRole('button', { name: /^Apply$/ }));
    expect(updateVoyage).toHaveBeenCalledTimes(1);
    const [, mutator] = updateVoyage.mock.calls[0];
    const result = mutator(voyage);
    expect(result.densities.HFO).toBe(0.92);
  });

  it('hides the action for a non-chief', () => {
    mockRole = 'second';
    render(<VoyageDetail voyage={voyage} shipClass={shipClass} editMode={true} />);
    expect(screen.queryByRole('button', { name: /apply default densities/i })).toBeNull();
  });
});
```

Note: `VoyageDetail` may require additional props in its real signature. If TypeScript complains about missing required props in the test render, pass the minimal extra props the component needs (e.g. `onAddLeg`, `onEndVoyage`, `onSelectLeg`) as `vi.fn()` / no-ops — do not change the component signature to satisfy the test.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/detail/VoyageDetail.applyDensities.test.tsx`
Expected: FAIL — button not found.

- [ ] **Step 3: Implement the action**

In `src/components/detail/VoyageDetail.tsx`:

a) Add imports / hooks at the top of the `VoyageDetail` component body (it already imports React state utilities; add what's missing):

```ts
import { useSession } from '../../hooks/useSession';
import { resolveDefaultDensities } from '../../domain/shipClass';
```

Inside the component (it already destructures `editMode`, has `ended`, `filename`, `voyage`, `shipClass`):

```ts
  const { role } = useSession();
  const { updateVoyage, shipSettings } = useVoyageStore();
  const isChief = role === 'chief';
  const [showApplyDensities, setShowApplyDensities] = useState(false);

  const resolvedDefaults = resolveDefaultDensities(shipClass, shipSettings?.defaultDensities);

  function handleApplyDensities() {
    updateVoyage(filename, (v) => ({ ...v, densities: { ...resolvedDefaults } }));
    setShowApplyDensities(false);
  }
```

(If `useVoyageStore` is already destructured in this component, add `updateVoyage` and `shipSettings` to that existing destructure instead of adding a second call.)

b) Add the button to the Densities section header. Replace the Densities section header block:

```tsx
        <div className="flex items-center mb-3">
          <div className="section-label">
            Fuel Densities <span className="font-mono ml-2" style={{ color: 'var(--color-dim)' }}>kg/L @ Counters</span>
          </div>
        </div>
```

with:

```tsx
        <div className="flex items-center mb-3">
          <div className="section-label">
            Fuel Densities <span className="font-mono ml-2" style={{ color: 'var(--color-dim)' }}>kg/L @ Counters</span>
          </div>
          <div className="flex-1" />
          {editMode && isChief && !ended && (
            <button
              type="button"
              className="btn-flat px-3 py-1.5 rounded-lg text-xs"
              onClick={() => setShowApplyDensities(true)}
              title="Overwrite this voyage's densities with the current ship defaults — fuel totals recompute"
            >
              Apply default densities (HFO {Number(resolvedDefaults.HFO).toFixed(2)} · MGO{' '}
              {Number(resolvedDefaults.MGO).toFixed(2)} · LSFO {Number(resolvedDefaults.LSFO).toFixed(2)})
            </button>
          )}
          {editMode && isChief && ended && (
            <span className="text-xs" style={{ color: 'var(--color-faint)' }} title="Density at close is frozen">
              voyage closed
            </span>
          )}
        </div>
```

c) Add the confirm dialog at the end of the Densities `<section>` (just before its closing `</section>`):

```tsx
        {showApplyDensities && (
          <div className="modal-overlay" role="presentation" onClick={() => setShowApplyDensities(false)}>
            <div
              className="modal-content w-full max-w-md"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-head"><h2>Apply default densities?</h2></div>
              <div className="p-6 space-y-3 text-sm">
                <p>
                  Replace this voyage's densities with the current ship defaults.
                  All fuel totals will recompute.
                </p>
                <div className="font-mono text-xs" style={{ color: 'var(--color-dim)' }}>
                  {(['HFO', 'MGO', 'LSFO'] as const).map((k) => (
                    <div key={k}>
                      {k}: {voyage.densities?.[k] ?? '—'} → {Number(resolvedDefaults[k]).toFixed(3)}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" className="btn-flat px-3 py-1.5 rounded-lg text-xs" onClick={() => setShowApplyDensities(false)}>
                    Cancel
                  </button>
                  <button type="button" className="btn-primary px-3 py-1.5 rounded-lg text-xs" onClick={handleApplyDensities}>
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/detail/VoyageDetail.applyDensities.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/detail/VoyageDetail.tsx src/components/detail/VoyageDetail.applyDensities.test.tsx
git commit -m "feat: per-voyage apply-default-densities action (chief, open voyages)"
```

---

### Task 9: Retire the IndexedDB `shipSettings` helpers

Remove `getShipSettings` / `putShipSettings` and their callers (all migrated in Tasks 5–7). Leave the `shipSettings` object store defined in the IDB schema so no destructive DB migration is needed — it simply goes dormant (unread, unwritten).

**Files:**
- Modify: `src/storage/indexeddb.ts`
- Test: `npx vitest run` (full suite) + `npx tsc --noEmit`

- [ ] **Step 1: Confirm there are no remaining callers**

Run: `grep -rn "getShipSettings\|putShipSettings" src/`
Expected: only `src/storage/indexeddb.ts` (definitions). If anything else appears, that file was missed in Tasks 5–7 — fix it before continuing.

- [ ] **Step 2: Remove the helpers**

In `src/storage/indexeddb.ts`, delete the two exported functions `getShipSettings` and `putShipSettings` (the block under the `// ── Ship settings …` comment). Keep `STORE_SHIP_SETTINGS`, the `ShipSettings` interface, and the object-store creation in `onupgradeneeded` untouched (dormant store; removing it would force a DB version bump). Add a one-line comment where the helpers were:

```ts
// Ship settings now live in the shared _settings.json on the ship folder
// (see src/storage/local/settings.ts). The shipSettings IDB store is retained
// dormant to avoid a destructive schema migration; it is no longer read/written.
```

- [ ] **Step 3: Full suite + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/storage/indexeddb.ts
git commit -m "refactor: retire shipSettings IDB helpers (settings now on the share)"
```

---

### Task 10: Documentation

Update CLAUDE.md to reflect the new storage location, the soft chief gate, and the per-voyage action.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update §3 (Storage model)**

In the per-ship folder layout, add the settings file:

```
├── _settings.json                 # shared per-ship settings (densities, reconcile tolerances) — chief-gated, loggedBy-stamped
```

Add a short paragraph after the Adapter contract paragraph:

> **Shared settings:** per-ship default densities and reconciliation tolerances
> live in `_settings.json` on the ship folder (not per-PC IndexedDB), via the
> adapter's `loadSettings` / `saveSettings`. Saves are `loggedBy`-stamped and
> gated soft chief-only. When the file is absent or the share is unreachable,
> the app falls back to safe class defaults. See
> [src/storage/local/settings.ts](src/storage/local/settings.ts).

- [ ] **Step 2: Update §4 (Access model)**

Add a bullet under Edit Mode:

> **Settings are chief-gated (soft).** The Settings panel disables density and
> tolerance edits unless the session role is `chief`. Like Edit Mode this is a
> workflow guard, not a security boundary — the SMB ACL and the `loggedBy`
> stamp on `_settings.json` are the real controls.

- [ ] **Step 3: Update §5/§6 (densities)**

In §5, change the densities note from "editable per-voyage" to:

> **Default densities** are shared per-ship in `_settings.json` and applied to
> new voyages at creation. A chief can also apply the current defaults to an
> existing open voyage from the Voyage Detail pane ("Apply default densities") —
> fuel totals recompute live. Closed voyages keep their `densitiesAtClose`.

- [ ] **Step 4: Bump the "Last updated" line and commit**

```bash
git add CLAUDE.md
git commit -m "docs: document shared chief-gated ship settings (CLAUDE.md §3-6)"
```

---

## Self-Review

**Spec coverage:**
- Shared `_settings.json` on the share → Tasks 2, 3. ✅
- `listVoyages` skips it → Task 1. ✅
- Adapter `loadSettings`/`saveSettings`, loggedBy stamp → Task 3. ✅
- Resolution shared → class defaults; unreachable → class defaults, no cache → Task 3 (adapter returns null on error), Task 5 (`createVoyage`), Task 4 (`resolveDefaultDensities`). ✅
- Live new-voyage behavior → Task 5. ✅
- Soft chief-only gate + honest copy → Task 6. ✅
- Reconciliation reads shared tolerances → Task 7. ✅
- Per-voyage apply, open-only, recompute, stamped → Task 8 (uses `updateVoyage`, which autosaves with the loggedBy stamp and refuses closed voyages). ✅
- Concurrency / stale-file → Tasks 2 (`saveSettingsFile` throws StaleFileError) + 6 (surfaced as toast). ✅
- IndexedDB retired → Task 9. ✅
- Docs → Task 10. ✅

**Placeholder scan:** none — every step has concrete code or exact commands.

**Type consistency:** `ShipSettingsData` defined in Task 2, imported in Tasks 3/5. `resolveDefaultDensities(shipClass, overrides)` defined in Task 4, used in Task 8. `loadSettings` returns `{ settings, mtime } | null` consistently in Tasks 3/5/6. `ReconcileTolerances` keys `fuel`/`water`/`naoh` used throughout. `updateVoyage(filename, mutator)` signature matches the provider.

**One nuance flagged for the implementer:** Task 9 keeps the dormant IDB store rather than removing it (avoids a destructive DB version bump) — this satisfies the spec's "no longer read or written" intent without migration risk.
