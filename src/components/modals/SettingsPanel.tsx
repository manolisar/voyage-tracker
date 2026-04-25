// SettingsPanel — the gear-icon modal in the TopBar. Replaces the old
// GitHub-era AdminPanel. Four actions, no privileged concepts:
//
//   1. Change data folder      — re-pick the directory for the current ship.
//   2. Default fuel densities  — per-ship overrides applied to NEW voyages.
//   3. Export voyages          — download a JSON bundle of every voyage file.
//   4. Import voyages          — restore a bundle (append-only; existing files
//                                are skipped).
//
// Switching ship / user lives on the TopBar (log-out button) — duplicating
// it here was redundant.

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { useSession } from '../../hooks/useSession';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { useToast } from '../../hooks/useToast';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import {
  pickDirectoryForShip,
  getHandleForShip,
} from '../../storage/local/fsHandle';
import {
  buildBundle,
  downloadBundle,
  parseBundleFile,
  importBundle,
} from '../../storage/local/exportImport';
import { defaultDensities } from '../../domain/shipClass';
import { getShipSettings, putShipSettings } from '../../storage/indexeddb';
import { Download, Folder, Settings, Upload, X } from '../Icons';
import type { FuelKey, ShipClass } from '../../types/domain';

interface Props {
  shipClass: ShipClass | null;
  onClose: () => void;
}

type BusyState = 'folder' | 'export' | 'import' | 'densities' | null;

