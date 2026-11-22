import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU, seededRandom } from '../route.js';
import { point, BOX } from './batches.js';
import { signMaterial } from './materials.js';

const horizontal = (p, height) => ({ ...p, y: p.y + height });
const circle = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);

export function addLighthouse(batches, route, landscape, m) {
  const p = landscape.lighthouse, base = p.y + .05;
  const tower = new THREE.CylinderGeometry(3.1, 4.5, 27, 32);
  const rings = [new THREE.CylinderGeometry(4.7, 4.7, .65, 32), new THREE.CylinderGeometry(3.7, 3.7, .6, 32)];
  batches.add('lighthouse-stone-terrace', new THREE.CylinderGeometry(13.8, 15.6, 2.2, 40), m.stone, { x: p.x, y: base + .8, z: p.z, color: 0xc2b69d });
  batches.add('lighthouse-ivory-tower', tower, m.plaster, { x: p.x, y: base + 15.1, z: p.z, color: 0xeadbc0 });
  batches.add('lighthouse-red-belt', new THREE.CylinderGeometry(3.48, 3.66, 2.8, 32), m.plaster, { x: p.x, y: base + 20.4, z: p.z, color: 0xa84f3e });
  for (const [y, radius] of [[2.1,4.65], [3,4.48], [27.8,3.25], [29,4.7]]) {
    batches.add('lighthouse-mouldings', rings[radius > 4.5 ? 0 : 1], m.stone, { x: p.x, y: base + y, z: p.z, sx: radius / (radius > 4.5 ? 4.7 : 3.7), sz: radius / (radius > 4.5 ? 4.7 : 3.7), color: 0xd0c4ab });
  }
  batches.add('lighthouse-gallery-floor', new THREE.CylinderGeometry(5.15, 4.85, .5, 32), m.stone, { x: p.x, y: base + 29.3, z: p.z, color: 0xc4b99e });
  // A glazed lantern with separate metal mullions; no opaque glowing box.
  batches.add('lighthouse-lantern-glass', new THREE.CylinderGeometry(2.6, 2.6, 3.65, 12, 1, true), m.glass, { x: p.x, y: base + 31.5, z: p.z });
  batches.add('lighthouse-beacon-core', new THREE.SphereGeometry(.7, 12, 8), m.lamp, { x: p.x, y: base + 31.6, z: p.z, sx: .8, sy: 1.4, sz: .8 });
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU, x = p.x + Math.sin(a) * 4.75, z = p.z + Math.cos(a) * 4.75;
    batches.box('lighthouse-gallery-balusters', m.darkMetal, { x, y: base + 29.94, z, sx: .065, sy: 1.15, sz: .065 });
    if (i % 2 === 0) batches.box('lighthouse-lantern-mullions', m.darkMetal, { x: p.x + Math.sin(a) * 2.65, y: base + 31.5, z: p.z + Math.cos(a) * 2.65, sx: .1, sy: 3.9, sz: .1 });
  }
  const ring = new THREE.TorusGeometry(4.76, .065, 5, 48).rotateX(Math.PI / 2);
  for (const y of [29.65, 30.5]) batches.add('lighthouse-gallery-handrails', ring, m.darkMetal, { x: p.x, y: base + y, z: p.z });
  batches.add('lighthouse-lantern-eaves', new THREE.CylinderGeometry(3.5, 3.5, .23, 24), m.darkMetal, { x: p.x, y: base + 33.45, z: p.z });
  batches.add('lighthouse-red-copper-roof', new THREE.ConeGeometry(3.8, 3.1, 24), m.roof, { x: p.x, y: base + 35.1, z: p.z, color: 0x924f3b });
  batches.column('lighthouse-lightning-rod', m.darkMetal, { x: p.x, y: base + 37.25, z: p.z, sx: .045, sy: 2.2, sz: .045 });
  const yaw = route.frame(.137).heading;
  const at = (x, y, z) => point(p.x, p.z, yaw, x, z, base + y);
  batches.box('lighthouse-door-stone-frame', m.stone, { ...at(0, 3.3, 4.42), sx: 1.9, sy: 3.6, sz: .28, yaw, color: 0xbcb29e });
  batches.box('lighthouse-blue-door', m.painted, { ...at(0, 3.1, 4.62), sx: 1.25, sy: 2.98, sz: .2, yaw, color: 0x4e7376 });
  for (const h of [8.4, 14.2, 25.4]) {
    batches.box('lighthouse-window-surrounds', m.stone, { ...at(0, h, 4.5 - h * .052), sx: 1.03, sy: 1.5, sz: .2, yaw, color: 0xccbea6 });
    batches.box('lighthouse-slit-windows', m.glass, { ...at(0, h, 4.64 - h * .052), sx: .56, sy: 1.08, sz: .13, yaw });
  }
  for (let i = 0; i < 6; i++) batches.box('lighthouse-stone-stairs', m.stone, { ...at(0, .2 + i * .22, 8.1 - i * .47), sx: 2.8, sy: .44, sz: 2.3 - i * .15, yaw, color: 0xbeb59e });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU;
    if (Math.cos(a - yaw) > .85) continue;
    batches.box('lighthouse-terrace-coping', m.stone, { x: p.x + Math.sin(a) * 13.6, y: base + 2.5, z: p.z + Math.cos(a) * 13.6, sx: 5.1, sy: .72, sz: .72, yaw: a, color: 0xafa891 });
  }
  // Keeper's house anchors the landmark to a believable inhabited place.
  const keeper = at(-10.5, 0, -6), h = landscape.height(keeper.x, keeper.z);
  batches.box('lighthouse-keeper-house', m.plaster, { ...keeper, y: h + 2.1, sx: 7.5, sy: 4.2, sz: 5.5, yaw, color: 0xd8c7aa });
  const roofA = new THREE.BoxGeometry(4.6, .22, 6.5).rotateZ(.41).translate(-2.05, 0, 0);
  const roofB = new THREE.BoxGeometry(4.6, .22, 6.5).rotateZ(-.41).translate(2.05, 0, 0);
  batches.add('lighthouse-keeper-roof', mergeGeometries([roofA, roofB]), m.roof, { ...keeper, y: h + 5.05, yaw, color: 0x97614a });
  for (const xx of [-1.9, 1.9]) batches.box('lighthouse-keeper-windows', m.glass, { ...point(keeper.x, keeper.z, yaw, xx, 2.8, h + 2.4), sx: 1.13, sy: 1.25, sz: .16, yaw });
}

