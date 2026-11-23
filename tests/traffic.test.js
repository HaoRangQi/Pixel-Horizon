import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrafficModel } from '../src/traffic/model.js';

const wrap = (v) => ((v % 1) + 1) % 1;

// Same contract as world/route.js, on a straight 2 km loop with +Z forward and heading 0.
function makeRoad(length = 2000, width = 12.2) {
  return {
    length, width,
    sample(t) {
      const w = wrap(t);
      return { position: { x: 0, y: 10, z: w * length }, heading: 0 };
    },
  };
}

function playerInLane(road, t, speed = 0) {
  return { t: wrap(t), speed, x: -road.width * 0.25, z: wrap(t) * road.length, y: 10 };
}

const step = (model, player, seconds) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) model.update(1 / 60, player);
};

test('traffic keeps the right-hand lane and drives in both directions', () => {
  const road = makeRoad();
  const model = createTrafficModel(road, { count: 6, bothDirections: true, seed: 7 });
  const player = playerInLane(road, 0.1);
  step(model, player, 6);
  const half = road.width * 0.25;
  assert.deepEqual(new Set(model.cars.map((car) => car.dir)), new Set([-1, 1]));
  for (const car of model.cars) {
    assert.ok(car.dir > 0 ? car.offset < 0 : car.offset > 0, `${car.style} stays on its own side (${car.offset})`);
    assert.ok(Math.abs(Math.abs(car.offset) - half) < 1.2, 'cars settle near a lane centre');
    assert.ok(Number.isFinite(car.heading) && Number.isFinite(car.x) && Number.isFinite(car.z));
  }
});

test('a car approaching a stopped player in the same lane stops behind it instead of overlapping', () => {
  const road = makeRoad();
  const model = createTrafficModel(road, { count: 1, bothDirections: false, seed: 1 });
  const car = model.cars[0];
  const player = playerInLane(road, 0.5);
  car.t = wrap(0.5 - 60 / road.length);
  car.offset = car.baseOffset = car.offsetTarget = -road.width * 0.25;
  car.speed = 18;
  step(model, player, 25);
  assert.ok(car.playerGap >= model.config.stopGap - 1e-6, `kept ${car.playerGap.toFixed(2)} m behind the player`);
  assert.ok(car.playerGap < model.config.followGap, 'the car actually closed the gap first');
  assert.ok(car.speed < 0.5, `the car came to rest (${car.speed.toFixed(2)} m/s)`);
  assert.ok(Math.abs(car.offset - -road.width * 0.25) < 0.3, 'it did not leave the lane to do so');
});

test('same-direction cars queue without touching', () => {
  const road = makeRoad();
  const model = createTrafficModel(road, { count: 2, bothDirections: false, seed: 3 });
  const [follower, leader] = model.cars;
  const lane = -road.width * 0.25;
  leader.t = 0.6; follower.t = wrap(0.6 - 15 / road.length);
  for (const car of [leader, follower]) {
    car.offset = car.baseOffset = car.offsetTarget = lane;
    car.speed = 0; car.cruise = 16; car.freeSpeed = 16;
  }
  leader.speed = 12;
  follower.speed = 24;
  step(model, playerInLane(road, 0.1), 25);
  const gap = wrap((leader.t - follower.t) * follower.dir) * road.length;
  assert.ok(gap >= model.config.stopGap - 1e-6, `following distance ${gap.toFixed(2)} m`);
  assert.ok(follower.speed <= leader.speed + 2, 'the follower does not keep ramming the leader');
});

test('a leading car changes lanes for a faster player behind it, then rejoins', () => {
  const road = makeRoad();
  const model = createTrafficModel(road, { count: 1, bothDirections: false, seed: 5 });
  const car = model.cars[0];
  car.t = 0.5;
  car.offset = car.baseOffset = car.offsetTarget = -road.width * 0.25;
  car.speed = 17;
  let playerT = wrap(0.5 - 30 / road.length);
  const player = playerInLane(road, playerT, 26);
  let yielded = false;
  for (let i = 0; i < 240; i++) {
    // The player advances behind the car at 26 m/s, closing in.
    playerT = wrap(playerT + 26 / 60 / road.length);
    player.t = playerT; player.z = playerT * road.length;
    model.update(1 / 60, player);
    if (car.yielding) yielded = true;
    // The player must never be shoved through the car.
    const dx = car.x - player.x, dz = car.z - player.z;
    assert.ok(Math.hypot(dx, dz) > 4.5, `no interpenetration (${Math.hypot(dx, dz).toFixed(2)} m)`);
  }
  assert.ok(yielded, 'the car indicated and moved over for the faster car behind');
  assert.ok(car.offset > car.baseOffset, 'the lane change actually moved it toward the other lane');
});

test('fleet count, enable switch and seeded appearance are configurable', () => {
  const road = makeRoad();
  const a = createTrafficModel(road, { count: 5, seed: 99 });
  const b = createTrafficModel(road, { count: 5, seed: 99 });
  assert.deepEqual(
    a.cars.map((car) => [car.t, car.style, car.color]),
    b.cars.map((car) => [car.t, car.style, car.color]),
    'same seed produces the same fleet',
  );
  a.setCount(9);
  assert.equal(a.count, 9);
  assert.equal(b.count, 5, 'models are independent');
  a.setEnabled(false);
  const before = a.cars.map((car) => car.t);
  step(a, playerInLane(road, 0.1), 2);
  assert.deepEqual(a.cars.map((car) => car.t), before, 'disabled traffic is frozen');
  a.configure({ enabled: true, density: 0.5 });
  assert.equal(a.enabled, true);
  assert.equal(a.count, 1, 'density sizes the fleet when count is not pinned');
});
