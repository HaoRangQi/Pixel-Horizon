import * as THREE from 'three';

const WHEEL_RADIUS = 0.365;
const FRONT_AXLE = 1.43;
const REAR_AXLE = -1.35;
const TRACK_HALF = 0.887;
const TAU = Math.PI * 2;

let shared;

// The body is built from section surfaces; wheel openings remain actual holes.
function surface(vertices, faces) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
  geometry.setIndex(faces.flat());
  geometry.computeVertexNormals();
  return geometry;
}

function polygon(points, outward) {
  const faces = [];
  for (let i = 1; i < points.length - 1; i++) faces.push([0, i, i + 1]);
  if (outward) {
    const a = new THREE.Vector3(...points[0]);
    const normal = new THREE.Vector3(...points[1]).sub(a).cross(new THREE.Vector3(...points[2]).sub(a));
    if (normal.dot(new THREE.Vector3(...outward)) < 0) faces.forEach(face => face.reverse());
  }
  return surface(points, faces);
}

function transform(geometry, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  return geometry.applyMatrix4(matrix);
}

function box(size, position, rotation) {
  return transform(new THREE.BoxGeometry(...size), position, rotation);
}

function ellipsoid(size, position, rotation) {
  return transform(new THREE.SphereGeometry(1, 12, 6), position, rotation, size);
}

function cylinder(radius, length, position, rotation = [0, 0, Math.PI / 2], segments = 20) {
  return transform(new THREE.CylinderGeometry(radius, radius, length, segments), position, rotation);
}

function strut(from, to, radius = 0.018, segments = 5) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const geometry = new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), segments);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  return geometry.translate(...a.add(b).multiplyScalar(0.5).toArray());
}

function extrudeXZ(points, bottom, top) {
  const vertices = points.map(([x, z]) => [x, bottom, z]).concat(points.map(([x, z]) => [x, top, z]));
  const n = points.length;
  const faces = [];
  for (let i = 1; i < n - 1; i++) faces.push([0, i + 1, i], [n, n + i, n + i + 1]);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([i, j, n + j], [i, n + j, n + i]);
  }
  return surface(vertices, faces);
}

function extrudeX(points, left, right) {
  const vertices = points.map(([y, z]) => [left, y, z]).concat(points.map(([y, z]) => [right, y, z]));
  const n = points.length;
  const faces = [];
  for (let i = 1; i < n - 1; i++) faces.push([0, i + 1, i], [n, n + i, n + i + 1]);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([i, j, n + j], [i, n + j, n + i]);
  }
  return surface(vertices, faces);
}

