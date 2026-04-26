// End-to-end smoke test for the voyage workflow.
//
// Walks: landing → create voyage → add leg → fill counters → add second leg
// out of date order → verify chronological sort → delete a leg → end voyage
// → verify lock-on-close → reload → verify persistence.
//
// Each scenario also asserts on the saved JSON file in the OPFS-backed ship
// folder, so we catch drift between in-memory state and what hits disk.

import { test, expect } from '@playwright/test';
import {
  completeLanding,
  enableEdit,
  installOpfsPickerStub,
  readVoyageFile,
  resetClientStorage,
  setControlledValue,
} from './helpers';

const SHIP_CODE = 'SL';
const SHIP_PICKER_ID = 'voyage-tracker-solstice';
const VOYAGE_FILE = 'SL_2026-01-15_MIA-FLL.json';

test.beforeEach(async ({ page }) => {
  await installOpfsPickerStub(page);
  await page.goto('/');
  await resetClientStorage(page);
  await page.reload();
});

test('landing → voyage → leg → autosave', async ({ page }) => {
  await completeLanding(page, { shipCode: SHIP_CODE, userName: 'Test Engineer' });
  await expect(page.getByRole('heading', { name: /Voyage Tracker.*Celebrity Solstice/ })).toBeVisible();
  await enableEdit(page);

  // Create a Miami → Fort Lauderdale voyage.
  await page.getByRole('button', { name: '+ New Voyage' }).click();
  await page.locator('#embark-port').fill('MIA');
  await page.getByRole('option', { name: 'MIA — Miami, US' }).click();
  await page.locator('#disembark-port').fill('FLL');
  await page.getByRole('option', { name: 'FLL — Fort Lauderdale, US' }).click();
  await setControlledValue(page, '[role="dialog"] input[type="date"]', '2026-01-15');
  await page.getByRole('button', { name: 'Create voyage' }).click();

  // The Add Leg modal opens automatically. Add Leg #1: Miami → Nassau.
  const addLegDlg = page.getByRole('dialog', { name: /Add Leg/ });
  await expect(addLegDlg).toBeVisible();
  await addLegDlg.locator('input[placeholder*="Hong Kong"]').fill('Miami');
  await addLegDlg.locator('input[placeholder*="Shanghai"]').fill('Nassau');
  // Two date inputs in tab order: departure, arrival.
  await setControlledValue(page, '[role="dialog"] input[type="date"]:nth-of-type(1)', '2026-01-16');
  // The second date input lives in a sibling cell — set both via JS.
  await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]')!;
    const dates = Array.from(dlg.querySelectorAll('input[type="date"]'));
    const setVal = (el: Element, v: string) => {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      desc!.set!.call(el as HTMLInputElement, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setVal(dates[0], '2026-01-16');
    setVal(dates[1], '2026-01-18');
  });
  await page.getByRole('button', { name: 'Add leg', exact: true }).click();

  // The departure form for the new leg renders. Fill counters + ROB.
  await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const inputs = Array.from(main.querySelectorAll('input[type="number"]'));
    const setVal = (el: Element, v: number | string) => {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      desc!.set!.call(el as HTMLInputElement, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    // Phase 1: PORT
    [1000, 1010, 800, 805, 500, 502, 200, 201, 150, 150].forEach((v, i) => setVal(inputs[i], v));
    // Phase 2: STANDBY
    [1010, 1015, 805, 810, 502, 503, 201, 201, 150, 150].forEach((v, i) => setVal(inputs[10 + i], v));
    // ROB hfo / mgo / lsfo
    [500, 200, 100].forEach((v, i) => setVal(inputs[20 + i], v));
  });

  // Wait for the autosave debounce to flush.
  await page.waitForTimeout(2000);

  // Verify the JSON on disk.
  const obj = (await readVoyageFile(page, SHIP_PICKER_ID, VOYAGE_FILE)) as Record<string, unknown>;
  expect(obj.startDate).toBe('2026-01-15');
  expect((obj.fromPort as Record<string, unknown>).code).toBe('MIA');
  expect((obj.toPort as Record<string, unknown>).code).toBe('FLL');
  expect((obj.legs as unknown[]).length).toBe(1);
  expect((obj.loggedBy as Record<string, unknown>).name).toBe('Test Engineer');
});

