import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom, TAU, smooth } from './route.js';

const matte = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const dummy = new THREE.Object3D();

function instances(scene, geometry, material, items, name = '') {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = name;
  for (let i = 0; i < items.length; i++) {
    const p = items[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.rx || 0, p.yaw || 0, p.rz || 0, 'YXZ');
    dummy.scale.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
    if (p.color != null) mesh.setColorAt(i, new THREE.Color(p.color));
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
  return mesh;
}

function addMesh(scene, geometry, material, x, y, z, sx = 1, sy = 1, sz = 1, yaw = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.y = yaw;
  scene.add(mesh); return mesh;
}

function roofGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5, 0, -.5, .5, 0, -.5, 0, .65, -.5,
    -.5, 0, .5, .5, 0, .5, 0, .65, .5,
  ], 3));
  g.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4, 0, 1, 4, 0, 4, 3]);
  g.computeVertexNormals(); return g;
}

function localPoint(x, z, yaw, xx, zz) {
  return { x: x + xx * Math.cos(yaw) + zz * Math.sin(yaw), z: z - xx * Math.sin(yaw) + zz * Math.cos(yaw) };
}

function addVegetation(scene, route, landscape, rng) {
  const trunks = [], crowns = [], pines = [], shadows = [], rocks = [], flowers = [];
  const broadColors = [0x7d9148, 0xad9e37, 0xb67b29, 0xb2582d, 0x923f31, 0xc28a31];
  const lakeView = route.frame(.616).position, summitView = route.frame(.762).position;
  for (let i = 0; i < 5100; i++) {
    const t = rng();
    if (t > 0.26 && t < 0.41 && rng() < 0.76) continue;
    if ((t < .07 || t > .965) && rng() < .4) continue;
    const side = (rng() < .5 ? -1 : 1) * (21 + rng() ** 1.8 * 240);
    const inTown = t < .105 || t > .965;
    if (inTown && side > 0) continue;
    if (t > .09 && t < .155 && side > 0 && side < 180) continue;
    const f = route.frame(t, side);
    const x = f.position.x + (rng() - .5) * 12, z = f.position.z + (rng() - .5) * 12;
    if (Math.hypot(x - lakeView.x, z - lakeView.z) < 270) continue;
    if (Math.hypot(x - summitView.x, z - summitView.z) < 230) continue;
    if (t > .715 && t < .835 && side > 0) continue;
    const y = landscape.height(x, z);
    if (y < 4 || route.query(x, z).distance < 18) continue;
    const lakeR = Math.hypot((x - landscape.lake.x) / landscape.lake.rx, (z - landscape.lake.z) / landscape.lake.rz);
    if (lakeR < 1.05 || landscape.riverQuery(x, z).distance < 18) continue;
    if (landscape.pads.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + 10)) continue;
    if (Math.hypot(x - landscape.lighthouse.x, z - landscape.lighthouse.z) < 38) continue;
    if (Math.abs(landscape.height(x + 5, z) - y) > 6 || Math.abs(landscape.height(x, z + 5) - y) > 6) continue;
    const pine = t > .57 && t < .91 && rng() < .77;
    const h = ((pine ? 16 : 10) + rng() * (pine ? 13 : 9)) * (inTown ? .64 : 1);
    const radius = h * (pine ? .25 : .37);
    trunks.push({ x, y: y + h * .3, z, sx: .55 + h * .025, sy: h * .6, sz: .55 + h * .025, color: pine ? 0x685e50 : 0x826849 });
    if (pine) pines.push({ x, y: y + h * .18, z, sx: radius, sy: h * .88, sz: radius, yaw: rng() * TAU, color: rng() > .5 ? 0x315a49 : 0x497253 });
    else crowns.push({ x, y: y + h * .7, z, sx: radius, sy: h * .42, sz: radius * .88, yaw: rng() * TAU, color: broadColors[Math.floor(rng() * broadColors.length)] });
    const shadowX = x + h * .28, shadowZ = z + h * .45;
    shadows.push({ x: shadowX, y: route.road.groundHeight(shadowX, shadowZ) + .085, z: shadowZ, sx: radius * 1.3, sy: 1, sz: radius * 1.9, yaw: .55 });
  }
  for (let i = 0; i < 560; i++) {
    const t = rng(), f = route.frame(t, (rng() < .5 ? -1 : 1) * (23 + rng() * 160));
    const x = f.position.x, z = f.position.z, y = landscape.height(x, z);
    if (route.query(x, z).distance < 20 || y < -7) continue;
    const size = 1.5 + rng() ** 2 * (t > .09 && t < .155 ? 4.5 : 9.5);
    rocks.push({ x, y: y + size * .27, z, sx: size, sy: size * (.55 + rng() * .45), sz: size * .78, yaw: rng() * TAU, color: t < .26 ? 0x9f9487 : 0x8c8c8c });
  }
  for (let i = 0; i < 2200; i++) {
    const t = .26 + rng() * .17, f = route.frame(t, (rng() < .45 ? -1 : 1) * (21 + rng() * 130));
    const y = landscape.height(f.position.x, f.position.z);
    if (y < 5 || route.query(f.position.x, f.position.z).distance < 18) continue;
    flowers.push({ x: f.position.x, y: y + .7, z: f.position.z, sx: .7 + rng(), sy: 1 + rng(), sz: .7 + rng(), yaw: rng() * TAU, color: rng() < .75 ? 0xd2b749 : 0xe6ca6b });
  }
  instances(scene, new THREE.CylinderGeometry(.65, .9, 1, 5), matte(0xffffff), trunks, 'tree-trunks');
  const canopy = mergeGeometries([
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.IcosahedronGeometry(.8, 0).translate(.35, .17, .22),
  ]);
  instances(scene, canopy, matte(0xffffff), crowns, 'autumn-tree-crowns');
  const pineGeometry = mergeGeometries([
    new THREE.ConeGeometry(1, .58, 6).translate(0, .29, 0),
    new THREE.ConeGeometry(.78, .56, 6).translate(0, .56, 0),
    new THREE.ConeGeometry(.55, .5, 6).translate(0, .78, 0),
  ]);
  instances(scene, pineGeometry, matte(0xffffff), pines, 'pine-forest');
  instances(scene, new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3f5145, transparent: true, opacity: .17, depthWrite: false }), shadows, 'tree-ground-shadows');
  instances(scene, new THREE.DodecahedronGeometry(1, 0), matte(0xffffff), rocks, 'roadside-rocks');
  const grass = new THREE.BufferGeometry();
  grass.setAttribute('position', new THREE.Float32BufferAttribute([-.6, 0, 0, .2, 1.2, 0, .6, 0, 0, 0, 0, -.6, 0, 1.4, .1, 0, 0, .6], 3));
  grass.computeVertexNormals();
  instances(scene, grass, new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: false, side: THREE.DoubleSide }), flowers, 'golden-wheat');
}

