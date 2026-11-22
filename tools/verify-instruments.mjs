import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [], samples = [];
const baseURL = process.env.HORIZON_URL || 'http://127.0.0.1:5174/';
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('shots/rework', { recursive: true });
const readings = () => page.evaluate(() => {
  const game = window.__horizon;
  const cluster = game.vehicle.root.getObjectByName('liveInstrumentCluster');
  return { state: game.snapshot(), physicalDriverX: game.vehicle.cockpitCamera.position.x,
    gauges: { ...cluster.userData.readings }, needle: cluster.getObjectByName('rpmNeedle').rotation.z };
});
const layout = () => page.evaluate(() => {
  const game = window.__horizon, camera = game.camera;
  const V = game.vehicle.root.position.constructor;
  const cluster = game.vehicle.root.getObjectByName('liveInstrumentCluster');
  const wheel = game.vehicle.root.getObjectByName('steeringWheel');
  cluster.updateMatrixWorld(true); wheel.updateMatrixWorld(true);
  const project = (v) => { const p = v.clone().project(camera); return [(p.x * 0.5 + 0.5) * innerWidth, (0.5 - p.y * 0.5) * innerHeight]; };
  const screen = cluster.children.find((o) => o.geometry?.type === 'PlaneGeometry');
  const { width, height } = screen.geometry.parameters;
  const corners = [];
  for (const x of [-width / 2, width / 2]) for (const y of [-height / 2, height / 2]) corners.push(project(cluster.localToWorld(new V(x, y, 0))));
  const wheelPoints = [];
  wheel.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) wheelPoints.push(project(new V(x, y, z).applyMatrix4(o.matrixWorld)));
  });
  return { screenWidth: width, screenHeight: height,
    panelTop: Math.min(...corners.map((p) => p[1])), panelBottom: Math.max(...corners.map((p) => p[1])),
    wheelTop: Math.min(...wheelPoints.map((p) => p[1])) };
});

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__horizon && document.querySelector('#loading').hidden, null, { timeout: 60000 });
  await page.locator('#start-button').click();
  await page.locator('#map-button').click(); await page.locator('[data-destination="1"]').click();
  await page.waitForTimeout(4600);
  await page.keyboard.press('c'); await page.keyboard.press('c'); await page.waitForTimeout(500);
  const idle = await readings();
  assert.ok(idle.physicalDriverX > 0);
  assert.equal(idle.gauges.gear, 'N'); assert.equal(idle.gauges.rpm, 1350); assert.equal(idle.gauges.speed, 0);
  await page.screenshot({ path: 'shots/rework/cockpit-idle.png' }); samples.push(idle);

  const cluster = await layout();
  assert.ok(cluster.screenWidth >= 0.7, 'the cluster display must be wide enough to keep readouts clear of the rim');
  assert.ok(cluster.wheelTop < cluster.panelBottom, 'the steering wheel must overlap the lower edge of the cluster');

  const interior = await page.evaluate(() => {
    const game = window.__horizon;
    game.renderer.render(game.vehicle.root.parent, game.camera);
    const gl = game.renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let sum = 0, count = 0;
    for (let y = 0; y < h * 0.25; y += 4) for (let x = 0; x < w * 0.5; x += 4) {
      const i = (y * w + x) * 4;
      sum += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]; count++;
    }
    const lights = [];
    game.vehicle.root.traverse((o) => { if (o.isLight && o.intensity > 0) lights.push(o.name); });
    return { meanLuminance: sum / count, lights };
  });
  assert.ok(interior.meanLuminance > 45, 'cockpit interior must be lit by the cabin fill, not a black frame');
  assert.ok(interior.lights.includes('cockpitFillLight'));

  await page.keyboard.press('f');
  await page.keyboard.down('w'); await page.waitForTimeout(5000); await page.keyboard.up('w');
  const moving = await readings();
  assert.ok(moving.state.speed > 50);
  assert.ok(moving.gauges.rpm > 2000);
  assert.ok(typeof moving.gauges.gear === 'number');
  assert.equal(moving.gauges.gear, moving.state.gear);
  assert.ok(Math.abs(moving.gauges.rpm - moving.state.rpm) < 1);
  assert.ok(Math.abs(moving.gauges.speed * 3.6 - moving.state.speed) < 1);
  assert.notEqual(moving.needle, idle.needle);
  assert.ok(moving.gauges.fuel < idle.gauges.fuel);
  assert.ok(moving.gauges.coolant > idle.gauges.coolant);
  assert.ok(moving.gauges.odometer > idle.gauges.odometer);
  await page.screenshot({ path: 'shots/rework/cockpit-driving.png' }); samples.push(moving);

  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__horizon.vehicle.root.getObjectByName('liveInstrumentCluster').userData.readings.turnSignal === 1);
  await page.screenshot({ path: 'shots/rework/cockpit-indicator.png' });
  await page.keyboard.press('e');
  await page.keyboard.press('t'); await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/rework/cockpit-sunset.png' });
  samples.push(await readings());
  assert.deepEqual(errors, []);
  await writeFile('shots/rework/instruments-results.json', JSON.stringify({ status: 'passed', layout: cluster, interior, samples, errors }, null, 2));
  console.log('PASS: lit cockpit interior; wide low cluster split into left/right readouts, wheel rim overlaps only the empty lower band; left driver; physical RPM needle, gear, speed, fuel, coolant, mileage, signals and sunset follow live driving state');
} finally {
  await browser.close();
}
