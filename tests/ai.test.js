import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoute } from '../src/world/route.js';
import { readRoadNetwork } from '../src/nav/road-adapter.js';
import { planPath, pathProgress } from '../src/nav/path.js';
import { createDriver, stepDriver } from '../src/drive.js';
import { planLocalDriving } from '../src/ai/local-planner.js';
import {
  normalizeAIConfig, loadAIConfig, resolveEndpoint, parseDrivingCommand,
  validateCommand, buildLLMObservation, createLLMDriver,
} from '../src/ai/llm-driver.js';
import { createAutopilot } from '../src/ai/autopilot.js';
import { createNavigation } from '../src/nav/navigation.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const llmResponse = (content = '{"throttle":0.42,"brake":0,"steer":0.07}') => ({
  ok: true, json: async () => ({ choices: [{ message: { content } }] }),
});
const mockConfig = { enabled: true, endpoint: 'http://example.test/v1/chat/completions', model: 'mock', minIntervalMs: 200 };

test('the AI driver is disabled by default and needs an explicit http endpoint and model', () => {
  const config = normalizeAIConfig();
  assert.equal(config.enabled, false);
  assert.equal(config.requested, false);
  assert.equal(config.apiKey, '');
  assert.equal(normalizeAIConfig({ enabled: true }).enabled, false, 'no endpoint means no network');
  assert.equal(normalizeAIConfig({ enabled: true, endpoint: 'file:///etc/passwd', model: 'm' }).enabled, false);
  assert.equal(normalizeAIConfig({ enabled: true, endpoint: 'http://127.0.0.1:11434', model: '' }).enabled, false);
  const enabled = normalizeAIConfig({ enabled: true, endpoint: 'http://127.0.0.1:11434', model: 'llama3.1', timeoutMs: 1 });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.timeoutMs, 250, 'timeouts are clamped to a sane minimum');
  const loaded = loadAIConfig({
    __HORIZON_AI__: { enabled: true, endpoint: 'http://127.0.0.1:11434/v1/chat/completions', model: 'llama3.1' },
    localStorage: { getItem: () => JSON.stringify({ minIntervalMs: 500 }) },
  });
  assert.equal(loaded.enabled, true);
  assert.equal(loaded.minIntervalMs, 500);
});

test('endpoint resolution supports OpenAI-compatible and Ollama-native shapes', () => {
  assert.deepEqual(resolveEndpoint('http://127.0.0.1:11434'), { url: 'http://127.0.0.1:11434/v1/chat/completions', protocol: 'openai' });
  assert.deepEqual(resolveEndpoint('http://127.0.0.1:11434/v1'), { url: 'http://127.0.0.1:11434/v1/chat/completions', protocol: 'openai' });
  assert.deepEqual(resolveEndpoint('https://example.test/v1/chat/completions'), { url: 'https://example.test/v1/chat/completions', protocol: 'openai' });
  assert.deepEqual(resolveEndpoint('http://127.0.0.1:11434/api/chat'), { url: 'http://127.0.0.1:11434/api/chat', protocol: 'ollama' });
});

test('page configuration overrides stored settings, including an explicit disable', () => {
  const config = loadAIConfig({
    __HORIZON_AI__: { enabled: false, model: 'page-model' },
    localStorage: { getItem: () => JSON.stringify({ ...mockConfig, model: 'stored-model' }) },
  });
  assert.equal(config.enabled, false);
  assert.equal(config.model, 'page-model');
  assert.equal(config.endpoint, mockConfig.endpoint);
});

test('LLM command parsing tolerates fences, prose, aliases and numeric strings, and clamps unsafe input', () => {
  assert.deepEqual(
    parseDrivingCommand('```json\n{"throttle":"0.5","brake":0,"steer":"-0.25"}\n```'),
    { throttle: 0.5, brake: 0, steer: -0.25 },
  );
  assert.deepEqual(
    parseDrivingCommand('Sure! Here is the command: {"throttle": 0.4, "brake": 0, "steer": 0.2, "reason": "ease right"} — done.'),
    { throttle: 0.4, brake: 0, steer: 0.2 },
  );
  assert.deepEqual(parseDrivingCommand('throttle: 0.3, brake: 0, steer: -0.1'), { throttle: 0.3, brake: 0, steer: -0.1 });
  assert.deepEqual(parseDrivingCommand('{"accel":0.3,"steering_angle":2}'), { throttle: 0.3, brake: 0, steer: 1 });
  assert.deepEqual(parseDrivingCommand('{"throttle":0.8,"brake":0.6,"steer":0}'), { throttle: 0, brake: 0.6, steer: 0 });
  assert.deepEqual(parseDrivingCommand('{"command":{"throttle":0.2,"brake":0,"steer":0}}'), { throttle: 0.2, brake: 0, steer: 0 });
  assert.equal(parseDrivingCommand('{"confidence":0.9}'), null);
  assert.equal(parseDrivingCommand('I would rather not drive.'), null);
  assert.equal(parseDrivingCommand(null), null);
  assert.equal(validateCommand({ throttle: NaN }), null);
});

