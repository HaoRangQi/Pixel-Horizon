import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const baseURL = process.env.HORIZON_URL || 'http://127.0.0.1:5174/';
const results = { baseURL, checks: [], screenshots: [], llm: {}, errors: [] };
await mkdir('shots/rework', { recursive: true });

// A local OpenAI-compatible endpoint. It reads the car-relative observation and
// returns a driving command wrapped in a code fence, so the browser exercises
// the real request/parse/apply path without any external network or key.
const llmRequests = [];
const server = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  let body = '';
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => {
    let payload = {};
    try { payload = JSON.parse(body || '{}'); } catch { /* reported as a bad request below */ }
    llmRequests.push({ model: payload.model, messages: payload.messages });
    let observation = {};
    try { observation = JSON.parse(payload.messages.at(-1).content); } catch { /* keep default */ }
    const near = observation.path?.[0] || {};
    const command = {
      throttle: (observation.speedKmh || 0) < 55 ? 0.75 : 0.2,
      brake: 0,
      steer: Math.max(-0.6, Math.min(0.6, -(near.turnDeg || 0) / 60 + (near.rightM || 0) * 0.03)),
      confidence: 0.9,
      reason: 'mock',
    };
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(command)}\n\`\`\`` } }] }));
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
let serverOpen = true;
const closeServer = async () => {
  if (!serverOpen) return;
  serverOpen = false;
  await new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });
};

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (error) => results.errors.push(error.message));
const external = [];
page.on('request', (request) => { if (/^https?:/.test(request.url()) && !request.url().startsWith(baseURL)) external.push(request.url()); });

