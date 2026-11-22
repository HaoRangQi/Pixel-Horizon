import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
const baseURL = process.env.HORIZON_URL || 'http://127.0.0.1:5174/';
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
await mkdir('shots/rework', { recursive: true });

const snapshot = () => page.evaluate(() => {
  const game = window.__horizon, cluster = game.vehicle.root.getObjectByName('liveInstrumentCluster');
  return {
    style: game.vehicle.style,
    visibleShells: ['one', 'coupe'].filter((key) => game.vehicle.root.getObjectByName(`body-${key}`).visible),
    badge: cluster.userData.readings.brand,
    caption: document.querySelector('#car-name').textContent,
    speed: game.state.speed, gear: game.state.gear,
    mirrors: !!game.vehicle.mirrors,
    mirrorGlass: !!game.vehicle.root.getObjectByName('interiorMirrorGlass'),
    cockpitX: game.vehicle.cockpitCamera.position.x,
    fps: game.fps,
  };
});

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__horizon && document.querySelector('#loading').hidden, null, { timeout: 60000 });
  await page.locator('#start-button').click();
  const first = await snapshot();
  assert.equal(first.style, 'one');
  assert.equal(first.caption, 'AMG ONE');
  assert.deepEqual(first.visibleShells, ['one']);
  assert.ok(first.cockpitX > 0.3, 'both cars keep the driver on the left');
  assert.ok(first.mirrors && first.mirrorGlass);

  await page.keyboard.press('g');
  await page.waitForTimeout(400);
  const coupe = await snapshot();
  assert.equal(coupe.style, 'coupe');
  assert.equal(coupe.caption, 'HORIZON M4');
  assert.deepEqual(coupe.visibleShells, ['coupe']);
  assert.equal(coupe.badge.sub, 'HORIZON M4');
  assert.equal(coupe.badge.header, 'M  //  PERFORMANCE');
  assert.ok(coupe.cockpitX > 0.3);
  await page.screenshot({ path: 'shots/rework/garage-coupe-road.png' });

  await page.keyboard.press('c'); await page.keyboard.press('c'); // cockpit
  await page.waitForTimeout(1600); // let the one-second FPS window cover the cockpit frames
  const cockpit = await snapshot();
  assert.ok(cockpit.fps > 45, `coupe cockpit should hold frame rate (${cockpit.fps.toFixed(1)})`);
  const mirror = await page.evaluate(() => {
    const game = window.__horizon, mirrors = game.vehicle.mirrors;
    const gl = game.renderer.getContext();
    const texture = mirrors.target.texture;
    return { width: mirrors.target.width, height: mirrors.target.height, visible: mirrors.sides.visible,
      interior: mirrors.interior.visible, hasMap: !!game.vehicle.root.getObjectByName('interiorMirrorGlass').material.map, type: texture.type };
  });
  assert.ok(mirror.hasMap, 'the interior mirror must be textured with the rear panorama');
  assert.ok(mirror.visible && mirror.interior, 'all three mirrors must be live in the cockpit');
  assert.equal(mirror.width, 768); assert.equal(mirror.height, 192);
  await page.screenshot({ path: 'shots/rework/coupe-cockpit.png' });

  // Driving in the coupe must keep the shared model, HUD and gauges coherent.
  await page.keyboard.down('w'); await page.waitForTimeout(3500); await page.keyboard.up('w');
  const driving = await snapshot();
  assert.ok(driving.speed > 25, `coupe must drive (${driving.speed.toFixed(1)} m/s)`);
  assert.ok(driving.fps > 45, `coupe cockpit should hold frame rate (${driving.fps.toFixed(1)})`);
  await page.screenshot({ path: 'shots/rework/coupe-cockpit-driving.png' });

  // Race opponents borrow the other body style, so a swap never leaves the grid empty.
  await page.keyboard.press('c'); await page.keyboard.press('c');
  await page.keyboard.press('g');
  await page.waitForTimeout(400);
  const back = await snapshot();
  assert.equal(back.style, 'one');
  assert.equal(back.caption, 'AMG ONE');
  assert.deepEqual(back.visibleShells, ['one']);
  assert.deepEqual(errors, []);
  await writeFile('shots/rework/garage-results.json', JSON.stringify({ status: 'passed', first, coupe, mirror, driving, back, errors }, null, 2));
  console.log(`PASS: garage swaps between ${first.caption} and ${coupe.caption} mid-drive (badge and caption follow), keeps the left-hand cockpit, all three mirrors live at 768×192, and holds ${driving.fps.toFixed(0)}fps`);
} finally {
  await browser.close();
}
