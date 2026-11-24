import { createExteriorGeometry } from './exterior.js';
import { createCabinGeometry } from './cabin.js';
import { createCoupeGeometry } from './coupe.js';

// Both cars share axles, tyres and the driving model, so they also share the cockpit
// shell: the coupe's eye point drops a little and the cluster reads its own brand.
export const BODY_STYLES = {
  one: {
    name: 'AMG ONE',
    subtitle: 'HYPERCAR',
    paint: 0xe02028,
    previewColor: 0xe02028,
    cockpit: { position: [0.345, 1.015, -0.235], pitch: 0.075, fov: 66 },
    cluster: { header: 'AMG  //  PERFORMANCE', sub: 'HORIZON ONE', mode: 'E-PERFORMANCE' },
    mirrors: { left: { position: [1.058, 0.854, 0.5215], rotationY: Math.PI + 0.26, size: 0.162, height: 0.045 }, right: { position: [-1.058, 0.854, 0.5215], rotationY: Math.PI - 0.26, size: 0.162, height: 0.045 } },
    build: () => createExteriorGeometry(),
  },
  coupe: {
    name: 'HORIZON M4',
    subtitle: 'GRAND COUPE',
    paint: 0x2f7d4f,
    previewColor: 0x2f7d4f,
    cockpit: { position: [0.345, 1.0, -0.245], pitch: 0.07, fov: 64 },
    cluster: { header: 'M  //  PERFORMANCE', sub: 'HORIZON M4', mode: 'SPORT' },
    mirrors: { left: { position: [0.988, 0.943, 0.272], rotationY: Math.PI + 0.28, size: 0.14, height: 0.042 }, right: { position: [-0.988, 0.943, 0.272], rotationY: Math.PI - 0.28, size: 0.14, height: 0.042 } },
    build: () => createCoupeGeometry(),
  },
};

export const BODY_ORDER = ['one', 'coupe'];
let sharedCabin;
export function sharedCabinGeometry() {
  sharedCabin ??= createCabinGeometry();
  return sharedCabin;
}

// One build per shell, shared by the player's garage, the sprint opponents and NPC traffic.
// Sharing the BufferGeometry keeps a traffic car at the cost of its instance matrices, not
// another copy of a 128k-triangle shell.
const geometryCache = new Map();
export function bodyGeometry(style) {
  const key = BODY_STYLES[style] ? style : 'one';
  if (!geometryCache.has(key)) geometryCache.set(key, BODY_STYLES[key].build());
  return geometryCache.get(key);
}