function merge(parts) {
  const count = parts.reduce((n, geometry) => n + (geometry.index?.count ?? geometry.attributes.position.count), 0);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  let cursor = 0;
  for (const geometry of parts) {
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const index = geometry.index;
    const length = index?.count ?? position.count;
    for (let i = 0; i < length; i++) {
      const j = index ? index.getX(i) : i;
      positions[cursor] = position.getX(j);
      normals[cursor++] = normal.getX(j);
      positions[cursor] = position.getY(j);
      normals[cursor++] = normal.getY(j);
      positions[cursor] = position.getZ(j);
      normals[cursor++] = normal.getZ(j);
    }
    geometry.dispose();
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

function interpolate(sections, z) {
  let i = 0;
  while (i < sections.length - 2 && z > sections[i + 1][0]) i++;
  const a = sections[i];
  const b = sections[i + 1];
  const t = THREE.MathUtils.clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
  return a.map((value, j) => THREE.MathUtils.lerp(value, b[j], t));
}

const hoodSections = [
  [0.67, 0.91, 0.625, 0.725], [0.94, 0.97, 0.613, 0.79],
  [1.2, 1.0, 0.59, 0.835], [1.47, 1.01, 0.566, 0.835],
  [1.76, 0.985, 0.548, 0.775], [2.05, 0.93, 0.522, 0.64],
  [2.24, 0.845, 0.496, 0.54], [2.36, 0.72, 0.458, 0.458],
];
const rearSections = [
  [-2.35, 0.84, 0.625, 0.63], [-2.13, 0.96, 0.69, 0.725],
  [-1.83, 1.0, 0.728, 0.805], [-1.5, 1.01, 0.745, 0.842],
  [-1.2, 0.99, 0.748, 0.82], [-1.02, 0.925, 0.725, 0.735],
];

function skinHeight(sections, x, z) {
  const [, width, center, edge] = interpolate(sections, z);
  return THREE.MathUtils.lerp(center, edge, Math.pow(Math.abs(x / width), 2.4));
}

function deck(sections) {
  const fractions = [-1, -0.83, -0.58, -0.26, 0, 0.26, 0.58, 0.83, 1];
  const vertices = [];
  const faces = [];
  for (const [z, width] of sections) {
    for (const f of fractions) vertices.push([f * width, skinHeight(sections, f * width, z), z]);
  }
  for (let i = 0; i < sections.length - 1; i++) {
    for (let j = 0; j < fractions.length - 1; j++) {
      const a = i * fractions.length + j;
      faces.push([a, a + fractions.length + 1, a + 1], [a, a + fractions.length, a + fractions.length + 1]);
    }
  }
  return surface(vertices, faces);
}

function makeSharedGeometry() {
  const parts = new Map();
  const add = (material, geometry) => {
    if (!parts.has(material)) parts.set(material, []);
    parts.get(material).push(geometry);
  };
  const paint = geometry => add('paint', geometry);
  const carbon = geometry => add('carbon', geometry);

  paint(deck(hoodSections));
  paint(deck(rearSections));
  carbon(extrudeXZ([[-0.69, 2.43], [0.69, 2.43], [0.99, 2.18], [1.015, 1.89], [0.86, 1.87], [-0.86, 1.87], [-1.015, 1.89], [-0.99, 2.18]], 0.145, 0.195));
  carbon(extrudeXZ([[-0.86, -2.44], [0.86, -2.44], [0.99, -2.15], [0.9, -1.9], [-0.9, -1.9], [-0.99, -2.15]], 0.17, 0.235));
  carbon(box([1.46, 0.065, 3.45], [0, 0.22, -0.04]));

  // Sills and side skins follow the circular wheel cuts instead of crossing them.
  const sideSections = [
    [-2.35, 0.84, 0.63], [-2.13, 0.96, 0.725], [-1.83, 1, 0.805],
    [-1.5, 1.01, 0.842], [-1.2, 0.99, 0.82], [-0.9, 0.93, 0.68],
    [-0.5, 0.915, 0.65], [0.15, 0.9, 0.645], [0.67, 0.91, 0.725],
    [0.94, 0.97, 0.79], [1.2, 1, 0.835], [1.47, 1.01, 0.835],
    [1.76, 0.985, 0.775], [2.05, 0.93, 0.64], [2.24, 0.845, 0.54], [2.36, 0.72, 0.458],
  ];
  for (const side of [-1, 1]) {
    const vertices = [];
    const faces = [];
    for (let i = 0; i <= 92; i++) {
      const z = THREE.MathUtils.lerp(-2.35, 2.36, i / 92);
      const [, width, top] = interpolate(sideSections, z);
      let bottom = 0.235;
      for (const axle of [FRONT_AXLE, REAR_AXLE]) {
        const dz = Math.abs(z - axle);
        if (dz < 0.438) bottom = Math.max(bottom, WHEEL_RADIUS + Math.sqrt(0.438 ** 2 - dz ** 2));
      }
      bottom = Math.min(top - 0.014, bottom);
      vertices.push([side * width, top, z], [side * (width - 0.025), bottom, z]);
      if (i) {
        const a = (i - 1) * 2;
        faces.push([a, a + 1, a + 3], [a, a + 3, a + 2]);
      }
    }
    paint(surface(vertices, side > 0 ? faces.map(face => face.toReversed()) : faces));
    carbon(extrudeXZ([[side * 0.77, -0.87], [side * 0.98, -0.87], [side * 0.98, 0.86], [side * 0.77, 0.83]], 0.19, 0.24));
    paint(strut([side * 0.945, 0.265, -0.82], [side * 0.945, 0.275, 0.88], 0.033, 5));

    for (const axle of [FRONT_AXLE, REAR_AXLE]) {
      const arch = [];
      const archFaces = [];
      for (let i = 0; i <= 22; i++) {
        const angle = i / 22 * Math.PI;
        for (const radius of [0.425, 0.462]) arch.push([side * 1.012, WHEEL_RADIUS + Math.sin(angle) * radius, axle + Math.cos(angle) * radius]);
        if (i) {
          const a = (i - 1) * 2;
          archFaces.push([a, a + 1, a + 3], [a, a + 3, a + 2]);
        }
      }
      paint(surface(arch, side > 0 ? archFaces.map(face => face.toReversed()) : archFaces));
      const path = [];
      for (let i = 0; i <= 22; i++) {
        const angle = i / 22 * Math.PI;
        path.push(new THREE.Vector3(side * 1.014, WHEEL_RADIUS + Math.sin(angle) * 0.421, axle + Math.cos(angle) * 0.421));
      }
      carbon(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 22, 0.012, 4, false));
    }

    // Door-top shoulder and the deep triangular mid-engine intake.
    paint(polygon([[side * 0.76, 0.686, 0.65], [side * 0.91, 0.71, 0.66], [side * 0.925, 0.67, -0.89], [side * 0.77, 0.7, -1.0]]));
    carbon(polygon([[side * 0.953, 0.635, -0.88], [side * 0.934, 0.59, -0.06], [side * 0.948, 0.315, -0.39], [side * 0.974, 0.33, -0.92]]));
    paint(strut([side * 0.961, 0.637, -0.9], [side * 0.943, 0.59, -0.04], 0.021));
    carbon(strut([side * 0.97, 0.337, -0.86], [side * 0.949, 0.35, -0.41], 0.014));
    add('trim', box([0.012, 0.018, 0.13], [side * 0.916, 0.62, -0.2], [0.04, 0, 0]));
    carbon(strut([side * 0.918, 0.642, 0.38], [side * 0.933, 0.365, 0.29], 0.004, 4));

    // Mirror stems are kept visibly separate from the front fenders.
    carbon(strut([side * 0.755, 0.735, 0.62], [side * 1.012, 0.856, 0.63], 0.018));
    paint(ellipsoid([0.12, 0.064, 0.108], [side * 1.045, 0.867, 0.627], [0, side * -0.12, 0]));
    add('mirror', ellipsoid([0.098, 0.041, 0.008], [side * 1.051, 0.87, 0.533]));

    // Coplanar lamp frames keep the bright lens in front of its black surround.
    const headOutline = [[0.47, 2.33], [0.89, 2.14], [0.958, 1.995], [0.57, 2.245]];
    const centerX = headOutline.reduce((n, p) => n + p[0], 0) / 4;
    const centerZ = headOutline.reduce((n, p) => n + p[1], 0) / 4;
    const lampY = (x, z) => 0.425 + x * 0.255 - (z - 2.2) * 0.06;
    carbon(polygon(headOutline.map(([x, z]) => [side * x, lampY(x, z), z]), [side * 0.1, 0.6, 1]));
    const lens = headOutline.map(([x, z]) => [THREE.MathUtils.lerp(centerX, x, 0.86), THREE.MathUtils.lerp(centerZ, z, 0.86)]);
    add('headlights', polygon(lens.map(([x, z]) => [side * x, lampY(x, z) + 0.006, z + 0.009]), [side * 0.1, 0.6, 1]));

    // Separate rounded side apertures wrap around a curved front fascia.
    const frontZ = x => 2.378 - 0.28 * (x / 0.98) ** 2;
    const intake = [[0.631, 0.432], [0.837, 0.489], [0.931, 0.461], [0.963, 0.373], [0.918, 0.251], [0.669, 0.222], [0.605, 0.276], [0.604, 0.369]];
    carbon(polygon(intake.map(([x, y]) => [side * x, y, frontZ(x) + 0.008]), [side * 0.35, 0, 1]));
    const lip = intake.map(([x, y]) => new THREE.Vector3(side * x, y, frontZ(x) + 0.018));
    lip.push(lip[0].clone());
    paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lip, false, 'centripetal'), 32, 0.023, 5, false));
    paint(strut([side * 0.565, 0.445, frontZ(0.565)], [side * 0.61, 0.232, frontZ(0.61)], 0.038, 6));
    carbon(polygon([[side * 0.634, 0.354, frontZ(0.634) + 0.028], [side * 0.934, 0.382, frontZ(0.934) + 0.028], [side * 0.931, 0.405, frontZ(0.931) + 0.028], [side * 0.636, 0.376, frontZ(0.636) + 0.028]], [side * 0.3, 0, 1]));
    carbon(polygon([[side * 0.817, 0.51, 2.219], [side * 1.012, 0.524, 2.055], [side * 1.027, 0.499, 1.97], [side * 0.817, 0.488, 2.15]]));
  }

  const frontZ = x => 2.378 - 0.28 * (x / 0.98) ** 2;
  carbon(polygon([[-0.48, 0.429], [0.48, 0.429], [0.548, 0.365], [0.464, 0.221], [0, 0.206], [-0.464, 0.221], [-0.548, 0.365]].map(([x, y]) => [x, y, frontZ(x) + 0.008]), [0, 0, 1]));
  const brow = [];
  const browFaces = [];
  for (let i = 0; i <= 20; i++) {
    const x = THREE.MathUtils.lerp(-0.957, 0.957, i / 20);
    const y = 0.463 + 0.14 * (x / 0.98) ** 2;
    brow.push([x, y, frontZ(x)], [x, y - 0.055, frontZ(x) + 0.013]);
    if (i) {
      const a = (i - 1) * 2;
      browFaces.push([a, a + 1, a + 3], [a, a + 3, a + 2]);
    }
  }
  paint(surface(brow, browFaces));
  for (const y of [0.274, 0.332, 0.384]) {
    const points = [];
    const width = y > 0.29 ? 0.49 : 0.455;
    for (let i = 0; i <= 10; i++) {
      const x = THREE.MathUtils.lerp(-width, width, i / 10);
      points.push(new THREE.Vector3(x, y, frontZ(x) + 0.013));
    }
    add('vent', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 10, 0.004, 3, false));
  }

  // Carbon cowl and twin NACA channels make the long nose easy to read.
  carbon(polygon([[-0.53, 0.646, 0.738], [-0.345, 0.603, 1.43], [0.345, 0.603, 1.43], [0.53, 0.646, 0.738]]));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = 0.82 + i * 0.11;
      add('vent', box([0.25, 0.009, 0.026], [side * 0.283, 0.638 - i * 0.009, z], [-0.075, 0, 0]));
    }
    paint(polygon([[side * 0.055, 0.651, 0.772], [side * 0.067, 0.614, 1.359], [side * 0.12, 0.614, 1.359], [side * 0.145, 0.651, 0.772]]));
  }
  add('silver', transform(new THREE.TorusGeometry(0.044, 0.006, 4, 12), [0, 0.53, 2.145], [Math.PI / 2 - 0.13, 0, 0]));
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU;
    add('silver', strut([0, 0.531, 2.145], [Math.sin(a) * 0.033, 0.531 + Math.cos(a) * 0.004, 2.145 + Math.cos(a) * 0.033], 0.003, 3));
  }

  // The glasshouse is hollow: the windscreen and A pillars enclose an actual cabin.
  add('glass', deck([[-0.035, 0.554, 1.219, 1.185], [0.29, 0.659, 1.044, 1.005], [0.727, 0.765, 0.729, 0.708]]));
  add('glass', deck([[-1.145, 0.759, 0.765, 0.735], [-0.89, 0.67, 1.014, 0.98], [-0.655, 0.588, 1.219, 1.175]]));
  carbon(deck([[-0.655, 0.588, 1.221, 1.177], [-0.37, 0.607, 1.253, 1.201], [-0.035, 0.554, 1.221, 1.187]]));
  for (const side of [-1, 1]) {
    add('glass', polygon([[side * 0.765, 0.71, 0.727], [side * 0.554, 1.185, -0.035], [side * 0.607, 1.201, -0.37], [side * 0.588, 1.175, -0.655], [side * 0.759, 0.735, -1.145]], [side, 0, 0]));
    paint(strut([side * 0.765, 0.707, 0.725], [side * 0.554, 1.184, -0.035], 0.024, 6));
    paint(strut([side * 0.554, 1.184, -0.035], [side * 0.588, 1.176, -0.655], 0.027, 6));
    paint(strut([side * 0.588, 1.176, -0.655], [side * 0.765, 0.727, -1.13], 0.042, 6));
    carbon(strut([side * 0.77, 0.717, -1.08], [side * 0.77, 0.704, 0.69], 0.016));
    carbon(strut([side * 0.612, 1.084, -0.7], [side * 0.746, 0.735, -0.72], 0.012));
    add('interior', box([0.06, 0.23, 1.36], [side * 0.715, 0.49, -0.12], [0, 0, side * -0.09]));
    add('trim', strut([side * 0.683, 0.568, -0.43], [side * 0.683, 0.57, -0.12], 0.013));
  }
  carbon(strut([-0.765, 0.71, 0.725], [0.765, 0.71, 0.725], 0.018, 6));
  carbon(strut([-0.52, 0.732, 0.68], [0.12, 0.732, 0.7], 0.008, 4));

  // A sculpted open-mouthed roof scoop and the central engine spine.
  carbon(extrudeX([[1.209, 0.12], [1.294, 0.055], [1.326, -0.23], [1.275, -0.64], [1.207, -0.69]], -0.114, 0.114));
  add('vent', polygon([[-0.093, 1.223, 0.125], [0.093, 1.223, 0.125], [0.086, 1.278, 0.077], [-0.086, 1.278, 0.077]]));
  paint(extrudeX([[1.173, -0.664], [1.08, -1.064], [0.853, -1.91], [0.757, -1.91], [0.759, -1.07]], -0.018, 0.018));
  carbon(polygon([[-0.45, 0.756, -1.135], [0.45, 0.756, -1.135], [0.37, 0.709, -2.11], [-0.37, 0.709, -2.11]]));
  for (let i = 0; i < 6; i++) {
    for (const side of [-1, 1]) add('vent', box([0.279, 0.011, 0.044], [side * 0.246, 0.76 - i * 0.0075, -1.24 - i * 0.137], [0.05, 0, 0]));
  }

  // Airfoil-shaped rear wing, not a rectangular plank.
  carbon(extrudeX([[1.024, -1.87], [1.079, -2.015], [1.111, -2.225], [1.067, -2.22], [1.027, -1.98]], -1.055, 1.055));
  for (const side of [-1, 1]) {
    carbon(extrudeX([[0.758, -1.9], [0.793, -2.03], [1.074, -2.04], [1.035, -1.94]], side * 0.5 - 0.025, side * 0.5 + 0.025));
    paint(extrudeX([[1.018, -1.866], [1.143, -1.88], [1.169, -2.249], [1.047, -2.255]], side * 1.041 - 0.018, side * 1.041 + 0.018));
  }

  carbon(polygon([[-0.862, 0.609, -2.36], [0.862, 0.609, -2.36], [0.925, 0.361, -2.285], [-0.925, 0.361, -2.285]]));
  for (const side of [-1, 1]) {
    add('taillights', polygon([[side * 0.3, 0.622, -2.372], [side * 0.853, 0.625, -2.372], [side * 0.828, 0.573, -2.371], [side * 0.351, 0.578, -2.371]]));
    add('taillights', polygon([[side * 0.743, 0.587, -2.374], [side * 0.783, 0.586, -2.374], [side * 0.776, 0.533, -2.357], [side * 0.745, 0.535, -2.357]]));
  }
  for (let i = -5; i <= 5; i++) add('vent', box([0.067, 0.151, 0.014], [i * 0.145, 0.466, -2.341], [0.24, 0, 0]));
  for (const x of [-0.69, -0.38, 0.38, 0.69]) carbon(extrudeX([[0.179, -2.44], [0.333, -2.35], [0.259, -1.97], [0.178, -1.97]], x - 0.012, x + 0.012));
  add('silver', cylinder(0.093, 0.12, [0, 0.37, -2.375], [Math.PI / 2, 0, 0], 16));
  carbon(cylinder(0.071, 0.012, [0, 0.37, -2.441], [Math.PI / 2, 0, 0], 16));
  add('silver', box([0.18, 0.022, 0.009], [0, 0.574, -2.372]));
  add('silver', box([0.07, 0.01, 0.009], [-0.055, 0.548, -2.372]));
  add('silver', box([0.07, 0.01, 0.009], [0.055, 0.548, -2.372]));

  // A real two-seat cabin is also visible through the glass from outside.
  add('interior', box([1.3, 0.07, 1.6], [0, 0.296, -0.1]));
  add('interior', extrudeX([[0.553, 0.38], [0.699, 0.423], [0.706, 0.645], [0.594, 0.68]], -0.69, 0.69));
  add('trim', strut([-0.64, 0.703, 0.43], [0.64, 0.703, 0.43], 0.008));
  add('interior', box([0.17, 0.14, 0.9], [0, 0.39, -0.06], [-0.06, 0, 0]));
  add('trim', box([0.117, 0.012, 0.23], [0, 0.475, 0.06], [-0.12, 0, 0]));
  for (const side of [-1, 1]) {
    const x = side * 0.325;
    add('interior', ellipsoid([0.242, 0.084, 0.297], [x, 0.383, -0.27]));
    add('interior', ellipsoid([0.228, 0.329, 0.09], [x, 0.633, -0.571], [0.17, 0, 0]));
    add('interior', ellipsoid([0.133, 0.13, 0.076], [x, 0.927, -0.625], [0.17, 0, 0]));
    for (const edge of [-1, 1]) {
      add('seatAccent', ellipsoid([0.044, 0.253, 0.078], [x + edge * 0.183, 0.616, -0.53], [0.17, 0, edge * -0.06]));
      add('seatAccent', box([0.028, 0.294, 0.012], [x + edge * 0.068, 0.68, -0.473], [0.18, 0, 0]));
    }
  }
  add('interior', box([0.3, 0.135, 0.025], [-0.325, 0.749, 0.422], [-0.16, 0, 0]));
  add('display', box([0.226, 0.009, 0.006], [-0.325, 0.784, 0.406], [-0.16, 0, 0]));
  for (let i = 0; i < 7; i++) add('display', box([0.016, 0.012 + i * 0.003, 0.006], [-0.419 + i * 0.031, 0.739, 0.404], [-0.16, 0, 0]));
  add('display', box([0.048, 0.022, 0.006], [-0.325, 0.76, 0.402], [-0.16, 0, 0]));
  add('interior', box([0.078, 0.04, 0.021], [0, 0.98, 0.455], [-0.08, 0, 0]));
  add('mirror', box([0.066, 0.025, 0.005], [0, 0.98, 0.44], [-0.08, 0, 0]));

  const staticGeometry = new Map([...parts].map(([name, geometries]) => [name, merge(geometries)]));

  const tire = [];
  const rim = [];
  const disc = [];
  tire.push(transform(new THREE.TorusGeometry(0.29, 0.075, 8, 28), [0, 0, 0], [0, Math.PI / 2, 0], [1, 1, 1.8]));
  rim.push(transform(new THREE.CylinderGeometry(0.234, 0.234, 0.256, 24, 1, true), [0, 0, 0], [0, 0, Math.PI / 2]));
  for (const side of [-1, 1]) {
    const sidewall = [];
    const sidewallFaces = [];
    for (let i = 0; i <= 28; i++) {
      const angle = i / 28 * TAU;
      for (const radius of [0.239, 0.299]) sidewall.push([side * 0.131, Math.cos(angle) * radius, Math.sin(angle) * radius]);
      if (i) {
        const a = (i - 1) * 2;
        sidewallFaces.push([a, a + 1, a + 3], [a, a + 3, a + 2]);
      }
    }
    tire.push(surface(sidewall, side < 0 ? sidewallFaces.map(face => face.toReversed()) : sidewallFaces));
    rim.push(transform(new THREE.TorusGeometry(0.241, 0.014, 5, 24), [side * 0.137, 0, 0], [0, Math.PI / 2, 0]));
    rim.push(cylinder(0.055, 0.017, [side * 0.145, 0, 0], undefined, 12));
    disc.push(cylinder(0.21, 0.009, [side * 0.112, 0, 0], undefined, 24));
    for (let i = 0; i < 10; i++) {
      const angle = i / 10 * TAU;
      rim.push(box([0.018, 0.183, 0.019], [side * 0.139, Math.cos(angle) * 0.139, Math.sin(angle) * 0.139], [angle, 0, 0]));
      const a = angle + 0.16;
      tire.push(cylinder(0.008, 0.002, [side * 0.119, Math.cos(a) * 0.172, Math.sin(a) * 0.172], undefined, 5));
    }
    tire.push(cylinder(0.033, 0.004, [side * 0.156, 0, 0], undefined, 10));
  }

  const steeringRing = [];
  const steeringTrim = [];
  const steeringPoints = [
    [-0.111, -0.099, 0], [-0.143, -0.045, 0], [-0.141, 0.052, 0],
    [-0.092, 0.126, 0], [0, 0.147, 0], [0.092, 0.126, 0],
    [0.141, 0.052, 0], [0.143, -0.045, 0], [0.111, -0.099, 0],
    [0, -0.113, 0], [-0.111, -0.099, 0],
  ].map(p => new THREE.Vector3(...p));
  steeringRing.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(steeringPoints), 36, 0.014, 6, false));
  steeringRing.push(box([0.151, 0.052, 0.044], [0, 0.002, 0]));
  steeringTrim.push(strut([-0.115, 0.025, 0], [-0.049, 0, 0], 0.012, 4));
  steeringTrim.push(strut([0.115, 0.025, 0], [0.049, 0, 0], 0.012, 4));
  steeringTrim.push(strut([0, -0.018, 0], [0, -0.103, 0], 0.011, 4));
  steeringTrim.push(box([0.024, 0.012, 0.004], [0, 0.006, -0.025]));

  const shadowData = new Uint8Array(64 * 128 * 4);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 64; x++) {
      const radius = Math.sqrt(((x - 31.5) / 32) ** 4 + ((y - 63.5) / 64) ** 4);
      shadowData[(y * 64 + x) * 4 + 3] = Math.round(THREE.MathUtils.clamp((1 - radius) * 2.8, 0, 1) * 255);
    }
  }
  const shadowMap = new THREE.DataTexture(shadowData, 64, 128);
  shadowMap.magFilter = THREE.LinearFilter;
  shadowMap.minFilter = THREE.LinearFilter;
  shadowMap.needsUpdate = true;

  return {
    staticGeometry,
    tire: merge(tire),
    rim: merge(rim),
    disc: merge(disc),
    caliper: box([0.256, 0.155, 0.069], [0, 0.011, -0.183], [0.16, 0, 0]),
    steeringRing: merge(steeringRing),
    steeringTrim: merge(steeringTrim),
    shadowMap,
  };
}

