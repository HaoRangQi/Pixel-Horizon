import * as THREE from 'three';
import { createRoadMaterials } from './surfaces.js';

const TAU = Math.PI * 2;
export const wrap = (t) => ((t % 1) + 1) % 1;
export const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function createRoute() {
  const points = [
    [-630, 22, -860], [-300, 20, -1040], [100, 24, -1100],
    [500, 37, -1030], [850, 70, -830], [1080, 96, -480],
    [1180, 112, -100], [1080, 124, 300], [870, 135, 650],
    [550, 146, 900], [130, 157, 1030], [-170, 176, 1050],
    [-480, 177, 950], [-740, 190, 780], [-1040, 225, 620],
    [-1150, 235, 310], [-980, 220, 90], [-1200, 185, -90],
    [-1060, 135, -360], [-790, 90, -470], [-870, 55, -690],
  ].map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
  curve.arcLengthDivisions = 8400;
  curve.updateArcLengths();
  const length = curve.getLength();
  const count = Math.ceil(length / 3.2);
  const samples = Array.from({ length: count }, (_, i) => curve.getPointAt(i / count));
  const cellSize = 90;
  const cells = new Map();
  const cellKey = (x, z) => `${x},${z}`;
  const visited = new Uint32Array(count);
  let stamp = 0;
  for (let i = 0; i < count; i++) {
    const a = samples[i], b = samples[(i + 1) % count];
    for (let x = Math.floor(Math.min(a.x, b.x) / cellSize); x <= Math.floor(Math.max(a.x, b.x) / cellSize); x++) {
      for (let z = Math.floor(Math.min(a.z, b.z) / cellSize); z <= Math.floor(Math.max(a.z, b.z) / cellSize); z++) {
        const key = cellKey(x, z);
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(i);
      }
    }
  }

  function query(x, z) {
    const cx = Math.floor(x / cellSize), cz = Math.floor(z / cellSize);
    let best = Infinity, bestI = 0, bestU = 0;
    stamp++;
    if (stamp === 0xffffffff) { visited.fill(0); stamp = 1; }
    const visitCell = (gx, gz) => {
      const list = cells.get(cellKey(gx, gz));
      if (!list) return;
      for (const i of list) {
        if (visited[i] === stamp) continue;
        visited[i] = stamp;
        const a = samples[i], b = samples[(i + 1) % count];
        const dx = b.x - a.x, dz = b.z - a.z;
        const u = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
        const px = a.x + dx * u, pz = a.z + dz * u;
        const d = (x - px) ** 2 + (z - pz) ** 2;
        if (d < best) { best = d; bestI = i; bestU = u; }
      }
    };
    for (let radius = 0; radius < 1000; radius++) {
      if (!radius) visitCell(cx, cz);
      else {
        for (let i = -radius; i <= radius; i++) {
          visitCell(cx + i, cz - radius);
          visitCell(cx + i, cz + radius);
        }
        for (let j = -radius + 1; j < radius; j++) {
          visitCell(cx - radius, cz + j);
          visitCell(cx + radius, cz + j);
        }
      }
      const outsideDistance = Math.min(
        x - (cx - radius) * cellSize, (cx + radius + 1) * cellSize - x,
        z - (cz - radius) * cellSize, (cz + radius + 1) * cellSize - z,
      );
      if (best <= outsideDistance * outsideDistance) break;
    }
    const a = samples[bestI], b = samples[(bestI + 1) % count];
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    const px = THREE.MathUtils.lerp(a.x, b.x, bestU);
    const pz = THREE.MathUtils.lerp(a.z, b.z, bestU);
    return {
      t: wrap((bestI + bestU) / count), distance: Math.sqrt(best),
      x: px, y: THREE.MathUtils.lerp(a.y, b.y, bestU), z: pz, heading,
      lateral: (x - px) * Math.cos(heading) - (z - pz) * Math.sin(heading),
    };
  }

  const road = {
    length, width: 12.2,
    sample(t) {
      const f = wrap(t) * count, i = Math.floor(f), u = f - i;
      const a = samples[i], b = samples[(i + 1) % count];
      const tangent = new THREE.Vector3().subVectors(b, a).normalize();
      return { position: new THREE.Vector3().lerpVectors(a, b, u), tangent, heading: Math.atan2(tangent.x, tangent.z) };
    },
    nearest(x, z) {
      const q = query(x, z);
      return { t: q.t, distance: q.distance, point: new THREE.Vector3(q.x, q.y, q.z), heading: q.heading };
    },
    groundHeight: () => 0,
  };
  function frame(t, lateral = 0) {
    const s = road.sample(t);
    s.position.x += Math.cos(s.heading) * lateral;
    s.position.z -= Math.sin(s.heading) * lateral;
    return s;
  }
  return { road, query, frame, samples };
}