function archWallGeometry() {
  const shape = new THREE.Shape();
  // The opening reaches the bottom of the masonry, so it belongs to the outer
  // contour. A hole extending outside a Shape is silently filled by Earcut.
  shape.moveTo(-18.5, -43); shape.lineTo(-18.5, -1.2); shape.lineTo(18.5, -1.2);
  shape.lineTo(18.5, -43); shape.lineTo(13.7, -43); shape.lineTo(13.7, -20);
  shape.absarc(0, -20, 13.7, 0, Math.PI, false); shape.lineTo(-13.7, -43); shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .09, bevelThickness: .08, curveSegments: 22 });
}

export function addBridge(batches, route, landscape, m) {
  const arch = archWallGeometry(), voussoir = new THREE.BoxGeometry(1, 1, 1);
  for (const distance of [-37, 0, 37]) {
    const f = route.frame(landscape.bridgeT + distance / route.road.length), yaw = f.heading;
    for (const side of [-8.5, 7.3]) {
      const p = point(f.position.x, f.position.z, yaw, side, 0, f.position.y);
      batches.add('bridge-cut-stone-spandrels', arch, m.stone, { ...p, yaw: yaw + Math.PI / 2, color: 0xb5a58c });
      for (let i = 0; i < 23; i++) {
        const a = i / 22 * Math.PI, zz = Math.cos(a) * 14.55, yy = -20 + Math.sin(a) * 14.55;
        const pos = point(f.position.x, f.position.z, yaw, side + (side < 0 ? -.09 : 1.29), zz, f.position.y + yy);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + Math.PI / 2, a - Math.PI / 2, 'YXZ'));
        batches.add('bridge-arch-keystones', voussoir, m.stone, { ...pos, sx: 1.62, sy: 1.7, sz: .28, q, color: i === 11 ? 0xcdbb9b : 0xc1b294 });
      }
    }
  }
  for (let i = -11; i <= 11; i++) {
    const f = route.frame(landscape.bridgeT + i * 5 / route.road.length), yaw = f.heading;
    for (const side of [-8.37, 8.37]) {
      const p = point(f.position.x, f.position.z, yaw, side, 0, f.position.y);
      batches.box('bridge-stone-parapets', m.stone, { ...p, y: p.y + .55, sx: .75, sy: 1.1, sz: 5.1, yaw, color: 0xb9aa8f });
      batches.box('bridge-coping-stones', m.stone, { ...p, y: p.y + 1.18, sx: 1.02, sy: .23, sz: 2.47, yaw, color: 0xcfc1a4 });
      if (i % 4 === 0) batches.box('bridge-parapet-pilasters', m.stone, { ...p, y: p.y + .7, sx: 1.17, sy: 1.48, sz: 1.15, yaw, color: 0xc7b99c });
    }
    batches.box('bridge-deck-stone', m.stone, { x: f.position.x, y: f.position.y - .63, z: f.position.z, sx: 17.2, sy: 1.2, sz: 5.2, yaw, color: 0xab9d86 });
  }
  // Buttressed piers and chamfered cutwaters make the river-facing view readable.
  for (const distance of [-55.5, -18.5, 18.5, 55.5]) {
    const f = route.frame(landscape.bridgeT + distance / route.road.length), bottom = Math.min(landscape.height(f.position.x, f.position.z), f.position.y - 39);
    const h = f.position.y - bottom - 1;
    batches.box('bridge-load-bearing-piers', m.stone, { x: f.position.x, y: bottom + h / 2, z: f.position.z, sx: 17.7, sy: h, sz: 3.5, yaw: f.heading, color: 0xaaa18a });
    for (const side of [-10.3, 10.3]) batches.add('bridge-river-cutwaters', new THREE.CylinderGeometry(.2, 2.2, h * .65, 4).rotateY(Math.PI / 4), m.stone,
      { ...point(f.position.x, f.position.z, f.heading, side, 0, bottom + h * .325), yaw: f.heading, color: 0xa9a28d });
  }
}

