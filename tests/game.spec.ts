import { test, expect, type Page } from '@playwright/test';
import type { GameScene } from '../src/scenes/GameScene';

type Snapshot = ReturnType<GameScene['snapshot']>;
const snapshot = (page: Page): Promise<Snapshot> => page.evaluate(() =>
  (window as unknown as { __NURO__: { snapshot: () => Snapshot } }).__NURO__.snapshot());

// Test-only fixtures use the existing scene and actual Matter bodies. No test
// controls or mutation hooks are added to the shipped game.
async function fixture(page: Page, code: string) {
  return page.evaluate(async script => {
    const entry = '/src/main.ts';
    const physics = '/src/physics/matter.ts';
    const { game } = await import(/* @vite-ignore */ entry);
    const { Matter } = await import(/* @vite-ignore */ physics);
    return new Function('scene', 'Matter', script)(game.scene.getScene('GameScene'), Matter);
  }, code);
}

async function advance(page: Page, ms: number) {
  await fixture(page, `for (let i = 0; i < ${Math.ceil(ms / (1000 / 120))}; i++) scene.update(0, 1000 / 120);`);
}
async function start(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(page.locator('.scoreboard')).toBeVisible();
}
async function hold(page: Page, key: string, ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(60);
  await advance(page, ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(40);
}
async function release(page: Page) {
  await page.keyboard.press('Space');
  await expect.poll(async () => (await snapshot(page)).grabs).toBe(0);
}

test('1-4: simple menu, CONTROLS, BACK and PLAY', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'NUROCLONE' })).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(2);
  await page.getByRole('button', { name: 'CONTROLS', exact: true }).click();
  await expect(page.locator('.controls-list dt')).toHaveText(['W', 'A / D', 'L', 'K', 'SPACE', 'R', 'ESC']);
  await expect(page.locator('.controls-list dd').first()).toHaveText('поднять ноги');
  await page.getByRole('button', { name: 'BACK', exact: true }).click();
  await expect(page.locator('.controls-list')).toBeHidden();
  await page.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(page.locator('.menu')).toHaveCount(0);
  await expect(page.locator('.scoreboard dt')).toHaveText(['Score', 'Flips', 'Twists', 'Last Trick', 'Best Score']);
  expect((await snapshot(page)).playing).toBe(true);
  expect(errors).toEqual([]);
});

test('5-8: idle hang, W raises straight legs, releases down and pumps momentum', async ({ page }) => {
  await start(page);
  await advance(page, 1800);
  const idle = await snapshot(page);
  expect(idle.grabs).toBe(2);
  expect(Math.abs(idle.jointAngles.rightHip)).toBeLessThan(0.25);
  expect(idle.speed).toBeLessThan(0.5);
  expect(Math.max(...idle.joints.map(j => j.error))).toBeLessThan(2);
  await page.keyboard.down('w');
  await page.waitForTimeout(60);
  await advance(page, 1200);
  const raised = await snapshot(page);
  expect(raised.jointAngles.rightHip).toBeLessThan(-1.3);
  expect(Math.abs(raised.jointAngles.rightKnee)).toBeLessThan(0.4);
  expect(raised.feet[1].y, JSON.stringify(raised.jointAngles)).toBeLessThan(raised.bodies.find(b => b.label === 'nuro:pelvis')!.y - 30);
  expect(raised.speed).toBeGreaterThan(idle.speed + 0.1);
  await page.screenshot({ path: 'test-results/leg-raise.png' });
  await page.keyboard.up('w');
  await page.waitForTimeout(40);
  await advance(page, 1300);
  const lowered = await snapshot(page);
  expect(Math.abs(lowered.jointAngles.rightHip)).toBeLessThan(0.45);
  expect(lowered.pose).toBe('neutral');
});

