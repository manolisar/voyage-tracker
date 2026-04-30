// Sub-components for the three landing steps. Kept together because they
// share the same compact visual treatment and constant set; splitting one
// per file added churn without clarity.

import { EDITOR_ROLE_LABELS, type EditorRole } from '../../../domain/constants';
import type { Ship } from '../../../types/domain';
import {
  STEP_SHIP, STEP_IDENTIFY, STEP_FOLDER,
  isEditorRole,
  type Step, type FolderState, type FolderBusy,
} from './types';

export function StepBadge({ step }: { step: Step }) {
  const label = step === STEP_SHIP ? '1 / 3  Ship'
              : step === STEP_IDENTIFY ? '2 / 3  Identify'
              : '3 / 3  Folder';
  return (
    <span
      className="text-[0.6rem] font-bold tracking-[1.2px] uppercase px-2 py-1 rounded-md"
      style={{ background: 'var(--color-surface2)', color: 'var(--color-dim)' }}
    >
      {label}
    </span>
  );
}

export function UnsupportedBrowserNotice() {
  return (
    <div className="p-4 rounded-lg text-sm"
      style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-fg)' }}>
      <strong className="block mb-1">This browser can't open local folders.</strong>
      Voyage Tracker needs the File System Access API, which is only available
      in Chromium-based browsers (Chrome, Edge, Brave). Please open this page in
      one of those.
    </div>
  );
}

interface ShipPickerStepProps {
  ships: Ship[];
  shipsError: string | null;
  shipId: string | null;
  onPick: (id: string) => void;
}

export function ShipPickerStep({ ships, shipsError, shipId, onPick }: ShipPickerStepProps) {
  if (shipsError) {
    return (
      <div role="alert" className="p-3 rounded-lg text-sm"
        style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-fg)' }}>
        {shipsError}
      </div>
    );
  }
  if (ships.length === 0) {
    return <div className="text-sm" style={{ color: 'var(--color-dim)' }}>Loading ships…</div>;
  }
  return (
    <>
      <p className="text-xs mb-3" style={{ color: 'var(--color-dim)' }}>
        Select the ship data folder you're working with.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {ships.map((s) => {
          const selected = s.id === shipId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s.id)}
              className="text-left rounded-xl p-3.5 transition"
              style={{
                background: selected ? 'var(--color-ocean-500)' : 'var(--color-surface)',
                color: selected ? 'white' : 'var(--color-text)',
                border: `1px solid ${selected ? 'var(--color-ocean-500)' : 'var(--color-border-subtle)'}`,
                boxShadow: selected ? '0 4px 12px rgba(6, 182, 212, 0.25)' : 'none',
              }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold"
                  style={{
                    background: selected ? 'rgba(255,255,255,0.18)' : 'var(--color-surface2)',
                    color: selected ? 'white' : 'var(--color-text)',
                  }}
                >
                  {s.code}
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{s.displayName}</div>
                  <div className="text-[0.7rem] opacity-80">Built {s.yearBuilt}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

interface IdentifyStepProps {
  selectedShip: Ship | null;
  userName: string;
  role: EditorRole;
  onUserName: (name: string) => void;
  onRole: (role: EditorRole) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function IdentifyStep({
  selectedShip, userName, role, onUserName, onRole, onBack, onContinue,
}: IdentifyStepProps) {
  const canContinue = userName.trim().length > 0 && isEditorRole(role);
  return (
    <>
      <div className="mb-4 p-3 rounded-lg flex items-center gap-3"
        style={{ background: 'var(--color-surface2)' }}>
        <span className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold"
          style={{ background: 'var(--color-ocean-500)', color: 'white' }}>
          {selectedShip?.code || '—'}
        </span>
        <div className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
          {selectedShip?.displayName || 'Ship'}
        </div>
      </div>

      <label className="form-label" htmlFor="landing-name">Your name</label>
      <input
        id="landing-name"
        type="text"
        className="form-input mb-4"
        autoComplete="name"
        autoFocus
        placeholder="e.g. M. Archontakis"
        value={userName}
        onChange={(e) => onUserName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && canContinue) onContinue(); }}
      />

      <label className="form-label" htmlFor="landing-role">Role</label>
      <select
        id="landing-role"
        className="form-input mb-6"
        value={role}
        onChange={(e) => {
          const v = e.target.value;
          if (isEditorRole(v)) onRole(v);
        }}
      >
        {Object.entries(EDITOR_ROLE_LABELS).map(([k, label]) => (
          <option key={k} value={k}>{label}</option>
        ))}
      </select>

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="btn-flat flex-1 py-3 rounded-xl text-sm">
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className="btn-primary flex-1 py-3 rounded-xl text-sm"
        >
          Continue
        </button>
      </div>

      <p className="mt-4 text-[0.68rem]" style={{ color: 'var(--color-faint)' }}>
        Your name and role are stamped on each save as <code>loggedBy</code> — they are
        not a login and have no privileges attached.
      </p>
    </>
  );
}

