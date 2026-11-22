import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export function meshGeometry(vertices, faces, uv) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
  g.setIndex(faces.flat());
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv.flat(), 2));
  g.computeVertexNormals();
  return g;
}

export function orient(g, outward) {
  const p = g.attributes.position;
  const i = g.index;
  const a = new THREE.Vector3().fromBufferAttribute(p, i.getX(0));
  const b = new THREE.Vector3().fromBufferAttribute(p, i.getX(1));
  const c = new THREE.Vector3().fromBufferAttribute(p, i.getX(2));
  if (b.sub(a).cross(c.sub(a)).dot(new THREE.Vector3(...outward)) < 0) {
    for (let k = 0; k < i.count; k += 3) {
      const tmp = i.getX(k + 1);
      i.setX(k + 1, i.getX(k + 2));
      i.setX(k + 2, tmp);
    }
    g.computeVertexNormals();
  }
  return g;
}

export function polygon(points, outward) {
  const n = points.length;
  const faces = [];
  const center = points.reduce((sum, p) => sum.add(new THREE.Vector3(...p)), new THREE.Vector3()).multiplyScalar(1 / n).toArray();
  for (let i = 0; i < n; i++) faces.push([n, i, (i + 1) % n]);
  const g = meshGeometry([...points, center], faces);
  return outward ? orient(g, outward) : g;
}

export function grid(fn, nu = 30, nv = 14, outward, cutout) {
  const vertices = [], faces = [], uv = [];
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      vertices.push(fn(i / nu, j / nv));
      uv.push([i / nu, j / nv]);
      if (i && j) {
        const a = (i - 1) * (nv + 1) + j - 1;
        const tris = [[a, a + 1, a + nv + 2], [a, a + nv + 2, a + nv + 1]];
        for (const tri of tris) {
          const center = tri.reduce((sum, k) => sum.map((n, c) => n + vertices[k][c] / 3), [0, 0, 0]);
          if (!cutout || !cutout(center)) faces.push(tri);
        }
      }
    }
  }
  const g = meshGeometry(vertices, faces, uv);
  return outward ? orient(g, outward) : g;
}

export function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function transform(g, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  return g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale)));
}

export function box(size, position, rotation) {
  return transform(new THREE.BoxGeometry(...size), position, rotation);
}

export function sphere(size, position, rotation, segments = 24) {
  return transform(new THREE.SphereGeometry(1, segments, Math.round(segments / 2)), position, rotation, size);
}

export function cylinder(radius, length, position, rotation = [0, 0, Math.PI / 2], segments = 48, openEnded = false) {
  return transform(new THREE.CylinderGeometry(radius, radius, length, segments, 1, openEnded), position, rotation);
}

export function torus(radius, tube, position, rotation = [0, Math.PI / 2, 0], segments = 64) {
  return transform(new THREE.TorusGeometry(radius, tube, 8, segments), position, rotation);
}

export function rod(from, to, radius = 0.01, segments = 8) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const g = new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
  return g.translate(...a.add(b).multiplyScalar(0.5).toArray());
}

export function tube(points, radius = 0.01, segments = 64, closed = false, radialSegments = 6) {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'centripetal');
  return new THREE.TubeGeometry(path, segments, radius, radialSegments, closed);
}

export function shapeExtrude(points, depth, position = [0, 0, 0], rotation = [0, 0, 0], bevel = 0.008) {
  const s = new THREE.Shape();
  s.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) s.lineTo(...points[i]);
  s.closePath();
  return transform(new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSegments: 3, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 12 }), position, rotation);
}

export function roundedBox(size, position, rotation, radius = 0.025) {
  const [w, h, d] = size, r = Math.min(radius, w / 3, h / 3, d / 3);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d - r * 2, bevelEnabled: true, bevelSegments: 3, bevelSize: r, bevelThickness: r, steps: 1, curveSegments: 6 });
  g.translate(0, 0, -d / 2 + r);
  return transform(g, position, rotation);
}

export function sampleSections(sections, z) {
  let i = 0;
  while (i < sections.length - 2 && z > sections[i + 1][0]) i++;
  const a = sections[i], b = sections[i + 1];
  const t = THREE.MathUtils.clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
  const before = sections[Math.max(0, i - 1)], after = sections[Math.min(sections.length - 1, i + 2)];
  return a.map((value, k) => {
    if (!k) return z;
    const m0 = (b[k] - before[k]) / (b[0] - before[0]) * (b[0] - a[0]);
    const m1 = (after[k] - a[k]) / (after[0] - a[0]) * (b[0] - a[0]);
    return (2 * t ** 3 - 3 * t ** 2 + 1) * value + (t ** 3 - 2 * t ** 2 + t) * m0 + (-2 * t ** 3 + 3 * t ** 2) * b[k] + (t ** 3 - t ** 2) * m1;
  });
}

export function merge(parts) {
  const positions = [], normals = [], uvs = [];
  for (const geometry of parts) {
    const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
    const index = geometry.index;
    for (let i = 0; i < (index?.count ?? p.count); i++) {
      const j = index ? index.getX(i) : i;
      positions.push(p.getX(j), p.getY(j), p.getZ(j));
      normals.push(n.getX(j), n.getY(j), n.getZ(j));
      uvs.push(uv ? uv.getX(j) : p.getX(j) * 3, uv ? uv.getY(j) : (p.getY(j) + p.getZ(j)) * 3);
    }
    geometry.dispose();
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  result.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

export function collection() {
  const parts = new Map();
  return {
    add(name, geometry) {
      if (!parts.has(name)) parts.set(name, []);
      parts.get(name).push(geometry);
    },
    finish() { return new Map([...parts].map(([name, geometries]) => [name, merge(geometries)])); },
  };
}

export function radialPatch(outline, project, scale = 1, segments = 64, rings = 8) {
  const path = new THREE.CatmullRomCurve3(outline.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  const cx = outline.reduce((n, p) => n + p[0], 0) / outline.length;
  const cz = outline.reduce((n, p) => n + p[1], 0) / outline.length;
  const vertices = [project(cx, cz)], faces = [];
  for (let r = 1; r <= rings; r++) {
    for (let i = 0; i <= segments; i++) {
      const p = path.getPoint(i / segments);
      vertices.push(project(THREE.MathUtils.lerp(cx, p.x, scale * r / rings), THREE.MathUtils.lerp(cz, p.z, scale * r / rings)));
      if (r === 1 && i) faces.push([0, i, i + 1]);
      if (r > 1 && i) {
        const a = 1 + (r - 2) * (segments + 1) + i - 1;
        faces.push([a, a + 1, a + segments + 2], [a, a + segments + 2, a + segments + 1]);
      }
    }
  }
  return orient(meshGeometry(vertices, faces), [0, 1, 0]);
}

export function loopPoints(outline, count = 48) {
  const path = new THREE.CatmullRomCurve3(outline.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal');
  return Array.from({ length: count }, (_, i) => path.getPoint(i / count));
}
