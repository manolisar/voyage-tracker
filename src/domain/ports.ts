// @ts-nocheck
// Port catalog loader. Fetches the UN/LOCODE-derived dataset built by
// scripts/build-ports-catalog.mjs and cached per tab.
//
// Shape: [{ code: "MIA", name: "Miami", country: "US", locode: "USMIA" }, …]

let cache = null;
let inflight = null;

const baseUrl = (() => {
  try { return import.meta.env?.BASE_URL || '/'; }
  catch { return '/'; }
})();

export async function loadPorts() {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch(`${baseUrl}ports.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load ports.json (${res.status})`);
    const data = await res.json();
    cache = Array.isArray(data) ? data : [];
    return cache;
  })();
  try { return await inflight; }
  finally { inflight = null; }
}

// Used by NewVoyageModal → PortCombobox. Normalizes user input against the
// catalog + IDB custom ports. Returns the full port object, or null if the
// code isn't found.
export function findPort(catalog, code) {
  if (!code) return null;
  const u = code.toUpperCase();
  return catalog.find((p) => p.code === u || p.locode === u) || null;
}
