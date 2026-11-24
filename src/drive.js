const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap = (value) => ((value % 1) + 1) % 1;
export const angleDelta = (target, current) => Math.atan2(Math.sin(target - current), Math.cos(target - current));

// The mock roads in the unit tests implement only the original single-road API.
// These three helpers keep that contract working while the game road accepts a
// route index for the branch network.
const widthOf = (road, route) => road.widthOf ? road.widthOf(route) : road.width;
const lengthOf = (road, route) => road.lengthOf ? road.lengthOf(route) : road.length;
const sampleOn = (road, route, t) => road.sampleOn ? road.sampleOn(route, t) : road.sample(wrap(t));

export function createDriver(road, t = 0) {
  const state = { cruise: false, distance: 0, odometer: 0, fuel: 0.94, coolant: 78,
    steer: 0, throttle: 0, brake: 0, offroad: false };
  resetDriver(state, road, t);
  return state;
}

export function resetDriver(state, road, t = state.t || 0, route = state.route || 0) {
  const sample = sampleOn(road, route, t);
  const closed = road.isClosed ? road.isClosed(route) : true;
  const mainT = road.mainNearest ? road.mainNearest(sample.position.x, sample.position.z).t : (closed ? wrap(t) : 0);
  Object.assign(state, {
    x: sample.position.x, y: sample.position.y + 0.04, z: sample.position.z,
    heading: sample.heading, motionHeading: sample.heading, speed: 0, steer: 0,
    route, t: closed ? wrap(t) : clamp(t, 0, 1), mainT, pitch: 0, offroad: false, roadDistance: 0, cruise: false,
    throttle: 0, brake: 0,
    gear: 'N', rpm: 1350, shiftTime: 0, turnSignal: 0, signalArmed: false,
  });
  return state;
}

export function stepDriver(state, input, dt, road) {
  if (input.manual && (input.brake || input.reverse || Math.abs(input.steer || 0) > 0.1)) state.cruise = false;
  const throttle = clamp(input.throttle || 0, 0, 1);
  const brake = clamp(input.brake || 0, 0, 1);
  const reverse = clamp(input.reverse || 0, 0, 1);
  const nearest = road.nearest(state.x, state.z, state.route || 0);
  const route = nearest.route ?? state.route ?? 0;
  const width = widthOf(road, route);
  const closed = road.isClosed ? road.isClosed(route) : true;
  state.route = route;
  state.offroad = nearest.distance > width * 0.54;
  state.roadDistance = nearest.distance;
  state.t = closed ? wrap(nearest.t) : clamp(nearest.t, 0, 1);
  state.mainT = road.mainNearest ? road.mainNearest(state.x, state.z).t : state.t;
  state.steer += ((input.steer || 0) - state.steer) * (1 - Math.exp(-9 * dt));
  const speed = Math.abs(state.speed);
  const drag = state.offroad ? 0.7 * speed + 0.012 * speed * speed : 0.075 * speed + 0.0017 * speed * speed;
  let acceleration = throttle * (13.2 / (1 + speed / 76)) - reverse * 6;
  acceleration -= Math.sign(state.speed) * (drag + brake * 24 + (input.handbrake ? 7 : 0));
  const nextSpeed = state.speed + acceleration * dt;
  state.speed = !throttle && !reverse && nextSpeed * state.speed < 0 ? 0 : clamp(nextSpeed, -9, 82);
  if (!throttle && !reverse && Math.abs(state.speed) < 0.035) state.speed = 0;
  const wheelAngle = state.steer * 0.46 / (1 + speed * speed / 110);
  // +Z is forward, so driver-right is -X and therefore a negative Y rotation.
  state.heading -= state.speed / 2.72 * Math.tan(wheelAngle) * (input.handbrake ? 1.05 : 0.73) * dt;
  const grip = input.handbrake ? 2.1 : state.offroad ? 5 : 14;
  state.motionHeading += angleDelta(state.heading, state.motionHeading) * (1 - Math.exp(-grip * dt));
  state.x += Math.sin(state.motionHeading) * state.speed * dt;
  state.z += Math.cos(state.motionHeading) * state.speed * dt;
  const nearestY = nearest.point ? nearest.point.y : nearest.y;
  const targetY = nearest.distance < width * 0.65
    ? nearestY : road.groundHeight(state.x, state.z);
  state.y += (targetY + 0.04 - state.y) * (1 - Math.exp(-22 * dt));
  const ahead = sampleOn(road, route, state.t + 4 / lengthOf(road, route));
  state.pitch = Math.atan2(ahead.position.y - nearestY, 4);
  state.distance += Math.abs(state.speed) * dt;
  state.odometer += Math.abs(state.speed) * dt;
  state.throttle = throttle;
  state.brake = brake;
  updatePowertrain(state, dt);
  return state;
}