function materials(color) {
  return {
    paint: new THREE.MeshPhysicalMaterial({ color, metalness: 0.34, roughness: 0.29, clearcoat: 1, clearcoatRoughness: 0.18, side: THREE.DoubleSide }),
    carbon: new THREE.MeshStandardMaterial({ color: 0x11161c, roughness: 0.58, metalness: 0.24, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x07151e, roughness: 0.17, metalness: 0.18, side: THREE.FrontSide, clearcoat: 1, clearcoatRoughness: 0.12 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x59636b, roughness: 0.5, metalness: 0.66, side: THREE.DoubleSide }),
    vent: new THREE.MeshStandardMaterial({ color: 0x252e33, roughness: 0.72, metalness: 0.18, side: THREE.DoubleSide }),
    silver: new THREE.MeshStandardMaterial({ color: 0xa3afb6, roughness: 0.3, metalness: 0.8, side: THREE.DoubleSide }),
    headlights: new THREE.MeshStandardMaterial({ color: 0xf1fbff, emissive: 0xd9f4ff, emissiveIntensity: 1.5, roughness: 0.23, side: THREE.DoubleSide }),
    taillights: new THREE.MeshStandardMaterial({ color: 0xff2034, emissive: 0xff142c, emissiveIntensity: 0.55, roughness: 0.28, side: THREE.DoubleSide }),
    interior: new THREE.MeshStandardMaterial({ color: 0x151a20, roughness: 0.94, metalness: 0.04, side: THREE.DoubleSide }),
    seatAccent: new THREE.MeshStandardMaterial({ color: 0x8b1b26, roughness: 0.86 }),
    display: new THREE.MeshBasicMaterial({ color: 0x87e9d6, side: THREE.DoubleSide }),
    mirror: new THREE.MeshStandardMaterial({ color: 0x9bbcc7, metalness: 0.85, roughness: 0.12, side: THREE.DoubleSide }),
    tire: new THREE.MeshStandardMaterial({ color: 0x16191c, roughness: 0.94, metalness: 0.03 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x87949f, metalness: 0.82, roughness: 0.32 }),
    disc: new THREE.MeshStandardMaterial({ color: 0x505961, metalness: 0.75, roughness: 0.55 }),
    caliper: new THREE.MeshStandardMaterial({ color: 0xd7a64c, roughness: 0.46, metalness: 0.48 }),
  };
}

