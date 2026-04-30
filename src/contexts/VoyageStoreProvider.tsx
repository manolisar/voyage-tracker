// VoyageStoreProvider — owns:
//   - voyage list (the manifest entries from listVoyages)
//   - lazy cache of fully-loaded voyages keyed by filename
//   - mtime cache (stale-file-check tokens) keyed by filename
//   - dirty edit drafts keyed by filename
//   - tree expansion set (filenames that are expanded in the sidebar)
//   - currently-selected node (filename + which inner node)
//   - pending conflict (stale-file case) — surfaces StaleFileModal
//
// Re-loads the list whenever shipId changes.
//
// Storage adapter lifecycle: installed once at module load against the local
// (File System Access API) backend. The adapter reads the live session via a
// module-level getter which this provider keeps pointed at the latest
// getSessionSnapshot.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from '../hooks/useSession';
import { useToast } from '../hooks/useToast';
import {
  ConflictError,
  getStorageAdapter,
  setStorageAdapter,
} from '../storage/adapter';
import { StaleFileError } from '../storage/local/errors';
import { createLocalAdapter } from '../storage/local';
import { createLogger } from '../util/log';

const log = createLogger('VoyageStore');
import {
  safePutDraft,
  safeDeleteDraft,
  getShipSettings,
} from '../storage/indexeddb';
import { AUTO_SAVE_DELAY_MS } from '../domain/constants';
import { calcVoyageTotals, calcVoyageFreshWaterTotal } from '../domain/calculations';
import {
  defaultVoyage,
  defaultLeg,
  defaultVoyageEnd,
  inheritedCounter,
} from '../domain/factories';
import type {
  Selection,
  Voyage,
  VoyageManifestEntry,
} from '../types/domain';
import {
  VoyageStoreContext,
  type AddLegInput,
  type CreateVoyageInput,
  type EndVoyageInput,
  type VoyageConflict,
  type VoyageMutator,
  type VoyageStoreContextValue,
} from './VoyageStoreContext';
import {
  buildFilename,
  filterVoyages,
  findNextPhaseFor as findNextPhaseForVoyage,
  manifestEntryFrom,
  type FilterMode,
  type PhaseSource,
  type PhaseTarget,
} from './voyageStore.helpers';
import type { SessionSnapshot } from './SessionContext';

// Module-level session getter ref. Held inside an object so the adapter
// captures the box at install time and reads the current value at call
// time — eliminates the StrictMode / ship-switch race window where a stale
// `getSessionSnapshot` closure could stamp the wrong loggedBy.role on a
// save that happens between unmount and re-mount.
const sessionGetterRef: { current: () => SessionSnapshot | null } = {
  current: () => null,
};
setStorageAdapter(createLocalAdapter({ getSession: () => sessionGetterRef.current() }));

const CODE_RE = /^[A-Z]{3}$/;

