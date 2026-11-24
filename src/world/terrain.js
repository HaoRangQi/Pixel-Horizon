import * as THREE from 'three';
import { smooth, seededRandom } from './route.js';
import { createGroundMaterial } from './surfaces.js';

export function createLandscape(route) {
  const lakeFrame = route.frame(0.622);
  const lake = { x: -580, z: 810, y: lakeFrame.position.y - 5, rx: 365, rz: 245 };
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

  function baseHeight(x, z, suppliedQuery) {
    const q = suppliedQuery || route.query(x, z);
    const broad = Math.sin(x * 0.0031 + 0.7) * Math.cos(z * 0.0035 - 1.1);
    const detail = Math.sin(x * 0.013 + Math.sin(z * 0.009)) * Math.cos(z * 0.012);
    const hummocks = Math.sin(x * .046 + Math.sin(z * .031) * 1.3) * Math.cos(z * .041) * 1.7
      + Math.sin(x * .119 + z * .067) * Math.cos(z * .097 - x * .037) * .48;
    const massif = 244 * Math.exp(-(((x + 830) / 650) ** 2) - ((z - 220) / 760) ** 2);
    const inland = 138 * Math.exp(-((x / 810) ** 2) - ((z + 160) / 900) ** 2);
    const east = 70 * Math.exp(-(((x - 600) / 660) ** 2) - ((z - 370) / 800) ** 2);
    const radial = Math.hypot(x / 1600, z / 1540) + Math.sin(Math.atan2(z, x) * 7) * 0.025;
    let h = (24 + broad * 21 + detail * 7 + massif + inland + east + hummocks) * (1 - smooth(0.89, 1.14, radial));
    h -= smooth(0.94, 1.19, radial) * 27;

    const coastWeight = q.t < 0.34 ? 1 - smooth(0.255, 0.34, q.t) : smooth(0.91, 0.965, q.t);
    if (coastWeight && q.lateral < 0) {
      const coastalPlain = q.y + 15 + smooth(105, 440, -q.lateral) * 180;
      h = THREE.MathUtils.lerp(h, Math.min(h, coastalPlain), coastWeight);
    }
    if (coastWeight && q.lateral > -35) {
      const shelf = 51 + Math.sin(q.t * 74) * 11;
      const coastal = q.y - smooth(13, shelf + 49, q.lateral) * (q.y + 24) + Math.sin(q.t * 1190 + q.lateral * .052) * smooth(21,70,q.lateral) * 1.9;
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
    if (river.distance < 115) {
      const riverBed = river.y - 4 + smooth(15, 55, river.distance) * 26;
      h = THREE.MathUtils.lerp(h, riverBed, 1 - smooth(40, 115, river.distance));
    }

    for (const pad of pads) {
      const d = Math.hypot(x - pad.x, z - pad.z);
      if (d < pad.radius + 24) h = THREE.MathUtils.lerp(h, pad.y - 0.12, 1 - smooth(pad.radius - 7, pad.radius + 24, d));
    }
    const lightDistance = Math.hypot(x - lighthouse.x, z - lighthouse.z);
    if (lightDistance < 65) h = THREE.MathUtils.lerp(h, lighthouse.y, 1 - smooth(26, 65, lightDistance));
    const bridgeCut=(1-smooth(48,100,Math.abs(q.t-bridgeT)*route.road.length))*(1-smooth(24,70,q.distance));
    const lakeBank = q.t > .565 && q.t < .685 && q.lateral < 0;
    const roadWeight = (1 - smooth(lakeBank ? 9.8 : 10.4, lakeBank ? 39 : 79, q.distance))*(1-bridgeCut);
    h = THREE.MathUtils.lerp(h, q.y - 0.2, roadWeight);
    if(river.distance<32) {
      const bed=river.y-4+smooth(15,55,river.distance)*26;
      h=THREE.MathUtils.lerp(h,bed,1-smooth(17,32,river.distance));
    }
    h=THREE.MathUtils.lerp(h,Math.min(h,q.y-.16),1-smooth(10.2,18,q.distance));
    return h;
  }
  // Branch roads settle their elevation on the already-shaped main landscape, then
  // carve a corridor of their own. Keeping the two passes separate avoids a circular
  // dependency between road heights and terrain heights.
  route.finalizeBranches(baseHeight);

  function height(x, z, suppliedQuery) {
    let h = baseHeight(x, z, suppliedQuery);
    const branch = route.branchQuery(x, z, 80);
    if (branch && branch.distance < 80) {
      let bed = branch.y - 0.2;
      const bridge = branch.line.def.bridge;
      if (bridge && branch.t >= bridge.from && branch.t < bridge.to + 25 / branch.line.length) {
        let below = Math.min(h, bed);
        const lakeR = Math.hypot((x - lake.x) / lake.rx, (z - lake.z) / lake.rz);
        if (lakeR < 1 && route.query(x, z).distance > 20) below = Math.min(below, lake.y - 2);
        const river = riverQuery(x, z);
        if (river.distance < 40) below = Math.min(below, river.y - 4);
        bed = THREE.MathUtils.lerp(below, bed, smooth(bridge.to, bridge.to + 25 / branch.line.length, branch.t));
      }
      const flat = 1 - smooth(11, 55, branch.distance);
      h = THREE.MathUtils.lerp(h, bed, flat);
      h = THREE.MathUtils.lerp(h, Math.min(h, branch.y - 0.16), 1 - smooth(10.2, 18, branch.distance));
    }
    return h;
  }

  route.road.groundHeight = (x, z) => {
    const q = route.networkQuery(x, z);
    if (q.distance <= q.width / 2 + 0.25) return q.y;
    return height(x, z, route.query(x, z));
  };
  return { height, lake, riverCurve, riverPoints, riverQuery, pads, lighthouse, waterfall, bridgeT };
}

export function addTerrain(scene, route, landscape) {
  const material = createGroundMaterial();
  const color = new THREE.Color(), grass = new THREE.Color(0x839b58), rock = new THREE.Color(0xa79884);
  const basePalette = [0x899d60, 0x9d9d68, 0xb4a754, 0x909b5b, 0x648b65, 0x8b917c].map((c) => new THREE.Color(c));
  const regionAt = (t) => t < .09 || t > .95 ? 0 : t < .255 ? 1 : t < .415 ? 2 : t < .56 ? 3 : t < .72 ? 4 : 5;
  const bends=Array.from({length:1800},(_,i)=>{
    const a=route.road.sample(i/1800-6/route.road.length).heading,b=route.road.sample(i/1800+6/route.road.length).heading;
    return Math.atan2(Math.sin(b-a),Math.cos(b-a))/12;
  });
  const curvature=(t)=>bends[Math.floor(((t%1+1)%1)*1800)%1800];
  const bandLimit=(q)=>{const k=curvature(q.t);return q.lateral*k>0?Math.min(100,.62/Math.max(.0001,Math.abs(k))):100;};
  const branchOwnsGround = (x, z, radius) => {
    const q = route.branchQuery(x, z, radius);
    if (!q || q.distance > radius || q.line.anchors.some((a) => Math.hypot(x - a.x, z - a.z) < 72)) return false;
    const bridge = q.line.def.bridge;
    return !bridge || q.t < bridge.from || q.t > bridge.to;
  };
  function tint(x, y, z, q) {
    color.copy(basePalette[regionAt(q.t)]);
    const patch = Math.sin(x * .021 + Math.sin(z * .014) * 1.8) * Math.cos(z * .024 + Math.sin(x * .013));
    color.lerp(grass, Math.max(0, patch) * .22);
    if (y < 3) color.lerp(new THREE.Color(0xc1ae7e), .8);
    if (q.distance < 15) color.lerp(new THREE.Color(0xaaa27b), (1 - smooth(9.5, 15, q.distance)) * .43);
    if (y > 240) color.lerp(rock, smooth(240, 330, y) * .52);
    color.multiplyScalar(.94 + Math.sin(x * .07 + Math.cos(z * .047)) * .045);
    return [color.r, color.g, color.b];
  }
  function makeMesh(positions, colors, indices, name) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true; mesh.name = name; scene.add(mesh); return mesh;
  }
  const size = 360, step = 4500 / size, vertices = [], colors = [], indices = [], distances = [], branchCoverage = [];
  for (let z = 0; z <= size; z++) for (let x = 0; x <= size; x++) {
    const xx = -2250 + x * step, zz = -2250 + z * step, q = route.query(xx, zz);
    const y = landscape.height(xx, zz, q);
    vertices.push(xx, y, zz); colors.push(...tint(xx, y, zz, q)); distances.push(q.distance / Math.max(15,bandLimit(q)-25));
    branchCoverage.push(branchOwnsGround(xx, zz, 28));
  }
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const n = z * (size + 1) + x, ns = [n, n + 1, n + size + 1, n + size + 2];
    if (ns.every((i) => distances[i] < 1) || ns.every((i) => branchCoverage[i])) continue;
    indices.push(n, n + size + 1, n + 1, n + 1, n + size + 1, n + size + 2);
  }
  const terrain = makeMesh(vertices, colors, indices, 'textured-smooth-island');
  const cross = [-110,-100,-85,-70,-56,-45,-36,-29,-23,-18,-14,-11,-9.4,-7,-5,-3,0,3,5,7,9.4,11,14,18,23,29,36,45,56,70,85,100,110];
  const segments = Math.ceil(route.road.length / 2.2), bandVertices = [], bandColors = [], bandIndices = [], bandBranchCoverage = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    for (const side of cross) {
      const k=curvature(t),limited=side*k>0?side*Math.min(1,.69/Math.max(.0001,Math.abs(k)*110)):side;
      const f = route.frame(t, limited), q = route.query(f.position.x, f.position.z);
      const y = landscape.height(f.position.x, f.position.z, q) + .018;
      bandVertices.push(f.position.x, y, f.position.z); bandColors.push(...tint(f.position.x, y, f.position.z, q));
      bandBranchCoverage.push(branchOwnsGround(f.position.x, f.position.z, 30));
    }
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < cross.length - 1; j++) {
    const n = i * cross.length + j;
    if ([n, n + cross.length, n + 1, n + cross.length + 1].every((index) => bandBranchCoverage[index])) continue;
    bandIndices.push(n, n + cross.length, n + 1, n + 1, n + cross.length, n + cross.length + 1);
  }
  makeMesh(bandVertices, bandColors, bandIndices, 'detailed-roadside-landform');

  // A finer skirt around each branch keeps its cut-and-fill shoulders readable at
  // 12.5 m terrain resolution. Quads within 58 m of a junction are skipped so the
  // main skirt and the neighbouring branch skirt own that ground without z-fighting.
  const branchCross = [-32, -24, -18, -13, -9.5, -6.5, -4.5, -2, 0, 2, 4.5, 6.5, 9.5, 13, 18, 24, 32];
  const branchVertices = [], branchColors = [], branchIndices = [];
  const shoulderColor = new THREE.Color(0xaaa27b);
  for (const line of route.branches) {
    const segments = Math.max(24, Math.ceil(line.length / 3.0));
    const base = branchVertices.length / 3;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      for (const side of branchCross) {
        const f = line.frame(t, side), q = route.query(f.position.x, f.position.z);
        const y = landscape.height(f.position.x, f.position.z, q) + 0.016;
        branchVertices.push(f.position.x, y, f.position.z);
        const [r, g, b] = tint(f.position.x, y, f.position.z, q);
        color.setRGB(r, g, b).lerp(shoulderColor, (1 - smooth(10.5, 20, Math.abs(side))) * 0.36);
        branchColors.push(color.r, color.g, color.b);
      }
    }
    for (let i = 0; i < segments; i++) {
      const t = (i + 0.5) / segments, bridge = line.def.bridge;
      if (bridge && t >= bridge.from && t <= bridge.to) continue;
      const mid = line.frame((i + 0.5) / segments, 0).position;
      if (line.anchors.some((a) => Math.hypot(a.x - mid.x, a.z - mid.z) < 58)) continue;
      for (let j = 0; j < branchCross.length - 1; j++) {
        const n = base + i * branchCross.length + j;
        branchIndices.push(n, n + branchCross.length, n + 1, n + 1, n + branchCross.length, n + branchCross.length + 1);
      }
    }
  }
  makeMesh(branchVertices, branchColors, branchIndices, 'detailed-branch-landform');
  addMountainLayers(scene);
  return terrain;
}

