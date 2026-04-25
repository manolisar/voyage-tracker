// Voyage data validation + auto-fix on load.
// Carried from v6's validateCruiseData; extended for v7 multi-ship + classId.

import { APP_VERSION } from './constants';
import { defaultDensities } from './shipClass';
import type { FuelKey, ShipClass, Voyage } from '../types/domain';

export interface ValidateOptions {
  shipClass?: ShipClass;
  expectedShipId?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  data: Voyage | null;
}

const FALLBACK_DENSITIES: Record<FuelKey, number> = { HFO: 0.92, MGO: 0.83, LSFO: 0.92 };
const EMPTY_PORT = { code: '', name: '', country: '', locode: '' } as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Returns { valid, errors, data } where `data` is a normalized copy with
// missing fields backfilled. Never throws.
export function validateVoyageData(
  data: unknown,
  { shipClass, expectedShipId }: ValidateOptions = {},
): ValidationResult {
  const errors: string[] = [];

  if (!isObject(data)) {
    return { valid: false, errors: ['Invalid data format'], data: null };
  }

  if (!data.id) errors.push('Missing voyage id');
  if (!Array.isArray(data.legs)) errors.push('Invalid legs array');
  if (data.shipId == null) errors.push('Missing shipId');
  if (expectedShipId && data.shipId && data.shipId !== expectedShipId) {
    errors.push(`shipId mismatch: file=${String(data.shipId)} expected=${expectedShipId}`);
  }

  if (isObject(data.densities)) {
    for (const [fuel, density] of Object.entries(data.densities)) {
      const d = parseFloat(String(density));
      if (isNaN(d) || d <= 0 || d > 2) {
        errors.push(`Invalid ${fuel} density: ${String(density)}`);
      }
    }
  }

  const fallbackDensities = shipClass ? defaultDensities(shipClass) : FALLBACK_DENSITIES;

  const fixed: Voyage = {
    id: (data.id as number) || Date.now(),
    shipId: ((data.shipId as string | null | undefined) ?? expectedShipId ?? null) as string | null,
    classId: ((data.classId as string | null | undefined) ?? shipClass?.id ?? null) as string | null,
    fromPort: (data.fromPort as Voyage['fromPort']) || { ...EMPTY_PORT },
    toPort: (data.toPort as Voyage['toPort']) || { ...EMPTY_PORT },
    startDate: (data.startDate as string) || '',
    endDate: (data.endDate as string) || '',
    legs: Array.isArray(data.legs)
      ? data.legs.map((leg: Record<string, unknown>) => ({
          ...(leg as object),
          voyageReport: leg.voyageReport || null,
        })) as Voyage['legs']
      : [],
    densities: { ...fallbackDensities, ...((data.densities as Partial<Record<FuelKey, number>>) || {}) },
    voyageEnd: (data.voyageEnd as Voyage['voyageEnd']) || null,
    lastModified: (data.lastModified as string) || new Date().toISOString(),
    version: APP_VERSION,
    filename: (data.filename as string | null) || null,
  };

  return { valid: errors.length === 0, errors, data: fixed };
}

// Lightweight ship-id sanity check used by the storage layer to refuse cross-
// ship writes. ALWAYS check this before PUTing — never trust caller.
export function isShipPath(path: unknown, shipId: unknown): boolean {
  return (
    typeof path === 'string' &&
    typeof shipId === 'string' &&
    path.startsWith(`data/${shipId}/`)
  );
}
