import * as THREE from 'three';
import { seededRandom, TAU } from '../route.js';
import { point } from './batches.js';
import { signMaterial } from './materials.js';

function roofGeometry() {
  const positions = [], uvs = [];
  const triangle = (a, b, c, uvA, uvB, uvC) => { positions.push(...a, ...b, ...c); uvs.push(...uvA, ...uvB, ...uvC); };
  const a = [-.5, 0, -.5], b = [.5, 0, -.5], c = [0, 1, -.5], d = [-.5, 0, .5], e = [.5, 0, .5], f = [0, 1, .5];
  triangle(a, d, f, [0, 0], [0, 4], [4, 4]); triangle(a, f, c, [0, 0], [4, 4], [4, 0]);
  triangle(b, c, f, [0, 0], [4, 0], [4, 4]); triangle(b, f, e, [0, 0], [4, 4], [0, 4]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.computeVertexNormals(); return g;
}

export function addBuildings(batches, route, landscape, materials) {
  const rng = seededRandom(73381), roof = roofGeometry(), plots = [];
  const gable = new THREE.BufferGeometry();
  gable.setAttribute('position', new THREE.Float32BufferAttribute([-.5,0,0, .5,0,0, 0,1,0],3));
  gable.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1],2));gable.computeVertexNormals();
  const wallColors = [0xe0c9aa, 0xe8d9ba, 0xd6b5a1, 0xc5d0ca, 0xe4cdb8, 0xd3be97];
  const roofColors = [0x955d45, 0x80594d, 0x9c694d, 0x596671, 0x825a4a];
  const shutterColors = [0x547b75, 0x6b777c, 0x847b65, 0x6d8c83, 0x6a7562];
  const flowerGeometry = new THREE.SphereGeometry(.055, 6, 4).scale(1.5,.6,1.3);
  const signGeometry = new THREE.PlaneGeometry(1, 1);
  const shopSigns = [signMaterial(['BAY', 'CAFE'], 0x3c6664), signMaterial(['FRESH', 'MARKET'], 0x4e705e), signMaterial(['BAKERY'], 0x80604f)];

  function house(t, lateral, id, type = 'town') {
    const f = route.frame(t, lateral), x = f.position.x, z = f.position.z;
    const yaw = f.heading + (lateral < 0 ? Math.PI / 2 : -Math.PI / 2), y = landscape.height(x, z);
    const w = 7.3 + rng() * 4.6, d = 6.7 + rng() * 3.9, h = type === 'cabin' ? 3.2 : type === 'farm' ? 4.7 : 5.8 + rng() * 1.2;
    if (y < 4 || route.query(x, z).distance < Math.hypot(w, d) * .5 + 11) return;
    if (Math.abs(landscape.height(x + w / 2, z) - y) > 3 || Math.abs(landscape.height(x, z + d / 2) - y) > 3) return;
    if (landscape.pads.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + 11)) return;
    const front = d / 2, wall = wallColors[id % wallColors.length], terracotta = roofColors[id % roofColors.length], shutter = shutterColors[id % shutterColors.length];
    plots.push({ x, z, radius: Math.hypot(w, d) / 2 + 4 }); batches.stats.houseCount++;
    const local = (xx, yy, zz) => point(x, z, yaw, xx, zz, y + yy);
    const box = (name, mat, xx, yy, zz, sx, sy, sz, color, options, more = {}) => batches.box(name, mat, { ...local(xx, yy, zz), sx, sy, sz, yaw, color, ...more }, options);
    const beam = (name, mat, a, b, width, depth = width) => batches.beam(name, mat, local(...a), local(...b), width, depth);
    box('house-masonry-foundations', materials.stone, 0, .3, 0, w + .3, .8, d + .3, 0xa8a18d);
    box('house-stucco-walls', type === 'cabin' ? materials.wood : materials.plaster, 0, h / 2 + .5, 0, w, h, d, type === 'cabin' ? 0xa08b68 : wall);
    box('house-base-course', materials.stone, 0, .68, 0, w + .08, .44, d + .08, 0xc0b69e);
    // Quoin blocks, eaves, drain pipes and ridge caps make the walls read as construction.
    for (const xx of [-w / 2, w / 2]) for (const zz of [-d / 2, d / 2]) {
      for (let j = 0; j < Math.floor(h / .54); j++) box('house-corner-stone', materials.stone, xx, .9 + j * .54, zz, .28, .44, .29, 0xcdbfa6, { shadow: false });
    }
    const pitch = Math.min(2.6, w * .25);
    batches.add('house-tiled-gables', roof, materials.roof, { x, y: y + h + .5, z, sx: w + 1.05, sy: pitch, sz: d + 1.02, yaw, color: terracotta });
    for(const sign of[-1,1])batches.add('house-plastered-gable-walls',gable,materials.plaster,{...local(0,h+.5,sign*(front+.012)),sx:w,sy:pitch*.93,yaw:yaw+(sign<0?Math.PI:0),color:wall});
    box('house-overhanging-soffits',materials.painted,0,h+.47,0,w+.94,.12,d+.92,0xb5aa8e);
    for (const xx of [-1, 1]) {
      box('house-eaves', materials.wood, xx * (w / 2 + .35), h + .43, 0, .22, .24, d + 1.08, 0x6a6356);
      beam('house-gable-trim', materials.painted, [xx * (w / 2 + .51), h + .52, front + .53], [0, h + pitch + .53, front + .53], .14, .18);
      beam('house-gable-trim', materials.painted, [xx * (w / 2 + .51), h + .52, -front - .53], [0, h + pitch + .53, -front - .53], .14, .18);
      box('house-gutters', materials.darkMetal, xx * (w / 2 + .47), h + .36, 0, .16, .16, d + 1.14);
      box('house-drainpipes', materials.darkMetal, xx * (w / 2 + .08), h / 2, front - .25, .1, h, .1);
    }
    box('house-roof-ridge', materials.roof, 0, h + pitch + .55, 0, .23, .21, d + 1.12, terracotta);
    box('house-chimney-stacks', materials.stone, w * .28, h + pitch * .7 + .7, -d * .17, .76, 2.6, .74, 0xb7a38a);
    box('house-chimney-caps', materials.solid, w * .28, h + pitch * .7 + 2.03, -d * .17, 1.04, .22, .97, 0x726c61);
    box('house-chimney-mouth', materials.darkMetal, w * .28, h + pitch * .7 + 2.15, -d * .17, .5, .05, .45);

    function window(xx, yy, zz, angle = 0, width = 1.05, height = 1.36) {
      const at = (u, v, out = 0) => {
        const p = point(x, z, yaw, xx + u * Math.cos(angle) + out * Math.sin(angle), zz - u * Math.sin(angle) + out * Math.cos(angle), y + yy + v);
        return { ...p, yaw: yaw + angle };
      };
      const part = (name, mat, u, v, out, sx, sy, sz, color) => batches.box(name, mat, { ...at(u, v, out), sx, sy, sz, color });
      part('window-recesses', materials.darkMetal, 0, 0, .035, width + .18, height + .18, .12);
      part('window-glazing', materials.glass, 0, 0, .12, width, height, .12);
      for (const sign of [-1, 1]) {
        part('window-frames', materials.painted, sign * (width / 2 + .065), 0, .21, .11, height + .32, .16, 0xe7ddc3);
        part('window-frames', materials.painted, 0, sign * (height / 2 + .065), .21, width + .24, .11, .16, 0xe7ddc3);
        part('wooden-shutters', materials.painted, sign * (width * .76 + .15), 0, .14, width * .43, height + .11, .13, shutter);
        for (let j = 0; j < 7; j++) part('shutter-louvres', materials.painted, sign * (width * .76 + .15), -height * .41 + j * height * .135, .225, width * .37, .055, .08, shutter);
      }
      part('window-mullions', materials.painted, 0, 0, .235, .056, height, .08, 0xe6ddc3);
      part('window-mullions', materials.painted, 0, .05, .235, width, .055, .08, 0xe6ddc3);
      part('window-stone-sills', materials.stone, 0, -height / 2 - .17, .2, width + .52, .18, .44, 0xd4c7ad);
      part('window-lintels', materials.stone, 0, height / 2 + .18, .12, width + .46, .15, .26, 0xd9ccb4);
      if ((id + Math.round(xx * 10)) % 3 === 0) {
        part('window-flowerboxes', materials.wood, 0, -height / 2 - .35, .48, width + .3, .32, .4, 0x8b674a);
        part('window-planter-leaves', materials.solid, 0, -height / 2 - .17, .47, width + .21, .21, .33, 0x5a7844);
        for (let j = 0; j < 7; j++) batches.add('window-potted-flowers', flowerGeometry, materials.solid,
          { ...at((j / 6 - .5) * width, -height / 2 - .01, .51), color: j % 3 ? 0xd17f69 : 0xebbc97 });
      }
    }

    const floors = type === 'town' ? [2.05, 4.75] : [2.12];
    for (const floor of floors) for (const xx of [-w * .29, w * .29]) window(xx, floor, front + .03);
    for (const side of [-1, 1]) for (const zz of [-d * .25, d * .25]) window(side * (w / 2 + .025), h * .57, zz, side * Math.PI / 2, .96, 1.23);
    if (type !== 'cabin') window(0, h + 1.1, front + .05, 0, .67, .76);
    box('house-door-surrounds', materials.stone, 0, 1.63, front + .08, 1.72, 2.66, .24, 0xd9cbb3);
    box('house-painted-doors', materials.painted, 0, 1.55, front + .23, 1.27, 2.26, .22, shutter);
    for (const yy of [.98, 1.78]) box('door-inset-panels', materials.painted, 0, yy, front + .365, .9, .58, .08, shutter);
    box('door-transom-glass', materials.glass, 0, 2.45, front + .37, .87, .3, .08);
    box('door-brass-handles', materials.metal, .4, 1.52, front + .4, .06, .24, .07, 0xb7a16b);
    for (let j = 0; j < 3; j++) box('doorstep-stone', materials.stone, 0, .14 + j * .14, front + 1.3 - j * .32, 1.9, .28, 1.2 - j * .25, 0xa9a38e);
    if (type === 'town') {
      const shop = id % 3 === 0;
      if (shop) {
        const sign = point(x, z, yaw, 0, front + .39, y + 3.62);
        batches.add(`shop-lettering-${Math.floor(id / 3) % 3}`, signGeometry, shopSigns[Math.floor(id / 3) % 3], { ...sign, sx: 2.5, sy: .75, yaw });
        for (let j = 0; j < 10; j++) box('striped-shop-awnings', materials.sail, -w * .38 + (j + .5) * w * .076, 3.03, front + 1.04, w * .077, .11, 2.05, j % 2 ? 0xd9c99f : shutter, undefined, { rx: .13 });
        box('shop-awning-valances', materials.painted, 0, 2.7, front + 2.03, w * .76, .3, .1, shutter);
        for (const xx of [-w * .36, w * .36]) beam('shop-canopy-braces', materials.darkMetal, [xx, 2.73, front + 2], [xx, 2.15, front + .1], .045);
        for (const xx of [-w * .19, w * .19]) {
          box('cafe-outdoor-tables', materials.wood, xx, 1, front + 3.7, 1.15, .13, 1.1, 0x92785a);
          box('cafe-table-legs', materials.darkMetal, xx, .48, front + 3.7, .11, .96, .11);
          for (const zz of [front + 2.75, front + 4.65]) {
            box('cafe-chairs', materials.painted, xx, .55, zz, .67, .14, .65, shutter);
            box('cafe-chair-backs', materials.painted, xx, 1, zz + (zz < front + 3 ? -.22 : .22), .67, .7, .1, shutter);
            for (const leg of [-.22, .22]) box('cafe-chair-legs', materials.darkMetal, xx + leg, .24, zz, .05, .5, .5);
          }
        }
      } else if (id % 2 === 0) {
        box('house-balcony-floors', materials.stone, 0, 3.87, front + .77, w * .74, .24, 1.7, 0xbab19b);
        for (let j = 0; j <= 11; j++) box('house-balcony-ironwork', materials.darkMetal, (j / 11 - .5) * w * .71, 4.4, front + 1.53, .045, .95, .045);
        for (const yy of [4.02, 4.87]) box('house-balcony-rails', materials.darkMetal, 0, yy, front + 1.53, w * .75, .065, .065);
        for (const xx of [-w * .355, w * .355]) beam('house-balcony-side-rails', materials.darkMetal, [xx, 4.87, front], [xx, 4.87, front + 1.53], .065);
      }
    }
    return { x, y, z, yaw, w, d, h };
  }

  for (let i = 0; i < 31; i++) house(-.021 + i * .00365, -(23.5 + (i % 4 === 1 ? 10 : 0)), i);
  for (let i = 0; i < 7; i++) house(.285 + i * .0175, (i % 2 ? -1 : 1) * (29 + rng() * 8), 40 + i, 'farm');
  for (let i = 0; i < 5; i++) house(.574 + i * .024, 31 + rng() * 10, 50 + i, 'cabin');
  return plots;
}

