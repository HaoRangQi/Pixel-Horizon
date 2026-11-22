import * as THREE from 'three';
import { smooth, seededRandom } from './route.js';

export function createLandscape(route) {
  const lakeFrame = route.frame(0.622);
  const lake = { x: -580, z: 810, y: lakeFrame.position.y - 23, rx: 365, rz: 245 };
  const bridgeT = 0.462;
  const bridge = route.frame(bridgeT);
  const bn = new THREE.Vector3(Math.cos(bridge.heading), 0, -Math.sin(bridge.heading));
  const riverCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(lake.x + 150, lake.y - 0.2, lake.z + 15),
    bridge.position.clone().addScaledVector(bn, -290).add(new THREE.Vector3(0, -6, 0)),
    bridge.position.clone().add(new THREE.Vector3(0, -14, 0)),
    bridge.position.clone().addScaledVector(bn, 300).add(new THREE.Vector3(0, -48, 0)),
    bridge.position.clone().addScaledVector(bn, 730).add(new THREE.Vector3(70, -bridge.position.y - 3, 80)),
  ], false, 'centripetal');
  const riverPoints = riverCurve.getPoints(130);
  const pads = [
    { t: 0.137, side: 25, radius: 37, name: '海岬观景台' },
    { t: 0.451, side: -25, radius: 29, name: '河谷石桥' },
    { t: 0.621, side: -30, radius: 36, name: '镜湖码头' },
    { t: 0.762, side: 27, radius: 39, name: '云上垭口' },
  ].map((p) => {
    const f = route.frame(p.t, p.side);
    return { ...p, x: f.position.x, y: f.position.y - 0.06, z: f.position.z, heading: f.heading };
  });
  const lighthouseFrame = route.frame(0.137, 99);
  const lighthouse = { x: lighthouseFrame.position.x, y: lighthouseFrame.position.y - 5, z: lighthouseFrame.position.z, radius: 29 };
  const waterfall = { x: lake.x - lake.rx * 0.88, z: lake.z - 20, y: lake.y, height: 47 };

  function riverQuery(x, z) {
    let best = Infinity, yy = 0;
    for (let i = 0; i < riverPoints.length - 1; i++) {
      const a = riverPoints[i], b = riverPoints[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const u = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const d = (x - a.x - dx * u) ** 2 + (z - a.z - dz * u) ** 2;
      if (d < best) { best = d; yy = THREE.MathUtils.lerp(a.y, b.y, u); }
    }
    return { distance: Math.sqrt(best), y: yy };
  }

  function height(x, z, suppliedQuery) {
    const q = suppliedQuery || route.query(x, z);
    const broad = Math.sin(x * 0.0031 + 0.7) * Math.cos(z * 0.0035 - 1.1);
    const detail = Math.sin(x * 0.013 + Math.sin(z * 0.009)) * Math.cos(z * 0.012);
    const massif = 244 * Math.exp(-(((x + 830) / 650) ** 2) - ((z - 220) / 760) ** 2);
    const inland = 138 * Math.exp(-((x / 810) ** 2) - ((z + 160) / 900) ** 2);
    const east = 70 * Math.exp(-(((x - 600) / 660) ** 2) - ((z - 370) / 800) ** 2);
    const radial = Math.hypot(x / 1600, z / 1540) + Math.sin(Math.atan2(z, x) * 7) * 0.025;
    let h = (24 + broad * 21 + detail * 7 + massif + inland + east) * (1 - smooth(0.89, 1.14, radial));
    h -= smooth(0.94, 1.19, radial) * 27;

    const coastWeight = q.t < 0.34 ? 1 - smooth(0.255, 0.34, q.t) : smooth(0.91, 0.965, q.t);
    if (coastWeight && q.lateral < 0) {
      const coastalPlain = q.y + 15 + smooth(105, 440, -q.lateral) * 180;
      h = THREE.MathUtils.lerp(h, Math.min(h, coastalPlain), coastWeight);
    }
    if (coastWeight && q.lateral > -35) {
      const shelf = 51 + Math.sin(q.t * 74) * 11;
      const coastal = q.y - smooth(18, shelf + 49, q.lateral) * (q.y + 24);
      h = THREE.MathUtils.lerp(h, Math.min(h, coastal), coastWeight);
    }

    const summitWeight = smooth(.69, .735, q.t) * (1 - smooth(.88, .94, q.t));
    if (summitWeight) {
      const shoulder = q.lateral > 0
        ? q.y - smooth(32, 350, q.lateral) * 185
        : q.y + smooth(105, 390, -q.lateral) * 100;
      h = THREE.MathUtils.lerp(h, Math.min(h, shoulder), summitWeight);
    }

    const lr = Math.hypot((x - lake.x) / lake.rx, (z - lake.z) / lake.rz);
    if (lr < 1.3) {
      const basin = lake.y - 17 + smooth(.68, 1.12, lr) * 20;
      h = THREE.MathUtils.lerp(h, Math.min(h, basin), 1 - smooth(1.02, 1.3, lr));
    }
    const river = riverQuery(x, z);
    if (river.distance < 70) {
      const riverBed = river.y - 5 + smooth(11, 70, river.distance) * 26;
      h = THREE.MathUtils.lerp(h, Math.min(h, riverBed), 1 - smooth(24, 70, river.distance));
    }

    for (const pad of pads) {
      const d = Math.hypot(x - pad.x, z - pad.z);
      if (d < pad.radius + 24) h = THREE.MathUtils.lerp(h, pad.y - 0.12, 1 - smooth(pad.radius - 7, pad.radius + 24, d));
    }
    const lightDistance = Math.hypot(x - lighthouse.x, z - lighthouse.z);
    if (lightDistance < 65) h = THREE.MathUtils.lerp(h, lighthouse.y, 1 - smooth(26, 65, lightDistance));
    const nearBridge = Math.abs(q.t - bridgeT) < 0.0125 && q.distance < 45;
    if (!nearBridge) {
      const lakeBank = q.t > .565 && q.t < .685 && q.lateral < 0;
      const roadWeight = 1 - smooth(lakeBank ? 10.5 : 28, lakeBank ? 40 : 105, q.distance);
      h = THREE.MathUtils.lerp(h, q.y - 0.2, roadWeight);
    }
    return h;
  }
  route.road.groundHeight = (x, z) => {
    const q = route.query(x, z);
    return q.distance <= route.road.width / 2 + 0.2 ? q.y : height(x, z, q);
  };
  return { height, lake, riverCurve, riverPoints, riverQuery, pads, lighthouse, waterfall, bridgeT };
}