function dock(batches, m, start, yaw, width, length, waterY, name) {
  const end = point(start.x, start.z, yaw, 0, length, waterY + .7), near = { ...start, y: waterY + .7 };
  const count = Math.ceil(length / .47);
  for (let i = 0; i < count; i++) {
    const p = point(start.x, start.z, yaw, 0, (i + .5) * length / count, waterY + .62);
    batches.box(`${name}-individual-planks`, m.wood, { ...p, sx: width, sy: .19, sz: length / count - .025, yaw, color: i % 5 ? 0x9a825f : 0x8e775b });
  }
  for (const side of [-width * .43, width * .43]) {
    const a = point(start.x, start.z, yaw, side, 0, waterY + .39), b = point(start.x, start.z, yaw, side, length, waterY + .39);
    batches.beam(`${name}-stringers`, m.wood, a, b, .21, .28);
    for (let i = 0; i <= Math.floor(length / 4); i++) {
      const p = point(start.x, start.z, yaw, side, i * length / Math.floor(length / 4), waterY - .8);
      batches.column(`${name}-timber-piles`, m.wood, { ...p, sx: .16, sy: 4.5, sz: .16, yaw, color: 0x76694e });
      batches.column(`${name}-pile-caps`, m.wood, { ...p, y: waterY + 1.53, sx: .2, sy: .13, sz: .2, color: 0x4f574f });
      if (i < Math.floor(length / 4) && (name !== 'lake-dock' || side > 0)) {
        const b = point(start.x, start.z, yaw, side, (i + 1) * length / Math.floor(length / 4), waterY + 1.31);
        batches.beam(`${name}-rope-handrails`, m.wood, { ...p, y: waterY + 1.31 }, b, .045, .045);
      }
    }
  }
  return { near, end };
}

