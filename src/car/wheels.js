import * as THREE from 'three';
import { box, collection, cylinder, grid, polygon, rod, roundedBox, sphere, torus, tube } from './geometry.js';
import { FRONT_AXLE, REAR_AXLE, TRACK_HALF, WHEEL_RADIUS } from './exterior.js';

const TAU = Math.PI * 2;
let shared;

function geometry() {
  const spin = collection(), fixed = collection();
  const add = (name, g) => spin.add(name, g);
  // Rounded tire shoulders and a recessed sidewall share one smooth carcass.
  add('tire', grid((u, v) => {
    const a = u * TAU, x = (v * 2 - 1) * 0.147;
    const radius = WHEEL_RADIUS - 0.059 * Math.abs(v * 2 - 1) ** 5;
    return [x, Math.cos(a) * radius, Math.sin(a) * radius];
  }, 80, 18, [0, 1, 0]));
  for (const side of [-1, 1]) {
    add('tire', grid((u, v) => {
      const a = u * TAU, radius = THREE.MathUtils.lerp(0.242, 0.3, v);
      return [side * (0.146 + Math.sin(v * Math.PI) * 0.006), Math.cos(a) * radius, Math.sin(a) * radius];
    }, 80, 8, [side, 0, 0]));
    add('tire', torus(0.302, 0.002, [side * 0.148, 0, 0], undefined, 80));
    add('tireMark', torus(0.287, 0.0007, [side * 0.153, 0, 0], undefined, 80));
    // Raised sidewall blocks give a readable molded rather than plain rubber edge.
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * TAU;
      if (i % 9 > 5) continue;
      add('tireMark', box([0.0013, 0.008, 0.013], [side * 0.153, Math.cos(a) * 0.273, Math.sin(a) * 0.273], [a, 0, 0]));
    }
    add('darkMetal', cylinder(0.247, 0.018, [side * 0.137, 0, 0], undefined, 64, true));
    add('rim', torus(0.247, 0.0095, [side * 0.148, 0, 0], undefined, 80));
    add('darkMetal', torus(0.23, 0.004, [side * 0.145, 0, 0], undefined, 64));
    add('brakeDisc', cylinder(0.216, 0.009, [side * 0.1, 0, 0], undefined, 72));
    add('darkMetal', cylinder(0.085, 0.012, [side * 0.113, 0, 0], undefined, 40));
    for (let j = 0; j < 36; j++) {
      const a = j / 36 * TAU;
      for (const r of [0.161, 0.193]) {
        add('black', cylinder(0.0032, 0.001, [side * 0.107, Math.cos(a + r) * r, Math.sin(a + r) * r], undefined, 5));
      }
    }
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU;
      for (const branch of [-1, 1]) {
        const p = (r, angle, x) => [side * x, Math.cos(angle) * r, Math.sin(angle) * r];
        const a1 = a + branch * 0.035, a2 = a + branch * 0.082;
        add('rim', polygon([p(0.064, a1 - 0.036, 0.154), p(0.064, a1 + 0.036, 0.154), p(0.239, a2 + 0.019, 0.146), p(0.239, a2 - 0.019, 0.146)], [side, 0, 0]));
        add('rim', polygon([p(0.064, a1 + 0.036, 0.154), p(0.064, a1 + 0.036, 0.137), p(0.239, a2 + 0.019, 0.132), p(0.239, a2 + 0.019, 0.146)]));
      }
    }
    add('rim', cylinder(0.063, 0.02, [side * 0.156, 0, 0], undefined, 32));
    add('darkMetal', cylinder(0.044, 0.005, [side * 0.17, 0, 0], undefined, 20));
    add('silver', torus(0.028, 0.002, [side * 0.175, 0, 0], undefined, 28));
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * TAU;
      add('silver', rod([side * 0.176, 0, 0], [side * 0.176, Math.cos(a) * 0.024, Math.sin(a) * 0.024], 0.0017, 5));
    }
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU;
      add('silver', cylinder(0.004, 0.004, [side * 0.17, Math.cos(a) * 0.049, Math.sin(a) * 0.049], undefined, 6));
    }
    fixed.add('caliper', roundedBox([0.06, 0.148, 0.08], [side * 0.111, 0.02, -0.185], [0.13, 0, 0], 0.013));
    fixed.add('black', box([0.002, 0.07, 0.023], [side * 0.146, 0.023, -0.19], [0.13, 0, 0]));
    for (const yy of [-0.033, 0.074]) fixed.add('silver', cylinder(0.008, 0.003, [side * 0.147, yy, -0.191 + yy * 0.13], undefined, 8));
  }
  // Three circumferential channels and staggered shallow tread blocks.
  for (const x of [-0.073, 0, 0.073]) add('tread', torus(WHEEL_RADIUS - 0.003, 0.0024, [x, 0, 0], undefined, 100));
  for (let i = 0; i < 52; i++) {
    const a = i / 52 * TAU;
    for (const side of [-1, 1]) {
      const pts = [];
      for (let j = 0; j <= 4; j++) {
        const x = side * THREE.MathUtils.lerp(0.014, 0.134, j / 4);
        const aa = a + j * 0.012 * side;
        const r = WHEEL_RADIUS - 0.059 * Math.abs(x / 0.147) ** 5 - 0.0025;
        pts.push([x, Math.cos(aa) * r, Math.sin(aa) * r]);
      }
      add('tread', tube(pts, 0.0018, 6, false, 3));
    }
  }
  return { spin: spin.finish(), fixed: fixed.finish() };
}

export function createWheels(root, materials) {
  shared ??= geometry();
  const wheels = [];
  for (const front of [true, false]) {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.name = `${front ? 'front' : 'rear'}-${side > 0 ? 'left' : 'right'}-steer`;
      pivot.position.set(side * TRACK_HALF, WHEEL_RADIUS, front ? FRONT_AXLE : REAR_AXLE);
      const rolling = new THREE.Group();
      rolling.name = 'wheelRoll';
      for (const [name, geometry] of shared.spin) {
        const mesh = new THREE.Mesh(geometry, materials[name]);
        mesh.name = `wheel-${name}`;
        mesh.castShadow = mesh.receiveShadow = true;
        rolling.add(mesh);
      }
      for (const [name, geometry] of shared.fixed) {
        const mesh = new THREE.Mesh(geometry, materials[name]);
        mesh.castShadow = mesh.receiveShadow = true;
        pivot.add(mesh);
      }
      pivot.userData = { front, side, radius: WHEEL_RADIUS, rolling };
      pivot.add(rolling);
      wheels.push(pivot);
      root.add(pivot);
    }
  }
  return wheels;
}
