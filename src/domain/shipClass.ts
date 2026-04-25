// Ship class loader + helpers.
// Replaces v6's hardcoded equipment keys (dg12 / dg4 / dg3 / boiler1 / boiler2).
// Ship-class JSON files live in public/ship-classes/<classId>.json and drive
// equipment lists, allowed fuels, default densities, and phase templates.

import type {
  EquipmentDefinition,
  FuelKey,
  Ship,
  ShipClass,
} from '../types/domain';

const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<ShipClass>>();

const baseUrl: string = (() => {
  // Vite injects import.meta.env.BASE_URL; falls back to '/' under tests.
  try {
    return import.meta.env?.BASE_URL || '/';
  } catch {
    return '/';
  }
})();

export async function loadShips(): Promise<Ship[]> {
  const cached = cache.get('__ships') as Ship[] | undefined;
  if (cached) return cached;
  const res = await fetch(`${baseUrl}ships.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ships.json (${res.status})`);
  const data = (await res.json()) as Ship[];
  cache.set('__ships', data);
  return data;
}

export async function loadShipClass(classId: string): Promise<ShipClass> {
  const cached = cache.get(classId) as ShipClass | undefined;
  if (cached) return cached;
  const pending = inflight.get(classId);
  if (pending) return pending;

  const p = (async (): Promise<ShipClass> => {
    const res = await fetch(`${baseUrl}ship-classes/${classId}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load ship-class ${classId} (${res.status})`);
    const data = (await res.json()) as ShipClass;
    cache.set(classId, data);
    return data;
  })();
  inflight.set(classId, p);
  try {
    return await p;
  } finally {
    inflight.delete(classId);
  }
}

// --- pure helpers (sync, take a loaded shipClass object) ---

export function equipmentKeys(shipClass: ShipClass): string[] {
  return shipClass.equipment.map((e) => e.key);
}

export function equipmentLabel(shipClass: ShipClass, key: string): string {
  return shipClass.equipment.find((e) => e.key === key)?.label ?? key;
}

export function equipmentDef(shipClass: ShipClass, key: string): EquipmentDefinition | null {
  return shipClass.equipment.find((e) => e.key === key) ?? null;
}

export function defaultDensities(shipClass: ShipClass): Record<FuelKey, number> {
  return { ...shipClass.defaultDensities };
}

export function fuelOptions(shipClass: ShipClass): FuelKey[] {
  return [...shipClass.fuels];
}

// Reset cache — used by tests or when admin reloads class config.
export function _clearShipClassCache(): void {
  cache.clear();
  inflight.clear();
}