export function addDocksAndBoats(batches, route, landscape, m) {
  const rng = seededRandom(3171), lakeY = landscape.lake.y;
  // Find the actual water edge in the lookout direction instead of leaving a dock in the hillside.
  const f = route.frame(.624, -36), toward = new THREE.Vector3(landscape.lake.x - f.position.x, 0, landscape.lake.z - f.position.z).normalize();
  let distance = 2;
  for (; distance < 165; distance += 2) {
    if (landscape.height(f.position.x + toward.x * distance, f.position.z + toward.z * distance) < lakeY + .3) break;
  }
  const start = { x: f.position.x + toward.x * distance, z: f.position.z + toward.z * distance, y: lakeY + .7 };
  const yaw = Math.atan2(toward.x, toward.z), landing = dock(batches, m, start, yaw, 3.5, 19, lakeY, 'lake-dock');
  const approach = { x: f.position.x, y: landscape.height(f.position.x, f.position.z) + .25, z: f.position.z };
  batches.beam('lake-dock-walkway', m.wood, approach, start, 2.5, .16);
  const rampLength = Math.hypot(start.x-approach.x,start.z-approach.z), steps=Math.max(1,Math.ceil(rampLength/3.4));
  for(const side of[-1.22,1.22]){
    let previous;
    for(let i=0;i<=steps;i++){
      const u=i/steps,p=point(THREE.MathUtils.lerp(approach.x,start.x,u),THREE.MathUtils.lerp(approach.z,start.z,u),yaw,side,0,THREE.MathUtils.lerp(approach.y,start.y,u));
      batches.box('lake-dock-ramp-posts',m.wood,{...p,y:p.y+.48,sx:.1,sy:.96,sz:.1,yaw,color:0x8b7958});
      if(previous)batches.beam('lake-dock-ramp-handrails',m.wood,{...previous,y:previous.y+.94},{...p,y:p.y+.94},.07,.07);
      previous=p;
    }
  }
  for (const offset of [-1.1, 1.1]) {
    const p = point(landing.end.x, landing.end.z, yaw, offset, -.7, lakeY + 1.05);
    batches.box('lake-dock-mooring-cleats', m.darkMetal, { ...p, sx: .43, sy: .11, sz: .12, yaw });
  }
  for (const t of [.009, .028, .047]) {
    const f = route.frame(t, 86), waterYaw = f.heading + Math.PI / 2;
    dock(batches, m, f.position, waterYaw, 3.8, 32 + rng() * 14, -2.3, 'harbor-pier');
  }
  const hull = boatHullGeometry(), sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,1,0, 1,.04,.05], 3));
  sail.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,0,1,1,0], 2)); sail.computeVertexNormals();
  for (let i = 0; i < 15; i++) {
    const lake = i > 12, f = lake ? { position: point(landing.end.x, landing.end.z, yaw, i === 13 ? -5 : 6, 1), heading: yaw } : route.frame(-.009 + rng() * .075, 105 + rng() * 120);
    const p = f.position, yy = lake ? lakeY : -2.3, heading = f.heading + (rng() - .5) * .7, scale = lake ? .65 : .8 + rng() * .4;
    batches.add('painted-wooden-boat-hulls', hull, m.painted, { x: p.x, y: yy + .13, z: p.z, sx: scale, sy: scale, sz: scale, yaw: heading, color: [0x638b8c, 0xac644f, 0xdfd3b3][i % 3] });
    batches.box('boat-gunwales', m.wood, { x: p.x, y: yy + .93 * scale, z: p.z, sx: 2.25 * scale, sy: .15, sz: 6.4 * scale, yaw: heading, color: 0xc2a873 });
    batches.box('boat-interiors', m.darkMetal, { x: p.x, y: yy + .99 * scale, z: p.z, sx: 1.74 * scale, sy: .08, sz: 5.2 * scale, yaw: heading });
    for (const zz of [-1.4, .2, 1.7]) batches.box('boat-wooden-benches', m.wood, { ...point(p.x, p.z, heading, 0, zz * scale, yy + 1.05 * scale), sx: 1.84 * scale, sy: .13, sz: .48 * scale, yaw: heading, color: 0xa58b61 });
    if (i % 3 === 0 && !lake) {
      batches.column('sailboat-masts', m.wood, { x: p.x, y: yy + 4.9, z: p.z, sx: .075, sy: 9.6, sz: .075, color: 0xa18d63 });
      batches.add('sailboat-cream-canvas', sail, m.sail, { x: p.x + .1, y: yy + 1.5, z: p.z, sx: 3.3, sy: 7.4, sz: 1, yaw: heading });
    }
  }
}

