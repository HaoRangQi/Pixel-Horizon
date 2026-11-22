const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap = (value) => ((value % 1) + 1) % 1;
export const angleDelta = (target, current) => Math.atan2(Math.sin(target - current), Math.cos(target - current));

export function createDriver(road, t = 0) {
  const state = { cruise: false, distance: 0, steer: 0, throttle: 0, brake: 0, offroad: false };
  resetDriver(state, road, t);
  return state;
}

export function resetDriver(state, road, t = state.t || 0) {
  const sample = road.sample(wrap(t));
  Object.assign(state, {
    x: sample.position.x, y: sample.position.y + 0.04, z: sample.position.z,
    heading: sample.heading, motionHeading: sample.heading, speed: 0, steer: 0,
    t: wrap(t), pitch: 0, offroad: false, roadDistance: 0, cruise: false,
    throttle: 0, brake: 0,
  });
  return state;
}

export function stepDriver(state, input, dt, road) {
  if (input.manual && (input.brake || input.reverse || Math.abs(input.steer || 0) > 0.1)) state.cruise = false;
  const throttle = clamp(input.throttle || 0, 0, 1);
  const brake = clamp(input.brake || 0, 0, 1);
  const reverse = clamp(input.reverse || 0, 0, 1);
  const nearest = road.nearest(state.x, state.z);
  state.offroad = nearest.distance > road.width * 0.54;
  state.roadDistance = nearest.distance;
  state.t = wrap(nearest.t);
  state.steer += ((input.steer || 0) - state.steer) * (1 - Math.exp(-9 * dt));
  const speed = Math.abs(state.speed);
  const drag = state.offroad ? 0.7 * speed + 0.012 * speed * speed : 0.075 * speed + 0.0017 * speed * speed;
  let acceleration = throttle * (13.2 / (1 + speed / 76)) - reverse * 6;
  acceleration -= Math.sign(state.speed) * (drag + brake * 24 + (input.handbrake ? 7 : 0));
  const nextSpeed = state.speed + acceleration * dt;
  state.speed = !throttle && !reverse && nextSpeed * state.speed < 0 ? 0 : clamp(nextSpeed, -9, 82);
  if (!throttle && !reverse && Math.abs(state.speed) < 0.035) state.speed = 0;
  const wheelAngle = state.steer * 0.46 / (1 + speed / 28);
  state.heading += state.speed / 2.8 * Math.tan(wheelAngle) * (input.handbrake ? 1.05 : 0.73) * dt;
  const grip = input.handbrake ? 2.1 : state.offroad ? 5 : 14;
  state.motionHeading += angleDelta(state.heading, state.motionHeading) * (1 - Math.exp(-grip * dt));
  state.x += Math.sin(state.motionHeading) * state.speed * dt;
  state.z += Math.cos(state.motionHeading) * state.speed * dt;
  const targetY = nearest.distance < road.width * 0.65
    ? nearest.point.y : road.groundHeight(state.x, state.z);
  state.y += (targetY + 0.04 - state.y) * (1 - Math.exp(-22 * dt));
  const ahead = road.sample(wrap(state.t + 4 / road.length));
  state.pitch = Math.atan2(ahead.position.y - nearest.point.y, 4);
  state.distance += Math.abs(state.speed) * dt;
  state.throttle = throttle;
  state.brake = brake;
  return state;
}

export function followRoad(state, road, targetSpeed = 22) {
  const lookahead = 9 + Math.abs(state.speed) * 0.95;
  const ahead = road.sample(wrap(state.t + lookahead / road.length));
  const next = road.sample(wrap(state.t + (lookahead + 36) / road.length));
  const desired = Math.atan2(ahead.position.x - state.x, ahead.position.z - state.z);
  const bend = Math.abs(angleDelta(next.heading, ahead.heading));
  const wanted = targetSpeed / (1 + bend * 3.4);
  const error = wanted - state.speed;
  return {
    throttle: clamp(error * 0.2, 0, 1),
    brake: clamp(-error * 0.13, 0, 0.65),
    steer: clamp(angleDelta(desired, state.heading) * 2.6, -1, 1),
  };
}
