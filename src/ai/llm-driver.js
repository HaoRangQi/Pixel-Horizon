// Pluggable LLM driving backend.
//
// Disabled by default. Configuration comes from `window.__HORIZON_AI__` or the
// `pixel-horizon-ai` localStorage key — never from source. No key is ever
// logged or exposed through status(); only the endpoint host and model name are
// reported for diagnostics.
//
// Protocol: a single POST of an OpenAI-compatible chat-completions body, or an
// Ollama-native /api/chat body when the endpoint ends in /api/chat. The reply
// must contain a JSON driving command; parsing tolerates code fences, prose
// around the object, numeric strings and key aliases. Anything else is treated
// as a failure and the autopilot falls back to the local planner.

import { pointAt, lanePoint, angleDelta } from '../nav/path.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const numberOr = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

export const DEFAULT_AI_CONFIG = Object.freeze({
  enabled: false,
  endpoint: '',
  model: '',
  apiKey: '',
  headers: {},
  timeoutMs: 2200,
  minIntervalMs: 900,
  commandTtlMs: 2500,
  maxTokens: 120,
  temperature: 0.1,
});

export const AI_STORAGE_KEY = 'pixel-horizon-ai';

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeAIConfig(input = {}) {
  const source = isObject(input) ? input : {};
  const requested = source.enabled === true;
  const endpoint = typeof source.endpoint === 'string' ? source.endpoint.trim() : '';
  const model = typeof source.model === 'string' ? source.model.trim() : '';
  const apiKey = typeof source.apiKey === 'string' ? source.apiKey : '';
  const headers = {};
  if (isObject(source.headers)) {
    for (const [key, value] of Object.entries(source.headers)) {
      if (typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(key)) headers[key] = value;
    }
  }
  let problem = '';
  if (!requested) problem = 'disabled';
  else if (!endpoint) problem = 'missing endpoint';
  else if (!isHttpUrl(endpoint)) problem = 'endpoint must be http(s)';
  else if (!model) problem = 'missing model';
  return {
    enabled: requested && !problem,
    requested,
    problem,
    endpoint,
    model,
    apiKey,
    headers,
    timeoutMs: clamp(numberOr(source.timeoutMs, DEFAULT_AI_CONFIG.timeoutMs), 250, 30000),
    minIntervalMs: clamp(numberOr(source.minIntervalMs, DEFAULT_AI_CONFIG.minIntervalMs), 200, 60000),
    commandTtlMs: clamp(numberOr(source.commandTtlMs, DEFAULT_AI_CONFIG.commandTtlMs), 300, 10000),
    maxTokens: Math.round(clamp(numberOr(source.maxTokens, DEFAULT_AI_CONFIG.maxTokens), 16, 512)),
    temperature: clamp(numberOr(source.temperature, DEFAULT_AI_CONFIG.temperature), 0, 2),
  };
}

export function loadAIConfig(env = globalThis) {
  const sources = [];
  try {
    const raw = env.localStorage && typeof env.localStorage.getItem === 'function'
      ? env.localStorage.getItem(AI_STORAGE_KEY)
      : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (isObject(parsed)) sources.push(parsed);
    }
  } catch { /* malformed local config must never break boot */ }
  try {
    if (isObject(env.__HORIZON_AI__)) sources.push(env.__HORIZON_AI__);
  } catch { /* ignore a hostile global */ }
  return normalizeAIConfig(Object.assign({}, ...sources));
}

export function resolveEndpoint(endpoint) {
  const url = new URL(endpoint);
  const path = url.pathname.replace(/\/+$/, '');
  if (path === '' || path === '/') {
    url.pathname = '/v1/chat/completions';
    return { url: url.href, protocol: 'openai' };
  }
  if (/\/api\/chat$/.test(path)) return { url: url.href, protocol: 'ollama' };
  if (/\/chat\/completions$/.test(path)) return { url: url.href, protocol: 'openai' };
  if (/\/v1$/.test(path)) {
    url.pathname = `${path}/chat/completions`;
    return { url: url.href, protocol: 'openai' };
  }
  return { url: url.href, protocol: 'openai' };
}

export function endpointHost(endpoint) {
  try {
    return new URL(endpoint).host;
  } catch {
    return '';
  }
}