export function addFields(batches, scene, route, landscape, materials) {
  const rng = seededRandom(23882), vertices = [], colors = [], normals = [], uvs = [];
  const shades = [0xd8b24b, 0xe0bd62, 0xcda548, 0xd5af50, 0xe1c574];
  const color = new THREE.Color();
  const hay = new THREE.CylinderGeometry(1, 1, 1, 20).rotateX(Math.PI / 2);
  for (let i = 0; i < 11; i++) {
    const t = .268 + i * .0128;
    for (const direction of [-1, 1]) {
      const inside = 19 + rng() * 7;
      rng(); // Preserve the existing fence and bale layout after replacing the surface.
      let previous;
      for (let j = 0; j <= 10; j++) {
        const f = route.frame(t + (j / 10 - .5) * .0117, direction * (inside - 1));
        const p = { x: f.position.x, y: landscape.height(f.position.x, f.position.z), z: f.position.z };
        batches.box('farm-fence-posts', materials.wood, { ...p, y: p.y + .7, sx: .16, sy: 1.4, sz: .16, yaw: f.heading, color: 0x9d8b64 });
        if (previous) for (const h of [.55, 1.04]) batches.beam('farm-fence-crossbars', materials.wood, { ...previous, y: previous.y + h }, { ...p, y: p.y + h }, .11, .14);
        previous = p;
      }
      if (i % 3 === 0) for (let j = 0; j < 2; j++) {
        const f = route.frame(t + j * .002, direction * (inside + 11 + rng() * 9)), p = f.position;
        batches.add('wrapped-hay-bales', hay, materials.wood, { x: p.x, y: landscape.height(p.x, p.z) + 1.1, z: p.z, sx: 1.15, sy: 1.15, sz: 1.9, yaw: f.heading, color: 0xc4ad63 });
        for (const offset of [-.55, .55]) {
          const band = point(p.x, p.z, f.heading, 0, offset, landscape.height(p.x, p.z) + 1.1);
          batches.add('hay-bale-binding', new THREE.TorusGeometry(1.16, .023, 3, 20), materials.wood, { ...band, yaw: f.heading, color: 0x9c8d58 });
        }
      }
    }
  }

  // Copy the actual rendered ground facets for the crop surface. A coarse patch
  // sampled independently from height() sank through the roadside landform and
  // left most of the intended gold invisible. These facets share its exact
  // ground contact and have only a 12 cm offset.
  for (const name of ['textured-smooth-island', 'detailed-roadside-landform']) {
    const ground = scene.getObjectByName(name);
    if (!ground) continue; // Asset-only Node scenes can omit the terrain render layer.
    const geometry = ground.geometry;
    const position = geometry.attributes.position, index = geometry.index;
    const samples = Array.from({ length: position.count }, (_, i) => {
      const x = position.getX(i), z = position.getZ(i);
      if (x < 650 || x > 1450 || z < -700 || z > 550) return null;
      return route.query(x, z);
    });
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i += 3) {
      const ids = [0, 1, 2].map((j) => index ? index.getX(i + j) : i + j);
      const qs = ids.map((j) => samples[j]);
      if (qs.some((q) => !q)) continue;
      const t = (qs[0].t + qs[1].t + qs[2].t) / 3;
      const lateral = (qs[0].lateral + qs[1].lateral + qs[2].lateral) / 3;
      if (t < .263 || t > .408 || Math.abs(lateral) < 19 || lateral < -255 || lateral > 105) continue;
      // The broad right-hand basin is a connected series of fields, separated
      // by narrow earth headlands rather than isolated yellow grass clumps.
      for (const j of ids) {
        const x = position.getX(j), z = position.getZ(j);
        const q = samples[j], plot = Math.max(0, Math.floor((q.t - .263) / .0207));
        color.setHex(shades[plot % shades.length]);
        vertices.push(x, position.getY(j) + .12, z); colors.push(color.r, color.g, color.b);
        const normal = geometry.attributes.normal;
        normals.push(normal.getX(j), normal.getY(j), normal.getZ(j));
        uvs.push((q.t - .263) * route.road.length, Math.abs(q.lateral));
      }
    }
  }
  const cropPixels = new Uint8Array(64 * 64 * 4), textureRng = seededRandom(9917);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const offset = (y * 64 + x) * 4, grain = 217 + textureRng() * 35 - (x % 7 < 1 ? 17 : 0);
    cropPixels[offset] = grain; cropPixels[offset + 1] = grain; cropPixels[offset + 2] = grain; cropPixels[offset + 3] = 255;
  }
  const cropMap = new THREE.DataTexture(cropPixels, 64, 64);
  cropMap.colorSpace = THREE.SRGBColorSpace; cropMap.wrapS = cropMap.wrapT = THREE.RepeatWrapping;
  cropMap.repeat.set(.16, .16);
  cropMap.magFilter = THREE.NearestFilter; cropMap.minFilter = THREE.LinearMipmapLinearFilter;
  cropMap.generateMipmaps = true; cropMap.needsUpdate = true;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const m = new THREE.MeshStandardMaterial({ map: cropMap, vertexColors: true, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying vec2 vFieldCoord;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vFieldCoord = uv;');
    shader.fragmentShader = 'varying vec2 vFieldCoord;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float fieldLength = ${(route.road.length * .0207).toFixed(5)};
      float plot = floor(vFieldCoord.x / fieldLength);
      float row = mod(vFieldCoord.y, 7.2);
      float stubble = step(3.0, row) * (1.0 - step(5.1, row));
      float harvested = 1.0 - step(0.5, mod(plot, 3.0));
      diffuseColor.rgb *= mix(1.045, 0.77, stubble * (0.42 + harvested * 0.58));
      float wheelTrack = 1.0 - smoothstep(0.09, 0.23, abs(mod(vFieldCoord.y + 1.8, 21.6) - 0.35));
      diffuseColor.rgb *= 1.0 - wheelTrack * 0.3;
      float headland = 1.0 - smoothstep(2.2, 3.0, mod(vFieldCoord.x, fieldLength));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.28, 0.21, 0.095), headland * 0.64);
    `);
  };
  m.customProgramCacheKey = () => 'detailed-golden-fields-v1';
  const mesh = new THREE.Mesh(g, m); mesh.name = 'cultivated-field-furrows'; mesh.receiveShadow = true; scene.add(mesh);

  const wheat = wheatClumpGeometry();
  for (let i = 0; i < 2500; i++) {
    const t = .279 + rng() * .121, side = i < 2050 ? -1 : 1;
    const lateral = side * (21 + Math.floor(rng() * 20) * 3.2 + rng() * .45);
    const f = route.frame(t, lateral), p = f.position;
    if (route.query(p.x, p.z).distance < 18) continue;
    const height = .75 + rng() * .42;
    batches.add('ripe-wheat-ear-clusters', wheat, materials.plant, { x: p.x, y: landscape.height(p.x, p.z) + .16, z: p.z,
      sx: height, sy: height, sz: height, yaw: rng() * TAU, color: 0xfff1ce }, { band: 'detail', shadow: false });
  }
}

function wheatClumpGeometry() {
  const positions = [], colors = [], uvs = [];
  const triangle = (a, b, c, color) => {
    for (const p of [a, b, c]) { positions.push(...p); colors.push(...color); uvs.push(p[0], p[1]); }
  };
  for (let stalk = 0; stalk < 4; stalk++) {
    const x = Math.sin(stalk * 2.4) * .18, z = Math.cos(stalk * 2.4) * .18, h = .66 + stalk * .09;
    const green = [.48, .5, .19], gold = [.85, .64, .24];
    triangle([x-.008,0,z],[x+.008,0,z],[x+.055,h,z],green);
    triangle([x,0,z-.008],[x,0,z+.008],[x+.055,h,z],green);
    for (const sign of [-1, 1]) triangle([x,h*.36,z],[x+sign*.18,h*.65,z+.05],[x+.025,h*.59,z],green);
    for (let row = 0; row < 5; row++) {
      const yy = h + row * .036, width = .047 - row * .004;
      for (const sign of [-1, 1]) {
        triangle([x+.055,yy,z],[x+.055+sign*width,yy+.027,z],[x+.055,yy+.065,z],gold);
        triangle([x+.055,yy,z],[x+.055,yy+.027,z+sign*width],[x+.055,yy+.065,z],gold);
      }
    }
    triangle([x+.047,h+.15,z],[x+.059,h+.15,z],[x+.073,h+.26,z],gold);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));g.computeVertexNormals();return g;
}
