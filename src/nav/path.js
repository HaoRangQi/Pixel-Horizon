// Reusable path query for the scenic circuit. Inputs are a road network (see
// road-adapter.js), a start point and a destination; the output is an ordered
// list of path points. The minimap highlight and the AI driver both consume the
// same plan — there is no second route query anywhere.
//
// The circuit is one-way and forward-travelling (the direction the game's cruise
// and traffic already drive), so a plan is always the forward arc from the start
// station to the destination station.

const wrap = (t) => ((t % 1) + 1) % 1;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const angleDelta = (target, current) => Math.atan2(Math.sin(target - current), Math.cos(target - current));

export function resolveStation(network, point) {
  if (typeof point === 'number') return wrap(point);
  if (point && Number.isFinite(point.t)) return wrap(point.t);
  if (point && Number.isFinite(point.x) && Number.isFinite(point.z)) {
    const hit = network.nearest(point.x, point.z);
    if (!hit || !Number.isFinite(hit.t)) throw new TypeError('planPath: nearest() did not return a station');
    return wrap(hit.t);
  }
  throw new TypeError('planPath: point must be a station number, { t } or { x, z }');
}

export function planPath(network, from, to, options = {}) {
  if (!network || typeof network.sample !== 'function') throw new TypeError('planPath: network needs sample(t)');
  const spacing = clamp(Number.isFinite(options.spacing) ? options.spacing : 6, 0.5, 100);
  const fromT = resolveStation(network, from);
  const toT = resolveStation(network, to);
  const length = wrap(toT - fromT) * network.length;
  const steps = length < 1e-6 ? 0 : Math.max(1, Math.ceil(length / spacing));
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const s = steps === 0 ? 0 : (length * i) / steps;
    const t = wrap(fromT + s / network.length);
    const sample = network.sample(t);
    const position = sample.position;
    points.push({
      x: position.x, y: position.y, z: position.z,
      t, heading: sample.heading, s,
    });
  }
  return { fromT, toT, length, spacing: steps ? length / steps : 0, points, destination: points[points.length - 1] };
}

// Interpolate a point at a distance along the plan (metres from the plan start).
export function pointAt(path, distance) {
  const points = path.points;
  if (!points || !points.length) return null;
  if (points.length === 1) return { ...points[0], s: 0 };
  const d = clamp(distance, 0, path.length);
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].s <= d) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const span = b.s - a.s;
  const u = span > 1e-9 ? (d - a.s) / span : 0;
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
    heading: a.heading + angleDelta(b.heading, a.heading) * u,
    t: u > 0.5 ? b.t : a.t,
    s: d,
  };
}

export function indexAtDistance(points, distance) {
  if (!points || !points.length) return 0;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].s <= distance) lo = mid;
    else hi = mid;
  }
  return lo;
}

// Signed distance travelled along the plan, in metres. Negative means the car is
// behind the plan start (it drove backwards); values beyond path.length mean it
// has passed the destination.
export function pathProgress(network, path, station) {
  const delta = (((station - path.fromT + 0.5) % 1) + 1) % 1 - 0.5;
  return delta * network.length;
}

// Offset a road-centre point towards the right-hand lane. Driver-right is -X at
// heading 0, matching the convention in drive.js / camera.js.
export function lanePoint(point, offset) {
  return {
    x: point.x - Math.cos(point.heading) * offset,
    y: point.y,
    z: point.z + Math.sin(point.heading) * offset,
    heading: point.heading,
  };
}