function addBuildings(scene, route, landscape, rng) {
  const walls = [], roofs = [], windows = [], doors = [], chimneys = [], awnings = [];
  const wallColors = [0xe2c4a0, 0xd1a887, 0xd8cbad, 0xc9977b, 0x9eabad, 0xceb283];
  const roofColors = [0x845c52, 0x9d6852, 0x6c7376, 0xae795a];
  const house = (x, z, yaw, w, h, depth, type = 0) => {
    const y = landscape.height(x, z);
    if (y < 5 || route.query(x, z).distance < Math.max(w, depth) * .65 + 14) return;
    walls.push({ x, y: y + h / 2, z, sx: w, sy: h, sz: depth, yaw, color: wallColors[Math.floor(rng() * wallColors.length)] });
    roofs.push({ x, y: y + h, z, sx: w * 1.17, sy: h * .55, sz: depth * 1.16, yaw, color: roofColors[Math.floor(rng() * roofColors.length)] });
    const front = depth * .505;
    for (const xx of [-w * .27, w * .27]) {
      for (const yy of h > 11 ? [h * .4, h * .76] : [h * .65]) {
        const p = localPoint(x, z, yaw, xx, front);
        windows.push({ ...p, y: y + yy, sx: w * .16, sy: h * .15, sz: .18, yaw });
      }
    }
    for (const xx of [-w * .505, w * .505]) {
      for (const zz of [-depth * .25, depth * .25]) {
        const p = localPoint(x, z, yaw, xx, zz);
        windows.push({ ...p, y: y + h * .65, sx: .18, sy: h * .19, sz: depth * .18, yaw });
      }
    }
    const door = localPoint(x, z, yaw, 0, front + .03);
    doors.push({ ...door, y: y + h * .18, sx: w * .18, sy: h * .36, sz: .2, yaw });
    const chimney = localPoint(x, z, yaw, w * .24, -depth * .15);
    chimneys.push({ ...chimney, y: y + h * 1.25, sx: 1.2, sy: h * .43, sz: 1.2, yaw });
    if (type === 1) {
      const p = localPoint(x, z, yaw, 0, front + 1.8);
      awnings.push({ ...p, y: y + h * .38, sx: w * .9, sy: .4, sz: 3.6, yaw, color: rng() < .5 ? 0xc27d57 : 0x6d9990 });
    }
  };
  for (let i = 0; i < 64; i++) {
    const t = i < 52 ? -.027 + (i % 26) * .0044 : .3 + rng() * .12;
    const side = (i < 26 ? -1 : 1) * (32 + rng() * 28);
    if (i < 52 && side > 0 && (t < .052 || t > .95)) continue;
    const f = route.frame(t, side);
    house(f.position.x, f.position.z, f.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2), 8 + rng() * 8, 6.5 + rng() * 5, 8 + rng() * 6, i < 52 ? 1 : 0);
  }
  for (let i = 0; i < 7; i++) {
    const f = route.frame(.58 + rng() * .1, -45 - rng() * 40);
    house(f.position.x, f.position.z, f.heading, 11, 7, 10, 0);
  }
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0xffffff), walls, 'village-walls');
  instances(scene, roofGeometry(), matte(0xffffff), roofs, 'village-rooftops');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0x416977), windows, 'village-windows');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0x755b4b), doors, 'village-doors');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0xac8c7b), chimneys, 'village-chimneys');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0xffffff), awnings, 'shop-awnings');
}