test('legs render in chronological order even when added out of order', async ({ page }) => {
  await completeLanding(page, { shipCode: SHIP_CODE, userName: 'Test Engineer' });
  await enableEdit(page);

  // Quick voyage creation
  await page.getByRole('button', { name: '+ New Voyage' }).click();
  await page.locator('#embark-port').fill('MIA');
  await page.getByRole('option', { name: 'MIA — Miami, US' }).click();
  await page.locator('#disembark-port').fill('FLL');
  await page.getByRole('option', { name: 'FLL — Fort Lauderdale, US' }).click();
  await setControlledValue(page, '[role="dialog"] input[type="date"]', '2026-01-15');
  await page.getByRole('button', { name: 'Create voyage' }).click();

  // First leg: 2026-01-16
  const addLeg = async (from: string, to: string, dep: string, arr: string) => {
    const dlg = page.getByRole('dialog', { name: /Add Leg/ });
    await expect(dlg).toBeVisible();
    await dlg.locator('input[placeholder*="Hong Kong"]').fill(from);
    await dlg.locator('input[placeholder*="Shanghai"]').fill(to);
    await page.evaluate(
      ({ dep, arr }) => {
        const dlg = document.querySelector('[role="dialog"]')!;
        const dates = Array.from(dlg.querySelectorAll('input[type="date"]'));
        const setVal = (el: Element, v: string) => {
          const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          desc!.set!.call(el as HTMLInputElement, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        setVal(dates[0], dep);
        setVal(dates[1], arr);
      },
      { dep, arr },
    );
    await page.getByRole('button', { name: 'Add leg', exact: true }).click();
  };

  await addLeg('Miami', 'Nassau', '2026-01-16', '2026-01-18');

  // Click Voyage Detail then "+ Add Leg" to add a SECOND leg with EARLIER date.
  await page.locator('button.tree-node', { hasText: 'Voyage Detail' }).click();
  await page.getByRole('button', { name: '+ Add Leg' }).click();
  await addLeg('Cozumel', 'Miami', '2026-01-12', '2026-01-14');

  // Tree should show Cozumel→Miami as L1 (earlier date), Miami→Nassau as L2.
  const treeText = await page.locator('[role="tree"]').innerText();
  const cozIdx = treeText.indexOf('Cozumel');
  const nasIdx = treeText.indexOf('Nassau');
  expect(cozIdx).toBeGreaterThan(-1);
  expect(nasIdx).toBeGreaterThan(-1);
  expect(cozIdx).toBeLessThan(nasIdx);

  // VoyageDetail leg rows should also be sorted.
  await page.locator('button.tree-node', { hasText: 'Voyage Detail' }).click();
  const rows = await page.locator('.cat-card.legs .py-2\\.5').allInnerTexts();
  expect(rows[0]).toContain('Cozumel → Miami');
  expect(rows[1]).toContain('Miami → Nassau');

  // On-disk array stays in INSERTION order (Miami first, then Cozumel).
  await page.waitForTimeout(2000);
  const obj = (await readVoyageFile(page, SHIP_PICKER_ID, VOYAGE_FILE)) as Record<string, unknown>;
  const legs = obj.legs as Array<{ departure: { port: string } }>;
  expect(legs[0].departure.port).toBe('Miami');
  expect(legs[1].departure.port).toBe('Cozumel');
});

test('delete leg removes it from tree, voyage detail, and disk', async ({ page }) => {
  await completeLanding(page, { shipCode: SHIP_CODE, userName: 'Test Engineer' });
  await enableEdit(page);

  // Create voyage + two legs (any dates)
  await page.getByRole('button', { name: '+ New Voyage' }).click();
  await page.locator('#embark-port').fill('MIA');
  await page.getByRole('option', { name: 'MIA — Miami, US' }).click();
  await page.locator('#disembark-port').fill('FLL');
  await page.getByRole('option', { name: 'FLL — Fort Lauderdale, US' }).click();
  await setControlledValue(page, '[role="dialog"] input[type="date"]', '2026-01-15');
  await page.getByRole('button', { name: 'Create voyage' }).click();

  const addLeg = async (from: string, to: string, dep: string, arr: string) => {
    const dlg = page.getByRole('dialog', { name: /Add Leg/ });
    await dlg.locator('input[placeholder*="Hong Kong"]').fill(from);
    await dlg.locator('input[placeholder*="Shanghai"]').fill(to);
    await page.evaluate(
      ({ dep, arr }) => {
        const dlg = document.querySelector('[role="dialog"]')!;
        const dates = Array.from(dlg.querySelectorAll('input[type="date"]'));
        const setVal = (el: Element, v: string) => {
          const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          desc!.set!.call(el as HTMLInputElement, v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        setVal(dates[0], dep);
        setVal(dates[1], arr);
      },
      { dep, arr },
    );
    await page.getByRole('button', { name: 'Add leg', exact: true }).click();
  };

  await addLeg('Miami', 'Nassau', '2026-01-16', '2026-01-18');
  await page.locator('button.tree-node', { hasText: 'Voyage Detail' }).click();
  await page.getByRole('button', { name: '+ Add Leg' }).click();
  await addLeg('Cozumel', 'Miami', '2026-01-12', '2026-01-14');

  // Click Voyage Detail and delete L1 (Cozumel — date-sorted index).
  await page.locator('button.tree-node', { hasText: 'Voyage Detail' }).click();
  await page.getByRole('button', { name: 'Delete leg 1' }).click();

  // Confirmation modal pops; subtitle should reference the chosen leg.
  const confirm = page.getByRole('dialog', { name: 'Delete leg' });
  await expect(confirm).toContainText('Cozumel → Miami');
  await confirm.getByRole('button', { name: 'Delete leg', exact: true }).click();

  // After delete: only Miami → Nassau remains.
  await page.waitForTimeout(1500);
  const tree = await page.locator('[role="tree"]').innerText();
  expect(tree).toContain('Nassau');
  expect(tree).not.toContain('Cozumel');

  const obj = (await readVoyageFile(page, SHIP_PICKER_ID, VOYAGE_FILE)) as Record<string, unknown>;
  const legs = obj.legs as Array<{ departure: { port: string } }>;
  expect(legs).toHaveLength(1);
  expect(legs[0].departure.port).toBe('Miami');
});

test('end voyage locks edits; reopen restores them', async ({ page }) => {
  await completeLanding(page, { shipCode: SHIP_CODE, userName: 'Test Engineer' });
  await enableEdit(page);

  // Create voyage with one leg
  await page.getByRole('button', { name: '+ New Voyage' }).click();
  await page.locator('#embark-port').fill('MIA');
  await page.getByRole('option', { name: 'MIA — Miami, US' }).click();
  await page.locator('#disembark-port').fill('FLL');
  await page.getByRole('option', { name: 'FLL — Fort Lauderdale, US' }).click();
  await setControlledValue(page, '[role="dialog"] input[type="date"]', '2026-01-15');
  await page.getByRole('button', { name: 'Create voyage' }).click();

  const dlg = page.getByRole('dialog', { name: /Add Leg/ });
  await dlg.locator('input[placeholder*="Hong Kong"]').fill('Miami');
  await dlg.locator('input[placeholder*="Shanghai"]').fill('Nassau');
  await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]')!;
    const dates = Array.from(dlg.querySelectorAll('input[type="date"]'));
    const setVal = (el: Element, v: string) => {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      desc!.set!.call(el as HTMLInputElement, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setVal(dates[0], '2026-01-16');
    setVal(dates[1], '2026-01-18');
  });
  await page.getByRole('button', { name: 'Add leg', exact: true }).click();

  // Fill some counters so totals round-trip through the rounding fix below.
  await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const inputs = Array.from(main.querySelectorAll('input[type="number"]'));
    const setVal = (el: Element, v: number) => {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      desc!.set!.call(el as HTMLInputElement, String(v));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    [1000, 1010, 800, 805, 500, 502, 200, 201, 150, 150].forEach((v, i) => setVal(inputs[i], v));
    [1010, 1015, 805, 810, 502, 503, 201, 201, 150, 150].forEach((v, i) => setVal(inputs[10 + i], v));
  });
  await page.waitForTimeout(1500);

  // End voyage with minimal lub-oil.
  await page.locator('button.tree-node', { hasText: 'Voyage Detail' }).click();
  await page.getByRole('button', { name: /End Voyage/ }).click();
  const endDlg = page.getByRole('dialog', { name: /End Voyage/ });
  await endDlg.locator('input[type="date"]').fill('2026-01-22');
  await endDlg.getByRole('button', { name: /End voyage/ }).click();

  // 3A: closing a voyage while on the ACTIVE filter should fire a toast
  // pointing to where the voyage went.
  await expect(
    page.getByText(/Switch to "Ended" or "All"/i),
  ).toBeVisible();

  // Locked state: trash buttons disappear, only Reopen shows.
  await page.locator('button.tree-node', { hasText: 'Voyage Detail' }).click();
  await expect(page.getByRole('button', { name: 'Reopen voyage' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Add Leg' })).toHaveCount(0);

  // Fix 1: voyageEnd.totals on disk should be rounded — no IEEE noise.
  // Autosave debounce is 1500ms; wait for it plus a small buffer.
  await page.waitForTimeout(2500);
  const obj = (await readVoyageFile(page, SHIP_PICKER_ID, VOYAGE_FILE)) as Record<string, unknown>;
  const totals = (obj.voyageEnd as Record<string, number>).totals as unknown as Record<string, number>;
  for (const fuel of ['hfo', 'mgo', 'lsfo', 'freshWaterCons']) {
    const n = totals[fuel];
    // Either an integer or has at most 2 decimal places — no IEEE tail.
    expect(Math.abs(n * 100 - Math.round(n * 100))).toBeLessThan(1e-9);
  }

  // 4A: filtered footer should now read "0 of 1 voyages" because the only
  // voyage is ended and we're still on ACTIVE.
  await expect(page.locator('aside[aria-label="Voyages"]')).toContainText('0 of 1 voyages');

  // Reopen → editing affordances return.
  await page.getByRole('button', { name: 'Reopen voyage' }).click();
  await expect(page.getByRole('button', { name: '+ Add Leg' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete leg 1' })).toBeVisible();
});

test('voyage data survives a full page reload (OPFS persistence)', async ({ page }) => {
  await completeLanding(page, { shipCode: SHIP_CODE, userName: 'Test Engineer' });
  await enableEdit(page);

  await page.getByRole('button', { name: '+ New Voyage' }).click();
  await page.locator('#embark-port').fill('MIA');
  await page.getByRole('option', { name: 'MIA — Miami, US' }).click();
  await page.locator('#disembark-port').fill('FLL');
  await page.getByRole('option', { name: 'FLL — Fort Lauderdale, US' }).click();
  await setControlledValue(page, '[role="dialog"] input[type="date"]', '2026-01-15');
  await page.getByRole('button', { name: 'Create voyage' }).click();

  // Cancel the auto-opened Add Leg modal.
  await page.getByRole('dialog', { name: /Add Leg/ }).getByRole('button', { name: 'Cancel' }).click();

  await page.waitForTimeout(1500);

  // Reload — landing should be skipped because the IDB session + handle stuck.
  await page.reload();
  await expect(page.getByRole('heading', { name: /Voyage Tracker.*Celebrity Solstice/ })).toBeVisible();

  // Switch to ALL filter to surface the (newly-created, possibly active) voyage.
  await page.getByRole('tab', { name: 'ALL' }).click();
  await expect(page.locator('[role="tree"]')).toContainText('MIA → FLL');
});
