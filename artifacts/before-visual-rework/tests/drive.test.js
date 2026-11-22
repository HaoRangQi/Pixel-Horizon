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
  assert.ok(state.heading > 0);
  assert.ok(state.x > 0.1);
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
