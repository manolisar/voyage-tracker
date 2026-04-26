// Shared helpers for the v8 e2e suite.
//
// The app talks to a real per-ship folder via the File System Access API.
// Tests stub `window.showDirectoryPicker` with the OPFS so the same handle
// interface is exercised, with no OS dialogs. Permission methods don't exist
// on OPFS handles, so we patch them onto the prototype.
//
// Each test wipes OPFS + IndexedDB at start so they're truly isolated.

import type { Page } from '@playwright/test';

/**
 * Install the OPFS-backed showDirectoryPicker stub. Idempotent. Must run on
 * every page (re-installed after reload by the test, since `addInitScript`
 * fires before app code).
 */
export async function installOpfsPickerStub(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const installPicker = async () => {
      try {
        const root = await navigator.storage.getDirectory();
        const proto = Object.getPrototypeOf(root) as {
          queryPermission?: (opts?: unknown) => Promise<string>;
          requestPermission?: (opts?: unknown) => Promise<string>;
        };
        if (!proto.queryPermission) {
          proto.queryPermission = async () => 'granted';
        }
        if (!proto.requestPermission) {
          proto.requestPermission = async () => 'granted';
        }
      } catch {
        /* ignore */
      }

      (window as unknown as { showDirectoryPicker: unknown }).showDirectoryPicker =
        async (opts?: { id?: string }) => {
          const id = (opts && opts.id) || 'default';
          const root = await navigator.storage.getDirectory();
          return await root.getDirectoryHandle(id, { create: true });
        };
    };
    installPicker();
  });
}

/**
 * Wipe OPFS + IndexedDB so the test starts from a clean slate.
 * Idempotent.
 */
export async function resetClientStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory();
      for await (const name of (root as unknown as { keys: () => AsyncIterableIterator<string> }).keys()) {
        await root.removeEntry(name, { recursive: true });
      }
    } catch {
      /* ignore */
    }

    const dbs = await indexedDB.databases?.();
    if (dbs) {
      await Promise.all(
        dbs.map(
          (info) =>
            new Promise<void>((resolve) => {
              if (!info.name) return resolve();
              const req = indexedDB.deleteDatabase(info.name);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            }),
        ),
      );
    }
  });
}

/**
 * Drive the landing flow: pick ship, fill name, accept role default, click
 * "Choose folder" (which goes through the OPFS stub), then "Enter".
 */
export async function completeLanding(
  page: Page,
  opts: { shipCode: string; userName: string },
): Promise<void> {
  await page
    .getByRole('button', { name: new RegExp(`^${opts.shipCode}\\b`, 'i') })
    .click();
  await page.getByRole('textbox', { name: 'Your name' }).fill(opts.userName);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Choose folder…' }).click();
  await page.getByRole('button', { name: 'Enter' }).click();
}

/**
 * Toggle Edit Mode on if it's currently off.
 */
export async function enableEdit(page: Page): Promise<void> {
  const enable = page.getByRole('button', { name: 'Enable Edit' });
  if (await enable.isVisible()) await enable.click();
}

/**
 * Read a voyage file from the OPFS-backed ship folder.
 */
export async function readVoyageFile(
  page: Page,
  shipPickerId: string,
  filename: string,
): Promise<unknown> {
  return page.evaluate(
    async ({ id, name }) => {
      const root = await navigator.storage.getDirectory();
      const ship = await root.getDirectoryHandle(id);
      const f = await ship.getFileHandle(name);
      const file = await f.getFile();
      return JSON.parse(await file.text());
    },
    { id: shipPickerId, name: filename },
  );
}

/**
 * Set a controlled-input's value and dispatch the React-aware input event.
 * Used for date/text/number fields where Playwright's `fill()` doesn't
 * trigger React's onChange (e.g. the AddLeg modal's plain inputs).
 */
export async function setControlledValue(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  await page.evaluate(
    ({ selector, value }) => {
      const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
      if (!el) throw new Error(`No element matching ${selector}`);
      const proto =
        el.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      desc!.set!.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    { selector, value },
  );
}