function addFurniture(scene, route, landscape, rng) {
  const posts = [], rails = [], lamps = [], lanterns = [], signPosts = [], signBoards = [], arrows = [], boards = [], benches = [];
  for (let i = 0; i < route.road.length / 18; i++) {
    const t = i * 18 / route.road.length;
    const coast = t > .075 && t < .265;
    const mountain = t > .708 && t < .923;
    if (!coast && !mountain) continue;
    for (const side of coast ? [8.1] : [-8.1, 8.1]) {
      const a = route.frame(t, side), b = route.frame(t + 18 / route.road.length, side);
      posts.push({ x: a.position.x, y: a.position.y + .8, z: a.position.z, sx: .28, sy: 1.6, sz: .28 });
      rails.push({ x: (a.position.x + b.position.x) / 2, y: (a.position.y + b.position.y) / 2 + 1.35, z: (a.position.z + b.position.z) / 2, sx: .25, sy: .38, sz: a.position.distanceTo(b.position) + .5, yaw: Math.atan2(b.position.x - a.position.x, b.position.z - a.position.z) });
    }
  }
  for (let i = 0; i < 26; i++) {
    const t = -.018 + i * .0042, f = route.frame(t, -11.1);
    lamps.push({ x: f.position.x, y: f.position.y + 3.7, z: f.position.z, sx: .18, sy: 7.4, sz: .18 });
    lanterns.push({ x: f.position.x, y: f.position.y + 7.7, z: f.position.z, sx: .7, sy: 1, sz: .7 });
  }
  const sceneColors = [0x628d8d, 0x6296a2, 0xb89e58, 0xb57a54, 0x718e70, 0x8e82a1];
  [.075, .245, .405, .55, .71, .944].forEach((t, i) => {
    const f = route.frame(t, 12.7);
    signPosts.push({ x: f.position.x, y: f.position.y + 2.3, z: f.position.z, sx: .22, sy: 4.6, sz: .22 });
    signBoards.push({ x: f.position.x, y: f.position.y + 4.25, z: f.position.z, sx: 6.2, sy: 2.5, sz: .22, yaw: f.heading, color: sceneColors[i] });
    arrows.push({ x: f.position.x, y: f.position.y + 4.3, z: f.position.z, sx: 1.1, sy: .24, sz: .29, yaw: f.heading });
  });
  for (const pad of landscape.pads) {
    const apron = new THREE.CircleGeometry(pad.radius - 4, 20).rotateX(-Math.PI / 2);
    const attribute = apron.attributes.position;
    for (let i = 0; i < attribute.count; i++) {
      const x = pad.x + attribute.getX(i), z = pad.z + attribute.getZ(i);
      attribute.setXYZ(i, x, landscape.height(x, z) + .075, z);
    }
    apron.computeVertexNormals();
    scene.add(new THREE.Mesh(apron, matte(0xb4ab96)));
    for (let i = -2; i <= 2; i++) {
      const p = localPoint(pad.x, pad.z, pad.heading, pad.side > 0 ? 15 : -15, i * 8);
      const y = landscape.height(p.x, p.z);
      benches.push({ ...p, y: y + .7, sx: 1.6, sy: .4, sz: 4.7, yaw: pad.heading });
      const back = localPoint(p.x, p.z, pad.heading, pad.side > 0 ? .8 : -.8, 0);
      benches.push({ ...back, y: y + 1.4, sx: .22, sy: 1.2, sz: 4.7, yaw: pad.heading });
    }
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * TAU;
      const x = pad.x + Math.cos(angle) * (pad.radius - 5), z = pad.z + Math.sin(angle) * (pad.radius - 5);
      const q = route.query(x, z);
      if (q.distance < 17) continue;
      posts.push({ x, y: landscape.height(x, z) + .8, z, sx: .4, sy: 1.6, sz: .4 });
      const b = { x: pad.x + Math.cos(angle + TAU / 12) * (pad.radius - 5), z: pad.z + Math.sin(angle + TAU / 12) * (pad.radius - 5) };
      rails.push({ x: (x + b.x) / 2, y: (landscape.height(x, z) + landscape.height(b.x, b.z)) / 2 + 1.35, z: (z + b.z) / 2, sx: .35, sy: .32, sz: Math.hypot(b.x - x, b.z - z), yaw: Math.atan2(b.x - x, b.z - z) });
    }
  }
  for (const t of [.009, .023, .038, .054]) {
    const f = route.frame(t, 95);
    const yaw = f.heading + Math.PI / 2;
    boards.push({ x: f.position.x, y: -.55, z: f.position.z, sx: 7, sy: 1, sz: 65, yaw });
    for (let i = -2; i <= 2; i++) {
      const p = localPoint(f.position.x, f.position.z, yaw, 2, i * 13);
      posts.push({ ...p, y: -4, sx: .7, sy: 7, sz: .7 });
    }
  }
  // A short timber landing is reachable from the lake turnout.
  const dock = route.frame(.621, -65);
  boards.push({ x: dock.position.x, y: landscape.lake.y + .9, z: dock.position.z, sx: 6, sy: .7, sz: 42, yaw: dock.heading + Math.PI / 2 });
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0xddd6bc), posts, 'guardrail-posts');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0xc8c6ad), rails, 'guardrails');
  instances(scene, new THREE.CylinderGeometry(.7, 1, 1, 5), matte(0x59666a), lamps, 'street-lamps');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xf2d3a2 }), lanterns, 'lamp-lanterns');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0x786c57), signPosts, 'direction-posts');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0xffffff), signBoards, 'direction-signs');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0xf2e7bf), arrows, 'direction-markers');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0x97795a), boards, 'wooden-jetties');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0x836548), benches, 'lookout-benches');
}

