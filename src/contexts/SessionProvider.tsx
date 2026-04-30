// SessionProvider — owns the local session state for the no-auth pivot.
//
// Three pieces of state:
//   1. shipId    — which ship's data we're looking at (drives storage handle)
//   2. userName  — free-text name, stamped on each save for attribution
//   3. role      — one of EDITOR_ROLES; stamped alongside userName
//   4. editMode  — false = view-only, true = editing. One-click toggle, no PIN.
//
// Persistence:
//   - shipId + userName + role are written to IndexedDB (`session` store)
//     so a tab refresh restores them without re-prompting.
//   - editMode is NEVER persisted. Always starts false on load — the plan
//     calls this an accident-prevention default so a reload doesn't leave
//     the app in edit mode if the PC was walked away from.
//
// This provider replaces the old AuthProvider. It intentionally has no PIN
// verification, no PAT state, no inactivity timer, no admin concept.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { EDITOR_ROLES, type EditorRole } from '../domain/constants';
import {
  clearSession as idbClearSession,
  getSession as idbGetSession,
  putSession as idbPutSession,
} from '../storage/indexeddb';
import {
  SessionContext,
  type SessionContextValue,
  type SessionSnapshot,
  type StartSessionInput,
} from './SessionContext';

const VALID_ROLES = new Set<string>(Object.values(EDITOR_ROLES));

function isEditorRole(role: unknown): role is EditorRole {
  return typeof role === 'string' && VALID_ROLES.has(role);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [shipId, setShipId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [role, setRole] = useState<EditorRole | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [ready, setReady] = useState(false);

  // Prevent the hydration write-back from persisting the empty initial state
  // over the real persisted session before we've loaded it.
  const hydratedRef = useRef(false);

  // Hydrate from IDB on mount. Runs once. If nothing persisted, leave all
  // fields null — LandingScreen will show.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await idbGetSession();
        if (cancelled) return;
        if (stored && stored.shipId) {
          setShipId(stored.shipId);
          setUserName(stored.userName || null);
          setRole(isEditorRole(stored.role) ? stored.role : null);
        }
      } catch (e) {
        console.warn('[session] hydrate failed', e);
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist whenever shipId / userName / role changes (after hydration).
  useEffect(() => {
    if (!hydratedRef.current) return;
    const hasSession = shipId && userName && role;
    if (!hasSession) {
      void idbClearSession().catch((e) => console.warn('[session] clear failed', e));
      return;
    }
    void idbPutSession({ shipId, userName, role }).catch((e) =>
      console.warn('[session] put failed', e),
    );
  }, [shipId, userName, role]);

  // Set all three identifying fields at once — called from LandingScreen on
  // Enter. Atomic update so we never flash a partial state (e.g. a shipId
  // without a userName) that a consumer could key off.
  const startSession = useCallback(({ shipId: s, userName: u, role: r }: StartSessionInput) => {
    if (!s) throw new Error('startSession: shipId required');
    if (!u) throw new Error('startSession: userName required');
    if (!isEditorRole(r)) throw new Error(`startSession: invalid role ${JSON.stringify(r)}`);
    setShipId(s);
    // Cap at 64 chars — `loggedBy.name` ends up rendered into the tree's leg
    // tooltips and the voyage detail header, so unbounded input could bloat
    // every voyage file and stretch the UI. 64 covers every real name.
    setUserName(String(u).trim().slice(0, 64));
    setRole(r);
    setEditMode(false);
  }, []);

  const enterEditMode = useCallback(() => setEditMode(true), []);
  const exitEditMode = useCallback(() => setEditMode(false), []);
  const toggleEditMode = useCallback(() => setEditMode((v) => !v), []);

  // Clear everything → back to landing. Used by "Switch ship/user" in the
  // settings panel and by the logout button in TopBar.
  const endSession = useCallback(() => {
    setShipId(null);
    setUserName(null);
    setRole(null);
    setEditMode(false);
  }, []);

  // Getter returned alongside the state so the storage adapter can read the
  // freshest session via closure without re-rendering. See createLocalAdapter
  // in src/storage/local/index.ts — it takes `getSession` not `session`.
  const sessionRef = useRef<SessionSnapshot>({ shipId, userName, role });
  useEffect(() => {
    sessionRef.current = { shipId, userName, role };
  }, [shipId, userName, role]);
  const getSessionSnapshot = useCallback(() => sessionRef.current, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      ready,
      shipId,
      userName,
      role,
      editMode,
      startSession,
      endSession,
      enterEditMode,
      exitEditMode,
      toggleEditMode,
      getSessionSnapshot,
    }),
    [
      ready,
      shipId,
      userName,
      role,
      editMode,
      startSession,
      endSession,
      enterEditMode,
      exitEditMode,
      toggleEditMode,
      getSessionSnapshot,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