test('9: L folds knees and reduces moment of inertia', async ({ page }) => {
  await start(page);
  await advance(page, 500);
  const normal = await snapshot(page);
  await hold(page, 'l', 1200);
  const tuck = await snapshot(page);
  expect(tuck.jointAngles.rightHip).toBeLessThan(-1.5);
  expect(tuck.jointAngles.rightKnee).toBeGreaterThan(1.6);
  expect(tuck.inertia).toBeLessThan(normal.inertia * 0.8);
  await advance(page, 1300);
  expect(Math.abs((await snapshot(page)).jointAngles.rightKnee)).toBeLessThan(0.4);
});

test('10-11,15: physical twist coasts after K; A and D drive opposite rotation', async ({ page }) => {
  await start(page);
  await hold(page, 'd', 700);
  const right = await snapshot(page);
  await page.keyboard.press('r');
  await page.waitForTimeout(80);
  await hold(page, 'a', 700);
  const left = await snapshot(page);
  expect(right.center.x).toBeGreaterThan(left.center.x + 20);
  await page.keyboard.press('r');
  await page.waitForTimeout(80);
  await release(page);
  // Extend airtime without changing the simulation rules.
  await fixture(page, `for (const b of scene.gymnast.bodies) { Matter.Body.translate(b, {x: 300, y: -3200}); Matter.Body.setVelocity(b, {x: 0, y: -5}); }`);
  await hold(page, 'k', 1100);
  const powered = await snapshot(page);
  expect(powered.twistVelocity).toBeGreaterThan(2);
  expect(powered.twistAngle).toBeGreaterThan(1);
  await advance(page, 500);
  const coasting = await snapshot(page);
  expect(coasting.twistAngle).toBeGreaterThan(powered.twistAngle + 0.5);
  expect(coasting.twistVelocity).toBeGreaterThan(powered.twistVelocity * 0.65);
  expect(coasting.twists).toBeGreaterThanOrEqual(1);
  await advance(page, 650);
  expect((await snapshot(page)).twists).toBeGreaterThanOrEqual(2);
});

test('12-13,16: release-only Space, cooldown, automatic one/two-hand regrab and speed limit', async ({ page }) => {
  await start(page);
  await release(page);
  await page.keyboard.press('Space');
  await page.waitForTimeout(40);
  expect((await snapshot(page)).grabs).toBe(0);
  // Move a free-flight fixture near the bar after cooldown. Only one hand is close.
  await fixture(page, `
    scene.grabs.step(500, false);
    const hand = scene.gymnast.hands[0];
    const p = scene.gymnast.handPoint(hand);
    for (const b of scene.gymnast.bodies) {
      Matter.Body.translate(b, {x: 820 - p.x, y: 244 - p.y});
      Matter.Body.setVelocity(b, {x: 0, y: 0});
      Matter.Body.setAngularVelocity(b, 0);
    }
    const other = scene.gymnast.hands[1];
    Matter.Body.translate(other.body, {x: 0, y: 65});
    scene.update(0, 1000 / 120);
  `);
  const regrabbed = await snapshot(page);
  expect(regrabbed.grabs).toBe(1);
  expect(regrabbed.lastTrick).toBe('Regrab');
  expect(regrabbed.score).toBeGreaterThan(0);
  await fixture(page, `
    const hand = scene.gymnast.hands[1];
    const p = scene.gymnast.handPoint(hand);
    Matter.Body.translate(hand.body, {x: 880 - p.x, y: 244 - p.y});
    Matter.Body.setVelocity(hand.body, {x: 0, y: 0});
    Matter.Body.setAngularVelocity(hand.body, 0);
    scene.grabs.step(1000 / 120);
  `);
  expect((await snapshot(page)).grabs).toBe(2);
  await release(page);
  const velocityCheck = await fixture(page, `
    scene.grabs.step(500, false);
    for (const hand of scene.gymnast.hands) {
      const p = scene.gymnast.handPoint(hand);
      Matter.Body.translate(hand.body, {x: 860 - p.x, y: 242 - p.y});
      Matter.Body.setVelocity(hand.body, {x: 24, y: 0});
      Matter.Body.setAngularVelocity(hand.body, 0);
    }
    const before = scene.gymnast.hands.map(h => ({...h.body.velocity}));
    scene.grabs.step(1000 / 120);
    return {count: scene.grabs.count, before, after: scene.gymnast.hands.map(h => ({...h.body.velocity}))};
  `);
  expect(velocityCheck.count).toBe(0);
  expect(velocityCheck.after).toEqual(velocityCheck.before);
});

