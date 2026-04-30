// HelpModal — officer-facing quick reference. Opened from the TopBar "?"
// button. Workflow-focused, terse; not a feature reference. Each <details>
// section is independent so readers can scan headings and expand only what
// they need.

import { useRef, type ReactNode } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { HelpCircle, X } from '../Icons';

interface Props {
  onClose: () => void;
}

export function HelpModal({ onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, { onEscape: onClose });

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="modal-content w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <div className="modal-head flex items-center justify-between">
          <h2 id="help-title" className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5" style={{ color: 'var(--color-ocean-500)' }} />
            Help &amp; quick reference
          </h2>
          <button
            type="button"
            className="p-1 rounded hover:bg-black/10"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-2 max-h-[70vh] overflow-y-auto">
          <div
            className="rounded-lg p-3 mb-2 text-[0.78rem] leading-relaxed"
            style={{
              background: 'var(--color-surface2)',
              border: '1px solid var(--color-border-subtle)',
              color: 'var(--color-text)',
            }}
          >
            <strong>How it works in one paragraph.</strong>{' '}
            <span style={{ color: 'var(--color-dim)' }}>
              Every marine officer with access (engineers and bridge) reads
              and writes the <strong>same shared network folder</strong> — one
              JSON file per voyage, directly on the drive. There is no server
              and no database in between. Your edits appear on everyone else's
              screen after they refresh, and theirs on yours. Every save
              stamps who did it and when.
            </span>
          </div>

          <HelpSection title="First time on this PC">
            <p>
              You'll be asked to pick the <strong>shared</strong> ship folder
              on the network drive (e.g.{' '}
              <code>Z:\voyage-tracker\solstice\</code>). That's the same folder
              every marine officer with access points at — all voyage files
              live there. The browser remembers your choice; next launches
              reconnect silently. If permission was revoked, a "Reconnect
              folder" button appears on the landing screen.
            </p>
            <p>
              The folder choice is stored per PC + browser profile. A new PC, a
              different browser, or Incognito means picking the folder again.
            </p>
          </HelpSection>

          <HelpSection title="Edit Mode vs View Only">
            <p>
              The app opens in <strong>View Only</strong> so a passing click can't
              change data. Press <strong>Enable Edit Mode</strong> in the top bar
              to make changes; press <strong>Exit Edit</strong> when you're done.
            </p>
            <p>
              There is no PIN. The Windows lock screen is the real access control —
              Edit Mode only prevents accidents.
            </p>
          </HelpSection>

          <HelpSection title="Who fills in what">
            <p>Convention (not enforced — anyone can edit any field):</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>2nd Engineer (ECR)</strong> — creates voyages, Departure and Arrival fuel data.</li>
              <li><strong>Bridge Officer of Watch</strong> — per-leg Nav Report (times, distance, speed).</li>
              <li><strong>Chief Engineer</strong> — amends anything, closes voyages (End Voyage + lub-oil).</li>
            </ul>
            <p>
              Every save stamps <code>loggedBy</code> with your name, role, and
              timestamp. That's the audit trail.
            </p>
          </HelpSection>

          <HelpSection title="Creating a voyage">
            <p>
              <strong>+ New Voyage</strong> in the top bar (Edit Mode). Enter
              embarkation and disembarkation ports — the autocomplete uses
              3-letter UN/LOCODE suffixes (MIA, FLL, NAS…).
            </p>
            <p>
              If a port isn't in the catalog, type the 3-letter code and the app
              will ask for name + country once, then remember it for this ship.
            </p>
          </HelpSection>

          <HelpSection title="Adding a leg">
            <p>
              Select a voyage → <strong>+ Add Leg</strong>. The "from" port
              defaults to the previous leg's arrival port. Tick{' '}
              <em>Carry over last counters</em> to copy the previous arrival's
              end values into this leg's departure start values.
            </p>
            <p>
              The floating <strong>⇪ Carry over</strong> button appears after you
              finish a phase — use it to push end-of-phase values into the next
              phase manually, with per-equipment tickboxes.
            </p>
          </HelpSection>

          <HelpSection title="Ending a voyage">
            <p>
              <strong>⚑ End Voyage</strong> on the voyage detail. Enter lub-oil
              (ME cons, 13S-14S, Used LO13C) — these are recorded <em>only</em>{' '}
              here, not per-report. Set engineer, end date, and any notes.
            </p>
            <p>
              Ending doesn't lock the voyage — Chief can still amend afterwards.
              Ended voyages move to the "Ended" tab in the tree.
            </p>
          </HelpSection>

          <HelpSection title="“Someone else edited this file”">
            <p>
              If the file on disk changed while you were editing it, you'll see a
              three-option dialog:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Reload from disk</strong> — discard your edits, re-fetch what the other person saved.</li>
              <li><strong>Overwrite anyway</strong> — proceed with your save. The other person's changes are lost.</li>
              <li><strong>Cancel</strong> — keep editing; the save stays scheduled and you can retry.</li>
            </ul>
            <p>
              This only triggers on overlap. In practice, the three roles usually
              touch different fields, so it's rare.
            </p>
          </HelpSection>

          <HelpSection title="If the network drive is unreachable">
            <p>
              Saves that can't reach the share are cached in the browser and
              flushed automatically the next time you connect. You can keep
              editing — nothing is lost.
            </p>
            <p>
              If the folder picker keeps failing after a share reconnect, use
              <strong> Settings → Change data folder</strong> to re-pick.
            </p>
          </HelpSection>

          <HelpSection title="Where the data lives">
            <p>
              Voyages are plain JSON files in the ship's <strong>shared</strong>{' '}
              network folder — the same one every marine officer with access
              opens. No cloud, no database, no server. Access is controlled by
              the Windows / network-share permissions: if you can open the
              folder in File Explorer, you can edit the data. Ship IT is
              responsible for backing up the share.
            </p>
            <p>
              The browser only stores: the folder pointer, your name/role, any
              offline-cached saves, and custom port entries. Clearing site data
              wipes these — you'll re-pick the folder, but the voyage files on
              the share are untouched.
            </p>
          </HelpSection>

          <HelpSection title="Keyboard shortcuts">
            <ul className="list-disc pl-5 space-y-1">
              <li><kbd>/</kbd> — focus the voyage search</li>
              <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>B</kbd> — toggle sidebar</li>
              <li><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> in the tree — navigate/expand</li>
              <li><kbd>Home</kbd> / <kbd>End</kbd> — first/last tree row</li>
              <li><kbd>Esc</kbd> — close the active modal</li>
            </ul>
          </HelpSection>
        </div>
      </div>
    </div>
  );
}

function HelpSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details
      className="rounded-lg border group"
      style={{
        borderColor: 'var(--color-border-subtle)',
        background: 'var(--color-surface2)',
      }}
    >
      <summary
        className="px-3 py-2 text-[0.82rem] font-semibold cursor-pointer select-none list-none flex items-center justify-between"
        style={{ color: 'var(--color-text)' }}
      >
        {title}
        <span
          className="text-[0.7rem] font-mono opacity-60 group-open:rotate-90 transition-transform"
          aria-hidden="true"
        >
          ▸
        </span>
      </summary>
      <div
        className="px-3 pb-3 pt-1 text-[0.78rem] leading-relaxed space-y-2"
        style={{ color: 'var(--color-dim)' }}
      >
        {children}
      </div>
    </details>
  );
}
