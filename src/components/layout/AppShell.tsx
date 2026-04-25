// AppShell — main view scaffold.
// Wires: TopBar, sidebar (VoyageTree), main (DetailPane). The storage adapter
// is installed by VoyageStoreProvider at module load (local File System
// Access backend, see src/storage/local/).

import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../hooks/useSession';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { loadShips, loadShipClass } from '../../domain/shipClass';
import { VoyageStoreProvider } from '../../contexts/VoyageStoreProvider';
import { findPreviousEndedVoyage } from '../../contexts/voyageStore.helpers';
import { TopBar } from './TopBar';
import { DetailPane } from './DetailPane';
import { VoyageTree } from '../tree/VoyageTree';
import { SettingsPanel } from '../modals/SettingsPanel';
import { NewVoyageModal } from '../modals/NewVoyageModal';
import { AddLegModal } from '../modals/AddLegModal';
import { VoyageEndModal } from '../modals/VoyageEndModal';
import { DeleteVoyageModal } from '../modals/DeleteVoyageModal';
import { StaleFileModal } from '../modals/StaleFileModal';
import { ImportCountersModal } from '../modals/ImportCountersModal';
import { HelpModal } from '../modals/HelpModal';
import { Eye } from '../Icons';
import type { Ship, ShipClass, Voyage } from '../../types/domain';

