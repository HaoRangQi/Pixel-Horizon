import * as THREE from 'three';
import { box, collection, cylinder, grid, loopPoints, pointInPolygon, polygon, radialPatch, rod, roundedBox, sampleSections, shapeExtrude, sphere, torus, transform, tube } from './geometry.js';

export const FRONT_AXLE = 1.32;
export const REAR_AXLE = -1.40;
export const TRACK_HALF = 0.861;
export const WHEEL_RADIUS = 0.357;

const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const front = [
  [0.57, 0.927, 0.668, 0.735], [0.85, 0.976, 0.643, 0.831],
  [1.19, 1.005, 0.611, 0.876], [1.42, 1.004, 0.588, 0.868],
  [1.71, 0.984, 0.568, 0.767], [1.98, 0.942, 0.535, 0.615],
  [2.21, 0.868, 0.497, 0.536], [2.36, 0.748, 0.453, 0.467],
];
const rear = [
  [-2.357, 0.873, 0.657, 0.657], [-2.16, 0.969, 0.715, 0.748],
  [-1.85, 1.004, 0.737, 0.839], [-1.47, 1.005, 0.755, 0.884],
  [-1.16, 0.972, 0.773, 0.845], [-0.94, 0.91, 0.752, 0.766],
];
const sides = [
  [-2.357, 0.873, 0.657], [-2.16, 0.969, 0.748], [-1.85, 1.004, 0.839], [-1.47, 1.005, 0.884],
  [-1.16, 0.972, 0.845], [-0.94, 0.91, 0.766], [-0.64, 0.887, 0.68], [0, 0.879, 0.665],
  [0.57, 0.927, 0.735], [0.85, 0.976, 0.831], [1.19, 1.005, 0.876], [1.42, 1.004, 0.868],
  [1.71, 0.984, 0.767], [1.98, 0.942, 0.615], [2.21, 0.868, 0.536], [2.36, 0.748, 0.467],
];

function topPoint(sections, x, z, offset = 0) {
  const [, width, center, edge] = sampleSections(sections, z);
  const f = clamp(Math.abs(x / width), 0, 1.05);
  const ridge = Math.exp(-(((f - 0.83) / 0.19) ** 2)) * 0.018;
  return [x, mix(center, edge, f ** 2.75) + ridge + offset, z];
}

function deck(sections, longitudinal = 90, cross = 42) {
  const from = sections[0][0], to = sections.at(-1)[0];
  return grid((u, v) => {
    const z = mix(from, to, u), [, width] = sampleSections(sections, z);
    return topPoint(sections, (v * 2 - 1) * width, z);
  }, longitudinal, cross, [0, 1, 0]);
}

function aperture(add, outline, project, inward, lipMaterial = 'carbon', lipRadius = 0.013) {
  const points = loopPoints(outline, 56);
  const center = points.reduce((p, q) => p.add(q), new THREE.Vector3()).multiplyScalar(1 / points.length);
  const mouth = points.map(p => project(p.x, p.y));
  const inner = points.map(p => project(mix(center.x, p.x, 0.91), mix(center.y, p.y, 0.86)).map((v, i) => v + inward[i]));
  const vertices = mouth.concat(inner), faces = [];
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    faces.push([i, j, j + points.length], [i, j + points.length, i + points.length]);
  }
  add('carbonMatte', grid((u, v) => {
    const i = Math.min(55, Math.floor(u * 56));
    const p = mouth[i], q = inner[i];
    return p.map((x, k) => mix(x, q[k], v));
  }, 56, 4));
  add('black', polygon(inner));
  add(lipMaterial, tube(mouth, lipRadius, 80, true, 8));
  return { points, mouth, inner };
}

