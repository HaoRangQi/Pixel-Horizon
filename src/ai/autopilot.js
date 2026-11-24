// Autonomous driver orchestrator. It owns the pluggable driver contract and the
// LLM safety envelope:
//   - the deterministic local planner is always computed and available;
//   - a fresh, valid LLM command may replace it;
//   - stale, failed or malformed LLM output silently falls back to local;
//   - the arrival guard always uses local braking, so a model cannot override
//     the final brake command (stopping distance still depends on speed).
//
// `update()` is the only place that starts network requests; `command()` stays
// synchronous so the 120 Hz physics loop never waits on the network.

import { planLocalDriving } from './local-planner.js';
import { createLLMDriver, normalizeAIConfig } from './llm-driver.js';

export function createAutopilot({ config, fetchImpl, now } = {}) {
  let settings = normalizeAIConfig(config);
  let driver = createLLMDriver({ config: settings, fetchImpl, now });
  let engaged = false;
  let source = 'local';
  let reason = 'idle';

  function engage() {
    engaged = true;
    reason = 'engaged';
  }

  function disengage() {
    if (!engaged) return;
    engaged = false;
    driver.cancel();
    source = 'local';
    reason = 'disengaged';
  }

  function configure(next) {
    settings = normalizeAIConfig({ ...settings, ...(next || {}) });
    driver.configure(settings);
  }

  return {
    engage,
    disengage,
    configure,
    get engaged() { return engaged; },
    get source() { return source; },
    get reason() { return reason; },

    // Call once per rendered frame while driving: starts at most one throttled
    // LLM request and never blocks.
    update(observation) {
      if (!engaged) return;
      driver.maybeRequest(observation);
    },

    command(observation) {
      const local = planLocalDriving(observation);
      if (!engaged) {
        source = 'local';
        reason = 'idle';
        return local;
      }
      if (!observation || !observation.path || local.reason === 'no-path') {
        source = 'local';
        reason = 'no-path';
        return local;
      }
      // Arrival is a safety boundary owned by the local planner.
      if (local.reason === 'arriving') {
        source = driver.enabled ? 'fallback' : 'local';
        reason = 'arrival';
        return local;
      }
      const command = driver.latestCommand();
      if (command) {
        source = 'llm';
        reason = 'llm-fresh';
        return command;
      }
      source = driver.enabled ? 'fallback' : 'local';
      reason = driver.enabled ? (driver.status().lastError ? 'llm-error' : 'llm-stale') : 'no-llm';
      return local;
    },

    status() {
      return { engaged, source, reason, llm: driver.status() };
    },
  };
}