/** Local +Z is forward. The caller owns root position and rotation. */
export function createCar({ color = 0xe63335 } = {}) {
  shared ??= makeSharedGeometry();
  const palette = materials(color);
  const root = new THREE.Group();
  root.name = 'Horizon One';
  const body = new THREE.Group();
  body.name = 'suspendedBody';
  root.add(body);
  for (const [name, geometry] of shared.staticGeometry) {
    const mesh = new THREE.Mesh(geometry, palette[name]);
    mesh.name = `car-${name}`;
    mesh.castShadow = name !== 'glass' && name !== 'headlights' && name !== 'display';
    mesh.receiveShadow = name !== 'glass';
    body.add(mesh);
  }

  const wheels = [];
  for (const front of [true, false]) {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.name = `${front ? 'front' : 'rear'}-${side < 0 ? 'left' : 'right'}-steer`;
      pivot.position.set(side * TRACK_HALF, WHEEL_RADIUS, front ? FRONT_AXLE : REAR_AXLE);
      const rolling = new THREE.Group();
      rolling.name = 'wheelRoll';
      for (const kind of ['tire', 'rim', 'disc']) {
        const mesh = new THREE.Mesh(shared[kind], palette[kind]);
        mesh.name = `wheel-${kind}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        rolling.add(mesh);
      }
      const caliper = new THREE.Mesh(shared.caliper, palette.caliper);
      caliper.castShadow = true;
      pivot.add(rolling, caliper);
      pivot.userData = { front, side, radius: WHEEL_RADIUS, rolling };
      wheels.push(pivot);
      root.add(pivot);
    }
  }

  const steeringMount = new THREE.Group();
  steeringMount.position.set(-0.325, 0.75, 0.253);
  steeringMount.rotation.x = -0.21;
  const steering = new THREE.Group();
  steering.name = 'steeringWheel';
  steering.add(new THREE.Mesh(shared.steeringRing, palette.carbon), new THREE.Mesh(shared.steeringTrim, palette.silver));
  steeringMount.add(steering);
  body.add(steeringMount);

  const cockpitCamera = new THREE.Object3D();
  cockpitCamera.name = 'cockpitCamera';
  cockpitCamera.position.set(-0.325, 0.97, -0.17);
  const hoodCamera = new THREE.Object3D();
  hoodCamera.name = 'hoodCamera';
  hoodCamera.position.set(0, 0.79, 1.25);
  body.add(cockpitCamera, hoodCamera);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.33, 4.94), new THREE.MeshBasicMaterial({ map: shared.shadowMap, transparent: true, opacity: 0.29, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  shadow.name = 'contactShadow';
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.012, -0.04);
  shadow.renderOrder = -1;
  root.add(shadow);
  root.userData.dimensions = { length: 4.8, width: 2.04, height: 1.326, wheelbase: FRONT_AXLE - REAR_AXLE };

  let spin = 0;
  function update(dt, { speed = 0, steer = 0, throttle = 0, brake = 0, time = 0 } = {}) {
    spin = (spin + speed * dt / WHEEL_RADIUS) % TAU;
    const turn = THREE.MathUtils.clamp(steer, -1, 1);
    const suspension = 1 - Math.exp(-dt * 9);
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, brake * 0.026 - throttle * 0.012, suspension);
    body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, turn * Math.min(Math.abs(speed) / 35, 1) * 0.022, suspension);
    body.position.y = Math.sin(time * 31) * Math.min(Math.abs(speed) / 10, 1) * throttle * 0.0015;
    for (const wheel of wheels) {
      wheel.rotation.y = wheel.userData.front ? turn * (Math.sign(turn) === wheel.userData.side ? 0.43 : 0.385) : 0;
      wheel.userData.rolling.rotation.x = spin;
    }
    steering.rotation.z = -turn * 0.9;
    palette.taillights.emissiveIntensity = 0.55 + brake * 1.65;
  }

  function setView(mode) {
    const inside = mode === 'cockpit';
    palette.glass.transparent = inside;
    palette.glass.opacity = inside ? 0.065 : 1;
    palette.glass.depthWrite = !inside;
    palette.glass.side = inside ? THREE.DoubleSide : THREE.FrontSide;
    palette.glass.needsUpdate = true;
  }

  return { root, body, wheels, cockpitCamera, hoodCamera, update, setView };
}
