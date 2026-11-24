// NPC traffic rendering. The player's two body shells are reused verbatim (same cached
// BufferGeometry per material), but every traffic car of a style is packed into one
// InstancedMesh per material — so the draw-call cost is one set per style, not one car.
// Per-instance colour on the paint batch gives each NPC its own paint without new meshes.
//
// The wheels are a deliberately reduced copy of wheels.js (torus tyre, five spokes, disc,
// caliper): the full wheel is ~31k triangles each, which is 20× more than the traffic view
// can resolve at road distance. See .agents/notes/implemented/feature/2026-11-23-npc-traffic.md.

import * as THREE from 'three';
import { BODY_STYLES, bodyGeometry } from './car/bodies.js';
import { createMaterials } from './car/materials.js';
import { collection, cylinder, rod, roundedBox, torus } from './car/geometry.js';
import { FRONT_AXLE, REAR_AXLE, TRACK_HALF, WHEEL_RADIUS } from './car/exterior.js';
import { createTrafficModel } from './traffic/model.js';

const TAU = Math.PI * 2;

function buildWheelGeometries() {
  const spin = collection(), fixed = collection();
  // Overall radius matches the real wheel (0.357 m) so the body sits at the same height.
  spin.add('tire', torus(0.267, 0.09, [0, 0, 0], undefined, 28));
  for (const side of [-1, 1]) {
    spin.add('tire', cylinder(0.30, 0.024, [side * 0.108, 0, 0], undefined, 20));
    spin.add('rim', cylinder(0.238, 0.014, [side * 0.148, 0, 0], undefined, 24));
    spin.add('silver', torus(0.03, 0.004, [side * 0.158, 0, 0], undefined, 16));
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU;
      spin.add('rim', rod(
        [side * 0.152, Math.cos(a) * 0.06, Math.sin(a) * 0.06],
        [side * 0.152, Math.cos(a) * 0.22, Math.sin(a) * 0.22], 0.013, 5));
    }
  }
  spin.add('darkMetal', cylinder(0.048, 0.30, [0, 0, 0], undefined, 12));
  spin.add('brakeDisc', cylinder(0.2, 0.022, [0, 0, 0], undefined, 20));
  fixed.add('caliper', roundedBox([0.24, 0.10, 0.13], [0, 0.01, -0.16], [0.15, 0, 0], 0.012));
  return { spin: spin.finish(), fixed: fixed.finish() };
}

