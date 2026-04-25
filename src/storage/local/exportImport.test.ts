import { describe, it, expect } from 'vitest';
import { parseBundleFile, maybeWrapSingleVoyage } from './exportImport';
import { PathSafetyError } from './errors';

// Build a minimal File-like that matches the surface parseBundleFile uses
// (just `.text()` and `.name`). Avoids pulling jsdom into the smoke harness.
function fakeFile(text: string, name = 'bundle.json') {
  return {
    text: async () => text,
    name,
  } as unknown as File;
}

const validBundle = {
  bundleVersion: 1,
  shipId: 'solstice',
  exportedAt: '2026-04-19T12:00:00Z',
  appVersion: '8.0.0',
  voyages: [
    { filename: 'SL_2026-01-15_MIA-FLL.json', content: { id: 1, legs: [] } },
  ],
};

describe('parseBundleFile — full bundle path', () => {
  it('accepts a well-formed bundle', async () => {
    const out = await parseBundleFile(fakeFile(JSON.stringify(validBundle)));
    expect(out.bundleVersion).toBe(1);
    expect(out.shipId).toBe('solstice');
    expect(out.voyages).toHaveLength(1);
  });

  it('rejects non-JSON text', async () => {
    await expect(parseBundleFile(fakeFile('{not json'))).rejects.toThrow(/not valid JSON/i);
  });

  it('rejects non-object roots', async () => {
    await expect(parseBundleFile(fakeFile('null'))).rejects.toThrow(/object/);
    await expect(parseBundleFile(fakeFile('"a string"'))).rejects.toThrow(/object/);
    await expect(parseBundleFile(fakeFile('[1,2]'))).rejects.toThrow();
  });

  it('rejects unsupported bundleVersion', async () => {
    const bad = { ...validBundle, bundleVersion: 99 };
    await expect(parseBundleFile(fakeFile(JSON.stringify(bad)))).rejects.toThrow(/bundleVersion/);
  });

  it('rejects bundle with missing shipId', async () => {
    const bad = { ...validBundle, shipId: '' };
    await expect(parseBundleFile(fakeFile(JSON.stringify(bad)))).rejects.toThrow(/shipId/);
  });

  it('rejects bundle whose voyages is not an array', async () => {
    const bad = { ...validBundle, voyages: 'oops' };
    await expect(parseBundleFile(fakeFile(JSON.stringify(bad)))).rejects.toThrow(/array/);
  });

  it('rejects bundle voyage entries with hostile filenames', async () => {
    const bad = {
      ...validBundle,
      voyages: [{ filename: '../etc/passwd', content: { id: 1, legs: [] } }],
    };
    await expect(parseBundleFile(fakeFile(JSON.stringify(bad)))).rejects.toThrow(PathSafetyError);
  });

  it('rejects bundle voyage entries missing content', async () => {
    const bad = {
      ...validBundle,
      voyages: [{ filename: 'SL_2026-01-15_MIA-FLL.json' }],
    };
    await expect(parseBundleFile(fakeFile(JSON.stringify(bad)))).rejects.toThrow(/content/);
  });
});

describe('parseBundleFile — single-voyage permissive path', () => {
  it('wraps a standalone voyage JSON as a synthetic bundle', async () => {
    const voyage = {
      id: 1,
      shipId: 'solstice',
      filename: 'SL_2026-01-15_MIA-FLL.json',
      legs: [],
    };
    const out = await parseBundleFile(fakeFile(JSON.stringify(voyage)));
    expect(out.bundleVersion).toBe(1);
    expect(out.shipId).toBe('solstice');
    expect(out.voyages).toHaveLength(1);
    expect(out.voyages[0].filename).toBe('SL_2026-01-15_MIA-FLL.json');
    expect(out.voyages[0].content).toEqual(voyage);
  });

  it('falls back to file.name when voyage JSON has no .filename field', async () => {
    const voyage = { id: 1, shipId: 'solstice', legs: [] };
    const out = await parseBundleFile(
      fakeFile(JSON.stringify(voyage), 'SL_2026-01-15_MIA-FLL.json'),
    );
    expect(out.voyages[0].filename).toBe('SL_2026-01-15_MIA-FLL.json');
  });

  it('rejects single-voyage with hostile filename', async () => {
    const voyage = { id: 1, filename: '../evil', legs: [] };
    await expect(parseBundleFile(fakeFile(JSON.stringify(voyage)))).rejects.toThrow(PathSafetyError);
  });

  it('does NOT wrap an object that lacks a legs array (falls through to bundle validation)', async () => {
    // Object with no bundleVersion AND no legs — should hit bundleVersion validation
    const notAVoyage = { foo: 'bar' };
    await expect(parseBundleFile(fakeFile(JSON.stringify(notAVoyage)))).rejects.toThrow(/bundleVersion/);
  });
});

describe('maybeWrapSingleVoyage (unit)', () => {
  it('returns null for objects with bundleVersion set', () => {
    expect(maybeWrapSingleVoyage({ bundleVersion: 1, legs: [] }, fakeFile(''))).toBeNull();
  });

  it('returns null for objects without legs array', () => {
    expect(maybeWrapSingleVoyage({ id: 1 }, fakeFile(''))).toBeNull();
  });

  it('returns null for non-objects', () => {
    expect(maybeWrapSingleVoyage(null, fakeFile(''))).toBeNull();
    expect(maybeWrapSingleVoyage('voyage', fakeFile(''))).toBeNull();
  });

  it('uses the JSON-stamped filename when present', () => {
    const out = maybeWrapSingleVoyage(
      { filename: 'SL_2026-01-15_MIA-FLL.json', legs: [] },
      fakeFile('', 'wrong-name.json'),
    );
    expect(out?.voyages[0].filename).toBe('SL_2026-01-15_MIA-FLL.json');
  });
});
