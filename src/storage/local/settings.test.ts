import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SETTINGS_FILENAME, loadSettingsFile, saveSettingsFile } from './settings';
import { StaleFileError } from './errors';

// ── Minimal in-memory File System Access fakes ───────────────────────────
function makeFile(text: string, lastModified: number) {
  return { text: async () => text, lastModified } as unknown as File;
}

function makeFileHandle(store: { text: string; mtime: number }) {
  return {
    kind: 'file' as const,
    name: SETTINGS_FILENAME,
    getFile: async () => makeFile(store.text, store.mtime),
    createWritable: async () => ({
      write: async (data: string) => {
        store.text = data;
        store.mtime += 1000;
      },
      close: async () => {},
    }),
  };
}

function makeDirHandle(files: Record<string, { text: string; mtime: number }>) {
  return {
    kind: 'directory' as const,
    getFileHandle: async (name: string, opts?: { create?: boolean }) => {
      if (!files[name]) {
        if (opts?.create) files[name] = { text: '', mtime: Date.now() };
        else {
          const err = new Error('not found');
          err.name = 'NotFoundError';
          throw err;
        }
      }
      return makeFileHandle(files[name]);
    },
  } as unknown as FileSystemDirectoryHandle;
}

// getHandleForShip is the only collaborator we mock.
vi.mock('./fsHandle', () => ({
  getHandleForShip: vi.fn(),
}));
import { getHandleForShip } from './fsHandle';
const mockedGetHandle = vi.mocked(getHandleForShip);

beforeEach(() => {
  mockedGetHandle.mockReset();
});

describe('loadSettingsFile', () => {
  it('returns null when the settings file is absent', async () => {
    mockedGetHandle.mockResolvedValue(makeDirHandle({}));
    expect(await loadSettingsFile('eclipse')).toBeNull();
  });

  it('returns parsed settings + mtime when the file exists', async () => {
    const files = {
      [SETTINGS_FILENAME]: {
        text: JSON.stringify({ defaultDensities: { HFO: 0.92 } }),
        mtime: 5000,
      },
    };
    mockedGetHandle.mockResolvedValue(makeDirHandle(files));
    const res = await loadSettingsFile('eclipse');
    expect(res?.settings.defaultDensities?.HFO).toBe(0.92);
    expect(res?.mtime).toBe(5000);
  });
});

describe('saveSettingsFile', () => {
  it('writes settings and returns the new mtime', async () => {
    // Seed with a known mtime so we can assert the exact post-write value.
    const SEED_MTIME = 5000;
    const files: Record<string, { text: string; mtime: number }> = {
      [SETTINGS_FILENAME]: { text: '{}', mtime: SEED_MTIME },
    };
    mockedGetHandle.mockResolvedValue(makeDirHandle(files));
    // Pass prevMtime matching the seed so the stale check passes.
    const { mtime } = await saveSettingsFile('eclipse', { defaultDensities: { HFO: 0.91 } }, SEED_MTIME);
    // The fake increments mtime by 1000 on each write.
    expect(mtime).toBe(SEED_MTIME + 1000);
    expect(JSON.parse(files[SETTINGS_FILENAME].text).defaultDensities.HFO).toBe(0.91);
  });

  it('throws StaleFileError when on-disk mtime is newer than prevMtime', async () => {
    const files = {
      [SETTINGS_FILENAME]: { text: JSON.stringify({ defaultDensities: {} }), mtime: 9000 },
    };
    mockedGetHandle.mockResolvedValue(makeDirHandle(files));
    await expect(saveSettingsFile('eclipse', { defaultDensities: {} }, 1000)).rejects.toBeInstanceOf(
      StaleFileError,
    );
  });

  it('throws StaleFileError when the file already exists but prevMtime is null', async () => {
    // Caller passes prevMtime=null (thinks it's creating), but file exists on disk.
    const files = {
      [SETTINGS_FILENAME]: { text: JSON.stringify({ defaultDensities: {} }), mtime: 3000 },
    };
    mockedGetHandle.mockResolvedValue(makeDirHandle(files));
    await expect(
      saveSettingsFile('eclipse', { defaultDensities: {} }, null),
    ).rejects.toBeInstanceOf(StaleFileError);
  });
});