test('invalid control values invalidate the entire LLM command instead of becoming acceleration', () => {
  for (const throttle of [true, false, '', ' ', null, [], {}, NaN, Infinity]) {
    assert.equal(validateCommand({ throttle, brake: 0, steer: 0 }), null);
  }
  for (const content of [
    '{"throttle":true,"brake":"bad","steer":0}',
    '{"throttle":1e999,"brake":0,"steer":0}',
    '{"throttle":0.5,"brake":NaN,"steer":0}',
    'throttle: 0.5, brake: invalid, steer: 0',
  ]) assert.equal(parseDrivingCommand(content), null, content);
  assert.deepEqual(parseDrivingCommand('throttle: 4e-1, brake: 0, steer: -1e-1'), { throttle: 0.4, brake: 0, steer: -0.1 });
});

test('the local planner drives the shared path to the destination and holds the right lane', () => {
  const route = createRoute();
  const network = readRoadNetwork(route.road);
  const start = 0.3;
  const path = planPath(network, { t: start }, { t: 0.315 });
  const state = createDriver(route.road, start);
  const sample = route.road.sample(start);
  const lane = route.road.width * 0.25;
  state.x = sample.position.x - Math.cos(sample.heading) * lane;
  state.z = sample.position.z + Math.sin(sample.heading) * lane;
  let minRemaining = Infinity, maxDeviation = 0, maxLeft = -Infinity, finished = false;
  for (let i = 0; i < 120 * 40 && !finished; i++) {
    const progress = Math.max(0, Math.min(path.length, pathProgress(network, path, state.t)));
    const remaining = path.length - progress;
    minRemaining = Math.min(minRemaining, remaining);
    const command = planLocalDriving({
      x: state.x, z: state.z, heading: state.heading, speed: state.speed,
      path, progress, remaining, roadWidth: route.road.width,
    });
    stepDriver(state, command, 1 / 120, route.road);
    maxDeviation = Math.max(maxDeviation, state.roadDistance);
    const hit = route.road.nearest(state.x, state.z);
    maxLeft = Math.max(maxLeft, (state.x - hit.point.x) * Math.cos(hit.heading) - (state.z - hit.point.z) * Math.sin(hit.heading));
    finished = remaining < 12 && Math.abs(state.speed) < 0.6;
  }
  assert.equal(finished, true, 'the planner parks at the destination');
  assert.ok(minRemaining < 10, `stopped within the destination radius (${minRemaining.toFixed(1)}m)`);
  assert.ok(maxDeviation < route.road.width * 0.5, `stayed on the tarmac (${maxDeviation.toFixed(2)}m)`);
  assert.ok(maxLeft < 0.2, `never crossed the centreline (max ${maxLeft.toFixed(2)}m left)`);
  assert.ok(Math.abs(state.speed) < 0.6);
});

test('the local planner follows a long highlighted route across the loop seam to arrival', () => {
  const { road } = createRoute();
  const network = readRoadNetwork(road);
  const state = createDriver(road, 0.85);
  const navigation = createNavigation({ network });
  navigation.setDestination({ t: 0.65 });
  const first = navigation.update(state);
  let arrived = false, maxDeviation = 0;
  for (let step = 0; step < 120 * 600 && !arrived; step++) {
    const frame = navigation.update(state);
    assert.ok(frame.path === first.path, 'the driven path stays identical to the highlighted query');
    const command = planLocalDriving({ ...state, ...frame, roadWidth: road.width });
    stepDriver(state, command, 1 / 120, road);
    maxDeviation = Math.max(maxDeviation, state.roadDistance);
    arrived = frame.remaining < 12 && Math.abs(state.speed) < 0.6;
  }
  assert.equal(arrived, true);
  assert.ok(maxDeviation < road.width / 2, `stayed on the road over ${(first.path.length / 1000).toFixed(2)}km: ${maxDeviation.toFixed(2)}m`);
});

