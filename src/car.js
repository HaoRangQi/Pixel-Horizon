import * as THREE from 'three';
import { FRONT_AXLE, REAR_AXLE, WHEEL_RADIUS } from './car/exterior.js';
import { createSteering } from './car/cabin.js';
import { BODY_ORDER, BODY_STYLES, bodyGeometry, sharedCabinGeometry } from './car/bodies.js';
import { createCoupeInstruments, createCoupeSteering } from './car/coupeCabin.js';
import { createInstruments } from './car/instruments.js';
import { createMaterials } from './car/materials.js';
import { createMirrors } from './car/mirrors.js';
import { createWheels } from './car/wheels.js';

const TAU = Math.PI * 2;
let shadowMap;

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
export function createCar({ color = null, style = 'one', garage = true } = {}) {
  shadowMap ??= contactMap();
  const spec = BODY_STYLES[style] ?? BODY_STYLES.one;
  const paint = color ?? spec.paint;
  const materials = createMaterials(paint);
  const root = new THREE.Group();
  root.name = `Horizon ${style} · detailed`;
  const body = new THREE.Group();
  body.name = 'suspendedBody';
  root.add(body);

  // Every body style installs its own shell under one named group, so a garage swap can
  // exchange the visible car while the driving model, wheels and cockpit keep running.
  // Opponent cars pass garage:false and build only the style they need.
  const shells = new Map();
  for (const key of garage ? BODY_ORDER : [style]) {
    const shell = new THREE.Group();
    shell.name = `body-${key}`;
    shell.visible = false;
    install(bodyGeometry(key), materials, shell, `car-${key}`);
    body.add(shell);
    shells.set(key, shell);
  }

  const cabin = new THREE.Group();
  cabin.name = 'cockpitInterior';
  const cabinMaterials = { ...materials, carbon: materials.cabinCarbon, carbonMatte: materials.cabinCarbonMatte, black: materials.cabinBlack, darkMetal: materials.cabinMetal };
  install(sharedCabinGeometry(), cabinMaterials, cabin, 'cabin');
  // Each style brings its own wheel and cluster: the AMG's squared-off wheel and wide split
  // display stay with the hypercar, while the coupe gets a round three-spoke M wheel and a
  // twin-dial M cluster. Only the active pair hangs under the cabin, so name lookups
  // ('steeringWheel', 'liveInstrumentCluster') always resolve to the car in use.
  const cabins = new Map();
  for (const key of garage ? BODY_ORDER : [style]) {
    const steering = key === 'coupe' ? createCoupeSteering(cabinMaterials) : createSteering(cabinMaterials);
    const instruments = key === 'coupe' ? createCoupeInstruments(cabinMaterials) : createInstruments(cabinMaterials);
    instruments.root.name = 'liveInstrumentCluster';
    cabins.set(key, { steering, instruments });
  }
  let steering = null, instruments = null;
  let styleMirrors = null;
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
  root.userData.provenance = 'Original parametric geometry; see src/car/ASSET-NOTES.md';

  let spin = 0, styleKey = null, view = '', cabinStyle = null;
  function applyStyle(key) {
    if (!BODY_STYLES[key] || key === styleKey) return;
    styleKey = key;
    const styleSpec = BODY_STYLES[key];
    for (const [name, shell] of shells) shell.visible = name === key;
    materials.paint.color.setHex(styleSpec.paint);
    cockpitCamera.position.set(...styleSpec.cockpit.position);
    cockpitCamera.rotation.x = styleSpec.cockpit.pitch;
    // Swap the whole cockpit pair, not just its branding: the coupe's wheel and gauges are
    // built independently from the AMG's.
    if (cabinStyle !== key) {
      cabinStyle = key;
      if (steering) cabin.remove(steering.root);
      if (instruments) cabin.remove(instruments.root);
      ({ steering, instruments } = cabins.get(key));
      cabin.add(steering.root, instruments.root);
    }
    instruments.setBrand(styleSpec.cluster);
    if (styleMirrors) {
      cabin.remove(styleMirrors.interior);
      body.remove(styleMirrors.sides);
      // The panorama camera rides on root; drop it too or every swap leaves a live camera behind.
      styleMirrors.camera.parent?.remove(styleMirrors.camera);
      styleMirrors.dispose?.();
    }
    styleMirrors = createMirrors(cabinMaterials, styleSpec.mirrors);
    cabin.add(styleMirrors.interior);
    body.add(styleMirrors.sides);
    root.add(styleMirrors.camera);
    cabin.visible = view === 'cockpit';
    styleMirrors.setActive(cabinInside);
    root.userData.dimensions = { length: styleSpec.length || 4.756, width: styleSpec.width || 2.010, height: styleSpec.height || 1.261, wheelbase: FRONT_AXLE - REAR_AXLE };
    root.userData.style = key;
  }

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
    styleMirrors?.setActive(inside);
  }

  function updateMirrors(renderer, scene, active, dt) {
    styleMirrors?.setActive(active);
    if (active) styleMirrors?.render(renderer, scene, root, dt);
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
  applyStyle(style);
  setView('chase');
  return {
    root, body, wheels, cockpitCamera, hoodCamera,
    get mirrors() { return styleMirrors; },
    get style() { return styleKey; },
    setStyle: applyStyle, update, updateMirrors, setView, setMood,
  };
}
