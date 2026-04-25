// Context object only. Provider lives in SessionProvider.tsx.
// Split for react-refresh / fast-refresh compatibility.

import { createContext } from 'react';
import type { EditorRole } from '../domain/constants';

export interface SessionSnapshot {
  shipId: string | null;
  userName: string | null;
  role: EditorRole | null;
}

export interface StartSessionInput {
  shipId: string;
  userName: string;
  role: EditorRole;
}

export interface SessionContextValue {
  ready: boolean;
  shipId: string | null;
  userName: string | null;
  role: EditorRole | null;
  editMode: boolean;
  startSession: (input: StartSessionInput) => void;
  endSession: () => void;
  enterEditMode: () => void;
  exitEditMode: () => void;
  toggleEditMode: () => void;
  getSessionSnapshot: () => SessionSnapshot;
}

export const SessionContext = createContext<SessionContextValue | null>(null);
