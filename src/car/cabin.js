import * as THREE from 'three';
import { box, collection, cylinder, grid, rod, roundedBox, shapeExtrude, sphere, torus, transform, tube } from './geometry.js';

export function createCabinGeometry() {
  const batch = collection(), add = (name, g) => batch.add(name, g);
  add('carbonMatte', roundedBox([1.47, 0.09, 1.72], [0, 0.271, -0.2], [0, 0, 0], 0.02));
  add('seat', roundedBox([1.39, 0.12, 0.285], [0, 0.604, 0.54], [-0.08, 0, 0], 0.035));
  add('carbon', grid((u, v) => {
    const x = THREE.MathUtils.lerp(-0.73, 0.73, u), z = THREE.MathUtils.lerp(0.323, 0.764, v);
    return [x, 0.655 + v * 0.048 + (x / 0.74) ** 2 * 0.014, z];
  }, 56, 16, [0, 1, 0]));
  add('stitch', tube([[-0.69, 0.67, 0.331], [-0.3, 0.658, 0.321], [0.3, 0.658, 0.321], [0.69, 0.67, 0.331]], 0.0018, 50));
  add('carbon', roundedBox([0.192, 0.184, 0.92], [0, 0.38, -0.016], [-0.11, 0, 0], 0.022));
  add('darkMetal', roundedBox([0.1, 0.017, 0.265], [0, 0.492, 0.026], [-0.11, 0, 0], 0.006));
  for (let i = 0; i < 3; i++) {
    add('silver', cylinder(0.013, 0.011, [0, 0.501 + i * 0.005, 0.105 - i * 0.075], [0, 0, 0], 24));
    add('black', box([0.002, 0.002, 0.011], [0, 0.508 + i * 0.005, 0.105 - i * 0.075]));
  }
  for (const side of [-1, 1]) {
    const x = side * 0.345;
    add('carbon', sphere([0.251, 0.365, 0.084], [x, 0.601, -0.665], [0.14, 0, 0], 32));
    add('seatCenter', sphere([0.168, 0.303, 0.062], [x, 0.592, -0.596], [0.14, 0, 0], 32));
    add('seat', sphere([0.226, 0.081, 0.314], [x, 0.34, -0.294], [-0.03, 0, 0], 32));
    add('seatCenter', sphere([0.161, 0.064, 0.265], [x, 0.376, -0.28], [-0.04, 0, 0], 28));
    add('carbon', sphere([0.139, 0.135, 0.071], [x, 0.941, -0.717], [0.14, 0, 0], 28));
    add('seat', sphere([0.12, 0.108, 0.028], [x, 0.947, -0.657], [0.14, 0, 0], 28));
    for (const edge of [-1, 1]) {
      add('seat', sphere([0.051, 0.266, 0.094], [x + edge * 0.192, 0.601, -0.56], [0.16, 0, edge * -0.12], 26));
      add('redLeather', tube([[x + edge * 0.164, 0.392, -0.496], [x + edge * 0.185, 0.596, -0.482], [x + edge * 0.155, 0.818, -0.559], [x + edge * 0.104, 0.903, -0.643]], 0.005, 48));
      add('redLeather', roundedBox([0.026, 0.28, 0.01], [x + edge * 0.074, 0.656, -0.523], [0.15, 0, 0], 0.003));
    }
    for (let i = 0; i < 5; i++) add('stitch', tube([[x - 0.127, 0.402 - i * 0.0015, -0.108 - i * 0.061], [x, 0.427 - i * 0.0015, -0.108 - i * 0.061], [x + 0.127, 0.402 - i * 0.0015, -0.108 - i * 0.061]], 0.0011, 20, false, 4));
    add('seat', roundedBox([0.065, 0.241, 1.3], [side * 0.725, 0.492, -0.12], [0, 0, 0], 0.016));
    add('carbon', roundedBox([0.047, 0.082, 0.68], [side * 0.694, 0.556, -0.18], [0.04, 0, 0], 0.014));
    add('silver', roundedBox([0.018, 0.015, 0.162], [side * 0.671, 0.579, -0.211], [0, 0, 0], 0.005));
    add('stitch', tube([[side * 0.691, 0.615, 0.39], [side * 0.692, 0.612, -0.18], [side * 0.692, 0.605, -0.64]], 0.0016, 40));
    for (let j = 0; j < 5; j++) add('black', box([0.08, 0.002, 0.01], [side * 0.6, 0.73, 0.486 + j * 0.028]));
    add('carbon', torus(0.048, 0.006, [side * 0.57, 0.665, 0.378], [Math.PI / 2, 0, 0], 32));
  }
  // Angled magnesium pedal faces are visible below the steering column.
  for (const [x, width] of [[0.278, 0.055], [0.405, 0.045]]) {
    add('darkMetal', rod([x, 0.271, 0.64], [x, 0.39, 0.52], 0.01));
    add('silver', roundedBox([width, 0.079, 0.007], [x, 0.362, 0.496], [-0.34, 0, 0], 0.007));
    for (let i = 0; i < 4; i++) add('black', box([width * 0.7, 0.003, 0.002], [x, 0.335 + i * 0.016, 0.487 - i * 0.005], [-0.34, 0, 0]));
  }
  add('carbon', roundedBox([0.12, 0.035, 0.02], [-0.12, 1.08, 0.1], [0, 0, 0], 0.007));
  add('mirror', roundedBox([0.103, 0.023, 0.003], [-0.12, 1.079, 0.084], [0, 0, 0], 0.004));
  add('black', rod([-0.12, 1.109, 0.075], [-0.12, 1.093, 0.1], 0.005));
  return batch.finish();
}

