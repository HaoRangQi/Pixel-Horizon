// Daylight look gate: opens the real game, measures what the player actually sees in
// three representative places (garage, coastal road, mountain pass), and proves the
// sunny-day exposure stays bright without clipping highlights. Run with the dev
// server up: npm run verify:lighting (HORIZON_URL overrides the default port).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = process.env.HORIZON_URL || 'http://127.0.0.1:5174/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const results = { baseURL, checks: [], scenes: [], status: 'running' };
await mkdir('shots/light', { recursive: true });

const snapshot = () => page.evaluate(() => window.__horizon.snapshot());
const exposure = () => page.evaluate(() => window.__horizon.renderer.toneMappingExposure);
const check = (name) => { results.checks.push(name); console.log('PASS', name); };

async function measure(name) {
  const buffer = await page.screenshot();
  const stats = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const all = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let luma = 0;
    for (let i = 0; i < all.length; i += 4) luma += 0.2126 * all[i] + 0.7152 * all[i + 1] + 0.0722 * all[i + 2];
    const averageLuma = +(luma / (all.length / 4)).toFixed(2);
    // Judge clipping from the middle of the frame (sky, road, car) and skip the white
    // HUD glyphs at the edges: a sunny-day gate should measure the scene, not the UI.
    const roi = { x0: Math.round(canvas.width * 0.35), y0: Math.round(canvas.height * 0.22), x1: Math.round(canvas.width * 0.86), y1: Math.round(canvas.height * 0.8) };
    const pixels = context.getImageData(roi.x0, roi.y0, roi.x1 - roi.x0, roi.y1 - roi.y0).data;
    let clipped = 0, max = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const y = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      if (y >= 250) clipped++; if (y > max) max = y;
    }
    const count = pixels.length / 4;
    return { averageLuma, clippedRatio: +(clipped / count).toFixed(5), maxLuma: +max.toFixed(1), pixels: all.length / 4 };
  }, buffer.toString('base64'));
  const live = await snapshot();
  const scene = { name, ...stats, draws: live.draws, triangles: live.triangles, fps: live.fps };
  results.scenes.push(scene);
  console.log('SCENE', name, JSON.stringify(scene));
  return scene;
}

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__horizon && document.querySelector('#loading').hidden);
  await page.waitForTimeout(900);

  assert.equal((await snapshot()).mood, 'day');
  assert.ok(Math.abs((await exposure()) - 1.12) < 0.001, 'day exposure must be applied on first load');
  check('sunny-day exposure is active on first load');

  const garage = await measure('garage-showcase');
  assert.ok(garage.averageLuma >= 88, `garage showcase is too dark: ${garage.averageLuma}`);
  assert.ok(garage.averageLuma <= 170, `garage showcase is washed out: ${garage.averageLuma}`);

  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__horizon.screen === 'drive');
  const travel = async (index) => {
    await page.locator('#map-button').click();
    await page.locator(`[data-destination="${index}"]`).click();
    await page.waitForTimeout(4000);
  };

  await travel(1);
  const coast = await measure('lighthouse-coast');
  assert.ok(coast.averageLuma >= 105, `coastal road is too dark: ${coast.averageLuma}`);
  assert.ok(coast.averageLuma <= 165, `coastal road is washed out: ${coast.averageLuma}`);

  await travel(2);
  const fields = await measure('golden-fields');
  assert.ok(fields.averageLuma >= 105, `golden fields are too dark: ${fields.averageLuma}`);

  await travel(5);
  for (let i = 0; i < 3; i++) await page.keyboard.press('c');
  await page.waitForTimeout(1200);
  const summit = await measure('mountain-pass-high');
  assert.ok(summit.averageLuma >= 105, `mountain pass is too dark: ${summit.averageLuma}`);

  for (const scene of [garage, coast, fields, summit]) {
    assert.ok(scene.clippedRatio <= 0.005, `${scene.name} clips ${(scene.clippedRatio * 100).toFixed(2)}% of pixels`);
  }
  check('day scenes stay bright without clipped highlights');

  const live = await snapshot();
  assert.ok(live.draws <= 900, `draw calls grew to ${live.draws}`);
  assert.ok(live.fps >= 30, `frame rate dropped to ${live.fps}`);
  check('draw calls and frame rate stay within the scene budget');

  await page.keyboard.press('t');
  await page.waitForTimeout(500);
  assert.equal((await snapshot()).mood, 'sunset');
  assert.ok(Math.abs((await exposure()) - 0.98) < 0.001);
  await page.keyboard.press('t');
  await page.waitForTimeout(500);
  assert.equal((await snapshot()).mood, 'day');
  assert.ok(Math.abs((await exposure()) - 1.12) < 0.001, 'returning to day restores the sunny exposure');
  check('mood toggle keeps the calibrated day exposure');

  assert.deepEqual(errors, []);
  check('no page errors during the lighting pass');
  results.status = 'passed';
} catch (error) {
  results.status = 'failed';
  results.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  results.errors = errors;
  await writeFile('shots/light/lighting-results.json', JSON.stringify(results, null, 2));
  await browser.close();
}