test('the LLM observation is car-relative, compact and free of identifiers', () => {
  const route = createRoute();
  const network = readRoadNetwork(route.road);
  const path = planPath(network, { t: 0.2 }, { t: 0.3 });
  const observation = buildLLMObservation({ x: path.points[0].x, z: path.points[0].z, heading: path.points[0].heading, speed: 15, path, progress: 0, remaining: path.length, roadWidth: route.road.width });
  assert.equal(observation.speedKmh, 54);
  assert.ok(observation.path.length >= 4);
  assert.equal(observation.path[0].aheadM, 8);
  assert.ok(observation.path[0].forwardM > 4);
  assert.ok(observation.path.every((sample) => Number.isFinite(sample.rightM) && Number.isFinite(sample.turnDeg)));
  assert.equal(observation.rightLaneOffsetM, 3.1);
  assert.ok(!JSON.stringify(observation).includes('route'), 'no internal route objects leak into the prompt');
});

test('the LLM driver sends one throttled request and never exposes the API key', async () => {
  const calls = [];
  let clock = 0;
  const driver = createLLMDriver({
    config: { enabled: true, endpoint: 'http://127.0.0.1:9/v1/chat/completions', model: 'mock', apiKey: 'test-key', minIntervalMs: 500, commandTtlMs: 1000 },
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
      return { ok: true, json: async () => ({ choices: [{ message: { content: '```json\n{"throttle":0.6,"brake":0,"steer":0.1}\n```' } }] }) };
    },
    now: () => clock,
  });
  assert.equal(driver.maybeRequest({}), true);
  assert.equal(driver.maybeRequest({}), false, 'an in-flight request is not duplicated');
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.Authorization, 'Bearer test-key');
  assert.equal(calls[0].body.model, 'mock');
  assert.equal(calls[0].body.messages.length, 2);
  assert.equal(driver.latestCommand().throttle, 0.6);
  const status = driver.status();
  assert.equal(status.successes, 1);
  assert.equal(status.endpoint, '127.0.0.1:9');
  assert.equal(JSON.stringify(status).includes('test-key'), false);
  clock = 5000;
  assert.equal(driver.latestCommand(), null, 'commands expire so a dead model cannot keep steering');
  assert.equal(driver.status().latestFresh, false);
});

test('Ollama-native endpoints are sent and parsed with the Ollama protocol', async () => {
  const calls = [];
  const driver = createLLMDriver({
    config: { enabled: true, endpoint: 'http://127.0.0.1:11434/api/chat', model: 'llama3.1' },
    fetchImpl: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ message: { content: '{"throttle":0,"brake":0.5,"steer":0}' } }) };
    },
    now: () => 0,
  });
  driver.maybeRequest({});
  await flush();
  assert.equal(calls[0].url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(calls[0].body.stream, false);
  assert.equal(calls[0].body.max_tokens, undefined);
  assert.deepEqual(calls[0].body.options, { temperature: 0.1, num_predict: 120 });
  assert.deepEqual(driver.latestCommand(), { throttle: 0, brake: 0.5, steer: 0 });
});

test('a hung LLM request times out instead of blocking the car', async () => {
  const driver = createLLMDriver({
    config: { enabled: true, endpoint: 'http://127.0.0.1:1/v1/chat/completions', model: 'm', timeoutMs: 250, minIntervalMs: 200 },
    fetchImpl: (url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }),
    now: () => 0,
  });
  assert.equal(driver.maybeRequest({}), true);
  await new Promise((resolve) => setTimeout(resolve, 340));
  const status = driver.status();
  assert.equal(status.lastError, 'timeout');
  assert.equal(status.failures, 1);
  assert.equal(driver.latestCommand(), null);
});

test('LLM freshness starts with the observation, so slow replies cannot revive expired commands', async () => {
  let clock = 0;
  const replies = [];
  const driver = createLLMDriver({
    config: { ...mockConfig, commandTtlMs: 1000 }, now: () => clock,
    fetchImpl: () => new Promise((resolve) => replies.push(resolve)),
  });
  driver.maybeRequest({});
  await flush();
  clock = 700;
  replies[0](llmResponse());
  await flush();
  assert.equal(driver.latestCommand()?.throttle, 0.42);
  clock = 1001;
  assert.equal(driver.latestCommand(), null, 'network latency is included in the command age');
  driver.maybeRequest({});
  await flush();
  clock = 2102;
  replies[1](llmResponse());
  await flush();
  assert.equal(driver.latestCommand(), null, 'a reply already stale on arrival is never published');
});

