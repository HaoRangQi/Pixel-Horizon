import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom, TAU } from '../route.js';

const up = new THREE.Vector3(0, 1, 0), temp = new THREE.Vector3(), rotation = new THREE.Quaternion();
const matrix = new THREE.Matrix4(), unitScale = new THREE.Vector3(1, 1, 1);

function branch(a, b, radiusA, radiusB, sides = 7) {
  temp.subVectors(b, a); const length = temp.length();
  const geometry = new THREE.CylinderGeometry(radiusB, radiusA, length, sides, 1);
  rotation.setFromUnitVectors(up, temp.normalize());
  matrix.compose(a.clone().add(b).multiplyScalar(.5), rotation, unitScale);
  geometry.applyMatrix4(matrix); return geometry;
}

function cardsGeometry(cards) {
  const positions = [], colors = [], uvs = [];
  const u = new THREE.Vector3(), v = new THREE.Vector3();
  for (const card of cards) {
    rotation.setFromEuler(new THREE.Euler(card.rx, card.ry, card.rz));
    u.set(card.w / 2, 0, 0).applyQuaternion(rotation); v.set(0, card.h / 2, 0).applyQuaternion(rotation);
    const center = new THREE.Vector3(card.x, card.y, card.z);
    const corners = [center.clone().sub(u).sub(v), center.clone().add(u).sub(v), center.clone().add(u).add(v), center.clone().sub(u).add(v)];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      positions.push(...corners[index].toArray()); colors.push(card.shade, card.shade, card.shade);
      uvs.push(index === 1 || index === 2 ? 1 : 0, index >= 2 ? 1 : 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.computeVertexNormals(); return g;
}

function broadleafGeometry(seed, far = false, olive = false) {
  const rng = seededRandom(seed), wood = [], cards = [], tiers = far ? 6 : 11;
  const leanX = (rng() - .5) * .12, leanZ = (rng() - .5) * .12;
  const trunkAt = (y) => new THREE.Vector3(leanX * y + Math.sin(y * 4) * .012, y, leanZ * y);
  for (let i = 0; i < 5; i++) wood.push(branch(trunkAt(i * .16), trunkAt((i + 1) * .16), .027 - i * .004, .023 - i * .004, far ? 5 : 9));
  for (let i = 0; i < tiers; i++) {
    const y = .32 + i / tiers * .47, angle = i * 2.399 + rng() * .5;
    const radius = (olive ? .36 : .28) * (.85 + rng() * .35) * (1 - (y - .38) * .55);
    const a = trunkAt(y), b = a.clone().add(new THREE.Vector3(Math.sin(angle) * radius * .62, .11 + rng() * .09, Math.cos(angle) * radius * .62));
    const c = b.clone().add(new THREE.Vector3(Math.sin(angle + .28) * radius * .56, .07 + rng() * .08, Math.cos(angle + .28) * radius * .56));
    wood.push(branch(a, b, .011 * (1 - i / tiers * .5), .005, far ? 4 : 7));
    if (!far) {
      wood.push(branch(b, c, .005, .0017, 5));
      for (const sign of [-1, 1]) {
        const end = b.clone().add(new THREE.Vector3(Math.sin(angle + sign * .7) * .12, .08, Math.cos(angle + sign * .7) * .12));
        wood.push(branch(b, end, .0035, .001, 4));
      }
    }
    const count = far ? 7 : 23;
    for (let j = 0; j < count; j++) {
      const aa = rng() * TAU, rr = Math.sqrt(rng()) * (olive ? .16 : .18);
      cards.push({ x: c.x + Math.cos(aa) * rr, y: c.y + (rng() - .45) * .2, z: c.z + Math.sin(aa) * rr,
        w: (far ? .22 : .16) * (.7 + rng() * .65), h: (far ? .22 : .17) * (.7 + rng() * .6),
        rx: (rng() - .5) * 2.2, ry: rng() * TAU, rz: (rng() - .5) * 1.8, shade: .77 + rng() * .23 });
    }
  }
  return { wood: mergeGeometries(wood), foliage: cardsGeometry(cards) };
}

function pineGeometry(seed, far = false) {
  const rng = seededRandom(seed), wood = [], cards = [], levels = far ? 7 : 12;
  wood.push(branch(new THREE.Vector3(), new THREE.Vector3(.015, .98, -.012), .022, .002, far ? 5 : 9));
  for (let level = 0; level < levels; level++) {
    const y = .19 + level / levels * .75, radius = (.97 - y) * .32;
    const count = far ? 4 : 6;
    for (let i = 0; i < count; i++) {
      const angle = i / count * TAU + level * 1.7 + rng() * .25;
      const a = new THREE.Vector3(.015 * y, y, -.012 * y), b = a.clone().add(new THREE.Vector3(Math.cos(angle) * radius, -.045, Math.sin(angle) * radius));
      if (!far) wood.push(branch(a, b, .0045 * (1 - y * .6), .001, 4));
      for (let j = 0; j < (far ? 2 : 7); j++) {
        const u = .18 + j / (far ? 2 : 7) * .9, p = a.clone().lerp(b, u);
        cards.push({ x: p.x + (rng() - .5) * radius * .38, y: p.y + (rng() - .3) * .052, z: p.z + (rng() - .5) * radius * .38,
          w: radius * (far ? 1.35 : .93) + .035, h: radius * (far ? 1.7 : 1.12) + .045,
          rx: Math.PI / 2 + (rng() - .5) * .9, ry: angle, rz: angle + (rng() - .5) * .6, shade: .75 + rng() * .25 });
      }
    }
  }
  return { wood: mergeGeometries(wood), foliage: cardsGeometry(cards) };
}

function tuftGeometry(seed, dried = false) {
  const rng = seededRandom(seed), positions = [], colors = [], uvs = [];
  for (let i = 0; i < 13; i++) {
    const angle = rng() * TAU, width = .025 + rng() * .025, height = .25 + rng() * .48;
    const x = (rng() - .5) * .32, z = (rng() - .5) * .32;
    const dx = Math.cos(angle) * width, dz = Math.sin(angle) * width, bend = .1 + rng() * .13;
    const a = [x - dx, 0, z - dz], b = [x + dx, 0, z + dz], c = [x + Math.cos(angle + 1.4) * bend, height, z + Math.sin(angle + 1.4) * bend];
    for (let k = 0; k < 3; k++) {
      positions.push(...[a, b, c][k]); const shade = k === 2 ? 1 : .48 + rng() * .22;
      colors.push(shade, shade, dried ? shade * .83 : shade * .82); uvs.push(k / 2, k === 2 ? 1 : 0);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.computeVertexNormals(); return g;
}

function flowerGeometry() {
  const pieces = [], color = new THREE.Color(), applyColor = (g, hex) => {
    color.setHex(hex); const values = [];
    for (let i = 0; i < g.attributes.position.count; i++) values.push(color.r, color.g, color.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(values, 3)); return g;
  };
  pieces.push(applyColor(new THREE.CylinderGeometry(.009, .014, .48, 4), 0x63814b));
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * TAU;
    pieces.push(applyColor(new THREE.SphereGeometry(.075, 5, 3).scale(1, .25, 1.6).translate(Math.sin(a) * .066, .25, Math.cos(a) * .066), 0xfff5cb));
  }
  pieces.push(applyColor(new THREE.SphereGeometry(.041, 5, 3).translate(0, .272, 0), 0xd9a33c));
  return mergeGeometries(pieces);
}

function rockGeometry(seed) {
  const rng = seededRandom(seed), geometry = new THREE.IcosahedronGeometry(1, 2), colors = [], pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ripple = 1 + Math.sin(x * 7.2 + y * 3.6) * .1 + Math.sin(z * 9 + x * 2) * .07;
    pos.setXYZ(i, x * ripple, Math.max(-.42, y * (.6 + Math.sin(x * 4) * .07)), z * ripple * .82);
    const shade = .77 + rng() * .21; colors.push(shade, shade, shade);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals(); return geometry;
}

export function addVegetation(batches, route, landscape, materials, housePlots = []) {
  const rng = seededRandom(117352), variants = [];
  for (let i = 0; i < 3; i++) {
    variants.push({ kind: 'broad', near: broadleafGeometry(633 + i * 71), far: broadleafGeometry(633 + i * 71, true) });
    variants.push({ kind: 'pine', near: pineGeometry(959 + i * 27), far: pineGeometry(959 + i * 27, true) });
  }
  const grasses = [tuftGeometry(725), tuftGeometry(723), tuftGeometry(727, true)];
  const flower = flowerGeometry(), rocks = [rockGeometry(935), rockGeometry(322), rockGeometry(721)];
  const autumn = [0xe3ae49, 0xd47c3c, 0xc56332, 0xe3bf61, 0xc8843c, 0xd99b44];
  const greens = [0x7d9650, 0x8da05b, 0x839a59, 0xa0aa63, 0x809b56];
  const pines = [0x57795c, 0x638866, 0x5c7e63, 0x73996b];
  const seen = new Set();

  function plantTree(t, lateral, force = false) {
    const f = route.frame(t, lateral), x = f.position.x + (rng() - .5) * 7, z = f.position.z + (rng() - .5) * 7;
    const q = route.query(x, z), y = landscape.height(x, z, q), inTown = q.t < .09 || q.t > .95;
    if (y < 3 || q.distance < (inTown ? 18 : 17)) return;
    const coast = q.t > .065 && q.t < .26;
    if (coast && q.lateral > 12) return;
    if (inTown && q.lateral > 0) return;
    // Views open toward the water; vegetation frames the inland side of the road.
    if (q.t > .575 && q.t < .667 && q.lateral < 0) return;
    if (q.t > .735 && q.t < .79 && q.lateral > 0) return;
    const lakeR = Math.hypot((x - landscape.lake.x) / landscape.lake.rx, (z - landscape.lake.z) / landscape.lake.rz);
    if (lakeR < 1.06 && y < landscape.lake.y + 2) return;
    if (landscape.riverQuery(x, z).distance < 17) return;
    if (landscape.pads.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + 5)) return;
    if (housePlots.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + 4)) return;
    if (Math.hypot(x - landscape.lighthouse.x, z - landscape.lighthouse.z) < 45) return;
    const key = `${Math.round(x / 7)}:${Math.round(z / 7)}`;
    if (seen.has(key)) return;
    if (!force && (Math.abs(landscape.height(x + 5, z) - y) > 7 || Math.abs(landscape.height(x, z + 5) - y) > 7)) return;
    seen.add(key);
    const pine = q.t > .56 && q.t < .94 ? rng() < .86 : coast && rng() < .22;
    const variantIndex = Math.floor(rng() * 3) * 2 + (pine ? 1 : 0), variant = variants[variantIndex];
    const height = (pine ? 10 + rng() * 12 : 8.5 + rng() * 8.5) * (inTown ? .8 : 1) * (q.t > .72 && q.distance < 50 ? .7 : 1);
    const autumnal = q.t > .413 && q.t < .56;
    const palette = pine ? pines : autumnal ? autumn : greens;
    const leafColor = palette[Math.floor(rng() * palette.length)];
    const p = { x, y: y - .15, z, sx: height * (.9 + rng() * .18), sy: height, sz: height * (.87 + rng() * .18), yaw: rng() * TAU };
    for (const [level, geometry] of [['tree-near', variant.near], ['tree-far', variant.far]]) {
      batches.add(`tree-branches-${variantIndex}`, geometry.wood, materials.bark, { ...p, color: 0xc0ae97 }, { band: level, shadow: level === 'tree-near' });
      batches.add(`tree-leaves-${variantIndex}`, geometry.foliage, pine ? materials.needles : materials.leaves,
        { ...p, color: leafColor }, { band: level, shadow: level === 'tree-near' });
    }
    batches.stats.treeCount++;
  }

  // Authored spacing along the verge gives the driving camera readable trunks and branches.
  for (let i = 0; i < route.road.length / 17; i++) {
    const t = i * 17 / route.road.length;
    if (t > .26 && t < .415 && i % 6) continue;
    for (const side of [-1, 1]) {
      if (rng() < .23) continue;
      plantTree(t + (rng() - .5) * .0017, side * (20 + rng() * 24), true);
      if (t > .415 && rng() < .66) plantTree(t, side * (50 + rng() * 38));
    }
  }
  for (let i = 0; i < 2550; i++) {
    const t = rng();
    if (t > .255 && t < .415 && rng() < .86) continue;
    plantTree(t, (rng() < .5 ? -1 : 1) * (55 + rng() ** 1.2 * 320));
  }

  // Fine, low silhouettes occupy the bare verge without hiding the water.
  for (let i = 0; i < 18500; i++) {
    const t = rng(), distance = 10.7 + rng() ** 1.8 * 35, side = rng() < .5 ? -1 : 1;
    const f = route.frame(t, side * distance), x = f.position.x, z = f.position.z, y = landscape.height(x, z);
    if (y < 3 || route.query(x, z).distance < 10.3) continue;
    const lakeR = Math.hypot((x - landscape.lake.x) / landscape.lake.rx, (z - landscape.lake.z) / landscape.lake.rz);
    if (lakeR < 1.02 && y < landscape.lake.y + .4) continue;
    if (landscape.pads.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius - 5)) continue;
    if (housePlots.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius)) continue;
    if (landscape.riverQuery(x, z).distance < 12) continue;
    const field = t > .255 && t < .415, alpine = t > .72 && t < .94;
    const scale = .7 + rng() * (field ? 1.4 : .9);
    batches.add('verge-grasses', grasses[i % 3], materials.plant, { x, y: y - .035, z, sx: scale, sy: scale, sz: scale, yaw: rng() * TAU,
      color: field ? 0xa39b48 : alpine ? 0x7c815e : t > .415 && t < .56 ? 0x9a8c53 : 0x71854c }, { band: 'detail', shadow: false });
    if (i % 9 === 0 && !alpine) batches.add('verge-wildflowers', flower, materials.plant,
      { x: x + .23, y: y + .25, z, sx: scale, sy: scale, sz: scale, color: i % 3 === 0 ? 0xe1b8ac : 0xf8eed3, yaw: rng() * TAU }, { band: 'detail', shadow: false });
  }

  for (let i = 0; i < 1850; i++) {
    const t = rng(), side = (rng() < .5 ? -1 : 1), far = i < 400;
    const f = route.frame(t, side * (far ? 36 + rng() * 150 : 10.8 + rng() * 8)), x = f.position.x, z = f.position.z, y = landscape.height(x, z);
    if (y < -3 || route.query(x, z).distance < 10.5) continue;
    if (Math.hypot((x - landscape.lake.x) / landscape.lake.rx, (z - landscape.lake.z) / landscape.lake.rz) < 1.03 && y < landscape.lake.y) continue;
    const scale = far ? .7 + rng() ** 2 * 2.8 : .1 + rng() ** 2 * .55;
    batches.add('weathered-verge-stones', rocks[i % 3], materials.rock,
      { x, y: y + scale * .1, z, sx: scale, sy: scale, sz: scale, yaw: rng() * TAU, color: t < .26 ? 0xb4a58d : 0xa3a19a }, { band: far ? 'structure' : 'detail', shadow: far });
  }

  // A thin scatter of real leaf-shaped cards rather than a flat orange carpet.
  const fallen = new THREE.PlaneGeometry(.16, .23).rotateX(-Math.PI / 2);
  const fallenMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .96, side: THREE.DoubleSide });
  for (let i = 0; i < 1400; i++) {
    const t = .415 + rng() * .145, f = route.frame(t, (rng() < .5 ? -1 : 1) * (9.8 + rng() * 17));
    const y = landscape.height(f.position.x, f.position.z);
    if (route.query(f.position.x, f.position.z).distance < 9.3) continue;
    batches.add('fallen-autumn-leaves', fallen, fallenMat, { x: f.position.x, y: y + .05, z: f.position.z, yaw: rng() * TAU,
      rx: (rng() - .5) * .2, sx: .6 + rng() * .9, sz: .6 + rng() * .8, color: autumn[i % autumn.length] }, { band: 'detail', shadow: false });
  }
}
