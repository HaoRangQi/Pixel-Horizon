import * as THREE from 'three';
import { seededRandom } from '../route.js';

// Every texture in this family is authored here. No DOM, downloads, or external assets.
function texture(size, pixel, { alpha = false, repeat = 1 } = {}) {
  const bytes = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const rgba = pixel(x, y);
      const offset = (y * size + x) * 4;
      for (let k = 0; k < 3; k++) bytes[offset + k] = Math.max(0, Math.min(255, rgba[k]));
      bytes[offset + 3] = alpha ? (rgba[3] ?? 255) : 255;
    }
  }
  const map = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestMipmapLinearFilter;
  map.generateMipmaps = true;
  map.repeat.set(repeat, repeat);
  map.needsUpdate = true;
  return map;
}

const gray = (v) => [v, v, v];

function makeLeafTexture(needle = false) {
  const size = 64, pixels = new Uint8Array(size * size * 4), rng = seededRandom(needle ? 817 : 314);
  const dab = (cx, cy, rx, ry, angle, shade) => {
    for (let y = Math.max(0, Math.floor(cy - ry - rx)); y < Math.min(size, cy + ry + rx); y++) {
      for (let x = Math.max(0, Math.floor(cx - ry - rx)); x < Math.min(size, cx + ry + rx); x++) {
        const dx = x - cx, dy = y - cy;
        const u = (dx * Math.cos(angle) + dy * Math.sin(angle)) / rx;
        const v = (-dx * Math.sin(angle) + dy * Math.cos(angle)) / ry;
        if (u * u + v * v > 1 || (Math.abs(u) > .7 && rng() < .12)) continue;
        const n = (y * size + x) * 4;
        const light = shade * (u > 0 ? 1 : .84);
        pixels[n] = Math.min(255, light * .96); pixels[n + 1] = Math.min(255, light);
        pixels[n + 2] = Math.min(255, light * .82); pixels[n + 3] = 255;
      }
    }
  };
  if (needle) {
    for (let j = 0; j < 11; j++) {
      const cy = 7 + j * 4.6, span = 5 + j * 1.35;
      for (const sign of [-1, 1]) {
        for (let k = 0; k < 5; k++) {
          dab(32 + sign * (k * span / 5 + 2), cy + k * 1.4, 1.2, 5.4, sign * .65, 175 + rng() * 75);
        }
      }
    }
  } else {
    for (let branch = 0; branch < 5; branch++) {
      const angle = -.9 + branch * .45, cx = 31 + Math.sin(angle) * 12, cy = 27 + Math.cos(angle) * 10;
      for (let j = 0; j < 9; j++) {
        const a = j * 2.4 + branch * .8, r = 6 + (j % 3) * 5;
        dab(cx + Math.sin(a) * r, cy + Math.cos(a) * r, 3.2 + rng() * 2.6, 5 + rng() * 3, a, 175 + rng() * 75);
      }
    }
  }
  const map = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.NearestFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true; map.needsUpdate = true;
  return map;
}