interface FolderStepProps {
  selectedShip: Ship | null;
  state: FolderState;
  busy: FolderBusy;
  onPick: () => void;
  onReconnect: () => void;
  onBack: () => void;
  onEnter: () => void;
  canEnter: boolean;
  submitting: boolean;
  userName: string;
  role: EditorRole;
}

export function FolderStep({
  selectedShip, state, busy, onPick, onReconnect, onBack, onEnter,
  canEnter, submitting, userName, role,
}: FolderStepProps) {
  return (
    <>
      <div className="mb-4 p-3 rounded-lg flex items-center gap-3"
        style={{ background: 'var(--color-surface2)' }}>
        <span className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold"
          style={{ background: 'var(--color-ocean-500)', color: 'white' }}>
          {selectedShip?.code || '—'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold truncate" style={{ color: 'var(--color-text)' }}>
            {selectedShip?.displayName || 'Ship'}
          </div>
          <div className="text-[0.7rem]" style={{ color: 'var(--color-dim)' }}>
            Logged in as <strong style={{ color: 'var(--color-text)' }}>{userName || '—'}</strong>
            {' · '}
            {EDITOR_ROLE_LABELS[role] || role}
          </div>
        </div>
      </div>

      <FolderStatusView
        state={state}
        busy={busy}
        shipName={selectedShip?.displayName}
        onPick={onPick}
        onReconnect={onReconnect}
      />

      <div className="flex gap-3 mt-6">
        <button type="button" onClick={onBack} className="btn-flat flex-1 py-3 rounded-xl text-sm">
          Back
        </button>
        <button
          type="button"
          onClick={onEnter}
          disabled={!canEnter || submitting}
          className="btn-primary flex-1 py-3 rounded-xl text-sm"
        >
          {submitting ? 'Opening…' : 'Enter'}
        </button>
      </div>
    </>
  );
}

interface FolderStatusViewProps {
  state: FolderState;
  busy: FolderBusy;
  shipName: string | undefined;
  onPick: () => void;
  onReconnect: () => void;
}

function FolderStatusView({ state, busy, shipName, onPick, onReconnect }: FolderStatusViewProps) {
  if (state.status === 'checking') {
    return <div className="text-sm" style={{ color: 'var(--color-dim)' }}>Checking folder…</div>;
  }
  if (state.status === 'ready') {
    return (
      <div className="notice success">
        <strong>Folder connected.</strong> Voyage files will read/write here.
        <span className="block text-[0.7rem] mt-1 opacity-80">Use "Change folder" later from Settings to switch.</span>
      </div>
    );
  }
  if (state.status === 'reconnect') {
    return (
      <div>
        <p className="text-sm mb-3" style={{ color: 'var(--color-text)' }}>
          A folder is remembered for <strong>{shipName}</strong>, but the browser needs
          permission to access it after a reload. Click to reconnect.
        </p>
        {state.error && (
          <div role="alert" className="mb-3 p-3 rounded-lg text-sm"
            style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-fg)' }}>
            {state.error}
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReconnect}
            disabled={!!busy}
            className="btn-primary py-2.5 px-4 rounded-xl text-sm"
          >
            {busy === 'reconnect' ? 'Reconnecting…' : 'Reconnect folder'}
          </button>
          <button
            type="button"
            onClick={onPick}
            disabled={!!busy}
            className="btn-flat py-2.5 px-4 rounded-xl text-sm"
          >
            {busy === 'pick' ? 'Opening picker…' : 'Change folder'}
          </button>
        </div>
      </div>
    );
  }
  // status === 'pick'
  return (
    <div>
      <p className="text-sm mb-3" style={{ color: 'var(--color-text)' }}>
        Choose the network folder for <strong>{shipName}</strong> — e.g.
        {' '}<code style={{ color: 'var(--color-dim)' }}>Z:\voyage-tracker\{shipName?.split(' ').pop()?.toLowerCase() || 'ship'}\</code>.
        <span className="block text-[0.7rem] mt-1" style={{ color: 'var(--color-dim)' }}>
          The browser will remember this folder next time.
        </span>
      </p>
      {state.error && (
        <div role="alert" className="mb-3 p-3 rounded-lg text-sm"
          style={{ background: 'var(--color-error-bg)', color: 'var(--color-error-fg)' }}>
          {state.error}
        </div>
      )}
      <button
        type="button"
        onClick={onPick}
        disabled={!!busy}
        className="btn-primary py-2.5 px-4 rounded-xl text-sm"
      >
        {busy === 'pick' ? 'Opening picker…' : 'Choose folder…'}
      </button>
    </div>
  );
}
