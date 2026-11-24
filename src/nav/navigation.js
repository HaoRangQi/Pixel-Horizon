// Destination state plus the cached path plan shared by the minimap highlight
// and the autonomous driver. Planning happens once per destination; the plan is
// only rebuilt if the player reverses behind its start or a new destination is
// set, so the highlight and the AI consume the exact same ordered points.

import { planPath, pathProgress, indexAtDistance } from './path.js';

const wrap = (t) => ((t % 1) + 1) % 1;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
// Destinations are scenic points on the main loop. Branch roads are free-drive
// excursions, so navigation follows their projection back onto that loop rather
// than pretending a branch-local t is a station on the circuit.
const stationOf = (state) => (Number.isFinite(state?.mainT) ? state.mainT : state?.t);
const INACTIVE_FRAME = Object.freeze({ active: false, destination: null, path: null, progress: 0, remaining: 0, passed: false, startIndex: 0 });

export function createNavigation({ network, spacing = 6, replanBehind = 30 } = {}) {
  if (!network || typeof network.sample !== 'function') throw new TypeError('createNavigation: network is required');
  let destination = null;
  let path = null;
  let travelled = 0;

  function setDestination(goal) {
    if (goal == null) throw new TypeError('setDestination: goal is required');
    const station = Number.isFinite(goal.t) ? wrap(goal.t) : wrap(network.nearest(goal.x, goal.z).t);
    const sample = network.sample(station);
    destination = {
      t: station,
      label: typeof goal.label === 'string' && goal.label.trim() ? goal.label.trim() : '目的地',
      x: sample.position.x,
      y: sample.position.y,
      z: sample.position.z,
    };
    path = null;
    travelled = 0;
  }

  function clear() {
    destination = null;
    path = null;
    travelled = 0;
  }

  function update(state) {
    if (!destination) {
      return INACTIVE_FRAME;
    }
    const station = stationOf(state);
    if (!path) path = planPath(network, { t: station }, { t: destination.t }, { spacing });
    travelled = pathProgress(network, path, station, travelled);
    if (travelled < -replanBehind) {
      path = planPath(network, { t: station }, { t: destination.t }, { spacing });
      travelled = 0;
      return { active: true, destination, path, progress: 0, remaining: path.length, passed: false, startIndex: 0 };
    }
    const progress = clamp(travelled, 0, path.length);
    return {
      active: true,
      destination,
      path,
      progress,
      remaining: Math.max(0, path.length - progress),
      passed: travelled > path.length + 1,
      startIndex: indexAtDistance(path.points, progress),
    };
  }

  return {
    setDestination,
    clear,
    update,
    get destination() { return destination; },
    get path() { return path; },
  };
}