export function AppShell() {
  const { shipId, editMode, enterEditMode } = useSession();
  const [ship, setShip] = useState<Ship | null>(null);
  const [shipClass, setShipClass] = useState<ShipClass | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [newVoyageOpen, setNewVoyageOpen] = useState(false);
  const [addLegFor, setAddLegFor] = useState<string | null>(null);
  const [endVoyageFor, setEndVoyageFor] = useState<string | null>(null);
  const [deleteVoyageFor, setDeleteVoyageFor] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!shipId) return;
    (async () => {
      try {
        const ships = await loadShips();
        const s = ships.find((x) => x.id === shipId) || null;
        if (!alive) return;
        setShip(s);
        if (s?.classId) {
          const cls = await loadShipClass(s.classId);
          if (alive) setShipClass(cls);
        }
      } catch (e) {
        console.error('Failed to load ship/class', e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [shipId]);

  const sidebarStyle = useMemo(
    () => ({
      width: sidebarOpen ? 320 : 0,
      transition: 'width 0.2s ease',
      borderColor: 'var(--color-border-subtle)',
      background: 'var(--color-surface)',
    }),
    [sidebarOpen],
  );

  // Global keyboard shortcuts. `/` focuses the tree search input; Ctrl/Cmd+B
  // toggles the sidebar. Both are suppressed while the user is typing in an
  // input/textarea/contenteditable so we don't intercept normal characters.
  useEffect(() => {
    const isEditable = (el: Element | null): boolean => {
      if (!el) return false;
      if ((el as HTMLElement).isContentEditable) return true;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+B / Cmd+B → toggle sidebar (works even while typing)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarOpen((v) => !v);
        return;
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (isEditable(document.activeElement)) return;
        const el = document.getElementById('tree-search');
        if (el) {
          e.preventDefault();
          if (!sidebarOpen) setSidebarOpen(true);
          // Defer to next frame so an opening sidebar mounts the input before we focus.
          requestAnimationFrame(() => el.focus());
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  return (
    <VoyageStoreProvider key={shipId}>
      <div className="flex flex-col flex-1 min-h-0">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <TopBar
          ship={ship}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onEnableEdit={enterEditMode}
          onNewVoyage={() => setNewVoyageOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
        />

        {!editMode && (
          <div
            className="px-4 py-2 text-xs flex items-center gap-2 border-b shrink-0"
            style={{
              background: 'var(--color-surface2)',
              color: 'var(--color-dim)',
              borderColor: 'var(--color-border-subtle)',
            }}
            role="status"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>You are in <strong>View Only</strong>. Click <strong>Enable Edit Mode</strong> in the top bar to modify data.</span>
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          <aside
            className="border-r overflow-hidden shrink-0 hidden md:flex flex-col"
            style={sidebarStyle}
            aria-label="Voyages"
          >
            {sidebarOpen && <VoyageTree />}
          </aside>

          <main id="main-content" className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8" tabIndex={-1}>
            <DetailPane
              ship={ship}
              shipClass={shipClass}
              onAddLeg={(filename) => setAddLegFor(filename)}
              onEndVoyage={(filename) => setEndVoyageFor(filename)}
              onDeleteVoyage={(filename) => setDeleteVoyageFor(filename)}
            />
          </main>
        </div>

        {settingsOpen && (
          <SettingsPanel shipClass={shipClass} onClose={() => setSettingsOpen(false)} />
        )}

        {helpOpen && (
          <HelpModal onClose={() => setHelpOpen(false)} />
        )}

        <NewVoyageFlow
          open={newVoyageOpen}
          ship={ship}
          shipClass={shipClass}
          onClose={() => setNewVoyageOpen(false)}
        />

        {addLegFor && (
          <AddLegModal
            filename={addLegFor}
            shipClass={shipClass}
            onClose={() => setAddLegFor(null)}
          />
        )}

        {endVoyageFor && (
          <VoyageEndModal
            filename={endVoyageFor}
            shipClass={shipClass}
            onClose={() => setEndVoyageFor(null)}
          />
        )}

        {deleteVoyageFor && (
          <DeleteVoyageModal
            filename={deleteVoyageFor}
            onClose={() => setDeleteVoyageFor(null)}
          />
        )}

        <StaleFileModalHost />
      </div>
    </VoyageStoreProvider>
  );
}

// New-Voyage flow chainer — renders inside VoyageStoreProvider so it can read
// the manifest and load the previous voyage. Sequence:
//   1. NewVoyageModal collects ports/dates and creates the voyage on submit.
//   2. On success, look for a previous ENDED voyage on this ship.
//      - None → open AddLegModal so the chief can add the first leg fresh.
//      - Found → load it and open ImportCountersModal.
//   3. ImportCountersModal:
//      - Start Fresh / dismiss → open AddLegModal with no initialCounters.
//      - Import → open AddLegModal with the chosen counters pre-filled into
//        the new leg's first departure phase.
function NewVoyageFlow({
  open,
  ship,
  shipClass,
  onClose,
}: {
  open: boolean;
  ship: Ship | null | undefined;
  shipClass: ShipClass | null;
  onClose: () => void;
}) {
  const { voyages, loadVoyage } = useVoyageStore();
  const [importFor, setImportFor] = useState<{
    newFilename: string;
    prevVoyage: Voyage;
  } | null>(null);
  const [pendingFirstLeg, setPendingFirstLeg] = useState<{
    filename: string;
    initialCounters?: Record<string, string>;
  } | null>(null);

  const handleNewVoyageClose = async (createdFilename?: string) => {
    onClose();
    if (!createdFilename) return;
    const prev = findPreviousEndedVoyage(voyages, createdFilename);
    if (!prev) {
      setPendingFirstLeg({ filename: createdFilename });
      return;
    }
    try {
      const prevVoyage = await loadVoyage(prev.filename);
      if (prevVoyage) {
        setImportFor({ newFilename: createdFilename, prevVoyage });
        return;
      }
    } catch (e) {
      console.warn('[NewVoyageFlow] failed to load previous voyage', e);
    }
    // Fall back to fresh first-leg if loading the previous voyage fails.
    setPendingFirstLeg({ filename: createdFilename });
  };

  return (
    <>
      {open && (
        <NewVoyageModal
          ship={ship}
          shipClass={shipClass}
          onClose={handleNewVoyageClose}
        />
      )}
      {importFor && shipClass && (
        <ImportCountersModal
          prevVoyage={importFor.prevVoyage}
          shipClass={shipClass}
          onStartFresh={() => {
            setPendingFirstLeg({ filename: importFor.newFilename });
            setImportFor(null);
          }}
          onImport={(counters) => {
            setPendingFirstLeg({ filename: importFor.newFilename, initialCounters: counters });
            setImportFor(null);
          }}
          onClose={() => setImportFor(null)}
        />
      )}
      {pendingFirstLeg && (
        <AddLegModal
          filename={pendingFirstLeg.filename}
          shipClass={shipClass}
          initialCounters={pendingFirstLeg.initialCounters}
          onClose={() => setPendingFirstLeg(null)}
        />
      )}
    </>
  );
}

// StaleFileModal reads the VoyageStore context, so it renders inside it.
function StaleFileModalHost() {
  const { conflict, reloadFromRemote, forceOverwrite, cancelConflict, voyages } = useVoyageStore();
  if (!conflict) return null;
  const entry = voyages.find((v) => v.filename === conflict.filename);
  const routeLabel = entry && entry.fromPort?.code && entry.toPort?.code
    ? `${entry.fromPort.code} → ${entry.toPort.code}`
    : '';
  const label = entry ? `${entry.startDate || ''} ${routeLabel}`.trim() : null;
  return (
    <StaleFileModal
      filename={conflict.filename}
      voyageLabel={label}
      onReload={reloadFromRemote}
      onForce={forceOverwrite}
      onCancel={cancelConflict}
    />
  );
}
