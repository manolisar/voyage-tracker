// ReconciliationPanel — counter-vs-sounding mass balance for one cruise,
// carried across from the previous ended cruise's finishing ROB. Loads the
// previous voyage on demand (one file read) and the per-ship tolerances, then
// renders the auditable breakdown. Display-only (identical in View/Edit).

import { useEffect, useState } from 'react';
import {
  calcReconciliation,
  resolveReconcileTolerances,
  DEFAULT_RECONCILE_TOLERANCES,
  type ReconRow,
} from '../../domain/calculations';
import { findPreviousEndedVoyageBefore } from '../../contexts/voyageStore.helpers';
import { useVoyageStore } from '../../hooks/useVoyageStore';
import type { ReconcileTolerances, ShipClass, Voyage } from '../../types/domain';

const FUEL_TEXT: Record<string, string> = {
  hfo: 'var(--color-hfo)',
  mgo: 'var(--color-mgo)',
  lsfo: 'var(--color-lsfo)',
  water: 'var(--color-water)',
  naoh: 'var(--color-chem)',
};

function fmt(n: number | null, dp: number): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function signed(n: number | null, dp: number): string {
  if (n == null) return '—';
  const s = fmt(Math.abs(n), dp);
  return n < 0 ? `−${s}` : `+${s}`;
}

interface Props {
  voyage: Voyage;
  shipClass: ShipClass;
}

export function ReconciliationPanel({ voyage, shipClass }: Props) {
  const { voyages, loadVoyage, shipSettings } = useVoyageStore();
  const [prev, setPrev] = useState<Voyage | null>(null);
  const [tol, setTol] = useState<ReconcileTolerances>(DEFAULT_RECONCILE_TOLERANCES);
  const [state, setState] = useState<'loading' | 'ready' | 'none'>('loading');

  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive) setState('loading');
      const tolv = resolveReconcileTolerances(shipSettings?.reconcileTolerances);
      const prevEntry = findPreviousEndedVoyageBefore(voyages, {
        filename: voyage.filename,
        startDate: voyage.startDate,
      });
      if (!prevEntry) {
        if (alive) { setTol(tolv); setPrev(null); setState('none'); }
        return;
      }
      try {
        const pv = await loadVoyage(prevEntry.filename);
        if (!alive) return;
        setTol(tolv);
        setPrev(pv ?? null);
        setState(pv ? 'ready' : 'none');
      } catch {
        if (alive) { setTol(tolv); setState('none'); }
      }
    })();
    return () => { alive = false; };
  }, [voyage.filename, voyage.startDate, voyages, shipSettings, loadVoyage]);

  if (state === 'loading') {
    return (
      <div className="cat-card fuel">
        <div className="cat-label">Counter vs Sounding</div>
        <div className="cat-body">
          <p className="text-[0.78rem]" style={{ color: 'var(--color-dim)' }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (state === 'none' || !prev) {
    return (
      <div className="cat-card fuel">
        <div className="cat-label">Counter vs Sounding</div>
        <div className="cat-body">
          <p className="text-[0.78rem]" style={{ color: 'var(--color-dim)' }}>
            No prior cruise to reconcile against.
          </p>
        </div>
      </div>
    );
  }

  const recon = calcReconciliation(voyage, prev, shipClass, tol);
  const dp = (row: ReconRow) => (row.key === 'water' || row.key === 'naoh' ? 1 : 2);

  return (
    <div className="cat-card fuel md:col-span-3">
      <div className="cat-label">
        Counter vs Sounding
        <span className="ml-auto font-mono text-[0.65rem] font-semibold" style={{ color: 'var(--color-dim)' }}>
          vs previous cruise finish
        </span>
      </div>
      <div className="cat-body">
        <table className="w-full font-mono text-[0.8rem]">
          <thead>
            <tr style={{ color: 'var(--color-dim)' }}>
              <th scope="col" className="text-left font-semibold py-1" />
              <th scope="col" className="text-right font-semibold py-1 px-2">Prev ROB</th>
              <th scope="col" className="text-right font-semibold py-1 px-2">+Bunker</th>
              <th scope="col" className="text-right font-semibold py-1 px-2">+Prod</th>
              <th scope="col" className="text-right font-semibold py-1 px-2">−Cons</th>
              <th scope="col" className="text-right font-semibold py-1 px-2">Expected</th>
              <th scope="col" className="text-right font-semibold py-1 px-2">Measured</th>
              <th scope="col" className="text-right font-semibold py-1 px-2">Offset</th>
            </tr>
          </thead>
          <tbody>
            {recon.rows.map((row) => {
              const d = dp(row);
              const offsetColor = row.offset == null
                ? 'var(--color-faint)'
                : row.withinTolerance ? 'var(--color-faint)' : 'var(--color-warn-fg)';
              return (
                <tr key={row.key} style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                  <th scope="row" className="text-left py-1 font-bold" style={{ color: FUEL_TEXT[row.key] }}>
                    {row.label}{row.unit ? ` (${row.unit})` : ''}
                  </th>
                  <td className="text-right py-1 px-2">{fmt(row.prevRob, d)}</td>
                  <td className="text-right py-1 px-2">{fmt(row.bunker, d)}</td>
                  <td className="text-right py-1 px-2">{row.production == null ? '—' : fmt(row.production, d)}</td>
                  <td className="text-right py-1 px-2">{fmt(row.consumption, d)}</td>
                  <td className="text-right py-1 px-2">{fmt(row.expected, d)}</td>
                  <td className="text-right py-1 px-2">{fmt(row.measured, d)}</td>
                  <td
                    className="text-right py-1 px-2 font-bold"
                    style={{ color: offsetColor }}
                    title={row.offset != null && !row.withinTolerance ? 'Beyond tolerance' : undefined}
                  >
                    {signed(row.offset, d)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