function addMountainLayers(scene) {
  const rng = seededRandom(71092);
  const ranges = [
    { x: -2500, z: 2500, width: 3000, depth: 970, height: 590, yaw: -.61, color: 0x667d83 },
    { x: 800, z: 3500, width: 3900, depth: 1150, height: 650, yaw: .19, color: 0x75899a },
    { x: -4100, z: 800, width: 2100, depth: 850, height: 480, yaw: -1.05, color: 0x7c8a99 },
    { x: -600, z: 5100, width: 4900, depth: 1100, height: 810, yaw: -.13, color: 0x8a98a8 },
  ];
  for (const [rangeIndex, range] of ranges.entries()) {
    const nx = 115, nz = 18, positions = [], colors = [], indices = [], baseColor = new THREE.Color(range.color);
    for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
      const u = x / nx, v = z / nz;
      const ridge = .62 + Math.sin(u * 17 + rangeIndex * 1.1) * .16 + Math.sin(u * 39 + .6) * .10 + Math.sin(u * 76) * .045;
      const valley = .63 + .37 * Math.abs(Math.sin(u * 9 + rangeIndex));
      const profile = Math.sin(v * Math.PI) ** 1.4;
      const edge = smooth(0,.1,u) * (1 - smooth(.88,1,u));
      const xx = (u - .5) * range.width, zz = (v - .5) * range.depth;
      const y = ridge * profile * edge * valley * range.height - 30;
      positions.push(range.x + Math.cos(range.yaw) * xx + Math.sin(range.yaw) * zz, y, range.z - Math.sin(range.yaw) * xx + Math.cos(range.yaw) * zz);
      const c = baseColor.clone().multiplyScalar(.89 + rng() * .05 + ridge * .12);
      if (y > 470) c.lerp(new THREE.Color(0xb4b8b5), smooth(470,720,y) * .4);
      colors.push(c.r, c.g, c.b);
    }
    for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const n = z * (nx + 1) + x; indices.push(n,n + nx + 1,n + 1,n + 1,n + nx + 1,n + nx + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3)); geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,envMapIntensity:.15}));
    mesh.name = `layered-mountain-range-${rangeIndex}`; scene.add(mesh);
  }
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