export function ribbonGeometry(road, from, to, left, right, y = 0, segments = 1600) {
  const vertices = [], indices = [], uvs = [];
  for (let i = 0; i <= segments; i++) {
    const s = road.sample(from + (to - from) * i / segments);
    const nx = Math.cos(s.heading), nz = -Math.sin(s.heading);
    vertices.push(s.position.x + nx * left, s.position.y + y, s.position.z + nz * left);
    vertices.push(s.position.x + nx * right, s.position.y + y, s.position.z + nz * right);
    uvs.push(left / 12.2, (from + (to - from) * i / segments) * road.length / 12.2);
    uvs.push(right / 12.2, (from + (to - from) * i / segments) * road.length / 12.2);
    if (i < segments) {
      const n = i * 2;
      indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function roadMesh(scene, route) {
  const { road } = route;
  const { gravel, pavement, paint, seal } = createRoadMaterials();
  const addRibbon = (from, to, left, right, y, material, name) => {
    const mesh = new THREE.Mesh(ribbonGeometry(road, from, to, left, right, y, Math.max(20, Math.ceil((to - from) * road.length / 2.7))), material);
    mesh.name = name; mesh.receiveShadow = true; scene.add(mesh); return mesh;
  };
  addRibbon(0, 1, -9.4, 9.4, -.1, gravel, 'aggregate-road-shoulder');
  addRibbon(0, 1, -6.1, 6.1, .035, pavement, 'textured-asphalt');
  addRibbon(0, 1, -5.5, -5.3, .058, paint, 'left-edge-line');
  addRibbon(0, 1, 5.3, 5.5, .058, paint, 'right-edge-line');
  const kerb = new THREE.MeshStandardMaterial({ color: 0xb2ab94, map: gravel.map, roughness: .97, bumpMap: gravel.bumpMap, bumpScale: .03 });
  for (const [from, to] of [[0, .087], [.975, 1]]) {
    addRibbon(from, to, -11.2, -7.4, .12, kerb, 'village-pavement');
    addRibbon(from, to, 7.4, 11.2, .12, kerb, 'coastal-footpath');
    addRibbon(from, to, -7.5, -7.25, .19, paint, 'stone-kerb');
    addRibbon(from, to, 7.25, 7.5, .19, paint, 'stone-kerb');
  }
  const dashes = Math.floor(road.length / 15);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.035, 5.2), paint, dashes);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < dashes; i++) {
    const s = road.sample(i / dashes);
    dummy.position.copy(s.position); dummy.position.y += 0.065;
    dummy.rotation.set(-Math.asin(s.tangent.y), s.heading, 0, 'YXZ'); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const rng = seededRandom(3127), repairs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), seal, 100);
  for (let i = 0; i < 100; i++) {
    const t = rng(), s = route.frame(t, (rng() - .5) * 9);
    dummy.position.copy(s.position); dummy.position.y += .046;
    dummy.rotation.set(-Math.asin(s.tangent.y), s.heading, 0, 'YXZ');
    dummy.scale.set(.32 + rng() * 1.8, 1, .5 + rng() * 3.2); dummy.updateMatrix(); repairs.setMatrixAt(i, dummy.matrix);
  }
  repairs.receiveShadow = true; repairs.instanceMatrix.needsUpdate = true; repairs.name = 'asphalt-repairs'; scene.add(repairs);
  const studs = new THREE.InstancedMesh(new THREE.BoxGeometry(.13, .035, .25), new THREE.MeshStandardMaterial({ color: 0xf1d78d, roughness: .3, metalness: .2 }), dashes * 2);
  for (let i = 0; i < dashes; i++) for (let side = 0; side < 2; side++) {
    const s = route.frame((i + .5) / dashes, side ? 5.15 : -5.15);
    dummy.position.copy(s.position); dummy.position.y += .085; dummy.rotation.set(0, s.heading, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); studs.setMatrixAt(i * 2 + side, dummy.matrix);
  }
  studs.instanceMatrix.needsUpdate = true; studs.name = 'road-reflective-studs'; scene.add(studs);
  return { gravel, pavement };
}

export function seededRandom(seed = 97127) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export { TAU };
