import * as THREE from 'three';
import { box, collection, cylinder, roundedBox, torus, transform, tube } from './geometry.js';

const WIDTH = 1536, HEIGHT = 384;
const SCALE = WIDTH / 0.71;           // canvas pixels per metre on the 0.71 m screen
const START = Math.PI * 0.75, SWEEP = Math.PI * 1.5;
const clamp = THREE.MathUtils.clamp;
const FALLBACK = { header: 'M  //  PERFORMANCE', sub: 'HORIZON M4', mode: 'SPORT' };

const angle = (value, max) => START + clamp(value / max, 0, 1) * SWEEP;

function dialCanvas() {
  if (typeof document === 'undefined') return { canvas: null, context: null, texture: null };
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return { canvas, context, texture };
}

function drawDial(ctx, cx, cy, radius, max, step, value, redFrom, labelStep = step) {
  ctx.textAlign = 'center';
  for (let v = 0; v <= max + 1e-6; v += step) {
    const a = angle(v, max), major = Math.round(v / step) % 1 === 0, label = v % labelStep === 0;
    const red = v >= redFrom;
    ctx.strokeStyle = red ? '#ff4a3d' : major ? '#e8eef2' : '#5e7484';
    ctx.lineWidth = label ? 3 : major ? 2 : 1.1;
    const inner = radius - (label ? 15 : major ? 10 : 6);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    ctx.stroke();
    if (label) {
      ctx.font = '600 17px Arial,sans-serif';
      ctx.fillStyle = red ? '#ff6a5e' : '#dfe7ec';
      ctx.fillText(String(v), cx + Math.cos(a) * (radius - 32), cy + Math.sin(a) * (radius - 32) + 7);
    }
  }
  // Blue trim follows the needle; the redline segment stays red.
  ctx.strokeStyle = '#3f8fe0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, radius + 7, START, angle(Math.min(value, redFrom), max)); ctx.stroke();
  if (value > redFrom) {
    ctx.strokeStyle = '#ff4a3d'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, radius + 7, angle(redFrom, max), angle(value, max)); ctx.stroke();
  }
}