function addLighthouse(scene, landscape) {
  const p = landscape.lighthouse;
  const stone = matte(0xc4b69c), cream = matte(0xf0dec0), red = matte(0xaa554c), dark = matte(0x586a72);
  addMesh(scene, new THREE.CylinderGeometry(15, 21, 5, 10), stone, p.x, p.y + 1, p.z);
  addMesh(scene, new THREE.CylinderGeometry(4.3, 6.1, 29, 10), cream, p.x, p.y + 17.3, p.z);
  addMesh(scene, new THREE.CylinderGeometry(4.85, 5.13, 5.2, 10), red, p.x, p.y + 19, p.z);
  addMesh(scene, new THREE.CylinderGeometry(6.2, 6.2, 1.4, 10), stone, p.x, p.y + 32.4, p.z);
  addMesh(scene, new THREE.CylinderGeometry(3.8, 3.8, 5.6, 8), dark, p.x, p.y + 35.6, p.z);
  addMesh(scene, new THREE.CylinderGeometry(3.85, 3.85, 3.2, 8), new THREE.MeshBasicMaterial({ color: 0xf2c983 }), p.x, p.y + 35.7, p.z);
  addMesh(scene, new THREE.ConeGeometry(6.2, 5.4, 8), red, p.x, p.y + 40.9, p.z);
  addMesh(scene, new THREE.BoxGeometry(1, 1, 1), dark, p.x, p.y + 4, p.z + 5.9, 2.3, 5.4, .3);
  const strips = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    strips.push({ x: p.x + Math.sin(a) * 3.9, y: p.y + 35.6, z: p.z + Math.cos(a) * 3.9, sx: .28, sy: 5.7, sz: .28 });
  }
  instances(scene, new THREE.BoxGeometry(1, 1, 1), dark, strips, 'lighthouse-window-frames');
}