test('14-15: full flips, doubles, triples, twists and combinations; no small-motion points', async ({ page }) => {
  await start(page);
  const result = await page.evaluate(async () => {
    const path = '/src/player/TrickTracker.ts';
    const { TrickTracker } = await import(/* @vite-ignore */ path);
    const tracker = new TrickTracker();
    tracker.release(0, 0);
    for (let i = 0; i < 400; i++) tracker.step(Math.sin(i) * 0.3, Math.sin(i) * 0.4);
    const tiny = {flips: tracker.flips, twists: tracker.twists};
    const names: string[] = [];
    for (const sign of [-1, 1]) {
      tracker.release(0, 0);
      for (let n = 1; n <= 3; n++) {
        for (let i = (n - 1) * 180 + 1; i <= n * 180 + 1; i++) tracker.step(sign * i * Math.PI / 90, 0);
        names.push(tracker.lastTrick);
      }
    }
    tracker.release(0, 0);
    for (let i = 0; i < 400; i++) tracker.step(0, i * 0.04);
    names.push(tracker.lastTrick);
    for (let i = 0; i < 200; i++) tracker.step(i * 0.04, 16);
    names.push(tracker.lastTrick);
    return {tiny, names};
  });
  expect(result.tiny).toEqual({flips: 0, twists: 0});
  expect(result.names).toEqual(['Front Flip', 'Double Flip', 'Triple Flip', 'Back Flip', 'Double Flip', 'Triple Flip', 'Double Twist', 'Flip + Twist']);
  await release(page);
  await fixture(page, `
    const c = scene.gymnast.center;
    for (const b of scene.gymnast.bodies) {
      const dx = b.position.x - c.x, dy = b.position.y - c.y;
      Matter.Body.translate(b, {x: 300, y: -3200});
      Matter.Body.setVelocity(b, {x: -dy * 0.10, y: dx * 0.10});
      Matter.Body.setAngularVelocity(b, 0.10);
    }
  `);
  await advance(page, 1600);
  const state = await snapshot(page);
  expect(state.flips, JSON.stringify({angle: state.bodies[0].angle, outcome: state.outcome, speed: state.speed, center: state.center})).toBeGreaterThanOrEqual(1);
});

test('17-18: feet landing, crash on head/back or excessive speed, R restart', async ({ page }) => {
  await start(page);
  await release(page);
  await advance(page, 2000);
  const landing = await snapshot(page);
  expect(landing.outcome).toBe('landing');
  expect(landing.lastTrick).toContain('Successful landing');
  expect(landing.score).toBeGreaterThan(0);
  const best = landing.bestScore;
  for (const scenario of ['head', 'back', 'speed']) {
    await page.keyboard.press('r');
    await page.waitForTimeout(80);
    const restarted = await snapshot(page);
    expect(restarted.grabs).toBe(2);
    expect(restarted.score).toBe(0);
    expect(restarted.bestScore).toBe(best);
    await release(page);
    await fixture(page, `
      const pivot = scene.gymnast.center;
      const angle = ${scenario === 'head' ? Math.PI : scenario === 'back' ? Math.PI / 2 : 0};
      for (const b of scene.gymnast.bodies) {
        Matter.Body.rotate(b, angle, pivot);
        Matter.Body.setVelocity(b, {x: 0, y: ${scenario === 'speed' ? 23 : 0}});
        Matter.Body.setAngularVelocity(b, 0);
      }
    `);
    await advance(page, 1500);
    expect((await snapshot(page)).outcome).toBe('crash');
    expect((await snapshot(page)).score).toBe(0);
  }
});
