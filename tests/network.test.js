import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoute } from '../src/world/route.js';
import { createLandscape } from '../src/world/terrain.js';
import { createDriver, stepDriver, followRoad, resetDriver } from '../src/drive.js';

const route = createRoute();
const landscape = createLandscape(route);
const { road, branches, main } = route;
const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function cornerRadius(line, i, window = 3) {
  const a = line.samples[i - window], b = line.samples[i], c = line.samples[i + window];
  const ab = Math.hypot(b.x - a.x, b.z - a.z);
  const bc = Math.hypot(c.x - b.x, c.z - b.z);
  const ca = Math.hypot(c.x - a.x, c.z - a.z);
  const area = Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
  return area < 1e-6 ? Infinity : (ab * bc * ca) / (4 * area);
}

test('the network exposes seven connected branches beyond the main loop', () => {
  assert.equal(branches.length, 7);
  assert.deepEqual(branches.map((line) => line.id), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(new Set(branches.map((line) => line.name)).size, 7);
  assert.ok(branches.every((line) => line.name.length > 0 && !line.closed));
  assert.ok(branches.every((line) => line.kind === 'secondary' || line.kind === 'trail'));
  const branchLength = branches.reduce((sum, line) => sum + line.length, 0);
  assert.ok(branchLength > 6000, `branch network is only ${branchLength.toFixed(0)}m`);
  assert.ok(road.length + branchLength > 13000, 'network should roughly double the single-loop road length');
  assert.ok(branches.some((line) => line.length > 1500), 'the network needs at least one long route');
  assert.ok(branches.some((line) => line.length < 400), 'the network needs at least one short spur');

  assert.equal(route.mapPaths.length, 8);
  assert.equal(route.mapPaths[0].closed, true);
  assert.ok(route.mapPaths.every((path) => path.points.length > 2 && Number.isFinite(path.width)));
  assert.ok(route.mainJunctions.length >= 8);
});

test('every branch sample lies on its own road and on the terrain', () => {
  for (const line of branches) {
    for (let i = 3; i < line.count - 3; i += 3) {
      const sample = line.samples[i];
      const hit = road.nearest(sample.x, sample.z, line.id);
      assert.equal(hit.route, line.id, `${line.name} sample ${i} escaped to route ${hit.route}`);
      assert.ok(hit.distance < 0.02, `${line.name} nearest error ${hit.distance.toFixed(3)}m`);
      const ground = road.groundHeight(sample.x, sample.z);
      assert.ok(Math.abs(ground - sample.y) < 0.01,
        `${line.name} sample ${i} is ${(sample.y - ground).toFixed(2)}m off the ground`);
    }
  }
});

test('branch ends meet the main loop or another branch without a step', () => {
  const sharedNodes = [
    ['V0', 200, -980], ['V1', 600, -700], ['V2', 430, -120], ['V3', 420, 330], ['V5', -800, -250],
  ];
  for (const line of branches) {
    for (const end of [0, line.count - 1]) {
      const sample = line.samples[end];
      const knots = [{ label: 'main', hit: main.query(sample.x, sample.z) }];
      for (const other of branches) {
        if (other !== line) knots.push({ label: other.name, hit: other.query(sample.x, sample.z) });
      }
      knots.sort((a, b) => a.hit.distance - b.hit.distance);
      assert.ok(knots[0].hit.distance < 0.5,
        `${line.name} end ${end} floats ${knots[0].hit.distance.toFixed(2)}m from ${knots[0].label}`);
      const gap = Math.abs(knots[0].hit.point.y - sample.y);
      assert.ok(gap < 0.2, `${line.name} end ${end} has a ${gap.toFixed(2)}m vertical step at ${knots[0].label}`);
    }
  }
  for (const [name, x, z] of sharedNodes) {
    const heights = branches
      .filter((line) => line.anchors.some((anchor) => anchor.kind === 'node' && anchor.node === name))
      .map((line) => line.query(x, z));
    assert.ok(heights.length >= 2, `${name} should join at least two branches`);
    const spread = Math.max(...heights.map((hit) => hit.point.y)) - Math.min(...heights.map((hit) => hit.point.y));
    assert.ok(spread < 0.05, `${name} branch surfaces differ by ${spread.toFixed(3)}m`);
  }
});

test('branch grades, corner radii and junction overlaps stay drivable', () => {
  for (const line of branches) {
    const ds = line.length / (line.count - 1);
    let minRadius = Infinity, maxGrade = 0;
    for (let i = 0; i < line.count; i++) {
      if (i >= 3 && i < line.count - 3) minRadius = Math.min(minRadius, cornerRadius(line, i));
      if (i > 0) {
        const step = Math.hypot(line.samples[i].x - line.samples[i - 1].x, line.samples[i].z - line.samples[i - 1].z) || ds;
        maxGrade = Math.max(maxGrade, Math.abs(line.samples[i].y - line.samples[i - 1].y) / step);
      }
    }
    assert.ok(minRadius > 30, `${line.name} has a ${minRadius.toFixed(1)}m corner`);
    assert.ok(maxGrade < 0.1505, `${line.name} climbs at ${(maxGrade * 100).toFixed(1)}%`);

    for (const sample of line.samples) {
      assert.ok(sample.y > 3, `${line.name} dips to ${sample.y.toFixed(1)}m`);
      const lakeR = Math.hypot((sample.x - landscape.lake.x) / landscape.lake.rx,
        (sample.z - landscape.lake.z) / landscape.lake.rz);
      assert.ok(lakeR > 1 || sample.y > landscape.lake.y + 0.5, `${line.name} runs into the lake`);

      // A branch mouth shares pavement with the main or with another branch only
      // if the ribbon edges can actually overlap; their surfaces must agree there.
      const mainHit = main.query(sample.x, sample.z);
      if (mainHit.distance < (main.width + line.width) / 2 - 0.3) {
        assert.ok(Math.abs(sample.y - mainHit.point.y) < 0.25,
          `${line.name} mouth stands ${Math.abs(sample.y - mainHit.point.y).toFixed(2)}m off the main road`);
      }
      for (const other of branches) {
        if (other === line) continue;
        const hit = other.query(sample.x, sample.z);
        if (hit.distance < (line.width + other.width) / 2 - 0.3) {
          assert.ok(Math.abs(sample.y - hit.point.y) < 0.1,
            `${line.name} and ${other.name} overlap at different heights`);
        }
      }
    }
  }
});

test('scenic cruise follows every branch end to end without leaving the lane', () => {
  for (const line of branches) {
    const start = Math.min(0.4, 45 / line.length);
    const driver = createDriver(road, 0);
    resetDriver(driver, road, start, line.id);
    let maxDeviation = 0, minimumSpeed = Infinity, reached = driver.t;
    const limit = Math.ceil((line.length / 8 + 20) * 120);
    for (let i = 0; i < limit; i++) {
      stepDriver(driver, followRoad(driver, road), 1 / 120, road);
      assert.equal(driver.route, line.id, `${line.name} switched route mid-branch`);
      maxDeviation = Math.max(maxDeviation, driver.roadDistance);
      if (i > 240) minimumSpeed = Math.min(minimumSpeed, driver.speed);
      reached = Math.max(reached, driver.t);
      if (driver.t > 0.985) break;
    }
    assert.ok(reached > 0.97, `${line.name} cruise only reached t=${reached.toFixed(3)}`);
    assert.ok(maxDeviation < line.width * 0.55,
      `${line.name} cruise wandered ${maxDeviation.toFixed(2)}m off the centreline`);
    assert.ok(minimumSpeed > 4, `${line.name} cruise stalled at ${minimumSpeed.toFixed(1)}m/s`);
    assert.ok(Number.isFinite(driver.x) && Number.isFinite(driver.y) && Number.isFinite(driver.z));
  }
});

test('cruise returns to the main loop through main-road branch mouths', () => {
  for (const id of [1, 6]) {
    const line = branches.find((branch) => branch.id === id);
    const driver = createDriver(road, 0);
    resetDriver(driver, road, 0.95, id);
    let switched = false;
    for (let i = 0; i < 120 * 90; i++) {
      stepDriver(driver, followRoad(driver, road), 1 / 120, road);
      if (driver.route === 0) { switched = true; break; }
    }
    assert.ok(switched, `${line.name} cruise never merged onto the main loop`);
    assert.ok(driver.roadDistance < main.width * 0.6, `${line.name} merger landed off the carriageway`);
    assert.ok(driver.speed > 5, `${line.name} merger lost all speed`);
  }
});

test('the main-loop cruise never turns onto a branch mouth it passes', () => {
  for (const junction of route.mainJunctions) {
    const lane = route.frame(junction.t, -main.width * 0.25).position;
    const hit = road.nearest(lane.x, lane.z, 0);
    assert.equal(hit.route, 0, `cruise would leave the main in its right lane at t=${junction.t}`);
  }
});