export function createSceneryMaterials() {
  const rng = seededRandom(58431);
  const plasterMap = texture(128, (x, y) => {
    const coarse = Math.sin(Math.floor(x / 4) * 1.7 + Math.floor(y / 5) * 2.3) * 4;
    return gray(225 + coarse + rng() * 13 - (rng() < .018 ? 22 : 0));
  });
  const stoneMap = texture(128, (x, y) => {
    const row = Math.floor(y / 16), u = (x + row % 2 * 18) % 38, v = y % 16;
    const mortar = u < 2 || v < 2;
    const block = Math.sin(Math.floor((x + row % 2 * 18) / 38) * 7 + row * 3) * 12;
    return gray(mortar ? 122 + rng() * 18 : 197 + block + rng() * 15);
  });
  const woodMap = texture(128, (x, y) => {
    const grain = Math.sin(x * .62 + Math.sin(y * .07) * 1.8) * 13;
    const knot = Math.sin(Math.hypot(x - 36, (y - 69) * .5) * .54) * Math.max(0, 1 - Math.hypot(x - 36, y - 69) / 25) * 30;
    return gray(201 + grain + knot + rng() * 9 - (x % 32 < 2 ? 24 : 0));
  });
  const barkMap = texture(128, (x, y) => {
    const crack = Math.sin(x * .71 + Math.sin(y * .071) * 1.8) > .68;
    return gray(180 + Math.sin(x * .3 + y * .03) * 18 + rng() * 17 - (crack ? 65 : 0));
  });
  const roofMap = texture(128, (x, y) => {
    const row = Math.floor(y / 16), u = (x + row % 2 * 8) % 16, v = y % 16;
    const value = 205 + Math.sin(u / 16 * Math.PI) * 32 - (v < 2 || u < 1 ? 50 : 0);
    return gray(value + Math.sin(row * 13 + Math.floor(x / 16) * 7) * 10 + rng() * 6);
  });
  const standard = (color, map, roughness = .9, extra = {}) => new THREE.MeshStandardMaterial({ color, map, roughness, metalness: 0, ...extra });
  const leaf = (map) => {
    const material = standard(0xffffff, map, .96, {
      side: THREE.DoubleSide, shadowSide: THREE.FrontSide, alphaTest: .46, alphaToCoverage: true, vertexColors: true,
      emissive: 0xffffff, emissiveMap: map, emissiveIntensity: .24,
    });
    // Thin leaves transmit skylight. Tint the modest transmission term by the
    // same vertex and instance colors as the reflected surface, including autumn.
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vColor.rgb;');
    };
    material.customProgramCacheKey = () => 'scenery-leaf-transmission-v1';
    return material;
  };
  return {
    plaster: standard(0xffffff, plasterMap), stone: standard(0xffffff, stoneMap, .96),
    wood: standard(0xffffff, woodMap), bark: standard(0xaa8a65, barkMap),
    roof: standard(0xffffff, roofMap, .85), painted: standard(0xffffff, woodMap, .74),
    leaves: leaf(makeLeafTexture()), needles: leaf(makeLeafTexture(true)),
    plant: standard(0xffffff, null, .98, { vertexColors: true, side: THREE.DoubleSide }),
    solid: standard(0xffffff, null, .87), rock: standard(0xffffff, stoneMap, .98, { vertexColors: true }),
    metal: standard(0xffffff, null, .49, { metalness: .66 }),
    darkMetal: standard(0x354345, null, .54, { metalness: .72 }),
    glass: standard(0x4b7e8d, null, .23, { metalness: .28, envMapIntensity: .8 }),
    lamp: standard(0xffe1ab, null, .34, { emissive: 0xd48a3e, emissiveIntensity: .48 }),
    sail: standard(0xe6ddc1, plasterMap, .96, { side: THREE.DoubleSide }),
  };
}

const FONT = {
  A: ['01110','10001','10001','11111','10001','10001','10001'], B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01111','10000','10000','10000','10000','10000','01111'], D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'], F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01111','10000','10000','10111','10001','10001','01111'], H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['111','010','010','010','010','010','111'], J: ['00111','00010','00010','00010','10010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'], L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'], N: ['10001','11001','11001','10101','10011','10011','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'], P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'], R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'], T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'], V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','10101','01010'], X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'], Z: ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'], '1': ['010','110','010','010','010','010','111'],
  '2': ['01110','10001','00001','00110','01000','10000','11111'], '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'], '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'], '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'], '9': ['01110','10001','10001','01111','00001','00001','01110'],
  ' ': ['000','000','000','000','000','000','000'], '-': ['000','000','000','111','000','000','000'],
};

export function signMaterial(lines, color = 0x345e62) {
  const bg = new THREE.Color(color), ink = new THREE.Color(0xf2e9d3), size = 128;
  // Raw byte colors deliberately follow the same sRGB albedo path as the other maps.
  const base = [bg.r, bg.g, bg.b].map((v) => Math.round(THREE.ColorManagement.workingToColorSpace(new THREE.Color(v, v, v), THREE.SRGBColorSpace).r * 255));
  const light = [ink.r, ink.g, ink.b].map((v) => Math.round(THREE.ColorManagement.workingToColorSpace(new THREE.Color(v, v, v), THREE.SRGBColorSpace).r * 255));
  const pixels = Array.from({ length: size * size }, () => base);
  for (let y = 6; y < size - 6; y++) for (let x = 5; x < size - 5; x++) {
    if (x < 7 || x > size - 8 || y < 8 || y > size - 9) pixels[y * size + x] = light;
  }
  lines.forEach((line, row) => {
    const glyphs = [...line.toUpperCase()].map((letter) => FONT[letter] || FONT[' ']);
    const width = glyphs.reduce((sum, glyph) => sum + glyph[0].length + 1, -1), scale = width > 70 ? 1 : 2;
    let cursor = Math.floor((size - width * scale) / 2);
    const top = Math.floor(size / 2 - lines.length * 10 + row * 21);
    for (const glyph of glyphs) {
      for (let y = 0; y < 7; y++) for (let x = 0; x < glyph[y].length; x++) if (glyph[y][x] === '1') {
        for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) pixels[(size - top - y * scale - yy - 1) * size + cursor + x * scale + xx] = light;
      }
      cursor += (glyph[0].length + 1) * scale;
    }
  });
  const map = texture(size, (x, y) => pixels[y * size + x]);
  return new THREE.MeshStandardMaterial({ map, roughness: .78, side: THREE.DoubleSide });
}
