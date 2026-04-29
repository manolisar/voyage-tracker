// TreeNode — recursive node renderer.
// Hierarchy:
//   Voyage (anchor) ▸
//     ├ Voyage Detail (▤)
//     ├ Leg 1 (⇆)
//     ├ Leg 2 …
//     └ Voyage End (⚑)        — only when voyage.voyageEnd is set

import { memo, useCallback, useMemo, type MouseEvent } from 'react';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { getDefaultLegReportKind, isLegReportKind } from '../../domain/legReportNavigation';
import { sortLegsByDate, voyageRouteLabel } from '../../domain/factories';
import type {
  Leg,
  Selection,
  Voyage,
  VoyageManifestEntry,
} from '../../types/domain';

const BORDER_SUBTLE_STYLE = { borderColor: 'var(--color-border-subtle)' };
const END_BADGE_STYLE = { background: 'var(--color-surface2)', color: 'var(--color-dim)' };
const LOADING_STYLE = { color: 'var(--color-faint)', cursor: 'default' as const };
const LEG_NUM_STYLE = { color: 'var(--color-faint)' };
const VOYAGE_DETAIL_SELECTED_STYLE = { background: 'rgba(6,182,212,0.10)' };
const VOYAGE_DETAIL_UNSELECTED_STYLE = { background: 'transparent' };

function chev(open: boolean) {
  return <span className="tree-chev">{open ? '▾' : '▸'}</span>;
}

function spacer() {
  return <span className="tree-chev" />;
}

type SelectFn = (sel: Selection | null) => Promise<void>;
type ToggleFn = (key: string) => void;

interface TreeNodeProps {
  entry: VoyageManifestEntry;
}