function addBridge(scene, route, landscape) {
  const stone = matte(0xa69a88), lighter = matte(0xc2b39a), pillars = [], arches = [], parapets = [];
  const middle = route.frame(landscape.bridgeT);
  for (const d of [-56, -19, 19, 56]) {
    const f = route.frame(landscape.bridgeT + d / route.road.length);
    const base = landscape.height(f.position.x, f.position.z);
    const h = Math.max(3, f.position.y - base - .8);
    for (const side of [-8.9, 8.9]) {
      const p = localPoint(f.position.x, f.position.z, f.heading, side, 0);
      pillars.push({ ...p, y: base + h / 2, sx: 4.5, sy: h, sz: 6.4, yaw: f.heading });
    }
  }
  for (const d of [-37, 0, 37]) {
    const f = route.frame(landscape.bridgeT + d / route.road.length);
    for (const side of [-8.9, 8.9]) {
      const p = localPoint(f.position.x, f.position.z, f.heading, side, 0);
      arches.push({ ...p, y: f.position.y - 12.3, sx: 1, sy: .88, sz: 1, yaw: f.heading + Math.PI / 2 });
    }
  }
  for (let i = -7; i < 7; i++) {
    const t = landscape.bridgeT + i * 8 / route.road.length;
    for (const side of [-8.85, 8.85]) {
      const f = route.frame(t, side);
      parapets.push({ x: f.position.x, y: f.position.y + .9, z: f.position.z, sx: .9, sy: 1.8, sz: 8.3, yaw: f.heading });
    }
  }
  instances(scene, new THREE.BoxGeometry(1, 1, 1), stone, pillars, 'stone-bridge-piers');
  instances(scene, new THREE.TorusGeometry(17, 2.8, 4, 12, Math.PI), stone, arches, 'stone-bridge-arches');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), lighter, parapets, 'stone-bridge-parapets');
  addMesh(scene, new THREE.BoxGeometry(1, 1, 1), stone, middle.position.x, middle.position.y - 1.1, middle.position.z, 19, 2, 119, middle.heading);
}

