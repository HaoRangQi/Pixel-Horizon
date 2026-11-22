import * as THREE from 'three';
import { box, roundedBox, torus, transform } from './geometry.js';

const WIDTH = 1536, HEIGHT = 384;
const START = Math.PI * 0.75, SWEEP = Math.PI * 1.5;
const clamp = THREE.MathUtils.clamp;

function tickAngle(rpm) { return START + clamp(rpm / 12000, 0, 1) * SWEEP; }

function createDialCanvas() {
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

function drawInstruments(ctx, state) {
  const { speed, rpm, gear, fuel, coolant, odometer, turnSignal, time } = state;
  const blink = Math.floor(time * 2.8) % 2 === 0;
  ctx.fillStyle = '#050a10'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(420, 230, 20, 500, 250, 560);
  glow.addColorStop(0, '#18222c'); glow.addColorStop(1, '#050a10');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.lineWidth = 1;
  for (let y = 12; y < HEIGHT; y += 5) { ctx.strokeStyle = '#ffffff03'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke(); }

  // Header
  ctx.textAlign = 'center'; ctx.fillStyle = '#9da9b4'; ctx.font = '600 21px Arial,sans-serif';
  ctx.fillText('AMG  //  PERFORMANCE', 768, 36);
  ctx.font = '14px Arial,sans-serif'; ctx.fillStyle = '#677786';
  ctx.fillText('HORIZON ONE', 768, 58);

  // Shift lights
  for (let i = 0; i < 12; i++) {
    const on = rpm >= 4800 + i * 480;
    ctx.fillStyle = on ? i > 8 ? '#ff504b' : i > 5 ? '#ffe88e' : '#6ee4c4' : '#26333a';
    if (on && i > 8 && !blink && rpm > 10600) ctx.fillStyle = '#66302c';
    ctx.beginPath(); ctx.roundRect(575 + i * 33, 76, 24, 11, 4); ctx.fill();
  }

  // Turn signals at the far corners
  for (const direction of [-1, 1]) {
    const x = direction < 0 ? 44 : 1492, lit = turnSignal === direction && blink;
    ctx.fillStyle = lit ? '#75f4a9' : '#22352e';
    ctx.beginPath(); ctx.moveTo(x + direction * 17, 70); ctx.lineTo(x - direction * 2, 55); ctx.lineTo(x - direction * 2, 64); ctx.lineTo(x - direction * 21, 64); ctx.lineTo(x - direction * 21, 76); ctx.lineTo(x - direction * 2, 76); ctx.lineTo(x - direction * 2, 85); ctx.closePath(); ctx.fill();
  }

  // Left: odometer + tachometer
  ctx.textAlign = 'center'; ctx.fillStyle = '#7d8d99'; ctx.font = '13px Arial,sans-serif';
  ctx.fillText('ODOMETER', 196, 28);
  ctx.fillStyle = '#cfdae0'; ctx.font = '15px monospace';
  ctx.fillText(`${(odometer / 1000).toFixed(2)} km`, 196, 47);

  const cx = 196, cy = 158, radius = 106;
  for (let i = 0; i <= 60; i++) {
    const a = START + i / 60 * SWEEP, major = i % 5 === 0;
    ctx.strokeStyle = i >= 50 ? '#ff4848' : major ? '#f4f6ef' : '#7d8c98';
    ctx.lineWidth = major ? 3 : 1.2;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (radius - (major ? 13 : 6)), cy + Math.sin(a) * (radius - (major ? 13 : 6))); ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius); ctx.stroke();
    if (major) {
      ctx.font = '600 19px Arial,sans-serif'; ctx.fillStyle = i >= 50 ? '#ff6860' : '#e1e8eb';
      ctx.fillText(String(i / 5), cx + Math.cos(a) * (radius - 31), cy + Math.sin(a) * (radius - 31) + 6);
    }
  }
  ctx.strokeStyle = '#35c6bd'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, radius + 8, START, tickAngle(rpm)); ctx.stroke();
  ctx.strokeStyle = '#ff393f'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, radius + 8, tickAngle(10000), tickAngle(12000)); ctx.stroke();
  ctx.fillStyle = '#b7c2c9'; ctx.font = '12px Arial,sans-serif'; ctx.fillText('RPM × 1000', cx, cy + 78);
  ctx.fillStyle = '#f8faf5'; ctx.font = '600 22px monospace'; ctx.fillText(String(Math.round(rpm / 50) * 50).padStart(4, '0'), cx, cy + 54);

  // Bottom-left: fuel (kept above the steering-wheel arc)
  ctx.textAlign = 'left'; ctx.font = '14px Arial,sans-serif'; ctx.fillStyle = '#8294a3'; ctx.fillText('FUEL', 26, 300);
  ctx.textAlign = 'right'; ctx.fillStyle = fuel < 0.15 ? '#ffb54d' : '#5ed0c3'; ctx.font = '600 17px Arial,sans-serif'; ctx.fillText(`${Math.round(fuel * 100)}%`, 280, 300);
  ctx.fillStyle = '#253440'; ctx.fillRect(26, 310, 254, 6);
  ctx.fillStyle = fuel < 0.15 ? '#ffb54d' : '#5ed0c3'; ctx.fillRect(26, 310, 254 * fuel, 6);

  // Right: gear
  ctx.textAlign = 'center'; ctx.fillStyle = '#96a5b2'; ctx.font = '15px Arial,sans-serif'; ctx.fillText('GEAR', 1188, 110);
  ctx.fillStyle = gear === 'R' ? '#ffbb74' : '#fafdf2'; ctx.font = '700 88px Arial,sans-serif'; ctx.fillText(String(gear), 1188, 202);
  ctx.fillStyle = '#76d8d0'; ctx.font = '13px Arial,sans-serif'; ctx.fillText(gear === 'N' ? 'NEUTRAL' : gear === 'R' ? 'REVERSE' : 'E-PERFORMANCE', 1188, 232);

  // Right: ground speed
  ctx.fillStyle = '#96a5b2'; ctx.font = '15px Arial,sans-serif'; ctx.fillText('GROUND SPEED', 1392, 110);
  ctx.fillStyle = '#fafdf2'; ctx.font = '700 90px Arial,sans-serif'; ctx.fillText(String(Math.round(Math.abs(speed) * 3.6)).padStart(3, '0'), 1392, 206);
  ctx.fillStyle = '#96a5b2'; ctx.font = '17px Arial,sans-serif'; ctx.fillText('km/h', 1392, 240);

  // Bottom-right: coolant (kept above the steering-wheel arc)
  ctx.textAlign = 'left'; ctx.font = '14px Arial,sans-serif'; ctx.fillStyle = '#8294a3'; ctx.fillText('COOLANT', 1252, 300);
  ctx.textAlign = 'right'; ctx.fillStyle = coolant > 108 ? '#ff6659' : '#b8cad6'; ctx.font = '600 17px Arial,sans-serif'; ctx.fillText(`${Math.round(coolant)}°C`, 1508, 300);
  ctx.fillStyle = '#253440'; ctx.fillRect(1252, 310, 256, 6);
  ctx.fillStyle = coolant > 108 ? '#ff6659' : '#b8cad6'; ctx.fillRect(1252, 310, 256 * clamp(coolant / 120, 0, 1), 6);
}

