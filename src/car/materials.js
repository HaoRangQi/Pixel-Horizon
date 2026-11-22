import * as THREE from 'three';

let carbonNormal;

function weaveNormal() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const horizontal = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0;
      const s = Math.sin((horizontal ? y : x) / 16 * Math.PI * 2);
      const i = (y * size + x) * 4;
      data[i] = horizontal ? 128 : 128 + s * 28;
      data[i + 1] = horizontal ? 128 + s * 28 : 128;
      data[i + 2] = 252;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(15, 15);
  texture.needsUpdate = true;
  return texture;
}

export function createMaterials(color) {
  carbonNormal ??= weaveNormal();
  const standard = (c, roughness = 0.45, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness, metalness, ...extra });
  return {
    paint: new THREE.MeshPhysicalMaterial({ color, roughness: 0.24, metalness: 0.19, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.9, side: THREE.DoubleSide }),
    carbon: new THREE.MeshPhysicalMaterial({ color: 0x171d24, roughness: 0.38, metalness: 0.23, clearcoat: 0.65, clearcoatRoughness: 0.27, normalMap: carbonNormal, normalScale: new THREE.Vector2(0.17, 0.17), side: THREE.DoubleSide }),
    hoodCarbon: new THREE.MeshPhysicalMaterial({ color: 0x0b0f14, roughness: 0.49, metalness: 0.08, clearcoat: 0.4, clearcoatRoughness: 0.32, envMapIntensity: 0.6, normalMap: carbonNormal, normalScale: new THREE.Vector2(0.2, 0.2), side: THREE.DoubleSide }),
    carbonMatte: standard(0x151b22, 0.72, 0.1, { side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0b1c25, roughness: 0.1, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.8, side: THREE.DoubleSide }),
    black: standard(0x10151b, 0.67, 0.08, { side: THREE.DoubleSide }),
    grille: standard(0x1b242c, 0.65, 0.45, { side: THREE.DoubleSide }),
    silver: standard(0xb9c5ca, 0.25, 0.9, { side: THREE.DoubleSide }),
    darkMetal: standard(0x465059, 0.37, 0.82, { side: THREE.DoubleSide }),
    rim: standard(0x9ba7af, 0.27, 0.87),
    tire: standard(0x17191d, 0.94, 0.01, { side: THREE.DoubleSide }),
    tread: standard(0x090b0e, 1, 0),
    tireMark: standard(0x696e72, 0.94, 0),
    brakeDisc: standard(0x686a65, 0.55, 0.72),
    caliper: standard(0xc3a151, 0.4, 0.6),
    lightHousing: standard(0x0b1218, 0.23, 0.55, { side: THREE.DoubleSide }),
    led: standard(0xe8f6ff, 0.19, 0.15, { emissive: 0xcae9ff, emissiveIntensity: 1.6, side: THREE.DoubleSide }),
    taillight: standard(0xa9020c, 0.24, 0.12, { emissive: 0xff081c, emissiveIntensity: 1.1, side: THREE.DoubleSide }),
    seat: standard(0x252c35, 0.97, 0),
    seatCenter: standard(0x333b45, 0.96, 0),
    redLeather: standard(0xb01c2c, 0.81, 0),
    stitch: standard(0xb6bcbc, 0.92, 0),
    // Cockpit-only variants: the shell sits in shadow, so the trim reads as charcoal
    // instead of dissolving into pure black from the driver's seat.
    cabinCarbon: new THREE.MeshPhysicalMaterial({ color: 0x2a333d, roughness: 0.5, metalness: 0.12, clearcoat: 0.4, clearcoatRoughness: 0.36, normalMap: carbonNormal, normalScale: new THREE.Vector2(0.15, 0.15), side: THREE.DoubleSide }),
    cabinCarbonMatte: standard(0x252d36, 0.82, 0.05, { side: THREE.DoubleSide }),
    cabinBlack: standard(0x1c232b, 0.75, 0.05, { side: THREE.DoubleSide }),
    cabinMetal: standard(0x5f6a74, 0.35, 0.8, { side: THREE.DoubleSide }),
    accent: standard(0x68d5cf, 0.34, 0.5),
    mirror: standard(0xb1c7ce, 0.08, 0.98),
    screenBlack: new THREE.MeshBasicMaterial({ color: 0x03080c }),
    // M-sport tricolour for the coupe's wheel badge and stitching.
    mSportLight: standard(0x2b87d8, 0.35, 0.4),
    mSportDark: standard(0x123a8a, 0.35, 0.4),
    mSportRed: standard(0xd0182b, 0.35, 0.4),
    hubBadge: new THREE.MeshBasicMaterial({ map: badgeTexture(), toneMapped: false }),
  };
}

// Steering-wheel hub badge: tricolour slashes over a roundel. A 256 px canvas keeps the
// marks readable at cockpit distance where sub-millimetre extruded bars turn to mush.
let badgeMap;
function badgeTexture() {
  if (typeof document === 'undefined') return null;
  if (badgeMap) return badgeMap;
  const size = 256, canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const dark = '#10161c';
  // Original M-sport mark: slanted tricolour over a single letter, not any real roundel.
  ctx.fillStyle = dark; ctx.fillRect(0, 0, size, size);
  const cx = size / 2;
  const bars = [['#2b87d8', cx - 66], ['#123a8a', cx - 22], ['#d0182b', cx + 22]];
  for (const [color, x] of bars) {
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x, 46); ctx.lineTo(x + 38, 46); ctx.lineTo(x + 16, 132); ctx.lineTo(x - 22, 132); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#e8eef2'; ctx.font = '700 62px Arial,sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('M4', cx, 212);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  badgeMap = texture;
  return texture;
}
