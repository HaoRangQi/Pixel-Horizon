import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoute } from '../src/world/route.js';
import { readRoadNetwork } from '../src/nav/road-adapter.js';
import { planPath, pointAt, pathProgress, indexAtDistance } from '../src/nav/path.js';
import { createNavigation } from '../src/nav/navigation.js';

test('the read-only adapter wraps the game road without changing it', () => {
  const route = createRoute();
  const before = route.road.length;
  const network = readRoadNetwork(route.road);
  assert.equal(network.kind, 'single');
  assert.equal(network.length, before);
  assert.equal(network.width, route.road.width);
  for (const t of [0, 0.13, 0.5, 0.87, 1, -0.2]) {
    const sample = network.sample(t);
    const expected = route.road.sample(t);
    assert.equal(sample.position.x, expected.position.x);
    assert.equal(sample.position.z, expected.position.z);
  }
  assert.throws(() => readRoadNetwork({}), /sample/);
  assert.throws(() => readRoadNetwork({ sample() {}, nearest() {}, length: 0 }), /positive length/);
});

test('a path query returns ordered points that both the map and the driver can consume', () => {
  const route = createRoute();
  const network = readRoadNetwork(route.road);
  const path = planPath(network, { t: 0.1 }, { t: 0.14 });
  assert.ok(Math.abs(path.length - 0.04 * network.length) < 1e-6);
  assert.ok(path.points.length > 40);
  assert.equal(path.fromT.toFixed(6), '0.100000');
  assert.ok(Math.abs(path.destination.t - 0.14) < 1e-9);
  for (let i = 0; i < path.points.length; i++) {
    const point = path.points[i];
    if (i) assert.ok(point.s > path.points[i - 1].s, 'path distances are strictly ordered');
    const hit = route.road.nearest(point.x, point.z);
    assert.ok(hit.distance < 0.01, `path point ${i} sits on the road`);
  }
  const middle = pointAt(path, path.length / 2);
  assert.ok(Math.abs(middle.s - path.length / 2) < 1e-9);
  assert.ok(Math.hypot(middle.x - path.points[0].x, middle.z - path.points[0].z) > 10);
  assert.equal(indexAtDistance(path.points, 0), 0);
  assert.ok(indexAtDistance(path.points, path.length) >= path.points.length - 2);
});

test('planning wraps across the loop start and reports progress from the current station', () => {
  const route = createRoute();
  const network = readRoadNetwork(route.road);
  const path = planPath(network, { t: 0.98 }, { t: 0.02 });
  assert.ok(Math.abs(path.length - 0.04 * network.length) < 1e-6);
  assert.ok(path.points.some((point) => point.t > 0.98));
  assert.ok(path.points.some((point) => point.t < 0.02));
  const progress = pathProgress(network, path, 0.99);
  assert.ok(Math.abs(progress - 0.01 * network.length) < 0.5);

  const navigation = createNavigation({ network });
  navigation.setDestination({ t: 0.02, label: '灯塔海岸' });
  const frame = navigation.update({ t: 0.98 });
  assert.equal(frame.active, true);
  assert.equal(frame.destination.label, '灯塔海岸');
  assert.ok(frame.remaining > 0 && frame.remaining < network.length * 0.05);
  assert.ok(frame.startIndex >= 0);
  assert.equal(navigation.update({ t: 0.01 }).passed, false);
  assert.equal(navigation.update({ t: 0.03 }).passed, true);
});

test('a destination can be resolved from world coordinates and cleared', () => {
  const route = createRoute();
  const network = readRoadNetwork(route.road);
  const sample = route.road.sample(0.44);
  const navigation = createNavigation({ network });
  navigation.setDestination({ x: sample.position.x, z: sample.position.z, label: '枫色河谷' });
  const frame = navigation.update({ t: 0.4 });
  assert.equal(frame.active, true);
  assert.ok(frame.remaining > 0);
  assert.ok(Math.hypot(frame.destination.x - sample.position.x, frame.destination.z - sample.position.z) < 0.01);
  navigation.clear();
  assert.equal(navigation.update({ t: 0.4 }).active, false);
});