export function addTerrain(scene, route, landscape) {
  const size = 225, minX = -2150, minZ = -2100, dx = 4300 / size, dz = 4250 / size;
  const grid = [];
  for (let z = 0; z <= size; z++) {
    for (let x = 0; x <= size; x++) {
      const xx = minX + x * dx, zz = minZ + z * dz;
      const q = route.query(xx, zz);
      grid.push({ x: xx, y: landscape.height(xx, zz, q), z: zz, t: q.t, distance: q.distance });
    }
  }
  const positions = [], colors = [];
  const rng = seededRandom(8923);
  const color = new THREE.Color();
  const palettes = [0x8c9861, 0xa18e67, 0xb2a33c, 0x929157, 0x63866d, 0x7f8490];
  const regionAt = (t) => t < 0.09 || t > 0.95 ? 0 : t < 0.255 ? 1 : t < 0.415 ? 2 : t < 0.56 ? 3 : t < 0.72 ? 4 : 5;
  const tri = (a, b, c) => {
    const y = (a.y + b.y + c.y) / 3;
    const slope = (Math.abs(a.y - b.y) + Math.abs(b.y - c.y) + Math.abs(c.y - a.y)) / (dx + dz);
    const t = (a.t + b.t + c.t) / 3;
    const distance = (a.distance + b.distance + c.distance) / 3;
    if (t > .56 && t < .69 && distance < 85) return;
    color.setHex(palettes[regionAt(t)]);
    if (y < 4) color.setHex(0xb9a478);
    else if (slope > 0.66) color.lerp(new THREE.Color(0x8d7e79), 0.68);
    else if (y > 285) color.lerp(new THREE.Color(0x9a9aa0), 0.5);
    color.multiplyScalar(0.93 + rng() * 0.13);
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      colors.push(color.r, color.g, color.b);
    }
  };
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const n = z * (size + 1) + x;
      const a = grid[n], b = grid[n + 1], c = grid[n + size + 1], d = grid[n + size + 2];
      tri(a, c, b); tri(b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.name = 'faceted-island-terrain';
  scene.add(mesh);

  // A fine shoreline strip keeps the steep lake bank joined to the road at driving height.
  const shorePositions = [], shoreColors = [];
  const crossSection = [-115, -85, -55, -40, -27, -18, -10, -6, 0, 6, 10, 18, 28, 55, 85, 115];
  const shoreGrid = [], segments = 155;
  for (let i = 0; i <= segments; i++) {
    const t = .548 + i / segments * .154;
    for (const side of crossSection) {
      const p = route.frame(t, side).position;
      shoreGrid.push(new THREE.Vector3(p.x, landscape.height(p.x, p.z) + .025, p.z));
    }
  }
  const shoreColor = new THREE.Color(0x68896e);
  const emit = (a, b, c) => {
    for (const p of [a, b, c]) { shorePositions.push(p.x, p.y, p.z); shoreColors.push(shoreColor.r, shoreColor.g, shoreColor.b); }
  };
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < crossSection.length - 1; j++) {
      const n = i * crossSection.length + j, a = shoreGrid[n], b = shoreGrid[n + 1], c = shoreGrid[n + crossSection.length], d = shoreGrid[n + crossSection.length + 1];
      emit(a, c, b); emit(b, c, d);
    }
  }
  const shoreGeometry = new THREE.BufferGeometry();
  shoreGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shorePositions, 3));
  shoreGeometry.setAttribute('color', new THREE.Float32BufferAttribute(shoreColors, 3)); shoreGeometry.computeVertexNormals();
  const shore = new THREE.Mesh(shoreGeometry, mesh.material);
  shore.name = 'fine-lakeshore-road-bank'; scene.add(shore);
  return mesh;
}

export function riverGeometry(points, width = 22) {
  const positions = [], indices = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    const p = points[i];
    positions.push(p.x - Math.cos(heading) * width / 2, p.y, p.z + Math.sin(heading) * width / 2);
    positions.push(p.x + Math.cos(heading) * width / 2, p.y, p.z - Math.sin(heading) * width / 2);
    if (i < points.length - 1) {
      const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}
