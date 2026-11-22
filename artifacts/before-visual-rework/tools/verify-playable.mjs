import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = process.env.HORIZON_URL || 'http://127.0.0.1:5174/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const errors = [];
const results = { baseURL, checks: [], regions: [], screenshots: [] };
await mkdir('shots', { recursive: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (error) => errors.push(error.message));
const shot = async (name) => { await page.screenshot({ path: `shots/${name}.png` }); results.screenshots.push(`shots/${name}.png`); };
const snapshot = () => page.evaluate(() => window.__horizon.snapshot());
const check = (name) => { results.checks.push(name); console.log('PASS', name); };

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__horizon && document.querySelector('#loading').hidden);
  await shot('horizon-title');
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__horizon.screen === 'drive');
  check('start enters free driving');
  await page.keyboard.down('w'); await page.waitForTimeout(1800); await page.keyboard.up('w');
  assert.ok((await snapshot()).speed > 35);
  await page.keyboard.down('s'); await page.waitForTimeout(1600); await page.keyboard.up('s');
  assert.ok(Math.abs((await snapshot()).speed) < 2);
  check('accelerator and brake respond to real keyboard input');

  for (let mode = 1; mode <= 4; mode++) {
    await page.keyboard.press('c');
    assert.equal((await snapshot()).view, mode % 4);
  }
  check('four driving views cycle without changing the vehicle');
  await page.keyboard.press('f'); await page.waitForTimeout(1300);
  assert.equal((await snapshot()).cruise, true);
  assert.ok((await snapshot()).speed > 5);
  await page.keyboard.down('s'); await page.waitForTimeout(100); await page.keyboard.up('s');
  assert.equal((await snapshot()).cruise, false);
  check('scenic cruise starts and manual brake takes over');

  await page.keyboard.press('r');
  await page.keyboard.press('p');
  assert.equal((await snapshot()).screen, 'photo');
  const photoPosition = await page.evaluate(() => window.__horizon.camera.position.toArray());
  await page.mouse.move(800, 420); await page.mouse.down(); await page.mouse.move(990, 470, { steps: 8 }); await page.mouse.up();
  await page.mouse.wheel(0, -100); await page.waitForTimeout(500);
  const nextPhotoPosition = await page.evaluate(() => window.__horizon.camera.position.toArray());
  assert.notDeepEqual(photoPosition, nextPhotoPosition);
  await page.keyboard.press('r');
  assert.equal((await snapshot()).screen, 'drive');
  assert.equal(await page.locator('#photo-hud').isVisible(), false);
  await page.keyboard.press('c'); assert.equal((await snapshot()).view, 1); await page.keyboard.press('c'); await page.keyboard.press('c'); await page.keyboard.press('c');
  check('photography orbit/zoom and reset restore the complete driving state');

  await page.keyboard.press('Escape');
  assert.equal((await snapshot()).screen, 'pause');
  await page.locator('#resume-button').click();
  await page.keyboard.press('h');
  assert.equal(await page.locator('#app').evaluate((node) => node.classList.contains('hud-hidden')), true);
  await page.keyboard.press('h');
  check('pause, resume and clean scenery view work');

  for (let i = 0; i < 6; i++) {
    await page.locator('#map-button').click();
    await page.locator(`[data-destination="${i}"]`).click();
    await page.waitForTimeout(3900);
    const state = await snapshot();
    assert.equal(state.screen, 'drive');
    assert.ok(state.position.every(Number.isFinite));
    results.regions.push(state);
    await shot(`horizon-region-${i}`);
    console.log('SCENE', state.region, `${state.fps}fps`);
  }
  assert.equal(new Set(results.regions.map((region) => region.region)).size, 6);
  check('six distinct scenery destinations are reachable from the map');
  await page.locator('#mood-button').click();
  assert.equal((await snapshot()).mood, 'sunset');
  await page.waitForTimeout(600); await shot('horizon-sunset');
  await page.locator('#mood-button').click();
  check('daylight and sunset switch in the running world');

  await page.locator('#map-button').click(); await page.locator('[data-destination="1"]').click(); await page.waitForTimeout(3900);
  for (let i = 1; i <= 3; i++) {
    await page.keyboard.press('c'); await page.waitForTimeout(350); await shot(`horizon-view-${i}`);
  }
  await page.keyboard.press('c');

  await page.locator('#map-button').click(); await page.waitForTimeout(200); await shot('horizon-map');
  await page.locator('#race-button').click(); await page.waitForTimeout(800);
  const countdownText = await page.locator('#toast').textContent();
  assert.ok(!countdownText.includes('出发！'), 'the start notification must wait for the countdown');
  assert.equal((await snapshot()).speed, 0);
  await page.waitForTimeout(2800);
  await page.keyboard.press('f');
  await page.waitForTimeout(2000); await shot('horizon-race');
  assert.ok((await snapshot()).speed > 10);
  await page.waitForFunction(() => window.__horizon.screen === 'pause' && !window.__horizon.race, null, { timeout: 65000 });
  await shot('horizon-race-finish');
  check('a real three-opponent sprint starts after countdown and reaches the results screen');

  await page.locator('#resume-button').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await shot('horizon-portrait');
  await page.locator('#map-button').click();
  assert.equal(await page.locator('.destination').count(), 6);
  await shot('horizon-portrait-map');
  check('portrait HUD and all six destinations fit without horizontal scrolling');
  const touchPage = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  touchPage.on('pageerror', (error) => errors.push(error.message));
  await touchPage.goto(baseURL, { waitUntil: 'networkidle' });
  await touchPage.waitForFunction(() => window.__horizon && document.querySelector('#loading').hidden);
  await touchPage.locator('#start-button').click();
  const pedal = touchPage.locator('[data-drive="throttle"]');
  assert.equal(await pedal.isVisible(), true);
  const box = await pedal.boundingBox();
  await touchPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await touchPage.mouse.down(); await touchPage.waitForTimeout(1300); await touchPage.mouse.up();
  assert.ok(await touchPage.evaluate(() => window.__horizon.state.speed * 3.6 > 20));
  await touchPage.screenshot({ path: 'shots/horizon-touch-landscape.png' });
  results.screenshots.push('shots/horizon-touch-landscape.png');
  await touchPage.close();
  check('coarse-pointer driving controls accept and release a held accelerator');
  assert.deepEqual(errors, []);
  results.errors = errors;
  results.status = 'passed';
} catch (error) {
  results.status = 'failed'; results.failure = error.stack; results.errors = errors;
  await page.screenshot({ path: 'shots/verification-failure.png' }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile('shots/playability-results.json', JSON.stringify(results, null, 2));
  await browser.close();
}