test('the adapter linearises an ordered multi-route network without touching route data', () => {
  const makeLine = (z0, length) => ({
    length,
    width: 10,
    sample(t) {
      const u = ((t % 1) + 1) % 1;
      return { position: { x: 0, y: 0, z: z0 + u * length }, heading: 0 };
    },
    nearest(x, z) {
      const local = Math.max(0, Math.min(length, z - z0));
      const dz = z - (z0 + local);
      return { t: local / length, distance: Math.hypot(x, dz), point: { x: 0, y: 0, z: z0 + local }, heading: 0 };
    },
  });
  const network = readRoadNetwork({ routes: [makeLine(0, 500), makeLine(500, 500)] });
  assert.equal(network.kind, 'chain');
  assert.equal(network.length, 1000);
  assert.equal(network.width, 10);
  const hit = network.nearest(2, 780);
  assert.ok(Math.abs(hit.t - 0.78) < 1e-9);
  const path = planPath(network, { t: 0.2 }, { t: 0.8 });
  assert.ok(Math.abs(path.length - 600) < 1e-6);
  assert.ok(path.points.some((point) => point.z > 500), 'the plan crosses into the second route');
  assert.ok(Math.abs(path.points.at(-1).z - 800) < 1e-6);
  assert.equal(network.locate(0.8).routeIndex, 1);
});

test('a navigation plan is reused while driving and rebuilt only when it is invalid', () => {
  const route = createRoute();
  const network = readRoadNetwork(route.road);
  const navigation = createNavigation({ network });
  navigation.setDestination({ t: 0.2, label: '金穗原野' });
  const first = navigation.update({ t: 0.1 });
  const second = navigation.update({ t: 0.12 });
  assert.equal(first.path, second.path, 'the same query result feeds every consumer');
  assert.ok(second.remaining < first.remaining);
  const reversed = navigation.update({ t: 0.09 });
  assert.notEqual(reversed.path, first.path, 'driving behind the plan start rebuilds it');
});

test('long routes keep their shared plan and accumulated progress beyond half a circuit', () => {
  const network = readRoadNetwork(createRoute().road);
  for (const start of [0.1, 0.85]) {
    const navigation = createNavigation({ network });
    navigation.setDestination({ t: (start + 0.8) % 1 });
    const first = navigation.update({ t: start });
    const direct = pathProgress(network, first.path, (start + 0.6) % 1);
    assert.ok(Math.abs(direct - 0.6 * network.length) < 1e-6, 'a path query supports the full forward arc');
    for (let step = 1; step <= 33; step++) {
      const travelled = step * 0.025 * network.length;
      const frame = navigation.update({ t: (start + step * 0.025) % 1 });
      assert.ok(frame.path === first.path, 'forward travel reuses the map/driver path');
      assert.ok(Math.abs(frame.progress - Math.min(travelled, first.path.length)) < 1e-6);
      assert.ok(Math.abs(frame.remaining - Math.max(0, first.path.length - travelled)) < 1e-6);
      assert.equal(frame.passed, travelled > first.path.length + 1);
    }
  }
});

test('reversing near the start of an almost-full circuit is not mistaken for arrival', () => {
  const network = readRoadNetwork(createRoute().road);
  const navigation = createNavigation({ network });
  navigation.setDestination({ t: 0.095 });
  const first = navigation.update({ t: 0.1 });
  const smallReverse = navigation.update({ t: 0.099 });
  assert.equal(smallReverse.progress, 0);
  assert.ok(smallReverse.path === first.path);
  const reversed = navigation.update({ t: 0.09 });
  assert.ok(reversed.path !== first.path);
  assert.equal(reversed.progress, 0);
  assert.equal(reversed.passed, false);
});

test('navigation keeps the main-loop station while the car drives a branch', () => {
  const network = readRoadNetwork(createRoute().road);
  const navigation = createNavigation({ network });
  navigation.setDestination({ t: 0.3, label: '金穗原野' });
  const onMain = navigation.update({ t: 0.1, mainT: 0.1 });
  const onBranch = navigation.update({ t: 0.72, mainT: 0.12 });
  assert.equal(onBranch.path, onMain.path, 'the scenic plan remains shared');
  assert.ok(onBranch.progress > onMain.progress, 'mainT drives progress, not the branch-local t');
  assert.ok(onBranch.remaining < onMain.remaining);
});