export function followRoad(state, road, targetSpeed = 22) {
  const route = state.route || 0;
  const length = lengthOf(road, route);
  const width = widthOf(road, route);
  const lookahead = 9 + Math.abs(state.speed) * 0.95;
  const ahead = sampleOn(road, route, state.t + lookahead / length);
  const next = sampleOn(road, route, state.t + (lookahead + 36) / length);
  // Right-hand traffic: aim for the centre of the right-hand lane, never the painted centreline.
  const lane = width * 0.25;
  const laneX = ahead.position.x - Math.cos(ahead.heading) * lane;
  const laneZ = ahead.position.z + Math.sin(ahead.heading) * lane;
  const desired = Math.atan2(laneX - state.x, laneZ - state.z);
  const bend = Math.abs(angleDelta(next.heading, ahead.heading));
  const wanted = targetSpeed / (1 + bend * 3.4);
  const error = wanted - state.speed;
  return {
    throttle: clamp(error * 0.2, 0, 1),
    brake: clamp(-error * 0.13, 0, 0.65),
    steer: clamp(-angleDelta(desired, state.heading) * 2.6, -1, 1),
  };
}

const RATIOS = [0, 3.65, 2.75, 2.10, 1.66, 1.38, 1.15, 0.98];
function updatePowertrain(state, dt) {
  const speed = Math.abs(state.speed);
  const wheelRpm = speed * 60 / (2 * Math.PI * 0.365);
  state.shiftTime = Math.max(0, state.shiftTime - dt);
  if (state.speed < -0.15) state.gear = 'R';
  else if (speed < 0.25 && state.throttle === 0) state.gear = 'N';
  else if (typeof state.gear !== 'number') state.gear = 1;
  let shifted = false;
  if (typeof state.gear === 'number' && state.shiftTime === 0) {
    const linked = wheelRpm * RATIOS[state.gear] * 6.4;
    if (linked > 9600 && state.gear < 7) { state.gear++; shifted = true; }
    else if (linked < 3400 && state.gear > 1) { state.gear--; shifted = true; }
    if (shifted) state.shiftTime = 0.38;
  }
  const ratio = state.gear === 'R' ? 3.4 : RATIOS[state.gear] || 0;
  const linkedRpm = wheelRpm * ratio * 6.4;
  const clutchSlip = Math.max(0, 1 - speed / 7) * state.throttle * 2300;
  const target = clamp(Math.max(1350 + clutchSlip, linkedRpm), 1350, 11000);
  state.rpm = shifted ? target : state.rpm + (target - state.rpm) * (1 - Math.exp(-14 * dt));
  state.fuel = Math.max(0, state.fuel - dt * (0.000002 + state.throttle * (0.000018 + state.rpm / 11000 * 0.00006)));
  state.coolant += (85 + state.throttle * 12 - state.coolant) * (1 - Math.exp(-0.013 * dt));
  if (state.turnSignal && state.steer * state.turnSignal > 0.3) state.signalArmed = true;
  if (state.signalArmed && Math.abs(state.steer) < 0.08) { state.turnSignal = 0; state.signalArmed = false; }
}
