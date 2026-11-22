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
  let maxDeviation = 0, maxLeft = -Infinity, lateralSum = 0, lateralCount = 0;
  for (let i = 0; i < 120 * 480; i++) {
    stepDriver(driver, followRoad(driver, road), 1 / 120, road);
    maxDeviation = Math.max(maxDeviation, driver.roadDistance);
    // Signed offset from the painted centreline (+ = driver-left) sampled around the circuit.
    if (i % 6 === 0) {
      const hit = road.nearest(driver.x, driver.z);
      const lateral = (driver.x - hit.point.x) * Math.cos(hit.heading) - (driver.z - hit.point.z) * Math.sin(hit.heading);
      maxLeft = Math.max(maxLeft, lateral);
      lateralSum += lateral; lateralCount++;
    }
  }
  assert.ok(driver.distance > road.length, 'cruise completes the full circuit');
  assert.ok(maxDeviation < road.width * 0.45, `maximum road deviation ${maxDeviation.toFixed(2)}m`);
  assert.ok(maxLeft < 0.2, `cruise must keep right of the centreline, reached ${maxLeft.toFixed(2)}m left of it`);
  const meanLateral = lateralSum / lateralCount;
  assert.ok(meanLateral > -road.width * 0.3 && meanLateral < -road.width * 0.2,
    `cruise should ride the right lane centre (mean offset ${meanLateral.toFixed(2)}m, target ${(-road.width * 0.25).toFixed(2)}m)`);
  assert.ok([driver.x, driver.y, driver.z, driver.speed].every(Number.isFinite));
});
