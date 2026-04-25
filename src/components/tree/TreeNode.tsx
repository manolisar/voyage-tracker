// @ts-nocheck
// TreeNode — recursive node renderer.
// Hierarchy:
//   Voyage (anchor) ▸
//     ├ Voyage Detail (▤)
//     ├ Leg 1 (⇆) ▸
//     │   ├ Departure (↗)
//     │   ├ Arrival (↘)
//     │   └ Voyage Report (⎈)  — only on legs that have one
//     ├ Leg 2 …
//     └ Voyage End (⚑)        — only when voyage.voyageEnd is set

import { memo, useCallback } from 'react';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import { voyageRouteLabel } from '../../domain/factories';

const BORDER_SUBTLE_STYLE = { borderColor: 'var(--color-border-subtle)' };
const END_BADGE_STYLE = { background: 'var(--color-surface2)', color: 'var(--color-dim)' };
const LOADING_STYLE = { color: 'var(--color-faint)', cursor: 'default' };
const LEG_NUM_STYLE = { color: 'var(--color-faint)' };
const VOYAGE_DETAIL_SELECTED_STYLE = { background: 'rgba(6,182,212,0.10)' };
const VOYAGE_DETAIL_UNSELECTED_STYLE = { background: 'transparent' };

function chev(open) {
  return <span className="tree-chev">{open ? '▾' : '▸'}</span>;
}

function spacer() {
  return <span className="tree-chev" />;
}

export function TreeNode({ entry }) {
  const { expanded, toggleExpand, selected, select, loadedById, loadVoyage } = useVoyageStore();
  const filename = entry.filename;
  const open = expanded.has(filename);
  const v = loadedById[filename];

  const isVoyageSelected = selected?.kind === 'voyage' && selected?.filename === filename;
  const isEndSelected    = selected?.kind === 'voyageEnd' && selected?.filename === filename;
  const selLegId = selected?.filename === filename ? (selected.legId || null) : null;
  const selKind  = selected?.filename === filename ? (selected.kind  || null) : null;

  const onToggle = useCallback((e) => {
    e.stopPropagation();
    toggleExpand(filename);
    if (!v) loadVoyage(filename);
  }, [toggleExpand, loadVoyage, filename, v]);

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
              expanded={expanded}
              isDetailSelected={isVoyageSelected}
              isEndSelected={isEndSelected}
              selLegId={selLegId}
              selKind={selKind}
              select={select}
              toggleExpand={toggleExpand}
            />
          )}
        </div>
      )}
    </div>
  );
}

function voyageChildrenEqual(prev, next) {
  if (prev.filename         !== next.filename)         return false;
  if (prev.voyage           !== next.voyage)           return false;
  if (prev.isDetailSelected !== next.isDetailSelected) return false;
  if (prev.isEndSelected    !== next.isEndSelected)    return false;
  if (prev.selLegId         !== next.selLegId)         return false;
  if (prev.selKind          !== next.selKind)          return false;
  if (prev.select           !== next.select)           return false;
  if (prev.toggleExpand     !== next.toggleExpand)     return false;
  // `expanded` is a Set whose identity changes on every expand anywhere in the
  // tree. Only treat it as a change if a key relevant to THIS voyage's legs
  // differs — that way unrelated expansions don't re-render this subtree.
  const legs = next.voyage?.legs || [];
  for (const leg of legs) {
    const key = `${next.filename}::${leg.id}`;
    if (prev.expanded.has(key) !== next.expanded.has(key)) return false;
  }
  return true;
}

const VoyageChildren = memo(function VoyageChildren({
  filename, voyage, expanded,
  isDetailSelected, isEndSelected,
  selLegId, selKind,
  select, toggleExpand,
}) {
  const onSelectDetail = useCallback(() => {
    select({ filename, kind: 'voyage' });
  }, [select, filename]);
  const onSelectEnd = useCallback(() => {
    select({ filename, kind: 'voyageEnd' });
  }, [select, filename]);

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
      {voyage.legs?.map((leg, idx) => {
        const key = `${filename}::${leg.id}`;
        const isOpen = expanded.has(key);
        const isLegSelected = selLegId === leg.id && selKind === 'leg';
        const selectedReportKind = selLegId === leg.id ? selKind : null;
        return (
          <LegNode
            key={leg.id}
            filename={filename}
            leg={leg}
            index={idx}
            isOpen={isOpen}
            isLegSelected={isLegSelected}
            selectedReportKind={selectedReportKind}
            select={select}
            toggleExpand={toggleExpand}
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

const LegNode = memo(function LegNode({
  filename, leg, index,
  isOpen, isLegSelected, selectedReportKind,
  select, toggleExpand,
}) {
  const legKey = `${filename}::${leg.id}`;
  const depPort = leg.departure?.port?.split(',')[0]?.trim() || 'Dep';
  const arrPort = leg.arrival?.port?.split(',')[0]?.trim()   || 'Arr';

  const onToggle = useCallback((e) => {
    e.stopPropagation();
    toggleExpand(legKey);
  }, [toggleExpand, legKey]);

  const onRowClick = useCallback(() => {
    select({ filename, kind: 'leg', legId: leg.id });
    if (!isOpen) toggleExpand(legKey);
  }, [select, filename, leg.id, isOpen, toggleExpand, legKey]);

  return (
    <div role="treeitem" aria-expanded={isOpen}>
      <button
        type="button"
        className={`tree-node ${isLegSelected ? 'selected' : ''}`}
        onClick={onRowClick}
      >
        <span onClick={onToggle} role="button" aria-label={isOpen ? 'Collapse' : 'Expand'}>
          {chev(isOpen)}
        </span>
        <span className="tree-icon">⇆</span>
        <span className="flex-1 truncate">
          <span className="font-mono text-[0.7rem]" style={LEG_NUM_STYLE}>L{index + 1}</span>{' '}
          {depPort} → {arrPort}
        </span>
      </button>

      {isOpen && (
        <div className="ml-4 pl-2 border-l" style={BORDER_SUBTLE_STYLE}>
          <ReportChild
            filename={filename}
            legId={leg.id}
            kind="departure"
            label="Departure"
            icon="↗"
            isSelected={selectedReportKind === 'departure'}
            select={select}
          />
          <ReportChild
            filename={filename}
            legId={leg.id}
            kind="arrival"
            label="Arrival"
            icon="↘"
            isSelected={selectedReportKind === 'arrival'}
            select={select}
          />
          <ReportChild
            filename={filename}
            legId={leg.id}
            kind="voyageReport"
            label="Voyage Report"
            icon="⎈"
            isSelected={selectedReportKind === 'voyageReport'}
            select={select}
          />
        </div>
      )}
    </div>
  );
});

const ReportChild = memo(function ReportChild({
  filename, legId, kind, label, icon, isSelected, select,
}) {
  const onClick = useCallback(() => {
    select({ filename, kind, legId });
  }, [select, filename, kind, legId]);
  return (
    <button
      type="button"
      className={`tree-node ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      {spacer()}
      <span className="tree-icon">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
});
