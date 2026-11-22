import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readDrivingInput } from '../src/input.js';
import { createDriver, stepDriver } from '../src/drive.js';
import { createCar } from '../src/car.js';

const road = {
  length: 1000, width: 20,
  sample: (t) => ({ position: { x: 0, y: 0, z: t * 1000 }, heading: 0 }),
  nearest: (x, z) => ({ t: z / 1000, distance: Math.abs(x), point: { x: 0, y: 0, z }, heading: 0 }),
  groundHeight: () => 0,
};

test('keyboard and touch steering are conventional and cancel opposing keys', () => {
  assert.equal(readDrivingInput(new Set(['KeyA'])).steer, -1);
  assert.equal(readDrivingInput(new Set(['ArrowLeft'])).steer, -1);
  assert.equal(readDrivingInput(new Set(['KeyD'])).steer, 1);
  assert.equal(readDrivingInput(new Set(['ArrowRight'])).steer, 1);
  assert.equal(readDrivingInput(new Set(['KeyA', 'KeyD'])).steer, 0);
  assert.equal(readDrivingInput(new Set(), new Set(['left'])).steer, -1);
  assert.equal(readDrivingInput(new Set(), new Set(['right'])).steer, 1);
});

test('pressing D is visibly a right turn in the actual Three.js coordinate system', () => {
  const camera = new THREE.PerspectiveCamera(56, 1.6, 0.1, 100);
  camera.position.set(0, 3, -8); camera.lookAt(0, 1, 20); camera.updateMatrixWorld();
  for (const [key, sign] of [['KeyA', -1], ['KeyD', 1]]) {
    const driver = createDriver(road); driver.speed = 12;
    const input = readDrivingInput(new Set([key, 'KeyW']));
    for (let i = 0; i < 90; i++) stepDriver(driver, input, 1 / 120, road);
    const projected = new THREE.Vector3(driver.x, driver.y, driver.z).project(camera);
    assert.ok(projected.x * sign > 0.02, `${key} must move to the ${sign > 0 ? 'right' : 'left'} of the screen`);
  }
});

test('left driver, front wheels and physical gauges consume the same conventional driving state', () => {
  const state = createDriver(road);
  const car = createCar();
  assert.ok(car.cockpitCamera.position.x > 0);
  for (let i = 0; i < 600; i++) stepDriver(state, { throttle: 1 }, 1 / 120, road);
  state.steer = 0.7;
  car.update(1 / 60, { ...state, time: 1 });
  const cluster = car.root.getObjectByName('liveInstrumentCluster');
  assert.ok(cluster);
  for (const property of ['speed', 'rpm', 'gear', 'fuel', 'coolant', 'odometer', 'turnSignal']) {
    assert.equal(cluster.userData.readings[property], state[property], property);
  }
  assert.ok(car.wheels.filter((wheel) => wheel.userData.front).every((wheel) => wheel.rotation.y < 0));
  assert.deepEqual(car.root.position.toArray(), [0, 0, 0]);
});

test('the garage swaps body styles without touching the shared driving state', () => {
  const state = createDriver(road);
  for (let i = 0; i < 300; i++) stepDriver(state, { throttle: 1 }, 1 / 120, road);
  const car = createCar();
  const before = state.speed;
  for (let i = 0; i < 90; i++) stepDriver(state, { throttle: 1 }, 1 / 120, road);
  car.update(1 / 60, { ...state, time: 1 });
  // Both shells exist up front, so a swap is a visibility flip rather than a rebuild.
  const one = car.root.getObjectByName('body-one');
  const coupe = car.root.getObjectByName('body-coupe');
  assert.ok(one && coupe);
  assert.equal(coupe.visible, false);
  car.setView('chase');
  car.setStyle('coupe');
  assert.equal(car.style, 'coupe');
  assert.equal(coupe.visible, true);
  assert.equal(one.visible, false);
  const cluster = car.root.getObjectByName('liveInstrumentCluster');
  assert.equal(cluster.userData.readings.brand.sub, 'HORIZON M4');
  // The swap must not reset the driving model or the wheels.
  assert.equal(state.speed > before, true);
  const wheelPositions = car.wheels.map((wheel) => wheel.position.toArray());
  car.update(1 / 60, { ...state, time: 1.1 });
  assert.deepEqual(car.wheels.map((wheel) => wheel.position.toArray()), wheelPositions);
  assert.equal(cluster.userData.readings.speed, state.speed);
  car.setStyle('one');
  assert.equal(car.root.userData.style, 'one');
});