export function TreeNode({ entry }: TreeNodeProps) {
  const { expanded, toggleExpand, selected, select, loadedById, loadVoyage } = useVoyageStore();
  const filename = entry.filename;
  const open = expanded.has(filename);
  const v = loadedById[filename];

  const isVoyageSelected = selected?.kind === 'voyage' && selected?.filename === filename;
  const isEndSelected = selected?.kind === 'voyageEnd' && selected?.filename === filename;
  const selLegId = selected?.filename === filename ? (selected.legId || null) : null;
  const selKind = selected?.filename === filename ? (selected.kind || null) : null;

  const onToggle = useCallback(
    (e: MouseEvent<HTMLSpanElement>) => {
      e.stopPropagation();
      toggleExpand(filename);
      if (!v) loadVoyage(filename);
    },
    [toggleExpand, loadVoyage, filename, v],
  );

  const onSelectVoyage = useCallback(() => {
    select({ filename, kind: 'voyage' });
  }, [select, filename]);

  return (
    <div role="treeitem" aria-expanded={open}>
      <button
        type="button"
        className={`tree-node ${isVoyageSelected ? 'selected' : ''}`}
        onClick={onSelectVoyage}
      >
        <span onClick={onToggle} role="button" aria-label={open ? 'Collapse' : 'Expand'}>
          {chev(open)}
        </span>
        <span className="tree-icon">⚓</span>
        <span className="flex-1 truncate">{voyageRouteLabel(entry)}</span>
        {entry.ended && (
          <span
            className="text-[0.55rem] font-bold px-1.5 py-0.5 rounded"
            style={END_BADGE_STYLE}
            title="Voyage ended"
          >
            END
          </span>
        )}
      </button>

      {open && (
        <div className="ml-4 pl-2 border-l" style={BORDER_SUBTLE_STYLE}>
          {!v ? (
            <div className="tree-node" style={LOADING_STYLE}>
              {spacer()}
              <span className="tree-icon">…</span>
              <span className="truncate italic">Loading…</span>
            </div>
          ) : (
            <VoyageChildren
              filename={filename}
              voyage={v}
              isDetailSelected={isVoyageSelected}
              isEndSelected={isEndSelected}
              selLegId={selLegId}
              selKind={selKind}
              select={select}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface VoyageChildrenProps {
  filename: string;
  voyage: Voyage;
  isDetailSelected: boolean;
  isEndSelected: boolean;
  selLegId: number | null;
  selKind: Selection['kind'] | null;
  select: SelectFn;
}

function voyageChildrenEqual(prev: VoyageChildrenProps, next: VoyageChildrenProps): boolean {
  if (prev.filename !== next.filename) return false;
  if (prev.voyage !== next.voyage) return false;
  if (prev.isDetailSelected !== next.isDetailSelected) return false;
  if (prev.isEndSelected !== next.isEndSelected) return false;
  if (prev.selLegId !== next.selLegId) return false;
  if (prev.selKind !== next.selKind) return false;
  if (prev.select !== next.select) return false;
  return true;
}

const VoyageChildren = memo(function VoyageChildren({
  filename, voyage,
  isDetailSelected, isEndSelected,
  selLegId, selKind,
  select,
}: VoyageChildrenProps) {
  const onSelectDetail = useCallback(() => {
    select({ filename, kind: 'voyage' });
  }, [select, filename]);
  const onSelectEnd = useCallback(() => {
    select({ filename, kind: 'voyageEnd' });
  }, [select, filename]);

  // Render legs in chronological order. The on-disk array stays in insertion
  // order; this is purely a display sort so the L1/L2/L3 numbering matches
  // departure date even when legs were added out of order.
  const sortedLegs = useMemo(() => sortLegsByDate(voyage.legs), [voyage.legs]);

  return (
    <>
      {/* Voyage Detail */}
      <button
        type="button"
        className="tree-node"
        onClick={onSelectDetail}
        style={isDetailSelected ? VOYAGE_DETAIL_SELECTED_STYLE : VOYAGE_DETAIL_UNSELECTED_STYLE}
      >
        {spacer()}
        <span className="tree-icon">▤</span>
        <span className="truncate">Voyage Detail</span>
      </button>

      {/* Legs */}
      {sortedLegs.map((leg, idx) => {
        const isLegSelected = selLegId === leg.id && (selKind === 'leg' || isLegReportKind(selKind));
        return (
          <LegNode
            key={leg.id}
            filename={filename}
            leg={leg}
            index={idx}
            isLegSelected={isLegSelected}
            select={select}
          />
        );
      })}

      {/* Voyage End */}
      {voyage.voyageEnd && (
        <button
          type="button"
          className={`tree-node ${isEndSelected ? 'selected' : ''}`}
          onClick={onSelectEnd}
        >
          {spacer()}
          <span className="tree-icon">⚑</span>
          <span className="truncate">Voyage End</span>
        </button>
      )}
    </>
  );
}, voyageChildrenEqual);

interface LegNodeProps {
  filename: string;
  leg: Leg;
  index: number;
  isLegSelected: boolean;
  select: SelectFn;
}

const LegNode = memo(function LegNode({
  filename, leg, index,
  isLegSelected,
  select,
}: LegNodeProps) {
  const depPort = leg.departure?.port?.split(',')[0]?.trim() || 'Dep';
  const arrPort = leg.arrival?.port?.split(',')[0]?.trim() || 'Arr';

  const onRowClick = useCallback(() => {
    select({ filename, kind: getDefaultLegReportKind(leg), legId: leg.id });
  }, [select, filename, leg]);

  return (
    <div role="treeitem">
      <button
        type="button"
        className={`tree-node ${isLegSelected ? 'selected' : ''}`}
        onClick={onRowClick}
      >
        {spacer()}
        <span className="tree-icon">⇆</span>
        <span className="flex-1 truncate">
          <span className="font-mono text-[0.7rem]" style={LEG_NUM_STYLE}>L{index + 1}</span>{' '}
          {depPort} → {arrPort}
        </span>
      </button>
    </div>
  );
});