// The M cockpit: two round dials under a ///M strip, a centre gear column and the
// M shift-light bar. Deliberately a different composition from the AMG's wide split cluster.
function drawCoupe(ctx, state) {
  const { speed, rpm, gear, fuel, coolant, odometer, turnSignal, time } = state;
  const brand = { ...FALLBACK, ...(state.brand || {}) };
  const blink = Math.floor(time * 2.8) % 2 === 0;
  const kmh = Math.round(Math.abs(speed) * 3.6);

  ctx.fillStyle = '#04070b'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(760, 210, 20, 760, 210, 640);
  glow.addColorStop(0, '#101c29'); glow.addColorStop(1, '#04070b');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = '#ffffff05'; ctx.lineWidth = 1;
  for (let y = 10; y < HEIGHT; y += 5) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke(); }

  // Header band: ///M tricolour, brand line and model subtitle.
  const slants = [['#2b87d8', 606], ['#123a8a', 628], ['#d0182b', 650]];
  for (const [color, x] of slants) {
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(x, 24); ctx.lineTo(x + 15, 24); ctx.lineTo(x + 6, 56); ctx.lineTo(x - 9, 56); ctx.closePath(); ctx.fill();
  }
  ctx.textAlign = 'left'; ctx.fillStyle = '#dfe7ec'; ctx.font = '700 20px Arial,sans-serif';
  ctx.fillText(brand.header, 678, 42);
  ctx.fillStyle = '#6d8091'; ctx.font = '12px Arial,sans-serif';
  ctx.fillText(brand.sub, 678, 59);

  // Turn signals in the far corners.
  for (const direction of [-1, 1]) {
    const x = direction < 0 ? 44 : 1492, lit = turnSignal === direction && blink;
    ctx.fillStyle = lit ? '#7cf0a8' : '#1f2c34';
    ctx.beginPath(); ctx.moveTo(x + direction * 17, 70); ctx.lineTo(x - direction * 2, 55); ctx.lineTo(x - direction * 2, 64); ctx.lineTo(x - direction * 21, 64); ctx.lineTo(x - direction * 21, 76); ctx.lineTo(x - direction * 2, 76); ctx.lineTo(x - direction * 2, 85); ctx.closePath(); ctx.fill();
  }

  // M shift lights: green through amber into red.
  for (let i = 0; i < 9; i++) {
    const on = rpm >= 5200 + i * 420;
    ctx.fillStyle = on ? (i > 6 ? '#ff4a3d' : i > 3 ? '#ffd05a' : '#63d7a0') : '#1b262f';
    ctx.beginPath(); ctx.roundRect(966 + i * 30, 36, 22, 9, 3); ctx.fill();
  }

  // Twin round dials: road speed left, engine speed right. The digital readout sits under
  // the open bottom wedge of the scale, clear of both the sweep and the needle pivot.
  drawDial(ctx, 300, 160, 110, 260, 20, kmh, 999, 40);
  drawDial(ctx, 1236, 160, 110, 8, 0.5, rpm / 1000, 7, 1);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2f6f8'; ctx.font = '700 34px Arial,sans-serif';
  ctx.fillText(String(kmh).padStart(3, '0'), 300, 262);
  ctx.fillStyle = '#7f93a2'; ctx.font = '11px Arial,sans-serif'; ctx.fillText('SPEED · KM/H', 300, 282);
  ctx.fillStyle = '#8ea3b3'; ctx.font = '600 23px monospace';
  ctx.fillText(String(Math.round(rpm / 50) * 50).padStart(4, '0'), 1236, 262);
  ctx.fillStyle = '#7f93a2'; ctx.font = '11px Arial,sans-serif'; ctx.fillText('RPM · × 1000', 1236, 282);

  // Centre column: gear, drive mode and mileage.
  ctx.fillStyle = gear === 'R' ? '#ffb066' : '#f7fafc'; ctx.font = '700 84px Arial,sans-serif';
  ctx.fillText(String(gear), 768, 206);
  ctx.fillStyle = '#3f8fe0'; ctx.font = '600 14px Arial,sans-serif';
  ctx.fillText(gear === 'N' ? 'NEUTRAL' : gear === 'R' ? 'REVERSE' : brand.mode, 768, 232);
  ctx.fillStyle = '#66798a'; ctx.font = '13px monospace';
  ctx.fillText(`${(odometer / 1000).toFixed(2)} km`, 768, 256);

  // Fuel and coolant along the lower band, clear of the wheel rim.
  const bar = (x, y, w, label, value, text, tint) => {
    ctx.textAlign = 'left'; ctx.fillStyle = '#7b8d9b'; ctx.font = '13px Arial,sans-serif';
    ctx.fillText(label, x, y - 12);
    ctx.textAlign = 'right'; ctx.fillStyle = tint; ctx.font = '600 16px Arial,sans-serif';
    ctx.fillText(text, x + w, y - 12);
    ctx.fillStyle = '#1c2a34'; ctx.fillRect(x, y, w, 6);
    ctx.fillStyle = tint; ctx.fillRect(x, y, w * clamp(value, 0, 1), 6);
  };
  bar(120, 352, 360, 'FUEL', fuel, `${Math.round(fuel * 100)}%`, fuel < 0.15 ? '#ffb44f' : '#63d7a0');
  bar(1056, 352, 360, 'COOLANT', coolant / 120, `${Math.round(coolant)}°C`, coolant > 108 ? '#ff6659' : '#bccbd6');
  ctx.textAlign = 'center'; ctx.fillStyle = '#4c5f6d'; ctx.font = '11px Arial,sans-serif';
  ctx.fillText('8-SPEED M DCT · REAR DRIVE', 768, 350);
}

function createCluster(materials) {
  const root = new THREE.Group();
  root.name = 'liveInstrumentClusterM';
  root.position.set(0.345, 0.748, 0.452);
  root.rotation.y = Math.PI;
  root.rotation.x = -0.07;
  root.add(new THREE.Mesh(roundedBox([0.745, 0.202, 0.032], [0, 0, -0.012], [0, 0, 0], 0.016), materials.carbon));
  root.add(new THREE.Mesh(roundedBox([0.726, 0.184, 0.006], [0, 0, 0.001], [0, 0, 0], 0.008), materials.darkMetal));

  const dial = dialCanvas();
  const screenMaterial = new THREE.MeshBasicMaterial({ color: dial.texture ? 0xffffff : 0x0a1218, map: dial.texture, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.71, 0.1775), screenMaterial);
  screen.position.z = 0.006;
  root.add(screen);

  const dialX = (cx) => (cx - WIDTH / 2) / SCALE;
  const dialY = (cy) => (HEIGHT / 2 - cy) / SCALE;
  const makeNeedle = (name, cx, cy, length) => {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(dialX(cx), dialY(cy), 0.013);
    const hand = new THREE.Mesh(transform(new THREE.ConeGeometry(0.0016, length, 4), [length / 2 - 0.004, 0, 0], [0, 0, -Math.PI / 2]), new THREE.MeshBasicMaterial({ color: 0xff8a5c, toneMapped: false }));
    const cap = new THREE.Mesh(transform(new THREE.CylinderGeometry(0.0052, 0.0052, 0.003, 20), [0, 0, 0.003], [Math.PI / 2, 0, 0]), materials.silver);
    group.add(hand, cap);
    root.add(group);
    return group;
  };
  const speedNeedle = makeNeedle('speedNeedle', 300, 160, 0.043);
  const rpmNeedle = makeNeedle('rpmNeedle', 1236, 160, 0.043);

  // Thin metal rings around the two dials echo the M analogue gauges.
  for (const cx of [300, 1236]) {
    const ring = new THREE.Mesh(torus(0.0515, 0.0013, [dialX(cx), dialY(160), 0.011], [0, 0, 0], 88), materials.darkMetal);
    root.add(ring);
  }
  for (const side of [-1, 1]) {
    const screw = new THREE.Mesh(transform(new THREE.CylinderGeometry(0.0025, 0.0025, 0.002, 12), [side * 0.352, -0.082, 0.01], [Math.PI / 2, 0, 0]), materials.silver);
    root.add(screw);
  }

  const state = { speed: 0, rpm: 0, gear: 'N', fuel: 1, coolant: 20, odometer: 0, turnSignal: 0, time: 0, brand: FALLBACK };
  let accumulator = 1;
  function update(dt, data) {
    Object.assign(state, data);
    speedNeedle.rotation.z = -angle(Math.abs(state.speed) * 3.6, 260);
    rpmNeedle.rotation.z = -angle(state.rpm / 1000, 8);
    root.userData.readings = { ...state };
    accumulator += dt;
    if (dial.context && (accumulator >= 1 / 24 || dt === 0)) {
      drawCoupe(dial.context, state);
      dial.texture.needsUpdate = true;
      accumulator = 0;
    }
  }
  function setBrand(brand) {
    state.brand = brand;
    root.userData.readings = { ...state };
    accumulator = 1;
  }
  update(0, state);
  return { root, update, needles: { speed: speedNeedle, rpm: rpmNeedle }, setBrand, canvas: dial.canvas };
}

