// NPC traffic verification: drives among the fleet in real Chrome, checks that nobody
// overlaps the player, that the toggle works, and measures the draw-call / triangle / frame
// cost with traffic on versus off at the same paused camera.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = process.env.HORIZON_URL || 'http://127.0.0.1:5174/';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [], results = { baseURL, checks: [], samples: [], measurements: {}, screenshots: [] };
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('shots/traffic', { recursive: true });

const check = (name) => { results.checks.push(name); console.log('PASS', name); };
const snapshot = () => page.evaluate(() => window.__horizon.snapshot());
const trafficStats = () => page.evaluate(() => window.__horizon.traffic.stats());
const playerState = () => page.evaluate(() => {
  const { state, world } = window.__horizon;
  const hit = world.road.nearest(state.x, state.z);
  return {
    x: state.x, z: state.z, t: state.t, speed: state.speed,
    lateral: (state.x - hit.point.x) * Math.cos(hit.heading) - (state.z - hit.point.z) * Math.sin(hit.heading),
  };
});
const nearestGap = (stats, p) => Math.min(...stats.cars.map((car) => Math.hypot(car.x - p.x, car.z - p.z)));
// Physical overlap in road space: two ~4.8 m x 2.1 m cars need clearance on at least one axis.
const overlaps = (stats, p) => {
  const length = stats.length;
  return stats.cars.filter((car) => {
    const d = (((car.t - p.t) % 1) + 1) % 1 * length;
    const along = Math.min(d, length - d);
    const lateral = Math.abs(p.lateral - car.offset);
    return along < 4.8 + 0.15 && lateral < 2.2 + 0.15;
  }).length;
};

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__horizon && document.querySelector('#loading').hidden, null, { timeout: 60000 });
  const boot = await trafficStats();
  assert.ok(boot.enabled && boot.count >= 12, `a fleet is live at boot (${boot.count} cars)`);
  check(`traffic fleet boots with ${boot.count} cars`);

  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__horizon.screen === 'drive');

  // Drive normally for a while among the traffic, sampling positions every 250 ms.
  await page.keyboard.down('w');
  let closest = Infinity, seen = 0;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    const stats = await trafficStats();
    const player = await playerState();
    const gap = nearestGap(stats, player);
    closest = Math.min(closest, gap);
    seen = Math.max(seen, stats.visible);
    const clashes = overlaps(stats, player);
    results.samples.push({ t: player.t, speed: player.speed, visible: stats.visible, nearest: +gap.toFixed(2), overlaps: clashes, minPlayerGap: stats.minPlayerGap });
    assert.equal(clashes, 0, `no NPC overlaps the player (${clashes} at t=${player.t.toFixed(4)})`);
  }
  await page.keyboard.up('w');
  assert.ok(seen > 0, 'at least one NPC enters the 600 m render window while driving');
  check(`10 s of driving: closest NPC ${closest.toFixed(1)} m, up to ${seen} visible, no overlap`);

  // Park the player just behind a same-direction car, in the right-hand lane, and look at it.
  await page.evaluate(() => {
    const game = window.__horizon, road = game.world.road, state = game.state;
    const fleet = game.traffic.stats().cars;
    const target = fleet.find((car) => car.dir === 1) ?? fleet[0];
    const lane = road.width * 0.25;
    const sample = road.sample((((target.t - 25 / road.length) % 1) + 1) % 1);
    state.t = (((target.t - 25 / road.length) % 1) + 1) % 1;
    state.x = sample.position.x - Math.cos(sample.heading) * lane;
    state.z = sample.position.z + Math.sin(sample.heading) * lane;
    state.y = sample.position.y + 0.04;
    state.heading = state.motionHeading = sample.heading;
    state.speed = 16;
    state.cruise = false;
    game.rig.reset();
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'shots/traffic/traffic-chase.png' });
  results.screenshots.push('shots/traffic/traffic-chase.png');
  const parked = await trafficStats();
  assert.ok(parked.visible > 0, `a car is in frame after placing the player behind it (${parked.visible} visible)`);

  // The NPC must yield rather than let a fast player drive through it.
  await page.keyboard.down('w');
  let ramClosest = Infinity, ramOverlaps = 0;
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(200);
    const stats = await trafficStats();
    const player = await playerState();
    ramClosest = Math.min(ramClosest, nearestGap(stats, player));
    const clashes = overlaps(stats, player);
    ramOverlaps += clashes;
    results.samples.push({ phase: 'ram', t: player.t, speed: player.speed, nearest: +ramClosest.toFixed(2), overlaps: clashes });
  }
  await page.keyboard.up('w');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/traffic/traffic-pass.png' });
  results.screenshots.push('shots/traffic/traffic-pass.png');
  assert.equal(ramOverlaps, 0, `closing on a car never interpenetrated (${ramOverlaps} overlaps)`);
  check(`closing at speed: no overlap across ${24} samples (closest centre ${ramClosest.toFixed(1)} m)`);

  // Stage a side-by-side view for the visual record: same shell, different paint.
  await page.evaluate(() => {
    const game = window.__horizon, road = game.world.road, state = game.state;
    const car = game.traffic.cars.find((entry) => entry.dir === 1);
    car.speed = 0; car.cruise = 0; car.freeSpeed = 0; // hold it still for the portrait
    const t = (((car.t - 5 / road.length) % 1) + 1) % 1;
    const sample = road.sample(t);
    const lane = road.width * 0.25;
    state.t = t;
    state.x = sample.position.x + Math.cos(sample.heading) * lane;
    state.z = sample.position.z - Math.sin(sample.heading) * lane;
    state.y = sample.position.y + 0.04;
    state.heading = state.motionHeading = sample.heading;
    state.speed = 0;
    state.cruise = false;
    game.rig.reset();
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'shots/traffic/traffic-side.png' });
  results.screenshots.push('shots/traffic/traffic-side.png');

  // V toggles the system off and on without touching the player's car.
  const beforeToggle = await snapshot();
  await page.keyboard.press('v');
  await page.waitForTimeout(250);
  const off = await snapshot();
  assert.equal(off.traffic.enabled, false);
  assert.equal(off.traffic.visible, 0);
  assert.equal(off.screen, 'drive');
  assert.ok(off.t >= beforeToggle.t, 'toggling traffic does not reset or rewind the player');
  await page.keyboard.press('v');
  await page.waitForTimeout(500);
  const on = await snapshot();
  assert.equal(on.traffic.enabled, true);
  assert.ok(on.traffic.visible > 0);
  check('V switches traffic off and back on without disturbing the player');

  // A/B cost at one fixed camera: pause freezes the world, then toggle the fleet.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__horizon.traffic.setEnabled(true));
  await page.waitForTimeout(600);
  const withTraffic = [];
  for (let i = 0; i < 3; i++) { await page.waitForTimeout(350); withTraffic.push(await snapshot()); }
  await page.evaluate(() => window.__horizon.traffic.setEnabled(false));
  await page.waitForTimeout(600);
  const without = [];
  for (let i = 0; i < 3; i++) { await page.waitForTimeout(350); without.push(await snapshot()); }
  await page.evaluate(() => window.__horizon.traffic.setEnabled(true));
  const pick = (rows) => ({
    draws: Math.round(rows.reduce((sum, row) => sum + row.draws, 0) / rows.length),
    triangles: Math.round(rows.reduce((sum, row) => sum + row.triangles, 0) / rows.length),
    fps: Math.round(rows.reduce((sum, row) => sum + row.fps, 0) / rows.length),
    visible: Math.round(rows.reduce((sum, row) => sum + row.traffic.visible, 0) / rows.length),
  });
  results.measurements = { withTraffic: pick(withTraffic), withoutTraffic: pick(without) };
  assert.ok(results.measurements.withTraffic.visible > 0, 'the A/B frame actually contains NPC cars');
  assert.equal(results.measurements.withoutTraffic.visible, 0);
  console.log('MEASURED', JSON.stringify(results.measurements));
  assert.ok(results.measurements.withTraffic.draws - results.measurements.withoutTraffic.draws <= 45,
    `traffic adds at most 45 draw calls (${results.measurements.withoutTraffic.draws} → ${results.measurements.withTraffic.draws})`);
  check(`cost at a fixed camera: +${results.measurements.withTraffic.draws - results.measurements.withoutTraffic.draws} draws, `
    + `+${Math.round((results.measurements.withTraffic.triangles - results.measurements.withoutTraffic.triangles) / 1000)}k triangles`);

  // Configurability: density/count and speed scale via the public API.
  await page.evaluate(() => window.__horizon.traffic.configure({ count: 5 }));
  await page.waitForTimeout(400);
  const reduced = await trafficStats();
  assert.equal(reduced.count, 5);
  assert.ok(reduced.cars.length <= 5);
  await page.evaluate(() => window.__horizon.traffic.configure({ density: 0.6, speedScale: 1 }));
  await page.waitForTimeout(300);
  const density = await trafficStats();
  assert.equal(density.count, 4, `density 0.6/km on a 7.46 km loop gives 4 cars (${density.count})`);
  await page.evaluate(() => window.__horizon.traffic.configure({ density: 3 }));
  await page.waitForTimeout(300);
  const restored = await trafficStats();
  assert.equal(restored.count, 22);
  check('count and density are configurable through the traffic API');

  assert.deepEqual(errors, []);
  results.errors = errors;
  results.status = 'passed';
  console.log(JSON.stringify({ status: 'passed', checks: results.checks.length, measurements: results.measurements, closest, ramClosest, visible: seen }, null, 2));
} catch (error) {
  results.status = 'failed';
  results.failure = error.stack;
  results.errors = errors;
  await page.screenshot({ path: 'shots/traffic/traffic-failure.png' }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile('shots/traffic/traffic-results.json', JSON.stringify(results, null, 2));
  await browser.close();
}
