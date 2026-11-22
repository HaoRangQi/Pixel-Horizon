import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriver, stepDriver, resetDriver, followRoad } from '../src/drive.js';

const road = {
  length: 1000,
  width: 16,
  sample(t) {
    return { position: { x: 0, y: 3, z: t * 1000 }, tangent: { x: 0, y: 0, z: 1 }, heading: 0 };
  },
  nearest(x, z) { return { t: z / 1000, distance: Math.abs(x), point: { x: 0, y: 3, z }, heading: 0 }; },
  groundHeight() { return 3; },
};

test('accelerating and braking produce a controllable forward drive', () => {
  const state = createDriver(road);
  for (let i = 0; i < 600; i++) stepDriver(state, { throttle: 1 }, 1 / 120, road);
  assert.ok(state.speed > 20 && state.speed < 70);
  assert.ok(state.z > 45);
  assert.equal(state.y, 3.04);
  for (let i = 0; i < 360; i++) stepDriver(state, { brake: 1 }, 1 / 120, road);
  assert.ok(Math.abs(state.speed) < 0.2);
});

test('right steering changes heading and reaches the right side of the road', () => {
  const state = createDriver(road);
  state.speed = 12;
  for (let i = 0; i < 90; i++) stepDriver(state, { throttle: 0.3, steer: 0.4 }, 1 / 120, road);
  assert.ok(state.heading < 0);
  assert.ok(state.x < -0.1, 'with +Z forward, driver-right is local -X');
});

test('reverse steering behaves like a left-hand-drive car rather than mirrored screen controls', () => {
  const state = createDriver(road);
  state.speed = -5;
  for (let i = 0; i < 90; i++) stepDriver(state, { reverse: 0.3, steer: 0.6 }, 1 / 120, road);
  assert.ok(state.heading > 0, 'right steering while reversing rotates the nose left');
  assert.ok(state.x < 0, 'the rear moves to driver-right');
});

test('keyboard steering stays controllable at motorway speed and recenters on release', () => {
  const state = createDriver(road);
  state.speed = 35;
  for (let i = 0; i < 120; i++) stepDriver(state, { throttle: 0.4, steer: 1 }, 1 / 120, road);
  assert.ok(Math.abs(state.heading) < 0.65, 'one second of steering should not whip the car around');
  for (let i = 0; i < 120; i++) stepDriver(state, { throttle: 0.4 }, 1 / 120, road);
  assert.ok(Math.abs(state.steer) < 0.01);
});

test('automatic gearbox drives real RPM, shifts down in RPM, and keeps telemetry coherent', () => {
  const state = createDriver(road);
  const shifts = [];
  let previous = { rpm: state.rpm, gear: state.gear };
  for (let i = 0; i < 120 * 18; i++) {
    stepDriver(state, { throttle: 1 }, 1 / 120, road);
    if (typeof previous.gear === 'number' && state.gear > previous.gear) shifts.push({ before: previous.rpm, after: state.rpm, gear: state.gear });
    previous = { rpm: state.rpm, gear: state.gear };
  }
  assert.ok(shifts.length >= 3);
  assert.ok(shifts.every((shift) => shift.after < shift.before));
  assert.ok(state.rpm > 1400 && state.rpm <= 11000);
  assert.ok(state.fuel > 0 && state.fuel < 0.94);
  assert.ok(state.coolant > 78 && state.coolant < 110);
  assert.ok(state.odometer > 100);
});

test('reset preserves travelled mileage and fuel while returning the gearbox to neutral', () => {
  const state = createDriver(road);
  for (let i = 0; i < 600; i++) stepDriver(state, { throttle: 1 }, 1 / 120, road);
  const { odometer, fuel } = state;
  resetDriver(state, road, 0.15);
  assert.equal(state.gear, 'N');
  assert.equal(state.rpm, 1350);
  assert.equal(state.odometer, odometer);
  assert.equal(state.fuel, fuel);
});

test('indicators remain on before a turn and cancel after the steering returns', () => {
  const state = createDriver(road);
  state.turnSignal = 1;
  for (let i = 0; i < 120; i++) stepDriver(state, {}, 1 / 120, road);
  assert.equal(state.turnSignal, 1);
  for (let i = 0; i < 120; i++) stepDriver(state, { steer: 0.6 }, 1 / 120, road);
  assert.equal(state.turnSignal, 1);
  for (let i = 0; i < 120; i++) stepDriver(state, {}, 1 / 120, road);
  assert.equal(state.turnSignal, 0);
});

test('fixed-step simulation has the same result at 30 and 120 display frames', () => {
  const a = createDriver(road);
  const b = createDriver(road);
  for (let frame = 0; frame < 90; frame++) for (let step = 0; step < 4; step++) stepDriver(a, { throttle: 1 }, 1 / 120, road);
  for (let frame = 0; frame < 360; frame++) stepDriver(b, { throttle: 1 }, 1 / 120, road);
  assert.ok(Math.abs(a.z - b.z) < 1e-9);
  assert.ok(Math.abs(a.speed - b.speed) < 1e-9);
});

test('reset returns to the requested road point with matching heading and stopped wheels', () => {
  const state = createDriver(road);
  state.x = 400;
  state.speed = 50;
  resetDriver(state, road, 0.42);
  assert.ok(Math.abs(state.z - 420) < 1e-9);
  assert.equal(state.x, 0);
  assert.equal(state.speed, 0);
  assert.equal(state.heading, 0);
});

test('scenic cruise follows the route and yields to a manual brake', () => {
  const state = createDriver(road);
  state.cruise = true;
  for (let i = 0; i < 600; i++) {
    const controls = followRoad(state, road);
    stepDriver(state, controls, 1 / 120, road);
  }
  assert.ok(state.speed > 12);
  assert.ok(Math.abs(state.x) < 0.5);
  stepDriver(state, { brake: 1, manual: true }, 1 / 120, road);
  assert.equal(state.cruise, false);
});
