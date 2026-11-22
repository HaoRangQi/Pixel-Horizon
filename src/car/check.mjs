import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCar } from '../car.js';

// Never hand a Three.js object to assert.equal/deepEqual. When such a comparison fails,
// Node builds an inspection diff of the whole scene graph (parent back-references, every
// buffer attribute, every texture) — that spun a single node process past 10 GB in under
// twenty seconds and froze the machine once. Compare booleans instead.
const same = (a, b, message) => assert.ok(a === b, message);
const differs = (a, b, message) => assert.ok(a !== b, message);

const car = createCar(), second = createCar({ color: 0x6a9daa });
let meshes = 0, triangles = 0;
const unique = new Set();
car.root.traverse(object => {
  if (!object.isMesh) return;
  meshes++;
  triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
  if (unique.has(object.geometry)) return;
  unique.add(object.geometry);
  for (const [name, attribute] of Object.entries(object.geometry.attributes)) {
    for (const value of attribute.array) assert.ok(Number.isFinite(value), `${object.name} finite ${name}`);
  }
});
assert.ok(car.cockpitCamera.position.x > 0.3, 'driver sits on the left');
assert.equal(car.wheels.length, 4);
car.root.updateMatrixWorld(true);
for (const wheel of car.wheels) {
  const bounds = new THREE.Box3().setFromObject(wheel, true);
  assert.ok(Math.abs(bounds.min.y) < 0.00001, `${wheel.name} contacts Y=0`);
}
same(car.body.getObjectByName('car-one-paint').geometry, second.body.getObjectByName('car-one-paint').geometry, 'hypercar shell geometry is shared');
same(car.body.getObjectByName('car-coupe-paint').geometry, second.body.getObjectByName('car-coupe-paint').geometry, 'coupe shell geometry is shared');
same(car.wheels[0].userData.rolling.children[0].geometry, second.wheels[0].userData.rolling.children[0].geometry, 'wheel geometry is shared between cars');
const pivotPositions = car.wheels.map(wheel => wheel.position.toArray());
car.root.position.set(12, 7, -31);
car.root.rotation.y = 0.74;
const state = { speed: 48.5, steer: 0.8, throttle: 0.7, brake: 0.2, rpm: 8600, gear: 4, fuel: 0.71, coolant: 94, odometer: 12480, turnSignal: 1, time: 0.1 };
for (let i = 0; i < 120; i++) car.update(1 / 60, state);
assert.deepEqual(car.root.position.toArray(), [12, 7, -31]);
assert.equal(car.root.rotation.y, 0.74);
assert.deepEqual(car.wheels.map(wheel => wheel.position.toArray()), pivotPositions);
assert.ok(car.wheels[0].rotation.y < car.wheels[1].rotation.y && car.wheels[1].rotation.y < 0, 'right inner wheel turns farther right');
const fastAngle = Math.abs(car.wheels[0].rotation.y);
car.update(0, { ...state, speed: 0 });
assert.ok(Math.abs(car.wheels[0].rotation.y) > fastAngle * 10, 'wheel angle reduces with speed');
const readings = car.body.getObjectByName('liveInstrumentCluster').userData.readings;
assert.deepEqual(readings, { speed: 0, rpm: 8600, gear: 4, fuel: 0.71, coolant: 94, odometer: 12480, turnSignal: 1, time: 0.1, brand: { header: 'AMG  //  PERFORMANCE', sub: 'HORIZON ONE', mode: 'E-PERFORMANCE' } });
car.update(0, { speed: -4, steer: -0.5, rpm: 1700, gear: 'R', fuel: 0.94, coolant: 78, odometer: 3, turnSignal: -1, time: 0.2 });
assert.equal(car.body.getObjectByName('liveInstrumentCluster').userData.readings.gear, 'R');
assert.equal(car.body.getObjectByName('liveInstrumentCluster').userData.readings.speed, -4);
assert.ok(car.wheels[0].rotation.y > 0 && car.wheels[1].rotation.y > 0);
car.root.position.set(0, 0, 0); car.root.rotation.set(0, 0, 0); car.body.position.set(0, 0, 0); car.body.rotation.set(0, 0, 0);
car.setView('cockpit'); car.root.updateMatrixWorld(true);
const eye = car.cockpitCamera.getWorldPosition(new THREE.Vector3());
for (const x of [-0.2, 0, 0.2]) {
  const ray = new THREE.Raycaster(eye, new THREE.Vector3(x, -0.035, 1).normalize(), 0.02, 8);
  const opaque = ray.intersectObject(car.root, true).filter(hit => !hit.object.material.transparent);
  assert.equal(opaque.length, 0, `cockpit road sightline ${x}`);
}
assert.equal(car.body.getObjectByName('cockpitInterior').visible, true);
const oneWheel = car.body.getObjectByName('steeringWheel'), oneCluster = car.body.getObjectByName('liveInstrumentCluster');
car.setStyle('coupe');
assert.ok(car.body.getObjectByName('body-coupe').visible && !car.body.getObjectByName('body-one').visible);
// The coupe cockpit is a separate build, not the AMG's wheel with a new badge.
const coupeWheel = car.body.getObjectByName('steeringWheel'), coupeCluster = car.body.getObjectByName('liveInstrumentCluster');
differs(coupeWheel, oneWheel, 'coupe steering wheel replaces the AMG wheel');
differs(coupeCluster, oneCluster, 'coupe cluster replaces the AMG display');
differs(coupeWheel.children[0].geometry, oneWheel.children[0].geometry, 'coupe rim uses its own geometry');
const screenMaterial = (cluster) => cluster.children.find((o) => o.geometry?.type === 'PlaneGeometry')?.material;
differs(screenMaterial(coupeCluster), screenMaterial(oneCluster), 'coupe cluster draws to its own surface');
const cabinGroup = car.body.getObjectByName('cockpitInterior');
assert.ok(!cabinGroup.children.includes(oneWheel.parent), 'the AMG cockpit mount leaves the cabin while the coupe is active');
assert.ok(cabinGroup.children.includes(coupeWheel.parent) && cabinGroup.children.includes(coupeCluster), 'the coupe cockpit mounts hang under the cabin');
assert.deepEqual(coupeCluster.userData.readings.brand, { header: 'M  //  PERFORMANCE', sub: 'HORIZON M4', mode: 'SPORT' });
car.root.updateMatrixWorld(true);
for (const x of [-0.2, 0, 0.2]) {
  const ray = new THREE.Raycaster(eye, new THREE.Vector3(x, -0.035, 1).normalize(), 0.02, 8);
  const opaque = ray.intersectObject(car.root, true).filter(hit => !hit.object.material.transparent && hit.object.parent?.visible !== false);
  assert.equal(opaque.length, 0, `coupe cockpit road sightline ${x}`);
}
car.setView('chase');
assert.equal(car.body.getObjectByName('cockpitInterior').visible, false);
assert.equal(car.body.getObjectByName('car-one-glass').material.transparent, false);
console.log(JSON.stringify({ status: 'PASS', meshes, triangles, uniqueGeometries: unique.size, cockpitEye: eye.toArray(), wheelbase: car.root.userData.dimensions.wheelbase, checks: ['finite geometry', 'wheel contact', 'left-hand drive', 'root/pivot invariants', 'right-turn yaw', 'speed-reduced steering', 'shared geometry', 'state-driven instrument readings', 'reverse state', 'three unobstructed cockpit rays', 'view visibility', 'garage shells'] }, null, 2));