function boatHullGeometry() {
  const g = new THREE.BufferGeometry(), positions = [], indices = [], uvs = [], rings = [];
  for (let row = 0; row <= 8; row++) {
    const z = (row / 8 - .5) * 7.4, width = Math.sin(Math.PI * row / 8) ** .68 * 1.25 + .08;
    const points = [[-width,.82,z],[-width*.76,.08,z],[0,-.2,z],[width*.76,.08,z],[width,.82,z]];
    rings.push(points);
    for (let i = 0; i < points.length; i++) { positions.push(...points[i]); uvs.push(i / 4, row / 8); }
  }
  for (let j = 0; j < 8; j++) for (let i = 0; i < 4; i++) { const n = j * 5 + i; indices.push(n,n+5,n+1,n+1,n+5,n+6); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions,3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs,2)); g.setIndex(indices); g.computeVertexNormals(); return g;
}

export function addWindmills(scene, batches, route, landscape, m) {
  const mills = [], blades = [];
  for (const [i,t] of [.286,.325,.373].entries()) {
    const f = route.frame(t, i % 2 ? 28 : -27), p = f.position, y = landscape.height(p.x,p.z), yaw = f.heading;
    batches.add('windmill-tapered-masonry', new THREE.CylinderGeometry(1.7,3.1,15.5,24), m.stone, { x:p.x,y:y+7.75,z:p.z,color:0xd0c4a3 });
    batches.add('windmill-shingled-caps', new THREE.ConeGeometry(2.7,3.6,24), m.roof, { x:p.x,y:y+17.2,z:p.z,color:0x6f6453 });
    batches.add('windmill-gallery-platforms', new THREE.CylinderGeometry(4.2,4.2,.22,24), m.wood, { x:p.x,y:y+9.1,z:p.z,color:0x8e7859 });
    const ring=new THREE.TorusGeometry(4.05,.055,4,32).rotateX(Math.PI/2);
    batches.add('windmill-gallery-handrails',ring,m.darkMetal,{x:p.x,y:y+10.2,z:p.z});
    for(let j=0;j<20;j++){const a=j/20*TAU;batches.box('windmill-gallery-railings',m.darkMetal,{x:p.x+Math.sin(a)*4.05,y:y+9.65,z:p.z+Math.cos(a)*4.05,sx:.045,sy:1.1,sz:.045});}
    const front=point(p.x,p.z,yaw,0,2.78,y+1.7);
    batches.box('windmill-painted-doors',m.painted,{...front,sx:1.24,sy:2.75,sz:.16,yaw,color:0x607067});
    for (const h of [5.1,11.6]) batches.box('windmill-windows',m.glass,{...point(p.x,p.z,yaw,0,2.7-h*.052,y+h),sx:.76,sy:1.24,sz:.2,yaw});
    const rotor = new THREE.Group(); rotor.name='detailed-turning-windmill-sails';
    const pos=point(p.x,p.z,yaw,0,2.9,y+13.3);rotor.position.set(pos.x,pos.y,pos.z);rotor.rotation.y=yaw;
    const woodPieces=[],canvasPieces=[];
    for(let j=0;j<4;j++){
      const a=j*Math.PI/2;
      woodPieces.push(new THREE.BoxGeometry(.16,8.5,.2).translate(0,4.15,0).rotateZ(a));
      for(let k=0;k<9;k++)woodPieces.push(new THREE.BoxGeometry(1.1,.08,.12).translate(.42,1.45+k*.76,0).rotateZ(a));
      woodPieces.push(new THREE.BoxGeometry(.08,6.4,.13).translate(.94,4.55,0).rotateZ(a));
      canvasPieces.push(new THREE.BoxGeometry(.75,5.95,.04).translate(.49,4.6,.07).rotateZ(a));
    }
    for(const [parts,material,name]of[[woodPieces,m.wood,'windmill-lattice-spars'],[canvasPieces,m.sail,'windmill-cloth-sails']]){
      const mesh=new THREE.Mesh(mergeGeometries(parts),material);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;rotor.add(mesh);
    }
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,.6,16).rotateX(Math.PI/2),m.darkMetal);rotor.add(hub);scene.add(rotor);mills.push({rotor,phase:i*.47});
  }
  return(time)=>{for(const mill of mills)mill.rotor.rotation.z=time*.15+mill.phase;};
}

