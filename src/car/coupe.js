import * as THREE from 'three';
import { box, collection, cylinder, grid, rod, roundedBox, sampleSections, sphere, torus, tube } from './geometry.js';
import { FRONT_AXLE, REAR_AXLE, WHEEL_RADIUS } from './exterior.js';

const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;

// A grand-touring coupe: long bonnet, upright greenhouse, wide twin-kidney nose.
// Forward +Z, driver-left +X, metres, and the same axles and tyres as the hypercar so
// one wheel package and one driving model serve both cars.
const front = [
  [0.62, 0.935, 0.955, 0.920], [0.95, 0.938, 0.942, 0.892],
  [1.35, 0.925, 0.914, 0.862], [1.75, 0.905, 0.882, 0.832],
  [2.05, 0.875, 0.848, 0.800], [2.22, 0.835, 0.818, 0.772],
  [2.34, 0.775, 0.786, 0.728], [2.40, 0.700, 0.748, 0.675],
];
// Ascending z, like every other section table here: tail first.
const rear = [
  [-2.39, 0.845, 0.905, 0.848], [-2.30, 0.870, 0.918, 0.876],
  [-2.10, 0.890, 0.948, 0.928], [-1.80, 0.918, 0.976, 0.962],
  [-1.40, 0.936, 0.996, 0.982], [-0.95, 0.930, 0.982, 0.972],
  [-0.62, 0.900, 0.958, 0.948],
];
const sides = [
  [-2.39, 0.740, 0.800], [-2.30, 0.830, 0.875], [-2.10, 0.880, 0.930],
  [-1.80, 0.916, 0.965], [-1.40, 0.936, 0.985], [-0.95, 0.930, 0.975],
  [-0.62, 0.900, 0.955], [0, 0.900, 0.945], [0.62, 0.935, 0.920],
  [0.95, 0.938, 0.892], [1.35, 0.925, 0.862], [1.75, 0.905, 0.832],
  [2.05, 0.875, 0.800], [2.22, 0.835, 0.772], [2.34, 0.775, 0.728],
  [2.40, 0.700, 0.675],
];
// Sections are ordered by ascending z, as sampleSections interpolates in that direction.
const screen = [
  [0.02, 0.800, 1.345, 1.280], [0.20, 0.830, 1.220, 1.150],
  [0.40, 0.780, 1.090, 1.030], [0.60, 0.660, 0.950, 0.915],
];
const roof = [
  [-0.56, 0.780, 1.360, 1.300], [-0.30, 0.800, 1.375, 1.310], [0.02, 0.800, 1.350, 1.285],
];
const backGlass = [
  [-1.12, 0.700, 1.040, 0.995], [-0.85, 0.750, 1.210, 1.150], [-0.56, 0.780, 1.360, 1.300],
];

function topPoint(sections, x, z, offset = 0) {
  const [, width, centre, edge] = sampleSections(sections, z);
  const f = clamp(Math.abs(x / width), 0, 1.05);
  const crown = Math.exp(-(((f - 0.86) / 0.2) ** 2)) * 0.014;
  return [x, mix(centre, edge, f ** 2.6) + crown + offset, z];
}

function deck(sections, longitudinal = 76, cross = 40) {
  const from = sections[0][0], to = sections.at(-1)[0];
  return grid((u, v) => {
    const z = mix(from, to, u), [, width] = sampleSections(sections, z);
    return topPoint(sections, (v * 2 - 1) * width, z);
  }, longitudinal, cross, [0, 1, 0]);
}

function roundedOutline(width, height, radius, steps = 18) {
  const points = [];
  for (let i = 0; i < steps; i++) {
    const a = i / steps * Math.PI * 2;
    const cx = Math.cos(a), cy = Math.sin(a);
    const w = width / 2 - radius, h = height / 2 - radius;
    points.push([Math.sign(cx) * Math.min(1, Math.abs(cx) * 1.35) * w + Math.sign(cx) * Math.min(1, Math.abs(cx) * 4.2) * radius, Math.sign(cy) * Math.min(1, Math.abs(cy) * 1.35) * h + Math.sign(cy) * Math.min(1, Math.abs(cy) * 4.2) * radius]);
  }
  return points;
}