export function VoyageStoreProvider({ children }: { children: ReactNode }) {
  const { shipId, getSessionSnapshot } = useSession();
  const { addToast } = useToast();
  // One toast per outage — don't spam the user for every burst-save retry.
  const offlineNotifiedRef = useRef(false);
  // Sync the module-level session getter ref synchronously before paint.
  // useLayoutEffect (not useEffect) shrinks the ship-switch race window:
  // by the time the new VoyageStoreProvider has rendered, any subsequent
  // adapter.saveVoyage call sees the new ship's session getter.
  useLayoutEffect(() => {
    sessionGetterRef.current = getSessionSnapshot;
  }, [getSessionSnapshot]);

  const [voyages, setVoyages] = useState<VoyageManifestEntry[]>([]);
  const [loadedById, setLoadedById] = useState<Record<string, Voyage>>({});
  const [mtimeById, setMtimeById] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, Voyage>>({});
  const [dirty, setDirty] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState<Set<string>>(() => new Set());
  const [loadingFiles, setLoadingFiles] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Selection | null>(null);
  const [filter, setFilter] = useState<FilterMode>('active');
  const [search, setSearch] = useState('');
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  // Pending conflict surfaces <StaleFileModal>. `currentVoyage` is populated
  // when the StaleFileError already read the on-disk copy, so "Reload" can
  // apply it without a second round-trip.
  const [conflict, setConflict] = useState<VoyageConflict | null>(null);
  const [lastEditedPhase, setLastEditedPhase] = useState<PhaseSource | null>(null);

  // One pending-save timer per filename.
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Per-filename "save currently in flight" flag. Serializes saves so that a
  // debounce timer firing while the previous save hasn't returned doesn't
  // re-enter with a stale mtime.
  const inFlight = useRef<Set<string>>(new Set());
  // Trampoline ref so the in-flight reschedule always calls the latest
  // `flushSave` without a self-referential useCallback + stale-closure lint.
  const flushSaveRef = useRef<
    ((filename: string, opts?: { forceOverwrite?: boolean }) => Promise<void>) | null
  >(null);
  const voyagesRef = useRef(voyages);
  useEffect(() => {
    voyagesRef.current = voyages;
  }, [voyages]);
  // Same pattern for mtimeById: autosave timers capture `flushSave` at schedule
  // time, so during a quick burst of edits timer-B's closure still sees the
  // mtime from BEFORE timer-A's save returned. Reading from a ref sidesteps
  // the race so every save uses the freshest mtime we know about.
  const mtimeByIdRef = useRef(mtimeById);
  useEffect(() => {
    mtimeByIdRef.current = mtimeById;
  }, [mtimeById]);
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  // Refresh the manifest from the adapter.
  const refreshList = useCallback(async () => {
    if (!shipId) {
      setVoyages([]);
      return;
    }
    setListLoading(true);
    setListError(null);
    try {
      const list = await getStorageAdapter().listVoyages(shipId);
      setVoyages(list);
    } catch (e) {
      setListError((e as Error).message || String(e));
    } finally {
      setListLoading(false);
    }
  }, [shipId]);

  // Load manifest on mount. The provider is `key`'d on shipId by AppShell, so
  // a ship switch unmounts/remounts this provider with fresh state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshList();
  }, [refreshList]);

  // Lazy-load a voyage's full data on first access (or when explicitly asked).
  const loadVoyage = useCallback(
    async (filename: string): Promise<Voyage | null> => {
      if (!shipId || !filename) return null;
      if (loadedById[filename]) return loadedById[filename];
      if (loadingFiles[filename]) return null;
      setLoadingFiles((s) => ({ ...s, [filename]: true }));
      try {
        const { voyage, mtime } = await getStorageAdapter().loadVoyage(shipId, filename);
        setLoadedById((s) => ({ ...s, [filename]: voyage }));
        if (mtime != null) setMtimeById((s) => ({ ...s, [filename]: mtime }));
        return voyage;
      } finally {
        setLoadingFiles((s) => {
          const n = { ...s };
          delete n[filename];
          return n;
        });
      }
    },
    [shipId, loadedById, loadingFiles],
  );

  // ── Editing ──────────────────────────────────────────────────────────────

  // Save-now flush. Called by the debounced timer or imperatively.
  // `forceOverwrite` drops the prevMtime so the adapter skips the stale-file
  // check — used by the "Overwrite anyway" branch of StaleFileModal.
  const flushSave = useCallback(
    async (filename: string, { forceOverwrite = false }: { forceOverwrite?: boolean } = {}) => {
      const draft = draftsRef.current[filename];
      if (!draft) return;
      // If a save is already in flight for this file, reschedule; otherwise two
      // writes would race and the second would trip the stale-file check.
      if (inFlight.current.has(filename)) {
        const timers = saveTimers.current;
        if (timers.has(filename)) clearTimeout(timers.get(filename));
        const t = setTimeout(() => {
          timers.delete(filename);
          flushSaveRef.current?.(filename, { forceOverwrite });
        }, 250);
        timers.set(filename, t);
        return;
      }
      if (!shipId) return;
      inFlight.current.add(filename);
      setSaving((prev) => {
        const n = new Set(prev);
        n.add(filename);
        return n;
      });
      try {
        const stamped: Voyage = { ...draft, lastModified: new Date().toISOString() };
        const prevMtime = forceOverwrite ? null : mtimeByIdRef.current[filename] ?? null;
        const { mtime } = await getStorageAdapter().saveVoyage(
          shipId,
          filename,
          stamped,
          prevMtime,
        );
        // Clear the "already warned about offline" latch so a future outage
        // gets its own toast.
        offlineNotifiedRef.current = false;
        // Promote draft → loaded snapshot, clear dirty + offline cache.
        setLoadedById((s) => ({ ...s, [filename]: stamped }));
        if (mtime != null) setMtimeById((s) => ({ ...s, [filename]: mtime }));
        setDrafts((d) => {
          const n = { ...d };
          delete n[filename];
          return n;
        });
        setDirty((prev) => {
          if (!prev.has(filename)) return prev;
          const n = new Set(prev);
          n.delete(filename);
          return n;
        });
        safeDeleteDraft(shipId, filename);

        // Manifest sync: if any manifest-level field changed (ports / dates /
        // ended), upsert _index.json and refresh our local `voyages` state.
        // No-op on the local adapter (see storage/local/voyages.ts) but cheap.
        const freshEntry = manifestEntryFrom(stamped);
        const existing = voyagesRef.current.find((v) => v.filename === filename);
        const manifestChanged =
          !existing ||
          existing.fromPort?.code !== freshEntry.fromPort.code ||
          existing.toPort?.code !== freshEntry.toPort.code ||
          existing.startDate !== freshEntry.startDate ||
          existing.endDate !== freshEntry.endDate ||
          !!existing.ended !== freshEntry.ended;
        if (manifestChanged) {
          setVoyages((list) => {
            const without = list.filter((v) => v.filename !== filename);
            return [...without, freshEntry].sort((a, b) =>
              (b.startDate || '').localeCompare(a.startDate || ''),
            );
          });
        }
      } catch (e) {
        if (e instanceof StaleFileError) {
          // Stale-file case. StaleFileError carries the on-disk voyage+mtime
          // so we can skip an extra read when the user picks Reload.
          setConflict({
            filename,
            currentVoyage: e.currentVoyage ?? null,
            currentMtime: e.currentMtime ?? null,
          });
        } else if (e instanceof ConflictError) {
          // Other ConflictError shapes (none today, but future-proof).
          setConflict({ filename, currentVoyage: null, currentMtime: null });
        } else {
          // Network drive unreachable / IO error: keep the draft in IDB so a
          // refresh doesn't lose work, then log and surface a toast. Only the
          // first failure per outage pops the toast, so a burst of retries
          // doesn't spam the user.
          safePutDraft(shipId, filename, draft);
          log.error('save failed', filename, e);
          if (!offlineNotifiedRef.current) {
            offlineNotifiedRef.current = true;
            addToast(
              'Network drive unreachable — drafts saved locally, will retry on next edit.',
              'warning',
              6000,
            );
          }
        }
      } finally {
        inFlight.current.delete(filename);
        setSaving((prev) => {
          if (!prev.has(filename)) return prev;
          const n = new Set(prev);
          n.delete(filename);
          return n;
        });
      }
    },
    [shipId, addToast],
  );
  useEffect(() => {
    flushSaveRef.current = flushSave;
  }, [flushSave]);

  const scheduleSave = useCallback(
    (filename: string) => {
      const timers = saveTimers.current;
      if (timers.has(filename)) clearTimeout(timers.get(filename));
      const t = setTimeout(() => {
        timers.delete(filename);
        flushSave(filename);
      }, AUTO_SAVE_DELAY_MS);
      timers.set(filename, t);
    },
    [flushSave],
  );

  const updateVoyage = useCallback(
    (filename: string, mutator: VoyageMutator) => {
      if (!filename) return;
      setDrafts((prev) => {
        const base = prev[filename] ?? loadedById[filename];
        if (!base) return prev;
        // Lock-on-close: once a voyage is ended, mutations are refused until
        // the chief explicitly reopens it (via reopenVoyage). The UI also
        // hides edit affordances when ended, so this is mostly defense in
        // depth — programmatic callers (auto-save retries, late timer
        // fires) won't slip through.
        if (base.voyageEnd) {
          return prev;
        }
        const next = typeof mutator === 'function' ? mutator(base) : mutator;
        if (next === base) return prev;
        if (shipId) safePutDraft(shipId, filename, next);
        return { ...prev, [filename]: next };
      });
      setDirty((prev) => {
        if (prev.has(filename)) return prev;
        const base = drafts[filename] ?? loadedById[filename];
        if (base?.voyageEnd) return prev;
        const n = new Set(prev);
        n.add(filename);
        return n;
      });
      scheduleSave(filename);
    },
    [drafts, loadedById, scheduleSave, shipId],
  );

  // Reopen a previously-ended voyage. Clears voyageEnd + endDate so the
  // voyage returns to "active" state and updateVoyage stops refusing
  // mutations. This bypasses updateVoyage's lock-on-close guard by writing
  // to drafts directly. Caller should typically warn first; the UI uses a
  // single-click action since the operation is reversible (re-close to
  // re-lock at any time).
  const reopenVoyage = useCallback(
    (filename: string) => {
      if (!filename) return;
      setDrafts((prev) => {
        const base = prev[filename] ?? loadedById[filename];
        if (!base?.voyageEnd) return prev;
        const next: Voyage = { ...base, endDate: '', voyageEnd: null };
        if (shipId) safePutDraft(shipId, filename, next);
        return { ...prev, [filename]: next };
      });
      setDirty((prev) => {
        if (prev.has(filename)) return prev;
        const n = new Set(prev);
        n.add(filename);
        return n;
      });
      scheduleSave(filename);
    },
    [loadedById, scheduleSave, shipId],
  );

  // Create a new voyage file. Caller must supply the ship's `code` (from
  // ships.json) plus embark/disembark port objects picked via PortCombobox.
  const createVoyage = useCallback(
    async (partial: CreateVoyageInput): Promise<string> => {
      if (!shipId) throw new Error('createVoyage: no shipId');
      if (!partial?.shipClass) throw new Error('createVoyage: shipClass required');
      const shipCode = (partial.shipCode || '').toUpperCase();
      if (!shipCode) throw new Error('createVoyage: shipCode required');
      const fromPort = partial.fromPort;
      const toPort = partial.toPort;
      if (!CODE_RE.test(fromPort?.code || ''))
        throw new Error('createVoyage: embarkation port code must be 3 uppercase letters');
      if (!CODE_RE.test(toPort?.code || ''))
        throw new Error('createVoyage: disembarkation port code must be 3 uppercase letters');
      if (!partial.startDate) throw new Error('createVoyage: startDate required');

      const filename = buildFilename(shipCode, partial.startDate, fromPort.code, toPort.code);
      if (voyagesRef.current.some((v) => v.filename === filename)) {
        throw new Error(
          `A voyage from ${fromPort.code} to ${toPort.code} starting ${partial.startDate} already exists for this ship.`,
        );
      }
      const base = defaultVoyage(shipId, partial.shipClass);
      // Per-ship density overrides edited from Settings live in IDB. Apply on
      // top of the shipClass baseline so crew tweaks (e.g. a ship that's been
      // burning a different HFO cut for a month) flow into every new voyage.
      const settings = await getShipSettings(shipId);
      const overrideDensities: Partial<typeof base.densities> = settings?.defaultDensities ?? {};
      const densities = { ...base.densities, ...overrideDensities };
      const voyage: Voyage = {
        ...base,
        fromPort: { ...fromPort },
        toPort: { ...toPort },
        startDate: partial.startDate || '',
        endDate: partial.endDate || '',
        densities,
        filename,
        lastModified: new Date().toISOString(),
      };

      // Brand-new file → no prevMtime. The adapter also rejects the write if a
      // file with this name already exists on disk (covers cross-session races).
      const { mtime } = await getStorageAdapter().saveVoyage(shipId, filename, voyage, null);
      setLoadedById((s) => ({ ...s, [filename]: voyage }));
      if (mtime != null) setMtimeById((s) => ({ ...s, [filename]: mtime }));

      const entry = manifestEntryFrom(voyage);
      setVoyages((list) => {
        const without = list.filter((v) => v.filename !== filename);
        return [...without, entry].sort((a, b) =>
          (b.startDate || '').localeCompare(a.startDate || ''),
        );
      });

      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(filename);
        return next;
      });
      setSelected({ filename, kind: 'voyage' });
      return filename;
    },
    [shipId],
  );

  // Delete a voyage permanently. Destructive; callers show a confirmation.
  const deleteVoyage = useCallback(
    async (filename: string): Promise<void> => {
      if (!shipId || !filename) return;
      // Cancel pending saves first — no point saving something we're deleting.
      const timers = saveTimers.current;
      if (timers.has(filename)) {
        clearTimeout(timers.get(filename));
        timers.delete(filename);
      }
      try {
        await getStorageAdapter().deleteVoyage(shipId, filename);
      } catch (e) {
        // Not-found is fine — some other tab already removed it; proceed with
        // local cleanup so the UI reflects reality.
        if ((e as Error)?.name !== 'NotFoundError') throw e;
      }
      setVoyages((list) => list.filter((v) => v.filename !== filename));
      setLoadedById((s) => {
        const n = { ...s };
        delete n[filename];
        return n;
      });
      setMtimeById((s) => {
        const n = { ...s };
        delete n[filename];
        return n;
      });
      setDrafts((d) => {
        const n = { ...d };
        delete n[filename];
        return n;
      });
      setDirty((prev) => {
        if (!prev.has(filename)) return prev;
        const n = new Set(prev);
        n.delete(filename);
        return n;
      });
      setExpanded((prev) => {
        const next = new Set<string>();
        for (const k of prev) {
          if (k === filename) continue;
          if (typeof k === 'string' && k.startsWith(`${filename}::`)) continue;
          next.add(k);
        }
        return next;
      });
      setSelected((sel) => (sel?.filename === filename ? null : sel));
      safeDeleteDraft(shipId, filename);
    },
    [shipId],
  );

  const discardDraft = useCallback(
    (filename: string) => {
      const timers = saveTimers.current;
      if (timers.has(filename)) {
        clearTimeout(timers.get(filename));
        timers.delete(filename);
      }
      setDrafts((d) => {
        if (!(filename in d)) return d;
        const n = { ...d };
        delete n[filename];
        return n;
      });
      setDirty((prev) => {
        if (!prev.has(filename)) return prev;
        const n = new Set(prev);
        n.delete(filename);
        return n;
      });
      if (shipId) safeDeleteDraft(shipId, filename);
    },
    [shipId],
  );

  // ── Conflict resolution helpers (used by StaleFileModal) ────────────────

  const reloadFromRemote = useCallback(async () => {
    const entry = conflict;
    if (!entry?.filename) return;
    const { filename, currentVoyage, currentMtime } = entry;
    discardDraft(filename);
    setConflict(null);

    // Optimization: StaleFileError already read the on-disk file when it
    // detected the conflict. Use that payload directly instead of another
    // round-trip. Fall back to a fresh load if the error didn't include it.
    if (currentVoyage) {
      setLoadedById((s) => ({ ...s, [filename]: currentVoyage as Voyage }));
      if (currentMtime != null) setMtimeById((s) => ({ ...s, [filename]: currentMtime }));
      return;
    }
    setLoadedById((s) => {
      const n = { ...s };
      delete n[filename];
      return n;
    });
    setMtimeById((s) => {
      const n = { ...s };
      delete n[filename];
      return n;
    });
    await loadVoyage(filename);
  }, [conflict, discardDraft, loadVoyage]);

  const forceOverwrite = useCallback(async () => {
    const filename = conflict?.filename;
    if (!filename) return;
    setConflict(null);
    await flushSave(filename, { forceOverwrite: true });
  }, [conflict, flushSave]);

  const cancelConflict = useCallback(() => setConflict(null), []);

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  // ── Selection / expansion ───────────────────────────────────────────────

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expand = useCallback((key: string) => {
    setExpanded((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const v of voyages) next.add(v.filename);
      return next;
    });
  }, [voyages]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const select = useCallback(
    async (sel: Selection | null): Promise<void> => {
      setSelected(sel);
      if (sel?.filename) {
        expand(sel.filename);
        if (!loadedById[sel.filename]) loadVoyage(sel.filename);
      }
    },
    [expand, loadedById, loadVoyage],
  );

  const addLeg = useCallback(
    (
      filename: string,
      {
        shipClass,
        fromPort = '',
        toPort = '',
        depDate = '',
        arrDate = '',
        carryOverFrom = null,
        initialCounters = null,
      }: AddLegInput,
    ): number => {
      if (!shipClass) throw new Error('addLeg: shipClass required');
      // Lock-on-close: refuse to append legs to an ended voyage. The chief
      // must reopen first.
      const current = draftsRef.current[filename] ?? loadedById[filename];
      if (current?.voyageEnd) {
        throw new Error('Voyage is closed — reopen it before adding a leg.');
      }
      const leg = defaultLeg(shipClass);
      if (fromPort) leg.departure.port = fromPort;
      if (toPort) leg.arrival.port = toPort;
      if (depDate) leg.departure.date = depDate;
      if (arrDate) leg.arrival.date = arrDate;

      // Voyage-level import (selective per-equipment) wins when present —
      // this is the "Import Counters from previous voyage" path. Per-equipment
      // entries with empty values are skipped (the user deselected = RESET).
      if (initialCounters) {
        for (const [key, val] of Object.entries(initialCounters)) {
          const cell = leg.departure.phases[0]?.equipment[key];
          if (cell && val) cell.start = String(val);
        }
      }

      if (carryOverFrom?.arrival?.phases) {
        const srcPhases = carryOverFrom.arrival.phases as Array<{
          equipment?: Record<string, { start?: string; end?: string }>;
        }>;
        const srcLast = srcPhases[srcPhases.length - 1];
        if (srcLast?.equipment) {
          // Inherit each equipment's last known position. END wins; if END is
          // empty (equipment idle for that phase) we fall back to its START so
          // the counter doesn't get blanked. Both empty → skip (target stays '').
          for (const key of Object.keys(leg.departure.phases[0]?.equipment || {})) {
            const v = inheritedCounter(srcLast.equipment[key]);
            if (v) leg.departure.phases[0].equipment[key].start = v;
          }
          for (const key of Object.keys(leg.arrival.phases[0]?.equipment || {})) {
            const v = inheritedCounter(srcLast.equipment[key]);
            if (v) leg.arrival.phases[0].equipment[key].start = v;
          }
        }
      }

      updateVoyage(filename, (v) => ({ ...v, legs: [...(v.legs || []), leg] }));
      const key = `${filename}::${leg.id}`;
      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(key);
        next.add(filename);
        return next;
      });
      setSelected({ filename, kind: 'departure', legId: leg.id });
      return leg.id;
    },
    [loadedById, updateVoyage],
  );

  // Remove a leg from the voyage. Goes through updateVoyage so it autosaves
  // and gets a fresh loggedBy stamp. Refuses on a closed voyage to match
  // addLeg — the chief must reopen first.
  const deleteLeg = useCallback(
    (filename: string, legId: number) => {
      if (!filename || legId == null) return;
      const current = draftsRef.current[filename] ?? loadedById[filename];
      if (current?.voyageEnd) {
        throw new Error('Voyage is closed — reopen it before deleting a leg.');
      }
      updateVoyage(filename, (v) => ({
        ...v,
        legs: (v.legs || []).filter((l) => l.id !== legId),
      }));
      // Selection cleanup: if we were viewing the deleted leg or one of its
      // child reports, drop back to the voyage detail.
      setSelected((sel) => {
        if (!sel || sel.filename !== filename) return sel;
        if (sel.legId === legId) return { filename, kind: 'voyage' };
        return sel;
      });
      // Expansion cleanup: drop the deleted leg's expansion key.
      const legKey = `${filename}::${legId}`;
      setExpanded((prev) => {
        if (!prev.has(legKey)) return prev;
        const next = new Set(prev);
        next.delete(legKey);
        return next;
      });
    },
    [loadedById, updateVoyage],
  );

  const endVoyage = useCallback(
    (
      filename: string,
      { shipClass, endDate = '', engineer = '', notes = '', lubeOil = null }: EndVoyageInput,
    ) => {
      if (!shipClass) throw new Error('endVoyage: shipClass required');
      // updateVoyage refuses when voyageEnd is already set, so re-closing an
      // already-ended voyage is a silent no-op. To re-close after edits, the
      // chief reopens first via reopenVoyage().
      const nowDate = endDate || new Date().toISOString().slice(0, 10);
      // Round IEEE-noise off the persisted totals — the on-screen formatMT
      // already rounds to 2 decimals, so anything tighter than that on disk
      // is just garbage tail (e.g. 23.000000000000004 → 23).
      const round2 = (n: number) => Math.round(n * 100) / 100;
      updateVoyage(filename, (v) => {
        const fuel = calcVoyageTotals(v, shipClass);
        const freshWaterCons = calcVoyageFreshWaterTotal(v);
        const base = defaultVoyageEnd(shipClass);
        // NB: voyageEnd.totals is written here as a snapshot at close time, but
        // VoyageEndDetail no longer renders from it — it recomputes live via
        // calcVoyageTotals so post-close amendments stay in sync. The field
        // is kept on disk for audit / forensic comparison only.
        return {
          ...v,
          endDate: nowDate,
          voyageEnd: {
            ...base,
            completedAt: new Date().toISOString(),
            engineer,
            notes,
            lubeOil: lubeOil || base.lubeOil,
            totals: {
              hfo: round2(fuel.hfo),
              mgo: round2(fuel.mgo),
              lsfo: round2(fuel.lsfo),
              freshWaterCons: round2(freshWaterCons),
            },
            densitiesAtClose: v.densities || base.densitiesAtClose,
          },
        };
      });
      setSelected({ filename, kind: 'voyageEnd' });
      // 3A: when the user is on the ACTIVE filter (the default), an ended
      // voyage immediately disappears from the tree. Surface a toast so
      // they know where to look — keep their filter choice unchanged.
      if (filter === 'active') {
        addToast(
          'Voyage ended. Switch to "Ended" or "All" to view closed voyages.',
          'info',
          5000,
        );
      }
    },
    [updateVoyage, filter, addToast],
  );

  // ── Manual carry-over (phase END → next phase START) ──────────────────
  const trackPhaseEnd = useCallback((source: PhaseSource | null) => {
    if (!source) {
      setLastEditedPhase(null);
      return;
    }
    setLastEditedPhase(source);
  }, []);

  const findNextPhaseFor = useCallback(
    (source: PhaseSource | null): PhaseTarget | null => {
      if (!source) return null;
      const v = drafts[source.filename] || loadedById[source.filename];
      return findNextPhaseForVoyage(v ?? null, source);
    },
    [drafts, loadedById],
  );

  const applyCarryOver = useCallback(
    (
      target: PhaseTarget,
      counters: Record<string, string | number | null | undefined>,
    ) => {
      if (!target) return;
      const entries = Object.entries(counters || {}).filter(
        ([, v]) => v !== '' && v != null,
      );
      if (!entries.length) return;
      updateVoyage(target.filename, (v) => ({
        ...v,
        legs: v.legs.map((l) => {
          if (l.id !== target.legId) return l;
          const rep = target.kind === 'departure' ? l.departure : l.arrival;
          if (!rep?.phases) return l;
          const nextPhases = rep.phases.map((p) => {
            if (p.id !== target.phaseId) return p;
            const eqNext = { ...p.equipment };
            for (const [key, val] of entries) {
              if (eqNext[key]) eqNext[key] = { ...eqNext[key], start: String(val) };
            }
            return { ...p, equipment: eqNext };
          });
          return target.kind === 'departure'
            ? { ...l, departure: { ...rep, phases: nextPhases } }
            : { ...l, arrival: { ...rep, phases: nextPhases } };
        }),
      }));
      setLastEditedPhase(null);
    },
    [updateVoyage],
  );

  const visibleVoyages = useMemo(
    () => filterVoyages(voyages, { filter, search }),
    [voyages, filter, search],
  );

  const effectiveById = useMemo<Record<string, Voyage>>(() => {
    if (!Object.keys(drafts).length) return loadedById;
    return { ...loadedById, ...drafts };
  }, [loadedById, drafts]);

  const value = useMemo<VoyageStoreContextValue>(
    () => ({
      voyages,
      visibleVoyages,
      loadedById: effectiveById,
      loadingFiles,
      listLoading,
      listError,
      dirty,
      saving,
      updateVoyage,
      createVoyage,
      addLeg,
      deleteLeg,
      endVoyage,
      reopenVoyage,
      deleteVoyage,
      discardDraft,
      flushSave,
      lastEditedPhase,
      trackPhaseEnd,
      findNextPhaseFor,
      applyCarryOver,
      conflict,
      reloadFromRemote,
      forceOverwrite,
      cancelConflict,
      selected,
      expanded,
      select,
      toggleExpand,
      expand,
      expandAll,
      collapseAll,
      filter,
      setFilter,
      search,
      setSearch,
      refreshList,
      loadVoyage,
    }),
    [
      voyages,
      visibleVoyages,
      effectiveById,
      loadingFiles,
      listLoading,
      listError,
      dirty,
      saving,
      updateVoyage,
      createVoyage,
      addLeg,
      deleteLeg,
      endVoyage,
      reopenVoyage,
      deleteVoyage,
      discardDraft,
      flushSave,
      lastEditedPhase,
      trackPhaseEnd,
      findNextPhaseFor,
      applyCarryOver,
      conflict,
      reloadFromRemote,
      forceOverwrite,
      cancelConflict,
      selected,
      expanded,
      select,
      toggleExpand,
      expand,
      expandAll,
      collapseAll,
      filter,
      search,
      refreshList,
      loadVoyage,
    ],
  );

  return (
    <VoyageStoreContext.Provider value={value}>{children}</VoyageStoreContext.Provider>
  );
}