// M Sport wheel: round rim with thick nine-and-three grips, three spokes, a tricolour
// badge in a roundel and the red M1/M2 buttons — visibly not the AMG's squared-off wheel.
function createWheel(materials) {
  const mount = new THREE.Group();
  mount.position.set(0.345, 0.703, 0.19);
  mount.rotation.x = -0.16;
  const wheel = new THREE.Group();
  wheel.name = 'steeringWheel';
  const batch = collection(), add = (name, g) => batch.add(name, g);

  add('seat', torus(0.124, 0.0158, [0, 0, 0], [0, 0, 0], 104));
  add('silver', torus(0.1065, 0.0016, [0, 0, 0.004], [0, 0, 0], 84));
  for (const side of [-1, 1]) {
    add('seat', roundedBox([0.03, 0.07, 0.042], [side * 0.118, 0, 0], [0, 0, 0], 0.025));
    add('mSportRed', tube([[side * 0.127, -0.032, -0.004], [side * 0.129, 0.006, -0.004], [side * 0.125, 0.036, -0.004]], 0.0012, 24, false, 4));
  }

  for (const side of [-1, 1]) {
    add('seat', roundedBox([0.064, 0.026, 0.024], [side * 0.060, 0.012, 0], [0, 0, side * -0.26], 0.011));
    add('silver', roundedBox([0.052, 0.012, 0.012], [side * 0.061, 0.016, -0.015], [0, 0, side * -0.26], 0.005));
    add('mSportRed', roundedBox([0.022, 0.013, 0.008], [side * 0.092, 0.033, -0.018], [0, 0, side * -0.22], 0.004));
    add('silver', cylinder(0.0065, 0.006, [side * 0.077, 0.01, -0.02], [Math.PI / 2, 0, 0], 14));
    add('black', roundedBox([0.016, 0.012, 0.006], [side * 0.061, -0.006, -0.02], [0, 0, side * -0.2], 0.003));
  }
  add('darkMetal', roundedBox([0.03, 0.076, 0.024], [0, -0.065, 0], [0, 0, 0], 0.012));
  add('silver', roundedBox([0.02, 0.012, 0.012], [0, -0.073, -0.016], [0, 0, 0], 0.004));

  // Hub pad with the ///M tricolour over a roundel badge, drawn on one small canvas so the
  // marks stay crisp instead of reading as blobs at cockpit distance.
  add('seat', roundedBox([0.086, 0.064, 0.034], [0, 0.001, -0.004], [0, 0, 0], 0.019));
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.048, 0.058), materials.hubBadge);
  badge.position.set(0, 0.004, -0.0245);
  badge.rotation.y = Math.PI;
  wheel.add(badge);
  add('silver', torus(0.0215, 0.0012, [0, 0.004, -0.0238], [0, 0, 0], 32));

  for (const [name, geometry] of batch.finish()) {
    const mesh = new THREE.Mesh(geometry, materials[name]);
    mesh.castShadow = true;
    wheel.add(mesh);
  }
  const column = new THREE.Mesh(cylinder(0.028, 0.21, [0, 0, 0.09], [Math.PI / 2, 0, 0], 24), materials.carbonMatte);
  mount.add(column, wheel);
  return { root: mount, wheel };
}

export function createCoupeSteering(materials) { return createWheel(materials); }
export function createCoupeInstruments(materials) { return createCluster(materials); }
