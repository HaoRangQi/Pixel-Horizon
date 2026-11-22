import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [], samples = [];
const baseURL = process.env.HORIZON_URL || 'http://127.0.0.1:5174/';
page.on('pageerror', (error) => errors.push(error.message));
await mkdir('shots/rework', { recursive: true });

const reading = () => page.evaluate(() => {
  const game = window.__horizon, state = game.state, road = game.world.road;
  const hit = road.nearest(state.x, state.z);
  // + = driver-left of the painted centreline; the right-hand lane centre is -width/4.
  const lateral = (state.x - hit.point.x) * Math.cos(hit.heading) - (state.z - hit.point.z) * Math.sin(hit.heading);
  const wheel = game.vehicle.root.getObjectByName('steeringWheel');
  return { t: state.t, kmh: state.speed * 3.6, lateral, wheel: wheel.rotation.z,
    steer: state.steer, cruise: state.cruise, offroad: state.offroad, laneTarget: -road.width * 0.25 };
});

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__horizon && document.querySelector('#loading').hidden, null, { timeout: 60000 });
  await page.locator('#start-button').click();
  await page.keyboard.press('c'); await page.keyboard.press('c'); // cockpit, where the wheel is visible

  // Start in the twisty mountain pass so the run covers real bends, already in the right lane.
  await page.evaluate(() => {
    const game = window.__horizon, state = game.state, road = game.world.road;
    const sample = road.sample(0.775), lane = road.width * 0.25;
    state.t = 0.775;
    state.x = sample.position.x - Math.cos(sample.heading) * lane;
    state.z = sample.position.z + Math.sin(sample.heading) * lane;
    state.y = sample.position.y + 0.04;
    state.heading = state.motionHeading = sample.heading;
    state.speed = 19; state.cruise = false;
  });
  await page.keyboard.press('f'); // scenic cruise
  await page.waitForFunction(() => window.__horizon.state.cruise === true);

  let shot = null;
  const started = Date.now();
  while (Date.now() - started < 24000) {
    const sample = await reading();
    samples.push(sample);
    if (!shot && Math.abs(sample.wheel) > 0.35) {
      shot = sample;
      await page.screenshot({ path: 'shots/rework/cockpit-cruise-bend.png' });
    }
    await page.waitForTimeout(90);
  }

  const lateral = samples.map((s) => s.lateral);
  const lock = samples.map((s) => Math.abs(s.wheel));
  const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
  const target = samples[0].laneTarget;

  assert.ok(samples.every((s) => s.cruise), 'cruise must stay engaged for the whole run');
  assert.ok(Math.max(...lateral) < 0.2, `cruise must never touch or cross the centreline (max ${Math.max(...lateral).toFixed(2)}m)`);
  assert.ok(mean(lateral) < target * 0.75, `cruise must ride the right lane (mean ${mean(lateral).toFixed(2)}m, target ${target.toFixed(2)}m)`);
  assert.ok(samples.every((s) => !s.offroad), 'cruise must keep all four wheels on the tarmac');
  assert.ok(Math.max(...lock) > 0.35, `the wheel must visibly turn through bends (max ${(Math.max(...lock) * 180 / Math.PI).toFixed(1)}°)`);
  assert.ok(Math.max(...lock) - Math.min(...lock) > 0.4, 'wheel lock must vary as the road bends, not sit frozen');
  assert.ok(Math.abs(samples.at(-1).wheel - samples[0].wheel) > 0.05, 'wheel must animate over the run');
  assert.deepEqual(errors, []);
  await writeFile('shots/rework/cruise-results.json', JSON.stringify({
    status: 'passed', targetLane: target, lanes: { mean: mean(lateral), min: Math.min(...lateral), max: Math.max(...lateral) },
    wheelDegrees: { max: Math.max(...lock) * 180 / Math.PI, min: Math.min(...lock) * 180 / Math.PI },
    samples: samples.length, shot, errors,
  }, null, 2));
  console.log(`PASS: right-lane cruise (mean ${mean(lateral).toFixed(2)}m of a ${target.toFixed(2)}m target, never left of ${Math.max(...lateral).toFixed(2)}m) with the wheel turning to ${(Math.max(...lock) * 180 / Math.PI).toFixed(0)}° through the bends`);
} finally {
  await browser.close();
}
