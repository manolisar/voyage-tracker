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
import { createLocalAdapter } from '../storage/local';
import {
  safePutDraft,
  safeDeleteDraft,
  getShipSettings,
} from '../storage/indexeddb';
import { AUTO_SAVE_DELAY_MS } from '../domain/constants';
import { calcVoyageTotals } from '../domain/calculations';
import {
  defaultVoyage,
  defaultLeg,
  defaultVoyageEnd,
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

// Module-level session getter. Updated on every render below so the adapter's
// loggedBy stamp always sees the freshest session without needing a rebuild.
let sessionGetter: () => SessionSnapshot | null = () => null;
setStorageAdapter(createLocalAdapter({ getSession: () => sessionGetter() }));

const CODE_RE = /^[A-Z]{3}$/;

export function VoyageStoreProvider({ children }: { children: ReactNode }) {
  const { shipId, getSessionSnapshot } = useSession();
  const { addToast } = useToast();
  // One toast per outage — don't spam the user for every burst-save retry.
  const offlineNotifiedRef = useRef(false);
  // Keep the module-level session getter pointing at the live one. Done in an
  // effect (not render) to satisfy the react-hooks purity rule; the adapter
  // only invokes getSession inside saveVoyage which always runs after mount.
  useEffect(() => {
    sessionGetter = getSessionSnapshot;
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
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
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
          const upsert = getStorageAdapter().upsertIndex;
          if (typeof upsert === 'function') {
            upsert(shipId, filename, freshEntry).catch((err) =>
              console.warn('[VoyageStore] _index upsert failed (non-fatal)', err),
            );
          }
        }
      } catch (e) {
        if (e instanceof ConflictError) {
          // Stale-file case. StaleFileError carries the on-disk voyage+mtime so
          // we can skip an extra read when the user picks Reload.
          const stale = e as ConflictError & {
            currentVoyage?: unknown;
            currentMtime?: number | null;
          };
          setConflict({
            filename,
            currentVoyage: stale.currentVoyage ?? null,
            currentMtime: stale.currentMtime ?? null,
          });
        } else {
          // Network drive unreachable / IO error: keep the draft in IDB so a
          // refresh doesn't lose work, then log and surface a toast. Only the
          // first failure per outage pops the toast, so a burst of retries
          // doesn't spam the user.
          safePutDraft(shipId, filename, draft);
          console.error('[VoyageStore] save failed', filename, e);
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
        const next = typeof mutator === 'function' ? mutator(base) : mutator;
        if (next === base) return prev;
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
      const overrideDensities = (settings?.defaultDensities ?? {}) as Partial<typeof base.densities>;
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
      const upsert = getStorageAdapter().upsertIndex;
      if (typeof upsert === 'function') {
        upsert(shipId, filename, entry).catch((err) =>
          console.warn('[VoyageStore] _index upsert failed (non-fatal)', err),
        );
      }

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
      }: AddLegInput,
    ): number => {
      if (!shipClass) throw new Error('addLeg: shipClass required');
      const leg = defaultLeg(shipClass);
      if (fromPort) leg.departure.port = fromPort;
      if (toPort) leg.arrival.port = toPort;
      if (depDate) leg.departure.date = depDate;
      if (arrDate) leg.arrival.date = arrDate;

      if (carryOverFrom?.arrival?.phases) {
        const srcPhases = carryOverFrom.arrival.phases as Array<{
          equipment?: Record<string, { end?: string }>;
        }>;
        const srcLast = srcPhases[srcPhases.length - 1];
        if (srcLast?.equipment) {
          for (const key of Object.keys(leg.departure.phases[0]?.equipment || {})) {
            const endVal = srcLast.equipment[key]?.end;
            if (endVal) leg.departure.phases[0].equipment[key].start = endVal;
          }
          for (const key of Object.keys(leg.arrival.phases[0]?.equipment || {})) {
            const endVal = srcLast.equipment[key]?.end;
            if (endVal) leg.arrival.phases[0].equipment[key].start = endVal;
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
    [updateVoyage],
  );

  const endVoyage = useCallback(
    (
      filename: string,
      { shipClass, endDate = '', engineer = '', notes = '', lubeOil = null }: EndVoyageInput,
    ) => {
      if (!shipClass) throw new Error('endVoyage: shipClass required');
      const nowDate = endDate || new Date().toISOString().slice(0, 10);
      updateVoyage(filename, (v) => {
        const fuel = calcVoyageTotals(v, shipClass);
        let freshWaterCons = 0;
        for (const leg of v.legs || []) {
          const fw = parseFloat(leg.arrival?.freshWater?.consumption);
          if (Number.isFinite(fw)) freshWaterCons += fw;
        }
        const base = defaultVoyageEnd(shipClass);
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
              hfo: fuel.hfo,
              mgo: fuel.mgo,
              lsfo: fuel.lsfo,
              freshWaterCons,
            },
            densitiesAtClose: v.densities || base.densitiesAtClose,
          },
        };
      });
      setSelected({ filename, kind: 'voyageEnd' });
    },
    [updateVoyage],
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
      endVoyage,
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
      endVoyage,
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
