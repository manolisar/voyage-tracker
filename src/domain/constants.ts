// Constants that don't depend on ship class.
// Per-class data (equipment, fuels, densities, phase templates) lives in
// public/ship-classes/<classId>.json — see src/domain/shipClass.ts.

export const APP_VERSION = '8.0.0';
export const AUTO_SAVE_DELAY_MS = 1500;

// Editor roles — recorded in each voyage file's `loggedBy.role` stamp for
// attribution. Not enforced as permissions (see CLAUDE.md §4).
export const EDITOR_ROLES = {
  CHIEF: 'chief',
  SECOND: 'second',
  BRIDGE: 'bridge',
  OTHER: 'other',
} as const;

export type EditorRole = (typeof EDITOR_ROLES)[keyof typeof EDITOR_ROLES];

export const EDITOR_ROLE_LABELS: Record<EditorRole, string> = {
  [EDITOR_ROLES.CHIEF]: 'Chief Engineer',
  [EDITOR_ROLES.SECOND]: '2nd Engineer (ECR)',
  [EDITOR_ROLES.BRIDGE]: 'Bridge Officer of Watch',
  [EDITOR_ROLES.OTHER]: 'Other',
};

export const PHASE_TYPES = {
  PORT: 'port',
  SEA: 'sea',
  STANDBY: 'standby',
} as const;

export type PhaseType = (typeof PHASE_TYPES)[keyof typeof PHASE_TYPES];

// Report types live on a leg
export const REPORT_TYPES = {
  DEPARTURE: 'departure',
  ARRIVAL: 'arrival',
} as const;

export type ReportType = (typeof REPORT_TYPES)[keyof typeof REPORT_TYPES];