const ALIASES = {
  throttle: ['throttle', 'accel', 'accelerator', 'gas'],
  brake: ['brake', 'braking', 'decel'],
  steer: ['steer', 'steering', 'steering_angle', 'wheel'],
};

export function validateCommand(value) {
  let source = isObject(value) ? value : null;
  if (!source) return null;
  if (isObject(source.command)) source = source.command;
  else if (isObject(source.action)) source = source.action;
  let found = false;
  const picked = {};
  for (const [name, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      if (!Object.hasOwn(source, alias)) continue;
      const value = source[alias];
      if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return null;
      picked[name] = numeric;
      found = true;
      break;
    }
  }
  if (!found) return null;
  const throttle = clamp(picked.throttle ?? 0, 0, 1);
  const brake = clamp(picked.brake ?? 0, 0, 1);
  const steer = clamp(picked.steer ?? 0, -1, 1);
  // Safety: a driver must never ask for throttle and brake at once. Brake wins.
  return { throttle: throttle > 0.05 && brake > 0.05 ? 0 : throttle, brake, steer };
}

function balancedObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const character = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth++;
    else if (character === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

export function parseDrivingCommand(text) {
  if (isObject(text)) return validateCommand(text);
  if (typeof text !== 'string') return null;
  const cleaned = text.replace(/```[a-zA-Z]*/g, '').trim();
  const candidates = [cleaned, balancedObject(cleaned)].filter(Boolean);
  for (const candidate of candidates) {
    let parsed;
    try {
      parsed = JSON.parse(candidate);
    } catch { continue; }
    return validateCommand(parsed);
  }
  // Last resort: key/value pairs embedded in prose.
  const picked = {};
  let found = false;
  for (const [name, aliases] of Object.entries(ALIASES)) {
    for (const alias of aliases) {
      const match = cleaned.match(new RegExp(`(?:^|[^A-Za-z_])["']?${alias}["']?\\s*[:=]\\s*([^\\s,;}]+)`, 'i'));
      if (match) {
        picked[name] = match[1].replace(/^["']|["']$/g, '');
        found = true;
        break;
      }
    }
  }
  return found ? validateCommand(picked) : null;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

// Compact observation sent to the model: car state plus the planned lane centre
// expressed in the car's local frame. No identifiers, no personal data.
export function buildLLMObservation(observation = {}) {
  const {
    x = 0, z = 0, heading = 0, speed = 0, path = null, progress = 0, remaining = 0,
    roadWidth = 12.2, laneOffset = null,
  } = observation;
  const lane = laneOffset == null ? roadWidth * 0.25 : laneOffset;
  const offsets = [8, 18, 32, 50, 75, 110];
  const samples = [];
  if (path && Array.isArray(path.points) && path.points.length) {
    for (const offset of offsets) {
      if (progress + offset > path.length + 1) break;
      const target = lanePoint(pointAt(path, progress + offset), lane);
      const dx = target.x - x;
      const dz = target.z - z;
      samples.push({
        aheadM: Math.round(offset),
        forwardM: round(dx * Math.sin(heading) + dz * Math.cos(heading)),
        rightM: round(-dx * Math.cos(heading) + dz * Math.sin(heading)),
        turnDeg: Math.round(angleDelta(target.heading, heading) * 180 / Math.PI),
      });
    }
  }
  return {
    speedKmh: Math.round(Math.abs(speed) * 3.6),
    remainingM: Math.max(0, Math.round(remaining)),
    roadWidthM: round(roadWidth),
    rightLaneOffsetM: round(lane),
    path: samples,
  };
}

const SYSTEM_PROMPT = [
  'You are the driving policy of a car in a scenic driving game.',
  'Reply with exactly one JSON object and no markdown:',
  '{"throttle":0.0,"brake":0.0,"steer":0.0,"confidence":0.0,"reason":"short"}',
  'throttle and brake are 0..1 and must not both be positive.',
  'steer is -1..1; positive steers the car to its right, negative to its left.',
  'The observation lists route samples in the car frame: forwardM is ahead,',
  'rightM is to the driver right, turnDeg is the route heading change',
  '(positive means the route bends left).',
  'Keep the car near rightM = 0 (the right-hand lane centre).',
  'Slow down as |turnDeg| grows and stop smoothly when remainingM approaches 0.',
].join(' ');

export function buildMessages(observation) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify(buildLLMObservation(observation)) },
  ];
}

const defaultNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

export function createLLMDriver({ config = DEFAULT_AI_CONFIG, fetchImpl = globalThis.fetch, now = defaultNow } = {}) {
  let settings = normalizeAIConfig(config);
  let latest = null;
  let inFlight = null;
  let nextAllowedAt = 0;
  let failures = 0;
  const stats = { requests: 0, successes: 0, failures: 0, lastError: null, lastLatencyMs: null };

  function status() {
    const age = latest ? Math.max(0, Math.round(now() - latest.at)) : null;
    return {
      configured: settings.enabled,
      requested: settings.requested,
      problem: settings.problem,
      endpoint: endpointHost(settings.endpoint),
      model: settings.model,
      ...stats,
      inFlight: !!inFlight,
      latestAgeMs: age,
      latestFresh: latest != null && age <= settings.commandTtlMs,
    };
  }

  function latestCommand() {
    if (!settings.enabled || !latest) return null;
    if (now() - latest.at > settings.commandTtlMs) return null;
    return latest.command;
  }

  function finishRequest(request) {
    clearTimeout(request.timer);
    if (inFlight !== request) return;
    stats.lastLatencyMs = Math.max(0, Math.round(now() - request.started));
    inFlight = null;
  }

  function failRequest(request, message) {
    if (inFlight !== request) return;
    latest = null;
    stats.failures++;
    stats.lastError = message;
    failures = Math.min(failures + 1, 5);
    nextAllowedAt = now() + Math.min(15000, settings.minIntervalMs * Math.max(2, 2 ** failures));
    finishRequest(request);
  }

  function maybeRequest(observation) {
    if (!settings.enabled || typeof fetchImpl !== 'function' || inFlight) return false;
    const at = now();
    if (at < nextAllowedAt) return false;
    nextAllowedAt = at + settings.minIntervalMs;
    const { url, protocol } = resolveEndpoint(settings.endpoint);
    const headers = { 'Content-Type': 'application/json', ...settings.headers };
    if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
    const body = protocol === 'ollama'
      ? { model: settings.model, stream: false, options: { temperature: settings.temperature, num_predict: settings.maxTokens }, messages: buildMessages(observation) }
      : { model: settings.model, stream: false, temperature: settings.temperature, max_tokens: settings.maxTokens, messages: buildMessages(observation) };
    const request = { started: at, controller: new AbortController(), timer: null };
    inFlight = request;
    request.timer = setTimeout(() => {
      request.controller.abort();
      failRequest(request, 'timeout');
    }, settings.timeoutMs);
    stats.requests++;
    Promise.resolve()
      .then(() => {
        if (inFlight !== request) return null;
        return fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal: request.controller.signal });
      })
      .then(async (response) => {
        if (inFlight !== request) return;
        if (!response || response.ok === false) throw new Error(`HTTP ${response && response.status ? response.status : 'error'}`);
        const payload = await response.json();
        if (inFlight !== request) return;
        const content = protocol === 'ollama'
          ? payload && payload.message && payload.message.content
          : payload && payload.choices && payload.choices[0]
            ? (payload.choices[0].message && payload.choices[0].message.content) ?? payload.choices[0].text
            : null;
        const command = parseDrivingCommand(content);
        if (!command) throw new Error('invalid driving command');
        if (now() - request.started > settings.commandTtlMs) throw new Error('stale observation');
        latest = { command, at: request.started };
        stats.successes++;
        stats.lastError = null;
        failures = 0;
      })
      .catch((error) => {
        const message = error && error.name === 'AbortError' ? 'timeout' : String((error && error.message) || error);
        failRequest(request, message);
      })
      .finally(() => finishRequest(request));
    return true;
  }

  function cancel() {
    latest = null;
    if (!inFlight) return;
    const request = inFlight;
    finishRequest(request);
    request.controller.abort();
  }

  function configure(next) {
    cancel();
    settings = normalizeAIConfig({ ...settings, ...(next || {}) });
    failures = 0;
    nextAllowedAt = 0;
    stats.lastError = null;
  }

  return {
    maybeRequest,
    latestCommand,
    cancel,
    configure,
    status,
    get enabled() { return settings.enabled; },
  };
}