function addSummit(scene, route) {
  const f = route.frame(.762, 34), base = f.position;
  const stone = matte(0xa9a2a0), bronze = matte(0xad8e62);
  addMesh(scene, new THREE.CylinderGeometry(7, 9, 2, 8), stone, base.x, base.y + .7, base.z);
  addMesh(scene, new THREE.TorusGeometry(5.1, .55, 5, 20), bronze, base.x, base.y + 7.5, base.z, 1, 1, 1, f.heading);
  addMesh(scene, new THREE.BoxGeometry(1, 1, 1), bronze, base.x, base.y + 4.4, base.z, .6, 7, .6);
  const flagPoles = [], flags = [];
  for (let i = 0; i < 5; i++) {
    const p = route.frame(.752 + i * .004, 11.5);
    flagPoles.push({ x: p.position.x, y: p.position.y + 4, z: p.position.z, sx: .14, sy: 8, sz: .14 });
    flags.push({ x: p.position.x + 1.6, y: p.position.y + 6.6, z: p.position.z, sx: 3.2, sy: 1.8, sz: .07, yaw: .2, color: [0xbf775d, 0xd3ad65, 0x749a9d, 0xa88b9a, 0xcaad80][i] });
  }
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0x7f7772), flagPoles, 'summit-flagpoles');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0xffffff), flags, 'summit-flags');
}

function addBoats(scene, route, rng) {
  const hulls = [], decks = [], masts = [], sails = [];
  for (let i = 0; i < 18; i++) {
    const t = -.01 + rng() * .075, f = route.frame(t, 106 + rng() * 130);
    const yaw = rng() * .7 + f.heading;
    hulls.push({ x: f.position.x, y: -1.3, z: f.position.z, sx: 4 + rng() * 2, sy: 1.7, sz: 10 + rng() * 5, yaw, color: [0x9e6d5c, 0x72999d, 0xddd4b7][i % 3] });
    decks.push({ x: f.position.x, y: -.2, z: f.position.z, sx: 2.3, sy: 1.2, sz: 4.2, yaw });
    if (i % 2 === 0) {
      masts.push({ x: f.position.x, y: 5.4, z: f.position.z, sx: .13, sy: 11, sz: .13 });
      sails.push({ x: f.position.x, y: 2.8, z: f.position.z, sx: 5, sy: 7.8, sz: 1, yaw });
    }
  }
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0xffffff), hulls, 'harbor-boats');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0xdfd5b8), decks, 'boat-cabins');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0x9b8d72), masts, 'boat-masts');
  const sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 1, 0, 0], 3)); sail.computeVertexNormals();
  instances(scene, sail, new THREE.MeshLambertMaterial({ color: 0xe5d9b7, side: THREE.DoubleSide }), sails, 'cream-sails');
}