test('a failed request immediately discards a previously fresh LLM command', async () => {
  let clock = 0, fail = false;
  const driver = createLLMDriver({
    config: mockConfig, now: () => clock,
    fetchImpl: async () => fail ? llmResponse('invalid') : llmResponse(),
  });
  driver.maybeRequest({});
  await flush();
  assert.ok(driver.latestCommand());
  clock = 250; fail = true;
  driver.maybeRequest({});
  await flush();
  assert.equal(driver.status().failures, 1);
  assert.equal(driver.latestCommand(), null, 'failure falls back without waiting for the previous TTL');
});

test('cancel clears cached commands and ignores late replies without disturbing a new request', async () => {
  let clock = 0;
  const replies = [], signals = [];
  const driver = createLLMDriver({
    config: mockConfig, now: () => clock,
    fetchImpl: (_url, init) => new Promise((resolve) => { signals.push(init.signal); replies.push(resolve); }),
  });
  driver.maybeRequest({});
  await flush();
  driver.cancel();
  assert.equal(signals[0].aborted, true);
  clock = 250;
  assert.equal(driver.maybeRequest({}), true, 'cancellation releases the in-flight slot');
  await flush();
  replies[0](llmResponse());
  await flush();
  assert.equal(driver.latestCommand(), null);
  assert.equal(driver.status().inFlight, true, 'an old completion cannot clear the new request');
  replies[1](llmResponse());
  await flush();
  assert.ok(driver.latestCommand());
  driver.cancel();
  assert.equal(driver.latestCommand(), null, 'manual takeover also clears a completed command');
});

test('reconfiguration invalidates the old request and disabled drivers cannot publish it', async () => {
  let respond;
  const driver = createLLMDriver({
    config: mockConfig,
    fetchImpl: () => new Promise((resolve) => { respond = resolve; }),
  });
  driver.maybeRequest({});
  await flush();
  driver.configure({ enabled: false });
  respond(llmResponse());
  await flush();
  assert.equal(driver.latestCommand(), null);
  assert.equal(driver.status().latestFresh, false);
  assert.equal(driver.status().successes, 0);
});

test('the autopilot uses a fresh LLM command and falls back when it is absent, invalid or stale', async () => {
  const route = createRoute();
  const network = readRoadNetwork(route.road);
  const path = planPath(network, { t: 0.2 }, { t: 0.3 });
  const observation = {
    x: path.points[0].x, z: path.points[0].z, heading: path.points[0].heading, speed: 8,
    path, progress: 0, remaining: path.length, roadWidth: route.road.width,
  };

  const localOnly = createAutopilot({ config: {}, now: () => 0 });
  localOnly.engage();
  localOnly.update(observation);
  const localCommand = localOnly.command(observation);
  assert.equal(localOnly.source, 'local');
  assert.equal(localOnly.status().reason, 'no-llm');
  assert.ok(localCommand.throttle > 0);

  let clock = 0;
  const okFetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"throttle":0.42,"brake":0,"steer":0.07}' } }] }) });
  const autopilot = createAutopilot({
    config: { enabled: true, endpoint: 'http://127.0.0.1:9/v1/chat/completions', model: 'm', commandTtlMs: 1000, minIntervalMs: 200 },
    fetchImpl: okFetch,
    now: () => clock,
  });
  autopilot.engage();
  autopilot.update(observation);
  await flush();
  const remote = autopilot.command(observation);
  assert.equal(remote.throttle, 0.42);
  assert.equal(autopilot.source, 'llm');
  assert.equal(autopilot.reason, 'llm-fresh');
  clock = 5000;
  const fallback = autopilot.command(observation);
  assert.equal(autopilot.source, 'fallback');
  assert.equal(autopilot.reason, 'llm-stale');
  assert.equal(fallback.reason, 'follow-path');

  const invalid = createAutopilot({
    config: { enabled: true, endpoint: 'http://127.0.0.1:9/v1/chat/completions', model: 'm' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'I am not a JSON driver.' } }] }) }),
    now: () => 0,
  });
  invalid.engage();
  invalid.update(observation);
  await flush();
  invalid.command(observation);
  assert.equal(invalid.source, 'fallback');
  assert.equal(invalid.status().reason, 'llm-error');
  assert.equal(invalid.status().llm.failures, 1);

  const arriving = createAutopilot({ config: {}, now: () => 0 });
  arriving.engage();
  const stop = arriving.command({ ...observation, remaining: 4 });
  assert.equal(stop.brake, 1);
  assert.equal(stop.throttle, 0);
  assert.equal(arriving.reason, 'arrival');
  arriving.disengage();
  assert.equal(arriving.engaged, false);
});