export function createTraffic(scene, road, options = {}) {
  const model = createTrafficModel(road, options);
  const capacity = Math.max(1, model.config.maxCount);
  // One palette for every NPC material. Paint stays white so the per-instance colour is the
  // real paint; the rest are identical to the player's materials but owned by traffic so a
  // cockpit view toggle can never turn NPC glass transparent.
  const materials = createMaterials(0xffffff);
  materials.taillight.emissiveIntensity = 1.35;
  const wheelGeometry = buildWheelGeometries();

  const styles = new Map();
  function ensureStyle(style) {
    const key = BODY_STYLES[style] ? style : 'one';
    if (styles.has(key)) return styles.get(key);
    const meshes = new Map();
    for (const [name, geometry] of bodyGeometry(key)) {
      const material = materials[name];
      if (!material) continue;
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = `traffic-${key}-${name}`;
      mesh.count = 0;
      mesh.visible = false;
      // Only the silhouette casts: trim and lamps would each cost another shadow draw.
      mesh.castShadow = ['paint', 'carbon', 'black', 'carbonMatte', 'grille', 'hoodCarbon'].includes(name);
      mesh.receiveShadow = name !== 'glass';
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (name === 'paint') {
        mesh.setColorAt(0, new THREE.Color(0xffffff));
        mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      scene.add(mesh);
      meshes.set(name, mesh);
    }
    styles.set(key, meshes);
    return meshes;
  }
  for (const style of model.config.styles) ensureStyle(style);

  const wheelBatches = { spin: [], fixed: [] };
  for (const part of ['spin', 'fixed']) {
    for (const [name, geometry] of wheelGeometry[part]) {
      const mesh = new THREE.InstancedMesh(geometry, materials[name], capacity * 4);
      mesh.name = `traffic-wheel-${part}-${name}`;
      mesh.count = 0;
      mesh.visible = false;
      mesh.castShadow = false; // the body shadow already grounds the car
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      wheelBatches[part].push(mesh);
    }
  }

  const slots = [
    { x: TRACK_HALF, z: FRONT_AXLE, front: true }, { x: -TRACK_HALF, z: FRONT_AXLE, front: true },
    { x: TRACK_HALF, z: REAR_AXLE, front: false }, { x: -TRACK_HALF, z: REAR_AXLE, front: false },
  ];
  const position = new THREE.Vector3(), scaleOne = new THREE.Vector3(1, 1, 1);
  const bodyEuler = new THREE.Euler(0, 0, 0, 'YXZ'), wheelEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const quaternion = new THREE.Quaternion();
  const bodyMatrix = new THREE.Matrix4(), chassisMatrix = new THREE.Matrix4();
  const localMatrix = new THREE.Matrix4(), wheelMatrix = new THREE.Matrix4();
  const color = new THREE.Color();
  let visible = 0;

  function hideAll() {
    for (const meshes of styles.values()) for (const mesh of meshes.values()) { mesh.count = 0; mesh.visible = false; }
    for (const part of ['spin', 'fixed']) for (const mesh of wheelBatches[part]) { mesh.count = 0; mesh.visible = false; }
    visible = 0;
  }

  /** Pack the cars near the player into the instanced batches. */
  function place(player) {
    const px = player?.x ?? 0, pz = player?.z ?? 0;
    const limit = model.config.renderDistance ** 2;
    for (const meshes of styles.values()) for (const mesh of meshes.values()) mesh.count = 0;
    for (const part of ['spin', 'fixed']) for (const mesh of wheelBatches[part]) mesh.count = 0;
    visible = 0;

    for (const car of model.cars) {
      const dx = car.x - px, dz = car.z - pz;
      if (dx * dx + dz * dz > limit) continue;
      const meshes = ensureStyle(car.style);
      visible++;

      position.set(car.x, car.y + 0.04, car.z);
      bodyEuler.set(-car.pitch, car.heading, car.roll, 'YXZ');
      quaternion.setFromEuler(bodyEuler);
      bodyMatrix.compose(position, quaternion, scaleOne);
      bodyEuler.set(-car.pitch, car.heading, 0, 'YXZ');
      quaternion.setFromEuler(bodyEuler);
      chassisMatrix.compose(position, quaternion, scaleOne);

      color.setHex(car.color);
      for (const [name, mesh] of meshes) {
        const index = mesh.count++;
        mesh.setMatrixAt(index, bodyMatrix);
        if (name === 'paint') mesh.setColorAt(index, color);
      }

      for (const slot of slots) {
        const steer = slot.front ? car.wheelAngle : 0;
        position.set(slot.x, WHEEL_RADIUS, slot.z);
        wheelEuler.set(car.spin, steer, 0, 'YXZ');
        quaternion.setFromEuler(wheelEuler);
        localMatrix.compose(position, quaternion, scaleOne);
        wheelMatrix.multiplyMatrices(chassisMatrix, localMatrix);
        for (const mesh of wheelBatches.spin) mesh.setMatrixAt(mesh.count++, wheelMatrix);

        wheelEuler.set(0, steer, 0, 'YXZ');
        quaternion.setFromEuler(wheelEuler);
        localMatrix.compose(position, quaternion, scaleOne);
        wheelMatrix.multiplyMatrices(chassisMatrix, localMatrix);
        for (const mesh of wheelBatches.fixed) mesh.setMatrixAt(mesh.count++, wheelMatrix);
      }
    }

    for (const meshes of styles.values()) {
      for (const mesh of meshes.values()) {
        mesh.visible = mesh.count > 0;
        if (!mesh.visible) continue;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        // The instance matrices move every frame; refresh the bounding sphere so the main
        // camera and the shadow camera can still cull the whole batch when nobody is in view.
        mesh.computeBoundingSphere();
      }
    }
    for (const part of ['spin', 'fixed']) {
      for (const mesh of wheelBatches[part]) {
        mesh.visible = mesh.count > 0;
        if (!mesh.visible) continue;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    }
  }

  function update(dt, player) {
    if (!model.enabled) return;
    if (dt > 0) for (const car of model.cars) car.spin = (car.spin + car.speed * dt / WHEEL_RADIUS) % TAU;
    model.update(dt, player);
    place(player);
  }

  function setEnabled(value) {
    model.setEnabled(value);
    if (!model.enabled) hideAll();
  }

  function setCount(value) {
    model.setCount(value);
    for (const style of model.config.styles) ensureStyle(style);
  }

  function configure(next = {}) {
    model.configure(next);
    for (const style of model.config.styles) ensureStyle(style);
    if (!model.enabled) hideAll();
  }

  return {
    update,
    place,
    setEnabled,
    setCount,
    configure,
    avoidPlayer: (player) => model.avoidPlayer(player),
    stats: () => ({ ...model.stats(), visible }),
    summary: () => ({ enabled: model.enabled, count: model.count, visible }),
    get enabled() { return model.enabled; },
    get count() { return model.count; },
    get visible() { return visible; },
    get cars() { return model.cars; },
    get model() { return model; },
  };
}