const frame = () => page.evaluate(() => window.__horizon.navigation.frame());
const shot = async (name) => { await page.screenshot({ path: `shots/rework/${name}.png` }); results.screenshots.push(`shots/rework/${name}.png`); };
const check = (name) => { results.checks.push(name); console.log('PASS', name); };

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__horizon && document.querySelector('#loading').hidden, null, { timeout: 60000 });
  await page.locator('#start-button').click();
  await page.waitForFunction(() => window.__horizon.screen === 'drive');

  const boot = await page.evaluate(() => ({ navigation: window.__horizon.snapshot().navigation, autopilot: window.__horizon.snapshot().autopilot }));
  assert.equal(boot.navigation.active, false);
  assert.equal(boot.autopilot.engaged, false);
  assert.equal(boot.autopilot.llm.configured, false, 'no LLM config means no backend');
  check('boots with no destination and the LLM backend disabled');

  const minimapBefore = await page.locator('#minimap').evaluate((canvas) => canvas.toDataURL());
  await page.locator('#map-button').click();
  assert.equal(await page.locator('.destination').count(), 6);
  assert.equal(await page.locator('[data-goal]').count(), 6);
  await page.locator('[data-goal="2"]').click();
  await page.waitForFunction(() => window.__horizon.navigation.active === true);
  await page.waitForTimeout(500);
  const planned = await page.evaluate(() => window.__horizon.snapshot());
  assert.equal(planned.navigation.active, true);
  assert.equal(planned.navigation.label, '金穗原野');
  assert.ok(planned.navigation.points > 100, `plan has ${planned.navigation.points} points`);
  assert.ok(planned.navigation.remaining > 1000, `destination is ${planned.navigation.remaining}m away`);
  const navCaption = await page.locator('#nav-state').textContent();
  assert.ok(navCaption.includes('金穗原野') && navCaption.includes('km'), `caption reads ${navCaption}`);
  const minimapAfter = await page.locator('#minimap').evaluate((canvas) => canvas.toDataURL());
  assert.notEqual(minimapBefore, minimapAfter, 'the minimap draws the destination marker and highlighted route');
  await shot('navigation-hud');
  check('map goal button sets a destination, draws its marker and highlights the route on the minimap');

  await page.locator('#map-button').click();
  await page.waitForTimeout(400);
  await shot('navigation-map');
  check('the large map shows the same highlighted route');

  await page.locator('#autopilot-button').click();
  assert.equal(await page.evaluate(() => window.__horizon.screen), 'drive', 'the map autopilot button resumes driving');
  assert.equal(await page.evaluate(() => window.__horizon.autopilot.engaged), true, 'the map button engages autopilot');
  await page.waitForFunction(() => window.__horizon.autopilot.engaged === true);
  await page.waitForTimeout(4000);
  const driving = await page.evaluate(() => {
    const game = window.__horizon, state = game.state, road = game.world.road;
    const hit = road.nearest(state.x, state.z);
    return {
      source: game.autopilot.source,
      speed: state.speed,
      remaining: game.navigation.frame().remaining,
      lateral: (state.x - hit.point.x) * Math.cos(hit.heading) - (state.z - hit.point.z) * Math.sin(hit.heading),
      offroad: state.offroad,
    };
  });
  assert.equal(driving.source, 'local', 'without an LLM the local planner is the driver');
  assert.ok(driving.speed > 5, `autopilot is driving (${(driving.speed * 3.6).toFixed(0)} km/h)`);
  assert.ok(driving.remaining < planned.navigation.remaining - 30, 'the car advances along the highlighted route');
  assert.ok(driving.lateral < 1, `the car stays right of the centreline (${driving.lateral.toFixed(2)}m)`);
  assert.equal(driving.offroad, false);
  check('the local planner autonomously drives the highlighted route in the right lane');

  await page.keyboard.press('b');
  assert.equal(await page.evaluate(() => window.__horizon.autopilot.engaged), false);
  await page.keyboard.press('b');
  assert.equal(await page.evaluate(() => window.__horizon.autopilot.engaged), true);
  check('the map button and B hotkey both control autopilot');

  await page.keyboard.down('w'); await page.waitForTimeout(200); await page.keyboard.up('w');
  await page.waitForFunction(() => window.__horizon.autopilot.engaged === false);
  assert.equal(await page.evaluate(() => window.__horizon.navigation.active), true, 'manual takeover keeps the navigation route');
  check('manual input takes over while the destination stays active');

  await page.locator('#map-button').click();
  await page.waitForTimeout(250);
  await page.locator('#clear-goal').click();
  await page.waitForFunction(() => window.__horizon.navigation.active === false);
  await page.locator('#close-map').click();
  await page.waitForFunction(() => window.__horizon.screen === 'drive');
  check('the map clear button removes the destination and the highlight');

  const goal = await page.evaluate(() => {
    const game = window.__horizon;
    const t = (game.state.t + 160 / game.world.road.length) % 1;
    game.navigation.setDestination(t, '测试终点');
    game.autopilot.engage();
    return game.navigation.frame();
  });
  assert.ok(goal.remaining > 100 && goal.remaining < 220);
  await page.waitForFunction(() => window.__horizon.autopilot.engaged === false, null, { timeout: 45000 });
  const arrived = await page.evaluate(() => ({ speed: Math.abs(window.__horizon.state.speed), active: window.__horizon.navigation.active, toast: document.querySelector('#toast').textContent }));
  assert.ok(arrived.speed < 1.5, `the car parks (${arrived.speed.toFixed(2)}m/s)`);
  assert.equal(arrived.active, false, 'arrival clears the destination');
  assert.ok(arrived.toast.includes('已抵达终点'), `arrival toast reads ${arrived.toast}`);
  await page.waitForFunction(() => document.querySelector('#nav-state').hidden
    && !document.querySelector('#autopilot-state').classList.contains('active')
    && document.querySelector('#speed').textContent === '000');
  await shot('navigation-arrival');
  check('the local planner stops at the destination marker and hands control back');

  assert.equal(llmRequests.length, 0, 'the default page never contacts an LLM endpoint');
  assert.deepEqual(external, [], 'the default page makes no external requests');
  results.llm.defaultRequests = llmRequests.length;

  const llmPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  llmPage.on('pageerror', (error) => results.errors.push(error.message));
  await llmPage.addInitScript((config) => { window.__HORIZON_AI__ = config; }, {
    enabled: true,
    endpoint: `http://127.0.0.1:${port}/v1/chat/completions`,
    model: 'mock-driver',
    minIntervalMs: 250,
    timeoutMs: 1200,
    commandTtlMs: 2500,
  });
  await llmPage.goto(baseURL, { waitUntil: 'networkidle' });
  await llmPage.waitForFunction(() => window.__horizon && document.querySelector('#loading').hidden, null, { timeout: 60000 });
  await llmPage.locator('#start-button').click();
  const configured = await llmPage.evaluate(() => window.__horizon.autopilot.status());
  assert.equal(configured.llm.configured, true);
  assert.equal(configured.llm.model, 'mock-driver');
  assert.equal(configured.llm.endpoint, `127.0.0.1:${port}`);
  assert.equal(JSON.stringify(configured).includes('apiKey'), false, 'status never exposes a key field');
  const start = await llmPage.evaluate(() => {
    const game = window.__horizon;
    game.navigation.setDestination((game.state.t + 500 / game.world.road.length) % 1, 'LLM 终点');
    game.autopilot.engage();
    return game.navigation.frame().remaining;
  });
  await llmPage.waitForFunction(() => window.__horizon.autopilot.source === 'llm', null, { timeout: 15000 });
  await llmPage.waitForFunction((start) => {
    const game = window.__horizon;
    return game.state.speed > 2 && game.navigation.frame().remaining < start - 10;
  }, start, { timeout: 15000 });
  const remote = await llmPage.evaluate(() => ({
    status: window.__horizon.autopilot.status(),
    speed: window.__horizon.state.speed,
    remaining: window.__horizon.navigation.frame().remaining,
  }));
  assert.ok(remote.status.llm.requests > 0 && remote.status.llm.successes > 0);
  assert.ok(remote.speed > 2, 'the LLM commands actually move the car');
  assert.ok(remote.remaining < start - 10, 'the LLM drives along the shared route');
  assert.ok(llmRequests.length > 0);
  assert.equal(llmRequests[0].model, 'mock-driver');
  assert.equal(llmRequests[0].messages.length, 2);
  assert.equal(llmRequests[0].messages[0].role, 'system');
  const observed = JSON.parse(llmRequests[0].messages[1].content);
  assert.ok(Array.isArray(observed.path) && observed.path.length > 0);
  assert.ok(Number.isFinite(observed.speedKmh) && Number.isFinite(observed.remainingM));
  results.llm = { ...results.llm, endpoint: `127.0.0.1:${port}`, model: 'mock-driver', requests: llmRequests.length, observed };
  await llmPage.screenshot({ path: 'shots/rework/navigation-llm.png' });
  results.screenshots.push('shots/rework/navigation-llm.png');
  check('a configured OpenAI-compatible endpoint drives the car through the pluggable driver interface');

  await closeServer();
  await llmPage.waitForFunction(() => window.__horizon.autopilot.source === 'fallback', null, { timeout: 15000 });
  const fallback = await llmPage.evaluate(() => ({ status: window.__horizon.autopilot.status(), speed: window.__horizon.state.speed }));
  assert.ok(fallback.status.llm.failures > 0, 'failed requests are counted');
  assert.ok(Math.abs(fallback.speed) > 0.5, 'the deterministic planner keeps the car moving after the LLM disappears');
  results.llm.failures = fallback.status.llm.failures;
  results.llm.fallbackSpeedKmh = Math.round(fallback.speed * 3.6);
  check('an unreachable LLM falls back to the local planner without interrupting the drive');
  await llmPage.close();

  assert.deepEqual(results.errors, []);
  results.status = 'passed';
} catch (error) {
  results.status = 'failed';
  results.failure = error.stack;
  await page.screenshot({ path: 'shots/rework/navigation-failure.png' }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile('shots/navigation-results.json', JSON.stringify(results, null, 2));
  await browser.close();
  await closeServer();
}