function addBayIslands(scene, route) {
  const points = [[.978, 150, 42, 18], [.023, 445, 90, 36], [.076, 660, 160, 62], [.956, 610, 120, 47]];
  const rocks = [];
  for (const [t, side, radius, height] of points) {
    const p = route.frame(t, side).position;
    rocks.push({ x: p.x, y: height / 2 - 7, z: p.z, sx: radius, sy: height, sz: radius * .76, yaw: t * TAU, color: t === .978 ? 0x9a9583 : 0x9c9a82 });
  }
  instances(scene, new THREE.CylinderGeometry(.55, 1, 1, 8), matte(0xffffff), rocks, 'bay-rock-islands');
  const p = route.frame(.978, 150).position, base = 11;
  addMesh(scene, new THREE.CylinderGeometry(2.5, 3.7, 15, 8), matte(0xe7d9b8), p.x, base + 7.5, p.z);
  addMesh(scene, new THREE.CylinderGeometry(2.8, 3, 3.4, 8), matte(0xb76b53), p.x, base + 10, p.z);
  addMesh(scene, new THREE.CylinderGeometry(2.7, 2.7, 3.2, 8), matte(0x576c73), p.x, base + 16.2, p.z);
  addMesh(scene, new THREE.ConeGeometry(4, 3.5, 8), matte(0x9d5c4d), p.x, base + 19.4, p.z);
}

function addWindmills(scene, route, landscape) {
  const mills = [.286, .314, .349, .382].map((t, i) => {
    const f = route.frame(t, i % 2 ? 90 : -68);
    return { x: f.position.x, y: landscape.height(f.position.x, f.position.z), z: f.position.z, yaw: f.heading, phase: i * 1.2 };
  });
  instances(scene, new THREE.CylinderGeometry(1.2, 2.8, 1, 7), matte(0xdbd4b9), mills.map((m) => ({ ...m, y: m.y + 14, sy: 28 })), 'windmill-towers');
  instances(scene, new THREE.ConeGeometry(3.6, 4, 7), matte(0x907764), mills.map((m) => ({ ...m, y: m.y + 29 })), 'windmill-roofs');
  const blades = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), matte(0xe5dcc1), mills.length * 4);
  blades.name = 'turning-windmill-sails'; scene.add(blades);
  const update = (time) => {
    mills.forEach((m, i) => {
      for (let j = 0; j < 4; j++) {
        const a = time * .17 + m.phase + j * Math.PI / 2;
        dummy.position.set(m.x + Math.cos(m.yaw) * Math.cos(a) * 5.8, m.y + 25 + Math.sin(a) * 5.8, m.z - Math.sin(m.yaw) * Math.cos(a) * 5.8);
        dummy.rotation.set(0, m.yaw, a, 'YXZ'); dummy.scale.set(10.8, 1.2, .35); dummy.updateMatrix();
        blades.setMatrixAt(i * 4 + j, dummy.matrix);
      }
    });
    blades.instanceMatrix.needsUpdate = true;
  };
  update(0); return update;
}

