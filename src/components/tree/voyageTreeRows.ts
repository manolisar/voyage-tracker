import type { Selection, Voyage, VoyageManifestEntry } from '../../types/domain';

export interface FlatTreeRow {
  sel: Selection;
  expandKey: string | null;
  canExpand: boolean;
  parent: Selection | null;
}

export function selectionKey(sel: Selection | null | undefined): string {
  if (!sel) return '';
  return `${sel.filename}|${sel.kind}|${sel.legId || ''}`;
}

export function flattenVoyageTreeRows(
  visibleVoyages: VoyageManifestEntry[],
  expanded: Set<string>,
  loadedById: Record<string, Voyage>,
): FlatTreeRow[] {
  const rows: FlatTreeRow[] = [];
  for (const v of visibleVoyages) {
    const voyageSel: Selection = { filename: v.filename, kind: 'voyage' };
    rows.push({ sel: voyageSel, expandKey: v.filename, canExpand: true, parent: null });
    if (!expanded.has(v.filename)) continue;

    const full = loadedById[v.filename];
    if (!full) continue;

    for (const leg of full.legs || []) {
      rows.push({
        sel: { filename: v.filename, kind: 'leg', legId: leg.id },
        expandKey: null,
        canExpand: false,
        parent: voyageSel,
      });
    }

    if (full.voyageEnd) {
      rows.push({ sel: { filename: v.filename, kind: 'voyageEnd' }, expandKey: null, canExpand: false, parent: voyageSel });
    }
  }
  return rows;
}
