// VoyageTree — top-level tree.
// Toolbar at the top (search/filter/refresh), then the list of visible voyages
// as TreeNodes, then a footer with count + storage path hint.

import { useCallback, type KeyboardEvent } from 'react';
import { useSession } from '../../hooks/useSession';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { TreeToolbar } from './TreeToolbar';
import { TreeNode } from './TreeNode';
import type { Selection, Voyage, VoyageManifestEntry } from '../../types/domain';

interface FlatRow {
  sel: Selection;
  expandKey: string | null;
  canExpand: boolean;
  parent: Selection | null;
}

// Stable key for a selection object — used to locate the current row in the
// flat list when stepping with arrow keys.
function selKey(sel: Selection | null | undefined): string {
  if (!sel) return '';
  return `${sel.filename}|${sel.kind}|${sel.legId || ''}`;
}

// Flatten the currently-visible tree into an ordered list of rows that the
// arrow-key handler can step through. Children are only emitted when their
// parent is expanded (and, for voyages, when the full voyage has loaded).
function flattenRows(
  visibleVoyages: VoyageManifestEntry[],
  expanded: Set<string>,
  loadedById: Record<string, Voyage>,
): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const v of visibleVoyages) {
    const voyageSel: Selection = { filename: v.filename, kind: 'voyage' };
    rows.push({ sel: voyageSel, expandKey: v.filename, canExpand: true, parent: null });
    if (!expanded.has(v.filename)) continue;
    const full = loadedById[v.filename];
    if (!full) continue;
    for (const leg of full.legs || []) {
      const legKey = `${v.filename}::${leg.id}`;
      const legSel: Selection = { filename: v.filename, kind: 'leg', legId: leg.id };
      rows.push({ sel: legSel, expandKey: legKey, canExpand: true, parent: voyageSel });
      if (!expanded.has(legKey)) continue;
      rows.push({ sel: { filename: v.filename, kind: 'departure', legId: leg.id }, expandKey: null, canExpand: false, parent: legSel });
      rows.push({ sel: { filename: v.filename, kind: 'arrival', legId: leg.id }, expandKey: null, canExpand: false, parent: legSel });
      rows.push({ sel: { filename: v.filename, kind: 'voyageReport', legId: leg.id }, expandKey: null, canExpand: false, parent: legSel });
    }
    if (full.voyageEnd) {
      rows.push({ sel: { filename: v.filename, kind: 'voyageEnd' }, expandKey: null, canExpand: false, parent: voyageSel });
    }
  }
  return rows;
}

export function VoyageTree() {
  const { shipId } = useSession();
  const {
    visibleVoyages, voyages, listLoading, listError,
    expanded, loadedById, selected, select, toggleExpand,
  } = useVoyageStore();
  const showError = !!listError;

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      // Only handle plain arrow / Home / End — let modifiers through.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key;
      if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft'
          && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return;

      const rows = flattenRows(visibleVoyages, expanded, loadedById);
      if (!rows.length) return;
      const currentKey = selKey(selected);
      let idx = rows.findIndex((r) => selKey(r.sel) === currentKey);
      if (idx < 0) idx = 0;
      const row = rows[idx];

      if (key === 'ArrowDown') {
        e.preventDefault();
        select(rows[Math.min(idx + 1, rows.length - 1)].sel);
      } else if (key === 'ArrowUp') {
        e.preventDefault();
        select(rows[Math.max(idx - 1, 0)].sel);
      } else if (key === 'Home') {
        e.preventDefault();
        select(rows[0].sel);
      } else if (key === 'End') {
        e.preventDefault();
        select(rows[rows.length - 1].sel);
      } else if (key === 'ArrowRight') {
        if (row.canExpand && row.expandKey && !expanded.has(row.expandKey)) {
          e.preventDefault();
          toggleExpand(row.expandKey);
        } else if (idx < rows.length - 1) {
          e.preventDefault();
          select(rows[idx + 1].sel);
        }
      } else if (key === 'ArrowLeft') {
        if (row.canExpand && row.expandKey && expanded.has(row.expandKey)) {
          e.preventDefault();
          toggleExpand(row.expandKey);
        } else if (row.parent) {
          e.preventDefault();
          select(row.parent);
        }
      }
    },
    [visibleVoyages, expanded, loadedById, selected, select, toggleExpand],
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <TreeToolbar />

      <div
        className="flex-1 overflow-y-auto min-h-0 p-2"
        role="tree"
        aria-label="Voyages"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {showError && (
          <div
            className="m-2 p-3 rounded-lg text-xs"
            style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-fg)' }}
            role="alert"
          >
            <strong>Failed to load voyages:</strong> {listError}
          </div>
        )}

        {listLoading && voyages.length === 0 && (
          <div className="p-6 text-center text-xs" style={{ color: 'var(--color-dim)' }}>
            Loading voyages…
          </div>
        )}

        {!listLoading && !listError && visibleVoyages.length === 0 && voyages.length === 0 && (
          <div className="p-6 text-center text-xs" style={{ color: 'var(--color-dim)' }}>
            No voyages yet for this ship.
          </div>
        )}

        {!listLoading && !listError && visibleVoyages.length === 0 && voyages.length > 0 && (
          <div className="p-6 text-center text-xs" style={{ color: 'var(--color-dim)' }}>
            No voyages match this filter.
          </div>
        )}

        {visibleVoyages.map((entry) => (
          <TreeNode key={entry.filename} entry={entry} />
        ))}
      </div>

      <div
        className="shrink-0 px-3 py-2 border-t text-[0.6rem] font-mono flex items-center justify-between"
        style={{ borderColor: 'var(--color-border-subtle)', color: 'var(--color-faint)' }}
      >
        <span>
          {visibleVoyages.length === voyages.length
            ? `${voyages.length} voyage${voyages.length === 1 ? '' : 's'}`
            : `${visibleVoyages.length} of ${voyages.length} voyage${voyages.length === 1 ? '' : 's'}`}
        </span>
        <span>{shipId}/</span>
      </div>
    </div>
  );
}