export function createInstruments(materials) {
  const root = new THREE.Group();
  root.name = 'liveInstrumentCluster';
  root.position.set(0.345, 0.752, 0.44);
  root.rotation.y = Math.PI;
  root.rotation.x = -0.06;
  const panel = new THREE.Mesh(roundedBox([0.74, 0.2, 0.032], [0, 0, -0.012], [0, 0, 0], 0.016), materials.carbon);
  root.add(panel);
  const dial = createDialCanvas();
  const screenMaterial = new THREE.MeshBasicMaterial({ color: dial.texture ? 0xffffff : 0x15262b, map: dial.texture, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.71, 0.1775), screenMaterial);
  screen.position.z = 0.006;
  root.add(screen);

  // The rev counter sits on the left third so the wheel rim never hides it.
  const dialX = (196 - WIDTH / 2) / (WIDTH / 0.71), dialY = (HEIGHT / 2 - 158) / (WIDTH / 0.71);
  const rim = new THREE.Mesh(torus(0.049, 0.0016, [dialX, dialY, 0.01], [0, 0, 0], 96), materials.darkMetal);
  root.add(rim);
  const needle = new THREE.Group();
  needle.name = 'rpmNeedle';
  needle.position.set(dialX, dialY, 0.012);
  const hand = new THREE.Mesh(transform(new THREE.ConeGeometry(0.0015, 0.0415, 4), [0.0197, 0, 0], [0, 0, -Math.PI / 2]), new THREE.MeshBasicMaterial({ color: 0xff7561, toneMapped: false }));
  needle.add(hand);
  const counterweight = new THREE.Mesh(box([0.011, 0.0024, 0.0015], [-0.005, 0, 0]), materials.silver);
  needle.add(counterweight);
  const cap = new THREE.Mesh(transform(new THREE.CylinderGeometry(0.005, 0.005, 0.003, 20), [0, 0, 0.003], [Math.PI / 2, 0, 0]), materials.silver);
  needle.add(cap);
  root.add(needle);
  for (const side of [-1, 1]) {
    const screw = new THREE.Mesh(transform(new THREE.CylinderGeometry(0.0025, 0.0025, 0.002, 12), [side * 0.352, -0.082, 0.01], [Math.PI / 2, 0, 0]), materials.silver);
    root.add(screw);
  }
  let accumulator = 1;
  const state = { speed: 0, rpm: 0, gear: 'N', fuel: 1, coolant: 20, odometer: 0, turnSignal: 0, time: 0 };
  function update(dt, data) {
    Object.assign(state, data);
    needle.rotation.z = -tickAngle(state.rpm);
    root.userData.readings = { ...state };
    accumulator += dt;
    if (dial.context && (accumulator >= 1 / 24 || dt === 0)) {
      drawInstruments(dial.context, state);
      dial.texture.needsUpdate = true;
      accumulator = 0;
    }
  }
  update(1, state);
  return { root, update, needle, canvas: dial.canvas };
}