export function createCoupeGeometry() {
  const batch = collection(), add = (name, g) => batch.add(name, g);

  add('paint', deck(front));
  add('paint', deck(rear));

  for (const side of [-1, 1]) {
    // Side skin with the same arched wheel wells as the shared wheel package.
    add('paint', grid((u, v) => {
      const z = mix(-2.39, 2.40, u);
      const [, width, top] = sampleSections(sides, z);
      let bottom = 0.245;
      for (const axle of [FRONT_AXLE, REAR_AXLE]) {
        const dz = Math.abs(z - axle);
        if (dz < 0.4) bottom = Math.max(bottom, WHEEL_RADIUS + Math.sqrt(0.4 ** 2 - dz ** 2));
      }
      if (z > 1.95) bottom = Math.max(bottom, 0.30);
      bottom = Math.min(top - 0.014, bottom);
      // A soft shoulder waist runs the length of the body above the sills.
      const waist = Math.sin(Math.PI * v) * (Math.abs(z) < 0.9 ? 0.028 : 0.01);
      return [side * (width - waist - 0.012 * v), mix(top, bottom, v), z];
    }, 190, 26, [side, 0, 0]));

    // Dark rocker strip, tucked just inside the painted sill so it never floats.
    add('carbon', grid((u, v) => {
      const z = mix(-0.98, 1.02, u);
      return [side * mix(0.80, 0.973, v), 0.175 + Math.sin(Math.PI * v) * 0.02, z];
    }, 34, 6, [0, 1, 0]));

    for (const axle of [FRONT_AXLE, REAR_AXLE]) {
      add('paint', grid((u, v) => {
        const theta = mix(-0.12, Math.PI + 0.12, u), r = mix(0.386, 0.436, v);
        return [side * (0.975 + Math.sin(Math.PI * v) * 0.006), WHEEL_RADIUS + Math.sin(theta) * r, axle + Math.cos(theta) * r];
      }, 76, 5, [side, 0, 0]));
      add('black', grid((u, v) => {
        const theta = u * Math.PI;
        return [side * mix(0.74, 0.968, v), WHEEL_RADIUS + Math.sin(theta) * 0.386, axle + Math.cos(theta) * 0.386];
      }, 64, 5, [0, -1, 0]));
    }

    // Door: flush handle sitting on the skin, no floating trim lines.
    add('darkMetal', roundedBox([0.011, 0.024, 0.115], [side * 0.923, 0.905, -0.30], [0, 0, 0], 0.004));

    // The shoulder-mounted mirror pod: rounded shell, dark cap, glass plane added at run time.
    add('paint', sphere([0.108, 0.048, 0.088], [side * 0.985, 0.945, 0.355], [0, side * 0.28, side * 0.04], 26));
    add('black', sphere([0.098, 0.04, 0.009], [side * 0.988, 0.943, 0.272], [0, side * 0.28, 0], 24));
    add('carbon', rod([side * 0.905, 0.888, 0.40], [side * 0.965, 0.928, 0.365], 0.014));

    // Side glass with pillars, framed in paint.
    add('glass', grid((u, v) => {
      const z = mix(-1.13, 0.60, u);
      const table = z > 0.02 ? screen : z < -0.56 ? backGlass : roof;
      const [, xTop, , yTop] = sampleSections(table, z);
      const zBelt = z > 0.02 ? 0.915 : z < -0.56 ? 0.995 : 0.945;
      return [side * mix(0.90, xTop, v), mix(zBelt, yTop, v) + Math.sin(v * Math.PI) * 0.01, z];
    }, 62, 14, [side, 0, 0]));
    add('paint', tube([[side * 0.902, 0.915, 0.60], [side * 0.83, 1.15, 0.21], [side * 0.80, 1.285, 0.02]], 0.017, 50, false, 8));
    add('paint', tube([[side * 0.80, 1.30, 0.0], [side * 0.80, 1.31, -0.30], [side * 0.78, 1.30, -0.56], [side * 0.70, 0.995, -1.12]], 0.019, 54, false, 8));
    add('carbon', tube([[side * 0.798, 1.298, 0.0], [side * 0.798, 1.308, -0.30], [side * 0.776, 1.296, -0.56]], 0.006, 30));
  }

  add('glass', deck(screen, 44, 40));
  add('carbon', deck(roof, 22, 34));
  add('glass', deck(backGlass, 30, 32));
  // Body-colour buttresses tie the boot lid into the rear screen.
  for (const side of [-1, 1]) {
    add('paint', grid((u, v) => {
      const z = mix(-0.56, -1.22, u), [, xTop, , yTop] = sampleSections(backGlass, z);
      return [side * mix(xTop, 0.86, v ** 0.8), mix(yTop, 0.995, v), z];
    }, 26, 8, [side, 0, 0]));
  }
  // Front and rear screen trim.
  add('black', tube([[-0.66, 0.94, 0.60], [-0.34, 0.95, 0.61], [0, 0.952, 0.61], [0.34, 0.95, 0.61], [0.66, 0.94, 0.60]], 0.011, 44));
  add('black', tube([[-0.70, 1.02, -1.13], [-0.35, 1.035, -1.14], [0, 1.04, -1.14], [0.35, 1.035, -1.14], [0.70, 1.02, -1.13]], 0.010, 40));

  // Rounded nose face: the body skin stops at the shoulder line, so this painted panel
  // closes the front between the splitter and the bonnet edge. Everything on the nose is
  // placed on noseZ() so no trim can float outside the body.
  const noseZ = (x) => 2.398 - (Math.abs(x) / 0.74) ** 2 * 0.085;
  add('paint', grid((u, v) => {
    const x = mix(-0.705, 0.705, u), top = 0.705 - (Math.abs(x) / 0.74) ** 2 * 0.045;
    return [x, mix(0.235, top, v), noseZ(x) - v * 0.012];
  }, 44, 12, [0, 0, 1]));

  // Twin-kidney grille: deep black mesh, chrome surrounds and vertical louvres.
  for (const side of [-1, 1]) {
    const cx = side * 0.175;
    add('black', roundedBox([0.285, 0.315, 0.032], [cx, 0.475, noseZ(cx) + 0.006], [0.04, 0, 0], 0.024));
    const ring = roundedOutline(0.285, 0.315, 0.11, 30);
    add('silver', tube(ring.map(([x, y]) => [cx + x, 0.475 + y, noseZ(cx + x) + 0.027]), 0.0042, 40, true, 5));
    for (let i = 0; i < 6; i++) {
      const x = cx - 0.106 + i * 0.0424;
      add('grille', box([0.011, 0.278, 0.014], [x, 0.475, noseZ(x) + 0.024], [0.04, 0, 0]));
    }
  }
  // Narrow body-colour bridge between the kidneys, plus the lower air intake.
  add('paint', roundedBox([0.05, 0.30, 0.045], [0, 0.475, noseZ(0) + 0.012], [0.04, 0, 0], 0.018));
  add('black', grid((u, v) => {
    const x = mix(-0.50, 0.50, u), y = mix(0.262, 0.322, v);
    return [x, y, noseZ(x) + 0.016];
  }, 30, 4, [0, 0, 1]));
  for (let i = -6; i <= 6; i++) add('grille', box([0.011, 0.05, 0.012], [i * 0.074, 0.292, noseZ(i * 0.074) + 0.024], [0.04, 0, 0]));

  // Quad headlamps: two crisp LED blades per side inside a smoked housing on the nose face.
  for (const side of [-1, 1]) {
    add('lightHousing', grid((u, v) => {
      const x = mix(0.335, 0.655, u), y = mix(0.545, 0.635, v);
      return [side * x, y, noseZ(x) + 0.019];
    }, 18, 6, [0, 0, 1]));
    for (const [dy, radius] of [[0.598, 0.005], [0.566, 0.0043]]) {
      add('led', tube([0.352, 0.45, 0.54, 0.638].map((x) => [side * x, dy + (x - 0.35) * 0.02, noseZ(x) + 0.026]), radius, 30, false, 6));
    }
    // Front corner air curtain tucked into the lower nose.
    add('black', roundedBox([0.06, 0.10, 0.03], [side * 0.615, 0.40, noseZ(0.615) + 0.004], [0.05, 0, side * 0.1], 0.014));
  }
  add('carbon', grid((u, v) => {
    const x = mix(-0.80, 0.80, u);
    return [x, 0.205 + Math.sin(v * Math.PI) * 0.012, 2.452 - v * 0.15 - Math.abs(x) ** 2 * 0.03];
  }, 44, 5, [0, 1, 0]));

  // Cabin trim: a dark inner shell hides the body-colour skin from the driver's seat.
  // Door cards, headliner and rear bulkhead follow the greenhouse closely enough that no
  // green shows through the glass at eye level.
  for (const side of [-1, 1]) {
    add('black', grid((u, v) => {
      const z = mix(-1.16, 0.60, u), [, width, top] = sampleSections(sides, z);
      const belt = z > 0.02 ? 0.90 : z < -0.56 ? 0.96 : 0.93;
      return [side * (width - 0.045 - v * 0.035), mix(0.34, belt, v), z];
    }, 46, 9, [side, 0, 0]));
  }
  // Headliner covers the roof only: stopping at the header rail keeps the windscreen clear.
  add('black', grid((u, v) => {
    const z = mix(-1.10, 0.14, u), table = z > 0.02 ? screen : z < -0.56 ? backGlass : roof;
    const [, xTop, , yTop] = sampleSections(table, z);
    const x = mix(-Math.min(0.70, xTop - 0.03), Math.min(0.70, xTop - 0.03), v);
    return [x, yTop - 0.05, z];
  }, 26, 22, [0, -1, 0]));
  add('black', grid((u, v) => {
    const x = mix(-0.70, 0.70, u);
    return [x, mix(0.905 + (x / 0.72) ** 2 * 0.02, 0.955, v), mix(0.60, 0.52, v)];
  }, 34, 5, [0, 1, 0]));
  // Rear parcel shelf and bulkhead close the cabin behind the seats.
  add('black', grid((u, v) => {
    const x = mix(-0.68, 0.68, u);
    return [x, mix(0.66, 0.90, v), mix(-0.90, -1.05, v)];
  }, 26, 6, [0, 0, 1]));
  // Scuttle: a dark panel bridges the dash top to the screen base so the bonnet's
  // body-colour surface is never visible as a green strip from the driver's seat.
  add('black', grid((u, v) => {
    const x = mix(-0.76, 0.76, u), [, , edge] = sampleSections(sides, 0.60);
    const top = Math.min(edge, 0.95) - (x / 0.78) ** 2 * 0.02;
    return [x, mix(0.66, top, v), mix(0.63, 0.60, v)];
  }, 40, 6, [0, 1, 0]));
  // Cowl vent grille and wipers at the base of the screen.
  add('carbonMatte', grid((u, v) => {
    const x = mix(-0.58, 0.58, u);
    return [x, 0.925 + (x / 0.6) ** 2 * 0.012 + v * 0.01, mix(0.545, 0.60, v)];
  }, 38, 4, [0, 1, 0]));
  for (const side of [-1, 1]) add('black', rod([side * 0.10, 0.945, 0.60], [side * 0.52, 0.952, 0.565], 0.007, 6));
  for (const side of [-1, 1]) {
    // Bonnet vents echo the coupe's power domes.
    add('grille', grid((u, v) => {
      const z = mix(1.62, 1.98, u), x = side * mix(0.15, 0.27, v);
      return topPoint(front, x, z, 0.005);
    }, 14, 4, [0, 1, 0]));
  }

  // Boot lid crease, then the vertical tail face that closes the body under it.
  add('black', tube([[-0.80, -1.26], [-0.45, -1.34], [0, -1.37], [0.45, -1.34], [0.80, -1.26]].map(([x, z]) => topPoint(rear, x, z, 0.004)), 0.0026, 38, false, 4));
  add('paint', grid((u, v) => {
    const x = mix(-0.955, 0.955, u), top = 0.845 - (Math.abs(x) / 0.97) ** 2 * 0.055;
    return [x, mix(0.24, top, v), -2.392 + v * 0.022 + (Math.abs(x) / 0.98) ** 2 * 0.05];
  }, 60, 14, [0, 0, -1]));

  // Bonnet: twin power domes and a centre crease, flush with the grille bridge.
  for (const side of [-1, 1]) {
    add('paint', grid((u, v) => {
      const z = mix(0.70, 2.10, u), x = side * mix(0.10, 0.30, v);
      return topPoint(front, x, z, 0.012);
    }, 30, 5, [0, 1, 0]));
  }
  for (const side of [-1, 1]) {
    // Panel seams sit on the crown of the bonnet, following the surface instead of floating.
    add('black', tube([[0.33, 2.30], [0.30, 1.95], [0.26, 1.58], [0.22, 1.28]].map(([x, z]) => topPoint(front, side * x, z, 0.003)), 0.0022, 24, false, 4));
  }

  // Rear: slim L-shaped lamps, black valance, diffuser and four round tips.
  for (const side of [-1, 1]) {
    add('lightHousing', roundedBox([0.40, 0.105, 0.03], [side * 0.56, 0.815, -2.372], [0, 0, side * 0.06], 0.03));
    add('taillight', tube([[side * 0.37, 0.842, -2.383], [side * 0.62, 0.835, -2.386], [side * 0.75, 0.81, -2.379], [side * 0.73, 0.745, -2.373]], 0.011, 40, false, 8));
    add('taillight', tube([[side * 0.40, 0.792, -2.379], [side * 0.66, 0.786, -2.382]], 0.0055, 24, false, 6));
    add('paint', tube([[side * 0.905, 0.82, -2.30], [side * 0.94, 0.62, -2.27], [side * 0.905, 0.37, -2.27]], 0.03, 32));
    for (const dx of [-0.115, 0.115]) {
      add('darkMetal', cylinder(0.047, 0.09, [side * 0.34 + dx, 0.30, -2.395], [Math.PI / 2, 0, 0], 26));
      add('black', cylinder(0.038, 0.012, [side * 0.34 + dx, 0.30, -2.443], [Math.PI / 2, 0, 0], 24));
    }
  }
  add('black', grid((u, v) => {
    const x = mix(-0.80, 0.80, u);
    return [x, mix(0.19, 0.44, v), -2.40 - Math.abs(x) * 0.02 + v * 0.02];
  }, 34, 8, [0, 0, -1]));
  add('carbon', grid((u, v) => {
    const x = mix(-0.78, 0.78, u);
    return [x, mix(0.165, 0.30, v), mix(-2.20, -2.43, v) + (Math.abs(x) / 0.8) ** 3 * 0.05];
  }, 34, 6, [0, 1, 0]));
  add('silver', torus(0.03, 0.003, [0, 0.83, -2.375], [0, 0, 0], 26));

  return batch.finish();
}
