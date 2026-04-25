// @ts-nocheck
// EmptyState — shown in the detail pane when nothing is selected.

import { Anchor, FileText } from '../Icons';

export function EmptyState({ ship }) {
  return (
    <div className="empty-state">
      <div className="empty-state-mark" aria-hidden="true">
        <Anchor className="w-8 h-8" />
      </div>
      <div className="section-kicker">Voyage tree ready</div>
      <h2>Pick a voyage to begin</h2>
      <p>
        Select a voyage, leg, departure report, arrival report, or voyage report from the tree.
        {ship ? ' Current ship: ' + ship.displayName + ' (' + ship.code + ').' : ''}
      </p>
      <div className="empty-state-hint">
        <FileText className="w-4 h-4" />
        <span>View Only is safe for inspection. Enable Edit when you need to write changes to the ship folder.</span>
      </div>
    </div>
  );
}
