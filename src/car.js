import * as THREE from 'three';
import { createExteriorGeometry, FRONT_AXLE, REAR_AXLE, WHEEL_RADIUS } from './car/exterior.js';
import { createCabinGeometry, createSteering } from './car/cabin.js';
import { createInstruments } from './car/instruments.js';
import { createMaterials } from './car/materials.js';
import { createWheels } from './car/wheels.js';

let exteriorGeometry, cabinGeometry, shadowMap;
const TAU = Math.PI * 2;

function contactMap() {
  const data = new Uint8Array(64 * 128 * 4);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 64; x++) {
      const radius = Math.sqrt(((x - 31.5) / 32) ** 4 + ((y - 63.5) / 64) ** 4);
      data[(y * 64 + x) * 4 + 3] = Math.round(THREE.MathUtils.clamp((1 - radius) * 2.7, 0, 1) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, 64, 128);
  texture.magFilter = texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function install(geometry, materials, parent, prefix) {
  for (const [name, shape] of geometry) {
    const mesh = new THREE.Mesh(shape, materials[name]);
    mesh.name = `${prefix}-${name}`;
    mesh.castShadow = !['glass', 'led', 'taillight'].includes(name);
    mesh.receiveShadow = name !== 'glass';
    parent.add(mesh);
  }
}

/** Metres. Forward +Z, up +Y, driver-left +X. The caller owns root motion. */
export function createCar({ color = 0xe02028 } = {}) {
  exteriorGeometry ??= createExteriorGeometry();
  cabinGeometry ??= createCabinGeometry();
  shadowMap ??= contactMap();
  const materials = createMaterials(color);
  const root = new THREE.Group();
  root.name = 'Horizon One · detailed';
  const body = new THREE.Group();
  body.name = 'suspendedBody';
  root.add(body);
  install(exteriorGeometry, materials, body, 'car');

  const cabin = new THREE.Group();
  cabin.name = 'cockpitInterior';
  const cabinMaterials = { ...materials, carbon: materials.cabinCarbon, carbonMatte: materials.cabinCarbonMatte, black: materials.cabinBlack, darkMetal: materials.cabinMetal };
  install(cabinGeometry, cabinMaterials, cabin, 'cabin');
  const steering = createSteering(cabinMaterials);
  const instruments = createInstruments(cabinMaterials);
  cabin.add(steering.root, instruments.root);
  // Soft cabin fill: skylight entering the greenhouse plus spill from the display.
  // The rig stays in the scene at all times (only its intensity changes) so the number of
  // lights is constant; otherwise the first cockpit switch recompiles every shader on the fly.
  const lightRig = new THREE.Group();
  lightRig.name = 'cockpitLightRig';
  root.add(lightRig);
  const cabinAmbient = new THREE.AmbientLight(0x9aabb9, 0);
  cabinAmbient.name = 'cockpitAmbientLight';
  lightRig.add(cabinAmbient);
  const cabinFill = new THREE.PointLight(0xe0e6ea, 0, 2.6, 2);
  cabinFill.name = 'cockpitFillLight';
  cabinFill.position.set(0.345, 1.06, 0.26);
  lightRig.add(cabinFill);
  const clusterGlow = new THREE.PointLight(0x9fd8da, 0, 0.9, 2);
  clusterGlow.name = 'clusterGlowLight';
  clusterGlow.position.set(0.345, 0.82, 0.46);
  lightRig.add(clusterGlow);
  const cabinBase = { ambient: 0.42, fill: 1.05, glow: 0.5 };
  let cabinInside = false;
  function applyCabinLights() {
    cabinAmbient.intensity = cabinInside ? cabinBase.ambient : 0;
    cabinFill.intensity = cabinInside ? cabinBase.fill : 0;
    clusterGlow.intensity = cabinInside ? cabinBase.glow : 0;
  }
  function setMood(name) {
    const sunset = name === 'sunset';
    cabinAmbient.color.setHex(sunset ? 0xc2b0a2 : 0x9aabb9);
    cabinFill.color.setHex(sunset ? 0xffd9b6 : 0xe0e6ea);
    cabinBase.ambient = sunset ? 0.34 : 0.42;
    cabinBase.fill = sunset ? 0.85 : 1.05;
    applyCabinLights();
  }
  setMood('day');
  body.add(cabin);
  const wheels = createWheels(root, materials);

  const cockpitCamera = new THREE.Object3D();
  cockpitCamera.name = 'cockpitCamera-left-hand-drive';
  cockpitCamera.position.set(0.345, 1.015, -0.235);
  cockpitCamera.rotation.x = 0.075;
  const hoodCamera = new THREE.Object3D();
  hoodCamera.name = 'hoodCamera';
  hoodCamera.position.set(0, 0.785, 1.22);
  body.add(cockpitCamera, hoodCamera);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.26, 4.95), new THREE.MeshBasicMaterial({ map: shadowMap, transparent: true, opacity: 0.26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  shadow.name = 'contactShadow';
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.009;
  shadow.renderOrder = -1;
  root.add(shadow);
  root.userData.dimensions = { length: 4.756, width: 2.010, height: 1.261, wheelbase: FRONT_AXLE - REAR_AXLE };
  root.userData.provenance = 'Original parametric geometry; see src/car/ASSET-NOTES.md';

  let spin = 0, view = '';
  function setView(mode) {
    if (mode === view) return;
    view = mode;
    const inside = mode === 'cockpit';
    cabinInside = inside;
    applyCabinLights();
    materials.glass.transparent = inside;
    materials.glass.opacity = inside ? 0.035 : 1;
    materials.glass.depthWrite = !inside;
    materials.glass.needsUpdate = true;
    cabin.visible = inside;
  }

  function update(dt, { speed = 0, steer = 0, steerVisual = null, throttle = 0, brake = 0, time = 0, rpm = 0, gear = 'N', fuel = 1, coolant = 20, odometer = 0, turnSignal = 0 } = {}) {
    spin = (spin + speed * dt / WHEEL_RADIUS) % TAU;
    const turn = THREE.MathUtils.clamp(steer, -1, 1);
    const ease = 1 - Math.exp(-dt * 10);
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, brake * 0.018 - throttle * 0.008, ease);
    body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, -turn * Math.min(Math.abs(speed) / 35, 1) * 0.017, ease);
    body.position.y = Math.sin(time * 29) * Math.min(Math.abs(speed) / 12, 1) * throttle * 0.0008;
    for (const wheel of wheels) {
      const inside = Math.sign(turn) === -wheel.userData.side;
      const steeringAngle = turn * 0.46 / (1 + speed * speed / 110);
      wheel.rotation.y = wheel.userData.front ? -steeringAngle * (inside ? 1.055 : 0.945) : 0;
      wheel.userData.rolling.rotation.x = spin;
    }
    // Seen from the driver's seat, a right turn rotates the wheel clockwise.
    steering.wheel.rotation.z = THREE.MathUtils.clamp(steerVisual ?? steer, -1, 1) * 1.1;
    materials.taillight.emissiveIntensity = 1.1 + brake * 2.4;
    instruments.update(dt, { speed, rpm, gear, fuel, coolant, odometer, turnSignal, time });
  }

  setView('chase');
  return { root, body, wheels, cockpitCamera, hoodCamera, update, setView, setMood };
}
