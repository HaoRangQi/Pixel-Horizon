// Memory soak: drives and swaps cars for a while inside a real Chrome tab and samples
// the JS heap, the WebGL resource counts and the scene graph size.
//
// Why this exists: the "300 GB node" alarm traced back to src/car/check.mjs handing a
// Three.js Group to assert.equal, not to the game. This is the counter-evidence — if the
// runtime leaked, heap and renderer.info.memory would climb while the car swaps.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const baseURL = process.env.HORIZON_URL || 'http://127.0.0.1:5173/';

const sample = () => page.evaluate(() => {
  const game = window.__horizon, renderer = game.renderer, root = game.vehicle.root;
  let nodes = 0;
  root.traverse(() => { nodes++; });
  return {
    mb: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? -1,
    children: root.children.length,
    nodes,
    style: game.vehicle.style,
    speed: Math.round(game.state.speed * 3.6),
    fps: game.fps,
  };
});

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__horizon && document.querySelector('#loading').hidden, null, { timeout: 60000 });
  await page.locator('#start-button').click();
  await page.keyboard.press('c'); // cockpit: the heaviest view (mirrors + cluster redraw)
  await page.waitForTimeout(500);

  const idle = await sample();
  // Warm up hard before measuring: first frames allocate textures, shader programs and the
  // mirror target, and every one of those is a one-off rather than a leak.
  await page.keyboard.down('w');
  await page.waitForTimeout(20000);
  const warm = await sample();
  const warmupLimit = warm.mb + 4;

  const drive = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(10000);
    drive.push(await sample());
  }
  await page.keyboard.up('w');

  // Swaps rebuild the mirror rig (render target + materials + camera) and swap the whole
  // cockpit pair, which is where a leak would actually show up. Warm up with two swaps
  // first: the first visit to each style uploads that cockpit's geometries to the GPU once,
  // and that steady-state cost is not a leak. Only growth after that counts.
  const beforeSwaps = await sample();
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('g');
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1500);
  const warmSwaps = await sample();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('g');
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(2000);
  const afterSwaps = await sample();

  const peak = Math.max(...drive.map((row) => row.mb));
  const drift = peak - warm.mb;
  const result = { idle, warm, drive, beforeSwaps, warmSwaps, afterSwaps, peakMB: peak, driftMB: drift, errors };
  console.log(JSON.stringify(result, null, 2));

  assert.deepEqual(errors, [], 'no page errors during the soak');
  assert.ok(drive.every((row) => row.fps > 30), `frame rate held while driving (${drive.map((r) => r.fps.toFixed(0)).join(', ')})`);
  assert.ok(drive.at(-1).mb <= warmupLimit, `heap stays within ${warmupLimit} MB of the warmed baseline (${drive.at(-1).mb} MB)`);
  assert.ok(drift < 40, `no upward heap trend over a minute of driving (peak +${drift} MB)`);
  // A swap must release what the previous style built: once both cockpits have been seen,
  // the live resource counts and the root's child list may not grow with further swaps.
  assert.ok(afterSwaps.geometries <= warmSwaps.geometries + 2, `geometries released on swap (${warmSwaps.geometries} → ${afterSwaps.geometries})`);
  assert.ok(afterSwaps.textures <= warmSwaps.textures + 2, `textures released on swap (${warmSwaps.textures} → ${afterSwaps.textures})`);
  assert.ok(afterSwaps.programs <= warmSwaps.programs + 4, `shader programs stable across swaps (${warmSwaps.programs} → ${afterSwaps.programs})`);
  assert.ok(afterSwaps.children === beforeSwaps.children, `scene graph does not grow with swaps (${beforeSwaps.children} → ${afterSwaps.children})`);
  assert.ok(afterSwaps.nodes <= warmSwaps.nodes + 8, `object count stable across 12 swaps (${warmSwaps.nodes} → ${afterSwaps.nodes})`);
  console.log(`PASS: ${drive.length * 10}s of driving held ${warm.mb}→${drive.at(-1).mb} MB with ${afterSwaps.geometries} geometries / ${afterSwaps.textures} textures / ${afterSwaps.programs} programs after 12 swaps`);
} finally {
  await browser.close();
}
