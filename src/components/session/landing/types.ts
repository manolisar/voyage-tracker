// Shared types and step constants for the landing-screen flow.
// Kept in their own module so each Steps.tsx component file can import them
// without pulling in the orchestrator.

import { EDITOR_ROLES, type EditorRole } from '../../../domain/constants';

export const STEP_SHIP = 0;
export const STEP_IDENTIFY = 1;
export const STEP_FOLDER = 2;

export type Step = typeof STEP_SHIP | typeof STEP_IDENTIFY | typeof STEP_FOLDER;

export type FolderStatus = 'checking' | 'ready' | 'reconnect' | 'pick' | 'unsupported';
export type FolderBusy = 'pick' | 'reconnect' | null;

export interface FolderState {
  status: FolderStatus;
  error: string | null;
}

export function isEditorRole(value: string): value is EditorRole {
  return (Object.values(EDITOR_ROLES) as string[]).includes(value);
}
