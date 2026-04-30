// Folder-probe hook — owns the state machine for the FOLDER step:
//   - on entry, probe what the browser already has for this ship
//     (granted handle / remembered handle that needs reconnect / no handle)
//   - exposes pick + reconnect handlers that update state on success/failure
//
// Extracted so LandingScreen.tsx is purely orchestration. Browser permission
// errors (AbortError vs others) are translated to user-readable copy here.

import { useCallback, useEffect, useState } from 'react';
import {
  isFileSystemAccessSupported,
  hasGrantedHandleForShip,
  hasHandleForShip,
  pickDirectoryForShip,
  getHandleForShip,
} from '../../../storage/local/fsHandle';
import { createLogger } from '../../../util/log';
import type { FolderBusy, FolderState, Step } from './types';
import { STEP_FOLDER } from './types';

const log = createLogger('landing');

interface UseFolderProbe {
  state: FolderState;
  busy: FolderBusy;
  fsaSupported: boolean;
  pick: () => Promise<void>;
  reconnect: () => Promise<void>;
}

export function useFolderProbe(step: Step, shipId: string | null): UseFolderProbe {
  const [state, setState] = useState<FolderState>({ status: 'checking', error: null });
  const [busy, setBusy] = useState<FolderBusy>(null);
  const fsaSupported = isFileSystemAccessSupported();

  // Probe what we've got the moment the user lands on the folder step. The
  // ship id is keyed in IDB; a granted handle skips the picker entirely.
  useEffect(() => {
    if (step !== STEP_FOLDER || !shipId) return;
    let alive = true;
    (async () => {
      setState({ status: 'checking', error: null });
      try {
        if (!fsaSupported) {
          if (alive) setState({ status: 'unsupported', error: null });
          return;
        }
        if (await hasGrantedHandleForShip(shipId)) {
          if (alive) setState({ status: 'ready', error: null });
          return;
        }
        if (await hasHandleForShip(shipId)) {
          if (alive) setState({ status: 'reconnect', error: null });
          return;
        }
        if (alive) setState({ status: 'pick', error: null });
      } catch (e) {
        if (alive) setState({ status: 'pick', error: (e as Error).message });
      }
    })();
    return () => {
      alive = false;
    };
  }, [step, shipId, fsaSupported]);

  const pick = useCallback(async () => {
    if (!shipId || busy) return;
    setBusy('pick');
    setState((s) => ({ ...s, error: null }));
    try {
      await pickDirectoryForShip(shipId);
      setState({ status: 'ready', error: null });
    } catch (e) {
      log.error('pick-folder failed', e);
      const err = e as Error;
      const msg = err?.name === 'AbortError'
        ? 'Folder picker was cancelled or blocked. Please try again.'
        : `${err?.name || 'Error'}: ${err?.message || 'Could not open folder picker'}`;
      setState({ status: 'pick', error: msg });
    } finally {
      setBusy(null);
    }
  }, [shipId, busy]);

  const reconnect = useCallback(async () => {
    if (!shipId || busy) return;
    setBusy('reconnect');
    setState((s) => ({ ...s, error: null }));
    try {
      await getHandleForShip(shipId, { prompt: true });
      setState({ status: 'ready', error: null });
    } catch (e) {
      log.error('reconnect failed', e);
      const err = e as Error;
      const msg = err?.name === 'AbortError'
        ? 'Reconnect was cancelled or blocked. Please try again.'
        : err?.message || 'Could not reconnect to folder';
      setState({ status: 'reconnect', error: msg });
    } finally {
      setBusy(null);
    }
  }, [shipId, busy]);

  return { state, busy, fsaSupported, pick, reconnect };
}
