// Deterministic driver. It is both the default autonomous driver and the safe
// fallback whenever an LLM backend is unavailable, slow or returns junk.
//
// Driver interface (shared with the LLM backend):
//   observation: { x, z, heading, speed, path, progress, remaining, roadWidth, laneOffset }
//   command:     { throttle, brake, steer }  (throttle/brake 0..1, steer -1..1, +steer = right)
//
// The planner reads the same plan object the minimap draws, so the highlighted
// route and the driven route cannot diverge.

import { pointAt, lanePoint, angleDelta } from '../nav/path.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function planLocalDriving(observation = {}, options = {}) {
  const {
    x = 0, z = 0, heading = 0, speed = 0,
    path = null, progress = 0, remaining = null,
    roadWidth = 12.2, laneOffset = null,
  } = observation;
  if (!path || !path.points || path.points.length < 2) {
    return { throttle: 0, brake: 0.6, steer: 0, targetSpeed: 0, reason: 'no-path' };
  }
  const left = Math.max(0, Number.isFinite(remaining) ? remaining : path.length - progress);
  const arrivalRadius = options.arrivalRadius ?? 8;
  if (left <= arrivalRadius) {
    return { throttle: 0, brake: 1, steer: 0, targetSpeed: 0, reason: 'arriving' };
  }
  const cruiseSpeed = options.cruiseSpeed ?? 24;
  const lookahead = clamp(8 + Math.abs(speed) * 0.9, 10, 46);
  const aim = pointAt(path, Math.min(path.length, progress + lookahead));
  const far = pointAt(path, Math.min(path.length, progress + lookahead + 36));
  const lane = laneOffset == null ? roadWidth * 0.25 : laneOffset;
  const target = lanePoint(aim, lane);
  const desired = Math.atan2(target.x - x, target.z - z);
  const bend = Math.abs(angleDelta(far.heading, aim.heading));
  let wanted = cruiseSpeed / (1 + bend * 3.4);
  // Arrival braking: aim for a smooth stop just before the destination marker.
  const stopDistance = Math.max(0, left - arrivalRadius);
  wanted = Math.min(wanted, Math.sqrt(2 * 3.6 * stopDistance) + 1.5);
  const error = wanted - Math.abs(speed);
  return {
    throttle: clamp(error * 0.22, 0, 1),
    brake: clamp(-error * 0.16, 0, 0.9),
    steer: clamp(-angleDelta(desired, heading) * 2.6, -1, 1),
    targetSpeed: wanted,
    reason: 'follow-path',
  };
}