export function createExteriorGeometry() {
  const batch = collection(), add = (name, g) => batch.add(name, g);
  add('paint', deck(front));
  add('paint', deck(rear, 72, 42));

  for (const side of [-1, 1]) {
    const sideIntake = [[-1.025, 0.752], [-0.912, 0.72], [-0.458, 0.608], [-0.692, 0.422], [-0.95, 0.378], [-1.014, 0.51]];
    const intakeCut = loopPoints(sideIntake, 60).map(p => [p.x, p.y]);
    // The inner edge follows each circular arch and the outer skin has a recessed waist.
    add('paint', grid((u, v) => {
      const z = mix(-2.357, 2.36, u);
      const [, width, top] = sampleSections(sides, z);
      let bottom = 0.225;
      for (const axle of [FRONT_AXLE, REAR_AXLE]) {
        const dz = Math.abs(z - axle);
        if (dz < 0.400) bottom = Math.max(bottom, WHEEL_RADIUS + Math.sqrt(0.400 ** 2 - dz ** 2));
      }
      if (z > 1.73) bottom = top - 0.035;
      bottom = Math.min(top - 0.014, bottom);
      const waist = Math.sin(Math.PI * v) * (Math.abs(z) < 0.91 ? 0.043 : 0.014);
      return [side * (width - waist - 0.014 * v), mix(top, bottom, v), z];
    }, 182, 28, [side, 0, 0], ([x, y, z]) => pointInPolygon(z, y, intakeCut)));

    add('carbon', grid((u, v) => {
      const z = mix(-0.98, 0.893, u);
      return [side * mix(0.82, 1.006, v), 0.17 + Math.sin(Math.PI * v) * 0.027, z];
    }, 36, 7, [0, 1, 0]));
    add('paint', tube([[side * 0.965, 0.223, -0.95], [side * 0.955, 0.215, -0.3], [side * 0.97, 0.226, 0.49], [side * 0.98, 0.244, 0.88]], 0.015, 50));

    for (const axle of [FRONT_AXLE, REAR_AXLE]) {
      add('paint', grid((u, v) => {
        const theta = mix(-0.12, Math.PI + 0.12, u), r = mix(0.389, 0.438, v);
        return [side * (1.005 + Math.sin(Math.PI * v) * 0.005), WHEEL_RADIUS + Math.sin(theta) * r, axle + Math.cos(theta) * r];
      }, 76, 5, [side, 0, 0]));
      add('black', grid((u, v) => {
        const theta = u * Math.PI;
        return [side * mix(0.763, 0.999, v), WHEEL_RADIUS + Math.sin(theta) * 0.387, axle + Math.cos(theta) * 0.387];
      }, 64, 5, [0, -1, 0]));
    }

    aperture(add, sideIntake, (z, y) => [side * (sampleSections(sides, z)[1] + 0.006), y, z], [-side * 0.11, 0, 0], 'carbon', 0.009);
    add('paint', tube([[side * 0.957, 0.736, -1.02], [side * 0.928, 0.698, -0.86], [side * 0.901, 0.609, -0.46]], 0.009, 34));
    add('paint', grid((u, v) => {
      const z = mix(-0.95, 0.64, u), width = sampleSections(sides, z)[1];
      return [side * mix(0.748, width, v), 0.685 + 0.03 * Math.sin(u * Math.PI) + 0.012 * Math.sin(v * Math.PI), z];
    }, 54, 10, [0, 1, 0]));
    add('black', tube([[side * 0.928, 0.694, 0.536], [side * 0.906, 0.59, 0.396], [side * 0.89, 0.35, 0.185], [side * 0.93, 0.26, -0.437], [side * 0.942, 0.46, -0.676]], 0.003, 64, false, 4));
    add('darkMetal', roundedBox([0.009, 0.018, 0.12], [side * 0.904, 0.642, -0.32], [0, 0, 0], 0.003));

    // Blade-like LED outlines follow the crowned fenders instead of floating above them.
    const lamp = [[0.475, 2.236], [0.621, 2.148], [0.862, 1.969], [0.945, 1.931], [0.912, 2.053], [0.778, 2.139], [0.57, 2.249]];
    const project = offset => (x, z) => topPoint(front, side * x, z, offset);
    add('lightHousing', radialPatch(lamp, project(0.012), 1, 72, 10));
    add('silver', radialPatch(lamp, project(0.014), 0.91, 72, 8));
    add('lightHousing', radialPatch(lamp, project(0.017), 0.85, 72, 8));
    const lampCurve = [[0.506, 2.231], [0.643, 2.155], [0.792, 2.077], [0.908, 2.019], [0.928, 1.961]];
    add('led', tube(lampCurve.map(([x, z]) => topPoint(front, side * x, z, 0.025)), 0.0105, 64, false, 8));
    for (let i = 0; i < 6; i++) {
      const x = 0.625 + i * 0.049, z = 2.166 - i * 0.029;
      add('led', tube([[x - 0.011, z - 0.011], [x + 0.004, z - 0.062], [x + 0.019, z - 0.08]].map(([xx, zz]) => topPoint(front, side * xx, zz, 0.026)), 0.006, 14, false, 6));
    }

    add('carbon', rod([side * 0.76, 0.738, 0.6], [side * 1.025, 0.845, 0.641], 0.012));
    add('paint', sphere([0.121, 0.052, 0.106], [side * 1.06, 0.858, 0.638], [0, side * -0.08, side * -0.04], 32));
    add('black', sphere([0.111, 0.04, 0.009], [side * 1.058, 0.853, 0.543], [0, side * -0.08, 0], 28));
    add('mirror', sphere([0.098, 0.031, 0.006], [side * 1.058, 0.854, 0.533], [0, side * -0.08, 0], 28));
  }

  // Three genuine recessed openings are separated by red and carbon sculpted bridges.
  const frontZ = x => 2.365 - 0.268 * (Math.abs(x) / 0.98) ** 2;
  const central = [[-0.48, 0.429], [0, 0.437], [0.48, 0.429], [0.525, 0.369], [0.437, 0.221], [0, 0.201], [-0.437, 0.221], [-0.525, 0.369]];
  aperture(add, central, (x, y) => [x, y, frontZ(x)], [0, 0, -0.11], 'carbon', 0.013);
  for (const side of [-1, 1]) {
    const outer = [[0.584, 0.405], [0.692, 0.46], [0.849, 0.487], [0.944, 0.447], [0.973, 0.353], [0.924, 0.236], [0.697, 0.207], [0.61, 0.259]];
    aperture(add, outer, (x, y) => [side * x, y, frontZ(x)], [0, 0, -0.105], 'carbon', 0.016);
    add('paint', grid((u, v) => {
      const x = mix(0.533, 0.635, u) + Math.sin(v * Math.PI) * 0.018;
      return [side * x, mix(0.226, 0.468, v), frontZ(x) + Math.sin(v * Math.PI) * 0.009];
    }, 8, 18, [0, 0, 1]));
    add('paint', tube([[0.957, 0.23], [0.977, 0.345], [0.952, 0.466], [0.882, 0.518], [0.756, 0.51]].map(([x, y]) => [side * x, y, frontZ(x) - 0.023]), 0.020, 42));
    // A swept undercut turns the corner back into the fender instead of forming a box side.
    add('paint', grid((u, v) => {
      const z = mix(2.195 - v * 0.125, 1.695, u);
      const [, width, fenderTop] = sampleSections(sides, z);
      const x = mix(0.955, width, u) + Math.sin(v * Math.PI) * 0.016 * (1 - u) - (1 - v) ** 1.3 * 0.052 * (1 - u);
      return [side * x, mix(mix(0.185, 0.32, u), fenderTop - 0.012, v), z];
    }, 30, 18, [side, 0, 0]));
    add('paint', grid((u, v) => {
      const z = mix(1.93, 2.19, u), [, width, center, edge] = sampleSections(front, z);
      return [side * mix(width - 0.005, 0.974 - u * 0.017, v), mix(edge - 0.004, mix(0.5, 0.47, u), v) + Math.sin(v * Math.PI) * 0.015, z - v * 0.025];
    }, 24, 10, [0, 1, 0]));
    for (const y of [0.306, 0.375]) {
      add('carbon', grid((u, v) => {
        const x = mix(0.638, 0.944, u);
        return [side * x, y + v * 0.017 + Math.sin(u * Math.PI) * 0.006, frontZ(x) - 0.029 + v * 0.032];
      }, 18, 3, [0, 1, 0]));
    }
    // The front dive-plane has a thin airfoil section and a swept trailing edge.
    add('carbon', grid((u, v) => {
      const x = mix(0.84, 1.023, v), z = mix(2.205, 1.96, u);
      return [side * x, 0.466 + (1 - u) * 0.033 + Math.sin(v * Math.PI) * 0.012, z - v * 0.08];
    }, 18, 8, [0, 1, 0]));
  }
  add('paint', grid((u, v) => {
    const x = mix(-0.955, 0.955, u), edge = 0.452 + 0.12 * (x / 0.98) ** 2;
    return [x, edge - v * 0.034, frontZ(x) + v * 0.012];
  }, 70, 5, [0, 0, 1]));
  for (let row = 0; row < 5; row++) {
    for (let col = -10; col <= 10; col++) {
      const x = col * 0.042 + row % 2 * 0.021, y = 0.242 + row * 0.035;
      if (Math.abs(x) > 0.43 + (y - 0.24) * 0.22) continue;
      const points = Array.from({ length: 6 }, (_, i) => { const a = i / 6 * Math.PI * 2; const xx = x + Math.sin(a) * 0.021; return [xx, y + Math.cos(a) * 0.019, frontZ(xx) - 0.083]; });
      add('grille', tube(points, 0.0015, 6, true, 3));
    }
  }
  add('carbon', grid((u, v) => {
    const x = mix(-1.018, 1.018, u), z = frontZ(x) + mix(-0.19, 0.045, v);
    return [x, 0.153 + Math.sin(v * Math.PI) * 0.017, z];
  }, 66, 10, [0, 1, 0]));
  add('carbon', box([1.51, 0.04, 3.95], [0, 0.202, -0.1]));

  const cowl = [[-0.623, 0.629], [-0.585, 0.976], [-0.435, 1.457], [-0.285, 1.616], [0, 1.679], [0.285, 1.616], [0.435, 1.457], [0.585, 0.976], [0.623, 0.629]];
  add('hoodCarbon', radialPatch(cowl, (x, z) => topPoint(front, x, z, 0.009), 1, 90, 18));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z = 0.737 + i * 0.121;
      add('black', grid((u, v) => {
        const x = side * mix(0.145, 0.521 - i * 0.027, u), zz = z + v * 0.022;
        return topPoint(front, x, zz, 0.013);
      }, 12, 2, [0, 1, 0]));
    }
    add('paint', grid((u, v) => {
      const z = mix(0.72, 1.43, u), x = side * mix(0.055, 0.1, v);
      return topPoint(front, x, z, 0.016);
    }, 26, 3, [0, 1, 0]));
    const seam = [[0.57, 0.68], [0.505, 1.05], [0.4, 1.51], [0.423, 1.9], [0.472, 2.165]];
    add('black', tube(seam.map(([x, z]) => topPoint(front, side * x, z, 0.003)), 0.0024, 74, false, 4));
  }
  const emblem = topPoint(front, 0, 2.055, 0.009);
  add('silver', torus(0.034, 0.0032, emblem, [Math.PI / 2 + 0.15, 0, 0], 32));
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    add('silver', rod(emblem, [Math.sin(a) * 0.027, emblem[1] + Math.cos(a) * 0.004, emblem[2] + Math.cos(a) * 0.027], 0.002, 5));
  }

  // Curved wraparound windscreen, separate roof and rear glass form a closed teardrop.
  const screen = [[0.015, 0.562, 1.131, 1.093], [0.28, 0.67, 1.027, 0.973], [0.543, 0.746, 0.891, 0.835], [0.798, 0.773, 0.734, 0.706]];
  const roof = [[-0.76, 0.572, 1.117, 1.079], [-0.49, 0.599, 1.153, 1.104], [-0.2, 0.592, 1.153, 1.104], [0.015, 0.562, 1.131, 1.093]];
  const backGlass = [[-1.17, 0.75, 0.792, 0.765], [-0.94, 0.67, 0.996, 0.954], [-0.76, 0.572, 1.117, 1.079]];
  add('glass', deck(screen, 50, 42));
  add('carbon', deck(roof, 28, 34));
  add('glass', deck(backGlass, 34, 32));
  for (const side of [-1, 1]) {
    add('glass', grid((u, v) => {
      const z = mix(-1.168, 0.797, u);
      let top;
      if (z < -0.76) top = sampleSections(backGlass, z);
      else if (z < 0.015) top = sampleSections(roof, z);
      else top = sampleSections(screen, z);
      const [, xTop, yCenter, yTop] = top;
      const bottomX = 0.767 + Math.sin(u * Math.PI) * 0.009, bottomY = 0.711 + 0.037 * (1 - u);
      return [side * mix(bottomX, xTop, v), mix(bottomY, yTop, v) + Math.sin(v * Math.PI) * 0.012, z];
    }, 66, 16, [side, 0, 0]));
    add('paint', tube([[side * 0.773, 0.706, 0.798], [side * 0.746, 0.835, 0.543], [side * 0.67, 0.973, 0.28], [side * 0.562, 1.093, 0.015]], 0.018, 62, false, 8));
    add('paint', tube([[side * 0.562, 1.093, 0.015], [side * 0.599, 1.104, -0.4], [side * 0.572, 1.079, -0.76], [side * 0.67, 0.954, -0.94], [side * 0.75, 0.765, -1.17]], 0.024, 64, false, 8));
    add('black', tube([[side * 0.77, 0.713, 0.78], [side * 0.776, 0.724, 0.16], [side * 0.776, 0.737, -0.56], [side * 0.75, 0.766, -1.16]], 0.009, 50));
    add('black', rod([side * 0.767, 0.739, -0.73], [side * 0.6, 1.039, -0.77], 0.012, 6));
    add('silver', roundedBox([0.006, 0.022, 0.085], [side * 0.782, 0.698, -0.51], [0, 0, 0], 0.002));
  }
  add('black', tube([[-0.773, 0.706, 0.798], [-0.4, 0.727, 0.826], [0, 0.735, 0.837], [0.4, 0.727, 0.826], [0.773, 0.706, 0.798]], 0.012, 56));
  add('black', tube([[-0.55, 0.74, 0.81], [-0.21, 0.745, 0.833], [0.23, 0.745, 0.832]], 0.005, 32));

  // The fairing grows directly from the curved roof and tapers into the fin.
  const scoop = [[-0.9, 0.014, 0.002], [-0.74, 0.078, 0.036], [-0.53, 0.137, 0.079], [-0.3, 0.155, 0.107], [-0.03, 0.15, 0.12]];
  const roofY = (x, z) => topPoint(z < -0.76 ? backGlass : roof, x, z)[1];
  add('carbon', grid((u, v) => {
    const z = mix(-0.9, -0.03, u), [, width, rise] = sampleSections(scoop, z), f = v * 2 - 1;
    const x = width * f;
    return [x, roofY(x, z) + 0.001 + rise * Math.sqrt(Math.max(0, 1 - f * f)), z];
  }, 52, 28, [0, 1, 0]));
  add('carbon', grid((u, v) => {
    const angle = u * Math.PI * 2, x = Math.cos(angle) * 0.15;
    const outer = [x, roofY(x, -0.03) + 0.001 + Math.max(0, Math.sin(angle)) * 0.12, -0.029];
    const inner = [Math.cos(angle) * 0.127, 1.193 + Math.sin(angle) * 0.045, -0.014];
    return outer.map((value, i) => mix(value, inner[i], v));
  }, 56, 4, [0, 0, 1]));
  add('black', sphere([0.124, 0.042, 0.004], [0, 1.193, -0.01], [0, 0, 0], 32));
  add('carbon', tube(Array.from({ length: 28 }, (_, i) => { const a = i / 28 * Math.PI * 2; return [Math.cos(a) * 0.127, 1.193 + Math.sin(a) * 0.045, -0.008]; }), 0.004, 56, true, 6));
  add('carbon', shapeExtrude([[-1.942, 0.762], [-1.78, 0.878], [-0.797, 1.154], [-0.687, 1.19], [-0.97, 0.787]], 0.024, [0.012, 0, 0], [0, -Math.PI / 2, 0], 0.004));
  add('carbon', radialPatch([[-0.424, -1.18], [-0.347, -2.136], [0.347, -2.136], [0.424, -1.18]], (x, z) => topPoint(rear, x, z, 0.008), 1, 60, 10));
  for (let i = 0; i < 8; i++) {
    const z = -1.26 - i * 0.106;
    for (const side of [-1, 1]) add('black', grid((u, v) => topPoint(rear, side * mix(0.07, 0.351, u), z - v * 0.04, 0.014), 10, 2, [0, 1, 0]));
  }

  // Two airfoil elements, milled swan-neck mounts and shaped endplates.
  for (const [z0, y0, chord] of [[-2.035, 1.009, 0.31], [-2.235, 1.063, 0.157]]) {
    add('carbon', grid((u, v) => {
      const x = mix(-1.012, 1.012, u), z = z0 + (v - 0.5) * chord;
      return [x, y0 + Math.sin(v * Math.PI) * 0.032 + (v - 0.5) * 0.024 - (x / 1.05) ** 2 * 0.026, z];
    }, 52, 18, [0, 1, 0]));
  }
  for (const side of [-1, 1]) {
    add('carbon', shapeExtrude([[-2.17, 0.767], [-2.093, 0.782], [-1.976, 0.993], [-2.012, 1.055], [-2.083, 1.034], [-2.057, 0.97]], 0.025, [side * 0.49 - 0.0125, 0, 0], [0, -Math.PI / 2, 0], 0.006));
    add('paint', shapeExtrude([[-2.337, 1.052], [-2.352, 1.157], [-2.05, 1.132], [-1.86, 1.074], [-1.855, 0.999], [-2.08, 0.982]], 0.018, [side * 1.012 - 0.009, 0, 0], [0, -Math.PI / 2, 0], 0.006));
    add('carbon', rod([side * 0.47, 0.764, -2.135], [side * 0.535, 0.964, -2.053], 0.013));
  }

  add('carbon', grid((u, v) => {
    const x = mix(-0.94, 0.94, u);
    return [x, mix(0.3, 0.646, v), -2.354 + 0.091 * (Math.abs(x) / 0.95) ** 3 + Math.sin(v * Math.PI) * 0.018];
  }, 62, 18, [0, 0, -1]));
  for (const side of [-1, 1]) {
    add('lightHousing', tube([[side * 0.28, 0.646, -2.368], [side * 0.49, 0.643, -2.361], [side * 0.751, 0.654, -2.315], [side * 0.883, 0.682, -2.226]], 0.028, 52));
    add('taillight', tube([[side * 0.285, 0.647, -2.386], [side * 0.49, 0.645, -2.38], [side * 0.75, 0.657, -2.338], [side * 0.877, 0.681, -2.249]], 0.012, 52, false, 8));
    add('taillight', tube([[side * 0.741, 0.654, -2.335], [side * 0.77, 0.59, -2.33], [side * 0.8, 0.566, -2.317]], 0.0075, 22));
    add('paint', tube([[side * 0.935, 0.658, -2.27], [side * 0.97, 0.492, -2.242], [side * 0.927, 0.284, -2.245]], 0.038, 36));
  }
  for (let i = -12; i <= 12; i++) {
    const x = i * 0.068;
    add('grille', box([0.011, 0.178, 0.015], [x, 0.47, -2.357 + Math.abs(x) * 0.035], [0.06, 0, 0]));
  }
  add('carbon', grid((u, v) => {
    const x = mix(-0.962, 0.962, u);
    return [x, mix(0.168, 0.302, v), mix(-1.84, -2.388, v) + (Math.abs(x) / 0.96) ** 3 * 0.08];
  }, 58, 15, [0, 1, 0]));
  for (const x of [-0.78, -0.48, -0.22, 0.22, 0.48, 0.78]) add('carbonMatte', shapeExtrude([[-2.388, 0.15], [-2.368, 0.316], [-1.88, 0.207], [-1.89, 0.143]], 0.016, [x - 0.008, 0, 0], [0, -Math.PI / 2, 0], 0.003));
  add('darkMetal', cylinder(0.083, 0.11, [0, 0.415, -2.356], [Math.PI / 2, 0, 0], 48));
  add('black', cylinder(0.066, 0.008, [0, 0.415, -2.416], [Math.PI / 2, 0, 0], 40));
  for (const x of [-0.105, 0.105]) {
    add('silver', cylinder(0.029, 0.06, [x, 0.355, -2.363], [Math.PI / 2, 0, 0], 24));
    add('black', cylinder(0.022, 0.009, [x, 0.355, -2.4], [Math.PI / 2, 0, 0], 24));
  }
  add('silver', torus(0.03, 0.003, [0, 0.653, -2.373], [0, 0, 0], 24));
  return batch.finish();
}