export function createSteering(materials) {
  const mount = new THREE.Group();
  mount.position.set(0.345, 0.715, 0.18);
  mount.rotation.x = -0.18;
  const wheel = new THREE.Group();
  wheel.name = 'steeringWheel';
  const batch = collection(), add = (name, g) => batch.add(name, g);
  const outline = [[-0.104, -0.081, 0], [-0.132, -0.045, 0], [-0.131, 0.057, 0], [-0.089, 0.106, 0], [-0.031, 0.112, 0], [0.031, 0.112, 0], [0.089, 0.106, 0], [0.131, 0.057, 0], [0.132, -0.045, 0], [0.104, -0.081, 0], [0, -0.087, 0]];
  add('seat', tube(outline, 0.014, 104, true, 10));
  for (const side of [-1, 1]) {
    add('carbon', roundedBox([0.079, 0.059, 0.032], [side * 0.073, 0.004, 0], [0, 0, side * -0.13], 0.01));
    add('carbon', rod([side * 0.035, -0.015, 0], [side * 0.07, -0.079, 0], 0.009));
    add('darkMetal', roundedBox([0.028, 0.09, 0.006], [side * 0.104, 0.005, 0.031], [0, 0, side * -0.12], 0.006));
    add('accent', cylinder(0.011, 0.006, [side * 0.071, -0.006, -0.019], [Math.PI / 2, 0, 0], 22));
    add('silver', cylinder(0.005, 0.007, [side * 0.094, 0.021, -0.02], [Math.PI / 2, 0, 0], 16));
    add('redLeather', cylinder(0.005, 0.007, [side * 0.053, 0.025, -0.02], [Math.PI / 2, 0, 0], 16));
    add('redLeather', tube([[side * 0.123, -0.029, -0.009], [side * 0.124, 0.018, -0.009], [side * 0.115, 0.065, -0.009]], 0.0013, 30, false, 4));
  }
  add('seat', roundedBox([0.078, 0.061, 0.035], [0, 0.001, -0.005], [0, 0, 0], 0.013));
  add('silver', torus(0.017, 0.0018, [0, 0.005, -0.025], [0, 0, 0], 28));
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; add('silver', rod([0, 0.005, -0.026], [Math.sin(a) * 0.014, 0.005 + Math.cos(a) * 0.014, -0.026], 0.001, 4)); }
  add('redLeather', box([0.011, 0.014, 0.014], [0, 0.113, -0.003]));
  for (const [name, geometry] of batch.finish()) {
    const mesh = new THREE.Mesh(geometry, materials[name]);
    mesh.castShadow = true;
    wheel.add(mesh);
  }
  const column = new THREE.Mesh(cylinder(0.028, 0.21, [0, 0, 0.085], [Math.PI / 2, 0, 0], 24), materials.carbonMatte);
  mount.add(column, wheel);
  return { root: mount, wheel };
}
