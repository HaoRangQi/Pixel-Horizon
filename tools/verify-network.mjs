import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const baseURL = process.env.HORIZON_URL || 'http://127.0.0.1:5177/';
const output = process.env.HORIZON_SHOTS || 'shots/network';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [], results = { baseURL, maps: [] };
page.on('pageerror', (e) => errors.push(e.message));

async function visibleRoads(id) {
  return page.evaluate((id) => {
    const { world } = window.__horizon, canvas = document.getElementById(id);
    const { width, height } = canvas, ctx = canvas.getContext('2d');
    const points = world.mapPaths.flatMap((path) => path.points);
    const xs = points.map((p) => p.x), zs = points.map((p) => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const margin = id === 'large-map' ? 65 : 29;
    const scale = Math.min((width - margin * 2) / (maxX - minX), (height - margin * 2) / (maxZ - minZ));
    return world.mapPaths.filter((path) => path.id).map((path) => {
      const middle = path.points.filter((p, i) => i > 2 && i < path.points.length - 3 && world.road.mainNearest(p.x, p.z).distance > 65);
      let visible = 0;
      for (const p of middle) {
        const x = Math.round(width / 2 + (p.x - (minX + maxX) / 2) * scale);
        const y = Math.round(height / 2 + (p.z - (minZ + maxZ) / 2) * scale);
        const pixels = ctx.getImageData(x - 3, y - 3, 7, 7).data;
        if (pixels.some((v, i) => i % 4 === 3 && v > 170 && pixels[i - 3] > 90)) visible++;
      }
      return { id: path.id, name: path.name, visible, samples: middle.length };
    });
  }, id);
}

try {
  await page.goto(baseURL);
  await page.waitForFunction(() => window.__horizon && document.getElementById('loading').hidden);
  await page.locator('#start-button').click();
  await page.locator('#map-button').click();
  await page.waitForFunction(() => getComputedStyle(document.getElementById('toast')).opacity === '0');
  await page.screenshot({ path: `${output}/map-desktop.png` });
  await page.locator('.large-map').screenshot({ path: `${output}/map-detail.png` });
  for (const id of ['large-map', 'minimap']) {
    const paths = await visibleRoads(id);
    results.maps.push({ canvas: id, paths });
    for (const path of paths) assert.ok(path.samples > 0 && path.visible / path.samples > 0.85,
      `${id}: ${path.name} is missing (${path.visible}/${path.samples} road samples visible)`);
  }
  assert.equal(await page.locator('.destination').count(), 6);
  await page.locator('[data-destination="4"]').click();
  await page.waitForFunction(() => window.__horizon.screen === 'drive' && window.__horizon.snapshot().region === '松影镜湖');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('transition')).opacity === '0');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#map-button').click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'portrait map must fit');
  await page.screenshot({ path: `${output}/map-portrait.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  results.driving = [];
  for (const [id, start, finish, name] of [[8, 0.36, 0.46, 'central-drive'], [10, 0.17, 0.27, 'lake-bridge-drive']]) {
    await page.evaluate(({ id, start }) => {
      const g = window.__horizon;
      g.state.route = id; g.state.t = start; g.actions.reset(); g.actions.cruise();
    }, { id, start });
    await page.waitForFunction(({ id, finish }) => window.__horizon.state.route === id && window.__horizon.state.t > finish,
      { id, finish }, { timeout: 18000 });
    const state = await page.evaluate(() => window.__horizon.snapshot());
    assert.equal(state.route, id); assert.ok(state.speed > 15);
    results.driving.push(state);
    await page.screenshot({ path: `${output}/${name}.png` });
  }
  results.network = await page.evaluate(() => {
    const g = window.__horizon;
    return { length: g.world.networkLength, roads: g.world.road.lines.map((line) => ({ id: line.id, name: line.name, length: line.length })) };
  });
  results.fps = await page.evaluate(() => new Promise((resolve) => {
    let first, count = 0;
    const frame = (now) => { first ??= now; if (++count === 121) resolve(120000 / (now - first)); else requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  }));
  assert.ok(results.fps > 45, `driving frame rate fell to ${results.fps.toFixed(1)}fps`);
  await page.keyboard.press('h');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('drive-hud')).opacity === '0');
  await page.evaluate(() => {
    const g = window.__horizon, p = g.world.road.sampleOn(10, 0.26).position;
    g.renderer.setAnimationLoop(null);
    g.camera.position.set(p.x + 100, p.y + 35, p.z + 40); g.camera.lookAt(p); g.camera.updateMatrixWorld();
    g.world.followFocus(p); g.renderer.info.reset(); g.renderer.render(g.vehicle.root.parent, g.camera);
  });
  await page.screenshot({ path: `${output}/lake-bridge.png` });
  await page.evaluate(() => {
    const g = window.__horizon, p = g.world.road.sampleOn(8, 0.405).position;
    g.camera.position.set(p.x, p.y + 160, p.z + 90); g.camera.lookAt(p); g.camera.updateMatrixWorld();
    g.world.followFocus(p); g.renderer.info.reset(); g.renderer.render(g.vehicle.root.parent, g.camera);
  });
  await page.screenshot({ path: `${output}/central-crossing.png` });
  assert.deepEqual(errors, []);
  results.status = 'passed';
  console.log(`PASS: all roads visible on both maps, central crossing and lake bridge driven, portrait travel works; ${results.fps.toFixed(1)}fps`);
} catch (e) {
  results.status = 'failed'; results.failure = e.message;
  throw e;
} finally {
  results.errors = errors;
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
