// LandingScreen — no-auth pivot version.
//
// Three-step flow driven by local state:
//   1. Ship    — pick a tile (5 ships).
//   2. Identify — type name + pick role (stamps loggedBy on saves).
//   3. Folder  — pick/confirm the ship's network folder via the File System
//                Access API. Skipped if the browser already has a persisted
//                handle with 'granted' permission for this ship.
//
// On Enter we write the session (IDB-backed via SessionProvider) and the
// AuthGate flips us into AppShell.
//
// If File System Access API isn't available (Firefox, Safari), the screen
// shows a clear compatibility message instead of crashing. The app needs
// a real Chromium-based browser on the ECR PC.
//
// NOTE: No PIN anywhere. The network-share ACL is the access boundary;
// the name+role stamp is purely for attribution.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadShips } from '../../domain/shipClass';
import { EDITOR_ROLES, type EditorRole } from '../../domain/constants';
import { useSession } from '../../hooks/useSession';
import { Anchor } from '../Icons';
import type { Ship } from '../../types/domain';
import {
  STEP_SHIP, STEP_IDENTIFY, STEP_FOLDER,
  isEditorRole,
  type Step,
} from './landing/types';
import { useFolderProbe } from './landing/useFolderProbe';
import {
  StepBadge,
  UnsupportedBrowserNotice,
  ShipPickerStep,
  IdentifyStep,
  FolderStep,
} from './landing/Steps';

export function LandingScreen() {
  const { startSession } = useSession();

  const [ships, setShips] = useState<Ship[]>([]);
  const [shipsError, setShipsError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>(STEP_SHIP);
  const [shipId, setShipId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [role, setRole] = useState<EditorRole>(EDITOR_ROLES.CHIEF);
  const [submitting, setSubmitting] = useState(false);

  const folder = useFolderProbe(step, shipId);

  // Load ship roster once.
  useEffect(() => {
    let alive = true;
    loadShips()
      .then((data) => alive && setShips(data.filter((s) => s.active)))
      .catch((e) => alive && setShipsError(`Failed to load ships: ${(e as Error).message}`));
    return () => {
      alive = false;
    };
  }, []);

  const selectedShip = useMemo(
    () => ships.find((s) => s.id === shipId) || null,
    [ships, shipId],
  );

  const canEnter =
    !!shipId &&
    userName.trim().length > 0 &&
    isEditorRole(role) &&
    folder.state.status === 'ready';

  const handleEnter = useCallback(async () => {
    if (!canEnter || submitting || !shipId) return;
    setSubmitting(true);
    try {
      startSession({ shipId, userName: userName.trim(), role });
    } finally {
      setSubmitting(false);
    }
  }, [canEnter, submitting, shipId, userName, role, startSession]);

  return (
    <div className="landing-bg flex-1 min-h-0 flex items-center justify-center p-6 overflow-auto">
      <div
        className="glass-card w-full max-w-3xl rounded-2xl p-6"
        role="form"
        aria-labelledby="landing-title"
      >
        <header className="flex items-center gap-3 mb-6">
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white"
            style={{ background: 'var(--color-ocean-500)' }}
            aria-hidden="true"
          >
            <Anchor className="w-5 h-5" />
          </span>
          <div className="flex-1">
            <h1 id="landing-title" className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
              Voyage Tracker v8
            </h1>
            <p className="text-xs" style={{ color: 'var(--color-dim)' }}>
              Celebrity Solstice-class · Engine Department
            </p>
          </div>
          <StepBadge step={step} />
        </header>

        {!folder.fsaSupported && <UnsupportedBrowserNotice />}

        {folder.fsaSupported && step === STEP_SHIP && (
          <ShipPickerStep
            ships={ships}
            shipsError={shipsError}
            shipId={shipId}
            onPick={(id) => {
              setShipId(id);
              setStep(STEP_IDENTIFY);
            }}
          />
        )}

        {folder.fsaSupported && step === STEP_IDENTIFY && (
          <IdentifyStep
            selectedShip={selectedShip}
            userName={userName}
            role={role}
            onUserName={setUserName}
            onRole={setRole}
            onBack={() => setStep(STEP_SHIP)}
            onContinue={() => setStep(STEP_FOLDER)}
          />
        )}

        {folder.fsaSupported && step === STEP_FOLDER && (
          <FolderStep
            selectedShip={selectedShip}
            state={folder.state}
            busy={folder.busy}
            onPick={folder.pick}
            onReconnect={folder.reconnect}
            onBack={() => setStep(STEP_IDENTIFY)}
            onEnter={handleEnter}
            canEnter={canEnter}
            submitting={submitting}
            userName={userName.trim()}
            role={role}
          />
        )}

        <p className="mt-6 text-center text-[0.7rem]" style={{ color: 'var(--color-faint)' }}>
          Data stays in the selected ship folder. Access control is the Windows/network share ACL.
        </p>
      </div>
    </div>
  );
}