function addFields(scene, route, landscape) {
  const rng = seededRandom(23882), positions = [], colors = [], hay = [], fencePosts = [], fenceRails = [];
  const shades = [0xb7a136, 0x968e32, 0xb28d34, 0x82944b, 0x9eaa55, 0xc3ae4b];
  const add = (a, b, c, color) => {
    for (const p of [a, b, c]) { positions.push(p.x, p.y, p.z); colors.push(color.r, color.g, color.b); }
  };
  for (let i = 0; i < 10; i++) {
    const t = .263 + i * .0141;
    for (const direction of [-1, 1]) {
      const inside = 28 + rng() * 13, outside = inside + 55 + rng() * 58;
      const color = new THREE.Color(shades[(i + (direction > 0 ? 2 : 0)) % shades.length]);
      for (let j = 0; j < 10; j++) {
        for (let k = 0; k < 6; k++) {
          const vertex = (u, v) => {
            const f = route.frame(t + (u / 10 - .5) * .0128, direction * THREE.MathUtils.lerp(inside, outside, v / 6));
            f.position.y = landscape.height(f.position.x, f.position.z) + .11;
            return f.position;
          };
          const a = vertex(j, k), b = vertex(j + 1, k), c = vertex(j, k + 1), d = vertex(j + 1, k + 1);
          const stripe = color.clone().multiplyScalar(k % 2 ? 1.035 : .96);
          if (direction > 0) { add(a, c, b, stripe); add(b, c, d, stripe); }
          else { add(a, b, c, stripe); add(b, d, c, stripe); }
        }
      }
      for (let j = 0; j <= 5; j++) {
        const f = route.frame(t + (j / 5 - .5) * .0128, direction * (inside - 2));
        const y = landscape.height(f.position.x, f.position.z);
        fencePosts.push({ x: f.position.x, y: y + .8, z: f.position.z, sx: .2, sy: 1.6, sz: .2 });
        if (j < 5) {
          const b = route.frame(t + ((j + 1) / 5 - .5) * .0128, direction * (inside - 2));
          fenceRails.push({ x: (f.position.x + b.position.x) / 2, y: (y + landscape.height(b.position.x, b.position.z)) / 2 + 1.1, z: (f.position.z + b.position.z) / 2, sx: .15, sy: .2, sz: f.position.distanceTo(b.position), yaw: Math.atan2(b.position.x - f.position.x, b.position.z - f.position.z) });
        }
      }
      if (i % 2) {
        const f = route.frame(t - .002, direction * (inside + 15));
        hay.push({ x: f.position.x, y: landscape.height(f.position.x, f.position.z) + 1.4, z: f.position.z, sx: 2.1, sy: 2.5, sz: 2.1, yaw: f.heading });
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  mesh.name = 'gold-and-green-field-patches'; scene.add(mesh);
  instances(scene, new THREE.CylinderGeometry(1, 1, 1, 10).rotateX(Math.PI / 2), matte(0xb79a47), hay, 'round-hay-bales');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0x88734b), fencePosts, 'field-fence-posts');
  instances(scene, new THREE.BoxGeometry(1, 1, 1), matte(0x9c8757), fenceRails, 'field-fence-rails');
}

function addDistantMountains(scene) {
  const rng = seededRandom(1711), rings = [3100, 3900, 4600, 5400, 6200], segments = 92;
  const profile = [0, .36, 1, .64, .02], vertices = [], colors = [], grid = [];
  for (let j = 0; j < rings.length; j++) {
    for (let i = 0; i <= segments; i++) {
      const a = -1.85 + i / segments * 3.15;
      const radius = rings[j] + Math.sin(a * 8.4 + j * .7) * 90;
      const ridge = 425 + Math.sin(a * 3.2 + .7) * 64 + Math.sin(a * 8.1) * 35 + Math.sin(a * 17.7 + 1.6) * 14;
      grid.push(new THREE.Vector3(Math.sin(a) * radius, Math.max(-45, ridge * profile[j] - 45), Math.cos(a) * radius));
    }
  }
  const emit = (a, b, c, ring) => {
    const color = new THREE.Color(ring > 1 ? 0x758194 : 0x697c83);
    color.multiplyScalar(.88 + rng() * .2);
    for (const p of [a, b, c]) { vertices.push(p.x, p.y, p.z); colors.push(color.r, color.g, color.b); }
  };
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < segments; i++) {
      const n = j * (segments + 1) + i, a = grid[n], b = grid[n + 1], c = grid[n + segments + 1], d = grid[n + segments + 2];
      emit(a, b, c, j); emit(b, d, c, j);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  mesh.name = 'irregular-distant-mountain-ridges'; scene.add(mesh);
}

export function addScenery(scene, route, landscape) {
  const rng = seededRandom(117352);
  addDistantMountains(scene);
  addVegetation(scene, route, landscape, rng);
  addBuildings(scene, route, landscape, rng);
  addFurniture(scene, route, landscape, rng);
  addLighthouse(scene, landscape);
  addBridge(scene, route, landscape);
  addSummit(scene, route);
  addBoats(scene, route, rng);
  addBayIslands(scene, route);
  addFields(scene, route, landscape);
  const updateMills = addWindmills(scene, route, landscape);
  return { update(time) { updateMills(time); } };
}