export function addSummit(batches, route, landscape, m) {
  const f=route.frame(.762,32),p=f.position,y=landscape.height(p.x,p.z);
  batches.add('summit-stone-compass-platform',new THREE.CylinderGeometry(5.5,6.2,.65,32),m.stone,{x:p.x,y:y+.3,z:p.z,color:0xa9a799});
  const ring=new THREE.TorusGeometry(2.8,.095,8,64);
  batches.add('summit-bronze-observation-ring',ring,m.metal,{x:p.x,y:y+4.4,z:p.z,yaw:f.heading,color:0xa79766});
  batches.add('summit-compass-inner-ring',new THREE.TorusGeometry(2.3,.055,6,48).rotateX(.6),m.metal,{x:p.x,y:y+4.4,z:p.z,yaw:f.heading,color:0x9a8a5c});
  batches.column('summit-compass-support',m.metal,{x:p.x,y:y+2.3,z:p.z,sx:.1,sy:4.5,sz:.1,color:0x9a8c65});
  for(let i=0;i<12;i++){
    const a=i/12*TAU,xx=Math.sin(a)*4.1,zz=Math.cos(a)*4.1;
    batches.box('summit-brass-compass-inlay',m.metal,{...point(p.x,p.z,0,xx,zz,y+.66),sx:.06,sy:.025,sz:i%3===0?.8:.4,yaw:a,color:0xb4a37c});
  }
  const flags=[0xb8755c,0xc6a95e,0x729a98,0x9f8293,0xc3ad7a];
  for(let i=0;i<5;i++){
    const f=route.frame(.751+i*.0041,12.4),p=f.position;
    batches.column('summit-prayer-flagpoles',m.wood,{x:p.x,y:p.y+3.6,z:p.z,sx:.055,sy:7.2,sz:.055,color:0x897c64});
    const geometry=new THREE.PlaneGeometry(1.8,1.05,7,3),pos=geometry.attributes.position;
    for(let j=0;j<pos.count;j++){const x=pos.getX(j);pos.setZ(j,Math.sin(x*3.3)*.12+(x+.9)*.12);}geometry.computeVertexNormals();
    batches.add(`summit-woven-flags-${i}`,geometry,m.sail,{x:p.x+1,y:p.y+6,z:p.z,yaw:.2,color:flags[i]});
  }
}