export function SettingsPanel({ shipClass, onClose }: Props) {
  const { shipId, userName, role } = useSession();
  const { refreshList } = useVoyageStore();
  const toast = useToast();

  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyState>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Density editor — pre-filled from shipClass baseline + any per-ship IDB
  // overrides. `densities` holds the working string values (inputs are
  // controlled), `densityDirty` flips true as soon as the user types.
  const baseline = shipClass ? defaultDensities(shipClass) : null;
  const [densities, setDensities] = useState<Record<string, string> | null>(null);
  const [densityDirty, setDensityDirty] = useState(false);
  useEffect(() => {
    if (!shipId || !baseline) return undefined;
    let alive = true;
    (async () => {
      const settings = await getShipSettings(shipId);
      if (!alive) return;
      const overrides =
        (settings as { defaultDensities?: Partial<Record<FuelKey, number>> } | null | undefined)
          ?.defaultDensities || {};
      const merged: Record<string, string> = {};
      for (const fuel of Object.keys(baseline) as FuelKey[]) {
        const v = overrides[fuel] ?? baseline[fuel];
        merged[fuel] = String(v);
      }
      setDensities(merged);
      setDensityDirty(false);
    })();
    return () => {
      alive = false;
    };
    // baseline is derived from shipClass; depending on shipClass.id is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipId, shipClass?.id]);

  useEscapeKey(onClose, !!busy);

  // Show the current folder name for reassurance. If permission isn't
  // granted (shouldn't happen post-landing) show a dash.
  useEffect(() => {
    if (!shipId) return undefined;
    let alive = true;
    (async () => {
      try {
        const h = await getHandleForShip(shipId, { prompt: false });
        if (alive) setCurrentFolder(h?.name || null);
      } catch {
        if (alive) setCurrentFolder(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [shipId]);

  async function handleChangeFolder() {
    if (!shipId) return;
    setBusy('folder');
    try {
      const h = await pickDirectoryForShip(shipId);
      setCurrentFolder(h.name);
      await refreshList();
      toast.addToast(`Folder changed to ${h.name}`, 'success');
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        toast.addToast((e as Error).message || 'Could not change folder', 'error');
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleExport() {
    if (!shipId) return;
    setBusy('export');
    try {
      const bundle = await buildBundle(shipId);
      const filename = downloadBundle(bundle);
      toast.addToast(`Exported ${bundle.voyages.length} voyage(s) → ${filename}`, 'success');
    } catch (e) {
      toast.addToast((e as Error).message || 'Export failed', 'error');
    } finally {
      setBusy(null);
    }
  }

  function handlePickImport() {
    importInputRef.current?.click();
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file || !shipId) return;
    setBusy('import');
    try {
      const bundle = await parseBundleFile(file);
      if (bundle.shipId !== shipId) {
        const ok = window.confirm(
          `Bundle was exported for ship "${bundle.shipId}" but you're importing into "${shipId}".\n\nContinue anyway?`,
        );
        if (!ok) {
          setBusy(null);
          return;
        }
      }
      const { written, skipped } = await importBundle(bundle, shipId);
      await refreshList();
      const parts = [`Imported ${written.length}`];
      if (skipped.length) parts.push(`skipped ${skipped.length} (already present)`);
      toast.addToast(parts.join(' · '), 'success');
    } catch (e) {
      toast.addToast((e as Error).message || 'Import failed', 'error');
    } finally {
      setBusy(null);
    }
  }

  function handleDensityChange(fuel: string, raw: string) {
    setDensities((prev) => (prev ? { ...prev, [fuel]: raw } : prev));
    setDensityDirty(true);
  }

  function handleDensityReset() {
    if (!baseline) return;
    const reset: Record<string, string> = {};
    for (const fuel of Object.keys(baseline)) reset[fuel] = String(baseline[fuel as FuelKey]);
    setDensities(reset);
    setDensityDirty(true);
  }

  async function handleDensitySave() {
    if (!densities || !baseline || !shipId) return;
    // Parse + validate. Reject NaN or non-positive; accept anything reasonable
    // (no tight range — different HFO cuts legitimately vary ±0.05).
    const parsed: Record<string, number> = {};
    for (const fuel of Object.keys(baseline)) {
      const n = Number(densities[fuel]);
      if (!Number.isFinite(n) || n <= 0) {
        toast.addToast(`Invalid ${fuel} density`, 'error');
        return;
      }
      parsed[fuel] = n;
    }
    setBusy('densities');
    try {
      await putShipSettings(shipId, { defaultDensities: parsed });
      setDensityDirty(false);
      toast.addToast('Default densities saved — applied to new voyages', 'success');
    } catch (e) {
      toast.addToast((e as Error).message || 'Could not save densities', 'error');
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <div className="modal-overlay" onClick={disabled ? undefined : onClose} role="presentation">
      <div
        className="modal-content w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="modal-head flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5" />
            <div>
              <h2 id="settings-title">Settings</h2>
              <p>
                {userName ? <>{userName} · </> : null}
                {role ? <span style={{ textTransform: 'capitalize' }}>{role}</span> : null}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={disabled}
            className="p-1 rounded hover:bg-black/5"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <Row
            icon={<Folder className="w-4 h-4" />}
            title="Data folder"
            subtitle={currentFolder ? `Currently: ${currentFolder}` : 'No folder selected'}
            action={
              <button
                type="button"
                className="btn-flat px-3 py-1.5 rounded-lg text-xs"
                disabled={disabled}
                onClick={handleChangeFolder}
              >
                {busy === 'folder' ? 'Picking…' : 'Change folder…'}
              </button>
            }
          />

          {baseline && densities && (
            <div className="flex items-start gap-3 min-w-0">
              <span
                className="mt-0.5 flex-shrink-0"
                style={{ color: 'var(--color-dim)' }}
                aria-hidden="true"
              >
                <Settings className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                  Default fuel densities
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-dim)' }}>
                  t/m³ @ Counters — applied to new voyages on this ship. Existing voyages keep their own densities.
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {Object.keys(baseline).map((fuel) => (
                    <label key={fuel} className="flex flex-col gap-1">
                      <span className="form-label">{fuel}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.001"
                        min="0"
                        className="form-input font-mono"
                        value={densities[fuel] ?? ''}
                        disabled={disabled}
                        onChange={(e) => handleDensityChange(fuel, e.target.value)}
                      />
                      <span className="text-[0.65rem] font-mono" style={{ color: 'var(--color-faint)' }}>
                        class baseline: {baseline[fuel]}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-primary px-3 py-1.5 rounded-lg text-xs"
                    disabled={disabled || !densityDirty}
                    onClick={handleDensitySave}
                  >
                    {busy === 'densities' ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="btn-flat px-3 py-1.5 rounded-lg text-xs"
                    disabled={disabled}
                    onClick={handleDensityReset}
                    title="Reset to ship-class baseline"
                  >
                    Reset to baseline
                  </button>
                </div>
              </div>
            </div>
          )}

          <Row
            icon={<Download className="w-4 h-4" />}
            title="Export voyages"
            subtitle="Download every voyage for this ship as a single JSON bundle."
            action={
              <button
                type="button"
                className="btn-flat px-3 py-1.5 rounded-lg text-xs"
                disabled={disabled}
                onClick={handleExport}
              >
                {busy === 'export' ? 'Building…' : 'Download'}
              </button>
            }
          />

          <Row
            icon={<Upload className="w-4 h-4" />}
            title="Import voyages"
            subtitle="Restore from a previously-exported bundle. Existing files are skipped."
            action={
              <>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportFile}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  className="btn-flat px-3 py-1.5 rounded-lg text-xs"
                  disabled={disabled}
                  onClick={handlePickImport}
                >
                  {busy === 'import' ? 'Importing…' : 'Choose file…'}
                </button>
              </>
            }
          />

        </div>
      </div>
    </div>
  );
}

interface RowProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  action: ReactNode;
}

function Row({ icon, title, subtitle, action }: RowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <span
          className="mt-0.5 flex-shrink-0"
          style={{ color: 'var(--color-dim)' }}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            {title}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--color-dim)' }}>
            {subtitle}
          </div>
        </div>
      </div>
      <div className="flex-shrink-0">{action}</div>
    </div>
  );
}
