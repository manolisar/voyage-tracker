// TreeToolbar — search box + filter pills + refresh button.
// Sits at the top of the sidebar, above the tree itself.

import { useVoyageStore } from '../../hooks/useVoyageStore';
import { Refresh, Search } from '../Icons';
import type { FilterMode } from '../../contexts/voyageStore.helpers';

interface FilterOption {
  id: FilterMode;
  label: string;
}

const FILTERS: FilterOption[] = [
  { id: 'active', label: 'Active' },
  { id: 'ended', label: 'Ended' },
  { id: 'all', label: 'All' },
];

export function TreeToolbar() {
  const {
    search, setSearch, filter, setFilter, refreshList, listLoading,
    expandAll, collapseAll,
  } = useVoyageStore();

  return (
    <div
      className="px-3 py-3 border-b shrink-0"
      style={{ borderColor: 'var(--color-border-subtle)', background: 'var(--color-surface)' }}
    >
      <div className="relative mb-2">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-faint)' }} />
        <input
          id="tree-search"
          type="text"
          placeholder="Search voyages…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="form-input text-xs !pl-7 !pr-2 !py-1.5"
          aria-label="Search voyages"
        />
      </div>
      <div className="flex items-center gap-1">
        <div
          role="tablist"
          aria-label="Voyage filter"
          className="flex rounded-lg p-0.5 text-[0.65rem] font-bold"
          style={{ background: 'var(--color-surface2)' }}
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f.id)}
                className="px-2 py-1 rounded-md transition-colors"
                style={{
                  background: active ? 'var(--color-surface)' : 'transparent',
                  color: active ? 'var(--color-text)' : 'var(--color-dim)',
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {f.label.toUpperCase()}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={expandAll}
            className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-[0.9rem] leading-none"
            aria-label="Expand all voyages"
            title="Expand all"
            style={{ color: 'var(--color-dim)' }}
          >
            ⊞
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-[0.9rem] leading-none"
            aria-label="Collapse all voyages"
            title="Collapse all"
            style={{ color: 'var(--color-dim)' }}
          >
            ⊟
          </button>
          <button
            type="button"
            onClick={refreshList}
            disabled={listLoading}
            className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
            aria-label="Refresh voyage list"
            title="Refresh"
          >
            <Refresh className={`w-3.5 h-3.5 ${listLoading ? 'animate-spin' : ''}`} style={{ color: 'var(--color-dim)' }} />
          </button>
        </div>
      </div>
    </div>
  );
}
