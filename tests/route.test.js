import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoute } from '../src/world/route.js';
import { createLandscape } from '../src/world/terrain.js';
import { createDriver, stepDriver, followRoad } from '../src/drive.js';

test('the complete scenic circuit is continuous, queryable and supports an unattended cruise', () => {
  const route = createRoute();
  createLandscape(route);
  const { road } = route;
  assert.ok(road.length > 7000 && road.length < 8500);
  assert.ok(road.sample(0).position.distanceTo(road.sample(1).position) < 0.001);
  for (let i = 0; i < 600; i++) {
    const t = i / 600;
    const sample = road.sample(t);
    const hit = road.nearest(sample.position.x, sample.position.z);
    assert.ok(hit.distance < 0.001);
    assert.ok(Math.abs(road.groundHeight(sample.position.x, sample.position.z) - sample.position.y) < 0.001);
  }
  const driver = createDriver(road, 0.004);
  let maxDeviation = 0;
  for (let i = 0; i < 120 * 480; i++) {
    stepDriver(driver, followRoad(driver, road), 1 / 120, road);
    maxDeviation = Math.max(maxDeviation, driver.roadDistance);
  }
  assert.ok(driver.distance > road.length, 'cruise completes the full circuit');
  assert.ok(maxDeviation < road.width * 0.45, `maximum road deviation ${maxDeviation.toFixed(2)}m`);
  assert.ok([driver.x, driver.y, driver.z, driver.speed].every(Number.isFinite));
});
