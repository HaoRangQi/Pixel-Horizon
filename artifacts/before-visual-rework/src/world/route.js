import * as THREE from 'three';

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
    [550, 146, 900], [130, 157, 1030], [-170, 168, 1050],
    [-480, 185, 950], [-740, 205, 780], [-1040, 225, 620],
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
  const vertices = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const s = road.sample(from + (to - from) * i / segments);
    const nx = Math.cos(s.heading), nz = -Math.sin(s.heading);
    vertices.push(s.position.x + nx * left, s.position.y + y, s.position.z + nz * left);
    vertices.push(s.position.x + nx * right, s.position.y + y, s.position.z + nz * right);
    if (i < segments) {
      const n = i * 2;
      indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function roadMesh(scene, route) {
  const { road } = route;
  const gravel = new THREE.MeshLambertMaterial({ color: 0xa99b80, flatShading: true });
  const pavement = new THREE.MeshLambertMaterial({ color: 0x4d565b, flatShading: true });
  const paint = new THREE.MeshBasicMaterial({ color: 0xf1e6be });
  const edgePaint = new THREE.MeshBasicMaterial({ color: 0xd6d7c5 });
  scene.add(new THREE.Mesh(ribbonGeometry(road, 0, 1, -10, 10, -0.09), gravel));
  scene.add(new THREE.Mesh(ribbonGeometry(road, 0, 1, -6.1, 6.1, 0.035), pavement));
  scene.add(new THREE.Mesh(ribbonGeometry(road, 0, 1, -5.5, -5.3, 0.055), edgePaint));
  scene.add(new THREE.Mesh(ribbonGeometry(road, 0, 1, 5.3, 5.5, 0.055), edgePaint));
  const dashes = Math.floor(road.length / 15);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.035, 5.2), paint, dashes);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < dashes; i++) {
    const s = road.sample(i / dashes);
    dummy.position.copy(s.position); dummy.position.y += 0.065;
    dummy.rotation.set(0, s.heading, 0); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
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
