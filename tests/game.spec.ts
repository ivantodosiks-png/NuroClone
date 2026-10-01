import { test, expect, type Page } from '@playwright/test';

type Snapshot = {
  playing: boolean; paused: boolean; grabs: number; canGrab: boolean; pose: string;
  speed: number; elapsed: number; bodyCount: number; jointCount: number;
  worldBodies: number; worldConstraints: number;
  center: { x: number; y: number }; velocity: { x: number; y: number };
  camera: { x: number; y: number };
  bodies: { label: string; x: number; y: number; angle: number; angularVelocity: number }[];
  joints: { label: string; error: number }[];
  hands: { side: string; x: number; y: number }[];
};
const snapshot = (page: Page) => page.evaluate(() => (window as unknown as { __NURO__: { snapshot: () => Snapshot } }).__NURO__.snapshot());

test('menu, physical swinging, pose, release, pause, landing and restart', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Начать тренировку' })).toBeVisible();
  await page.screenshot({ path: 'test-results/menu.png' });
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await expect(page.locator('.telemetry')).toBeVisible();
  await page.waitForTimeout(1000);
  const initial = await snapshot(page);
  expect(initial.bodyCount).toBe(11);
  expect(initial.jointCount).toBe(10);
  expect(initial.grabs).toBe(2);
  expect(initial.center.y).toBeLessThan(500);
  expect(Math.max(...initial.joints.map(j => j.error))).toBeLessThan(5);

  await page.keyboard.down('d');
  await page.waitForTimeout(1600);
  await page.keyboard.up('d');
  const swinging = await snapshot(page);
  expect(Math.abs(swinging.center.x - initial.center.x)).toBeGreaterThan(25);
  expect(swinging.speed).toBeGreaterThan(0.4);
  expect(Math.abs(swinging.camera.x - initial.camera.x)).toBeGreaterThan(10);
  await page.screenshot({ path: 'test-results/swing.png' });

  await page.keyboard.down('w');
  await page.waitForTimeout(450);
  expect((await snapshot(page)).pose).toBe('tuck');
  await page.keyboard.up('w');
  await page.keyboard.down('s');
  await page.waitForTimeout(200);
  expect((await snapshot(page)).pose).toBe('arch');
  await page.keyboard.up('s');
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).grabs).toBe(0);
  await page.waitForTimeout(170);
  expect((await snapshot(page)).speed).toBeGreaterThan(0.2);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  const paused = await snapshot(page);
  await page.waitForTimeout(500);
  expect((await snapshot(page)).bodies).toEqual(paused.bodies);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.waitForTimeout(4500);
  const landed = await snapshot(page);
  expect(landed.center.y).toBeGreaterThan(570);
  expect(landed.center.y).toBeLessThan(730);
  expect(landed.bodies.every(b => Number.isFinite(b.x + b.y + b.angle))).toBe(true);
  expect(Math.max(...landed.joints.map(j => j.error))).toBeLessThan(8);
  await page.screenshot({ path: 'test-results/landing.png' });

  await page.keyboard.press('r');
  await page.waitForTimeout(200);
  const restarted = await snapshot(page);
  expect(restarted.grabs).toBe(2);
  expect(restarted.worldBodies).toBe(initial.worldBodies);
  expect(restarted.worldConstraints).toBe(initial.worldConstraints);
  expect(restarted.elapsed).toBeLessThan(1000);
  await page.screenshot({ path: 'test-results/training.png' });
  expect(errors).toEqual([]);
});

test('regrab nearby, reject distant grabs, repeated resets and menu cleanup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await page.waitForTimeout(150);
  await page.keyboard.press('Space');
  await page.waitForTimeout(30);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).grabs).toBeGreaterThan(0);

  await page.keyboard.press('Space');
  await page.waitForTimeout(1300);
  await page.keyboard.press('Space');
  await page.waitForTimeout(350);
  expect((await snapshot(page)).grabs).toBe(0);
  expect((await snapshot(page)).canGrab).toBe(false);

  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('r');
    await page.waitForTimeout(50);
  }
  const reset = await snapshot(page);
  expect(reset.worldBodies).toBe(14);
  expect(reset.worldConstraints).toBe(12);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Вернуться в меню' }).click();
  await expect(page.getByRole('button', { name: 'Начать тренировку' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.telemetry')).toHaveCount(1);
  expect((await snapshot(page)).grabs).toBe(2);
});

test('sustained torque and repeated pose changes keep joints stable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать тренировку' }).click();
  await page.keyboard.down('d');
  for (let i = 0; i < 8; i++) {
    const key = i % 2 === 0 ? 'w' : 's';
    await page.keyboard.down(key);
    await page.waitForTimeout(650);
    await page.keyboard.up(key);
    const state = await snapshot(page);
    expect(state.bodies.every(b => Number.isFinite(b.x + b.y + b.angle))).toBe(true);
    expect(Math.max(...state.joints.map(j => j.error))).toBeLessThan(12);
    expect(state.grabs).toBe(2);
  }
  await page.keyboard.up('d');
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: 'test-results/training-1024.png' });
});
