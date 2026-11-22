import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWorld } from './world.js';
import { createCar } from './car.js';
import { BODY_ORDER, BODY_STYLES } from './car/bodies.js';
import { createCameraRig } from './camera.js';
import { angleDelta, createDriver, stepDriver, resetDriver, followRoad } from './drive.js';
import { readDrivingInput } from './input.js';
import { createUI } from './ui.js';
import { DriveAudio } from './audio.js';
import { createOutdoorEnvironment } from './environment.js';
import './style.css';

const canvas = document.getElementById('world');
const clamp = THREE.MathUtils.clamp;
const wrap = (v) => ((v % 1) + 1) % 1;
let game;

function boot() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.97;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.06, 10000);
  const environment = createOutdoorEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.45;

  const world = createWorld(scene);
  const { road, regions } = world;
  const vehicle = createCar();
  scene.add(vehicle.root);
  const state = createDriver(road, 0.004);
  const rig = createCameraRig(camera, vehicle, road);
  const audio = new DriveAudio();
  const keys = new Set();
  const touches = new Set();
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const pixelGrade = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform sampler2D tDiffuse;varying vec2 vUv;
      void main(){vec4 c=texture2D(tDiffuse,vUv);
      float d=mod(gl_FragCoord.x,2.0)*2.0+mod(gl_FragCoord.y,2.0);
      c.rgb=floor(c.rgb*48.0+0.25+d*0.16)/48.0;
      gl_FragColor=vec4(c.rgb,1.0);}`,
  });
  composer.addPass(new OutputPass());
  composer.addPass(pixelGrade);

  let started = false;
  let screen = 'intro';
  let photo = false;
  let hidden = false;
  let mood = 'day';
  let reverseHeld = false;
  let race = null;
  let raceCars = [];
  let lastFrame = performance.now();
  let accumulator = 0;
  let time = 0;
  let steerVisual = 0;
  let hudTime = 0;
  let fpsTime = 0;
  let fpsFrames = 0;
  let fps = 60;
  let drag = null;
  const dust = makeDust(scene);

  const actions = {
    start() {
      if (started) return;
      started = true; screen = 'drive'; ui.start(); rig.reset();
      audio.start().catch(() => ui.toast('声音暂不可用，仍然可以继续驾驶'));
      ui.toast('W / ↑ 加速，A D 转向 · 按 F 可以观光巡航', 5500);
    },
    camera() { if (!started || screen !== 'drive' || photo) return; rig.cycle(); resize(); ui.toast(rig.name); },
    cruise() {
      if (!started || screen !== 'drive' || photo) return;
      state.cruise = !state.cruise;
      if (state.cruise && state.roadDistance > road.width) resetDriver(state, road, state.t), state.cruise = true;
      ui.toast(state.cruise ? '观光巡航已开启 · 转向或刹车可随时接管' : '已回到自由驾驶');
    },
    mood() { mood = mood === 'day' ? 'sunset' : 'day'; renderer.toneMappingExposure = world.setMood(mood).exposure; vehicle.setMood(mood); ui.mood(mood); },
    sound() { audio.setMuted(!audio.muted); ui.sound(audio.muted); if (started) audio.start().catch(() => {}); },
    photo() {
      if (!started || !['drive', 'photo'].includes(screen)) return;
      photo = !photo; screen = photo ? 'photo' : 'drive'; rig.setPhoto(photo); ui.photo(photo); keys.clear();
      if (photo) ui.toast('拖动鼠标，换个角度看看风景');
    },
    pause() {
      if (!started) return;
      if (photo) actions.photo();
      if (screen === 'pause') actions.resume(); else { screen = 'pause'; ui.screen('pause', state); keys.clear(); }
    },
    resume() {
      photo = false; rig.setPhoto(false); ui.photo(false);
      screen = 'drive'; ui.screen('drive', state); keys.clear(); canvas.focus({ preventScroll: true });
    },
    map() {
      if (!started || photo) return;
      if (screen === 'map') actions.close(); else { screen = 'map'; ui.screen('map', state); keys.clear(); }
    },
    close() { actions.resume(); },
    reset() {
      resetDriver(state, road, state.t); rig.reset(); actions.resume(); ui.toast('已回到公路，继续出发');
    },
    garage() {
      if (!started || screen !== 'drive' || photo) return;
      const next = BODY_ORDER[(BODY_ORDER.indexOf(vehicle.style) + 1) % BODY_ORDER.length];
      vehicle.setStyle(next);
      vehicle.setView('chase');
      ui.car(BODY_STYLES[next].name);
      rig.reset();
      ui.toast(`已换上 ${BODY_STYLES[next].name} · ${BODY_STYLES[next].subtitle}`);
    },
    hide() { if (!started || screen !== 'drive') return; hidden = !hidden; ui.hide(hidden); },
    signalLeft() { if (screen === 'drive') { state.turnSignal = state.turnSignal === -1 ? 0 : -1; state.signalArmed = false; } },
    signalRight() { if (screen === 'drive') { state.turnSignal = state.turnSignal === 1 ? 0 : 1; state.signalArmed = false; } },
    travel(index) {
      stopRace();
      ui.transition(() => {
        resetDriver(state, road, regions[index].t); rig.reset(); actions.resume(); ui.announce(regions[index].name);
      });
    },
    race() {
      ui.transition(() => {
        if (!raceCars.length) {
          raceCars = [0xeff2c1, 0x63b9c1, 0xe7a84e].map((color, i) => {
            const car = createCar({ color, style: BODY_ORDER[(BODY_ORDER.indexOf(vehicle.style) + 1 + i) % BODY_ORDER.length], garage: false });
            scene.add(car.root);
            return car;
          });
        }
        const start = Math.max(0.015, regions[1].t - 0.018);
        resetDriver(state, road, start); rig.reset();
        race = { start, length: 0.105, elapsed: -3, progress: 0, position: 1, opponents: [0, 1, 2].map((i) => ({ progress: -(i + 1) * 5 / road.length, speed: 0, target: 26 + i * 2, offset: (i % 2 ? 1 : -1) * 3.3 })) };
        raceCars.forEach((car) => { car.root.visible = true; });
        actions.resume(); ui.toast('3 · 准备出发', 950);
      });
    },
  };
  const ui = createUI(regions, road, actions);
  ui.sound(audio.muted);

  function stopRace() {
    race = null;
    raceCars.forEach((car) => { car.root.visible = false; });
  }

  function controls() {
    const input = readDrivingInput(keys, touches, reverseHeld);
    if (state.cruise && !input.manual) return followRoad(state, road);
    if (state.cruise && input.throttle && !input.brake && !input.steer) { const follow = followRoad(state, road, 32); return { ...follow, throttle: 1 }; }
    return input;
  }

  function updateRace(dt) {
    if (!race) return;
    const before = race.elapsed;
    race.elapsed += dt;
    const countdown = race.elapsed < 0;
    if (countdown) {
      if (Math.ceil(-race.elapsed) !== Math.ceil(-before)) ui.toast(`${Math.ceil(-race.elapsed)} · 准备出发`, 900);
    }
    if (before < 0 && race.elapsed >= 0) ui.toast('出发！海岸线在等你', 2200);
    for (let i = 0; i < race.opponents.length; i++) {
      const opponent = race.opponents[i];
      const t = wrap(race.start + opponent.progress);
      const a = road.sample(t); const b = road.sample(wrap(t + 25 / road.length));
      const bend = Math.abs(Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading)));
      const wanted = opponent.target / (1 + bend * 4);
      if (!countdown) {
        opponent.speed += (wanted - opponent.speed) * (1 - Math.exp(-0.65 * dt));
        opponent.progress += opponent.speed * dt / road.length;
      }
      const sample = road.sample(wrap(race.start + opponent.progress));
      const car = raceCars[i];
      car.root.position.set(sample.position.x + Math.cos(sample.heading) * opponent.offset, sample.position.y + 0.04, sample.position.z - Math.sin(sample.heading) * opponent.offset);
      car.root.rotation.set(0, sample.heading, 0);
      car.update(dt, { speed: opponent.speed, steer: 0, throttle: 0.5, brake: 0, time });
    }
    if (countdown) return;
    let progress = wrap(state.t - race.start);
    if (progress > 0.8) progress -= 1;
    race.progress = progress / race.length;
    race.position = 1 + race.opponents.filter((opponent) => opponent.progress > progress).length;
    if (race.progress >= 1) {
      const { position, elapsed } = race;
      stopRace(); screen = 'pause'; state.speed = 0; state.cruise = false;
      ui.finishRace(position, elapsed);
    }
  }

  function placeCar() {
    vehicle.root.position.set(state.x, state.y, state.z);
    vehicle.root.rotation.set(-state.pitch, state.heading, 0, 'YXZ');
    vehicle.root.updateMatrixWorld(true);
  }

  function resize() {
    const w = innerWidth; const h = innerHeight;
    // One render scale for every camera: switching into the cockpit used to resize the
    // composer and reallocate its targets mid-drive, which showed up as a freeze.
    const scale = Math.min(1, 1280 / w, 900 / h);
    renderer.setSize(Math.max(1, Math.floor(w * scale)), Math.max(1, Math.floor(h * scale)), false);
    composer.setSize(Math.max(1, Math.floor(w * scale)), Math.max(1, Math.floor(h * scale)));
    canvas.style.width = '100%'; canvas.style.height = '100%';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();
  world.setMood(mood);
  placeCar();
  rig.update(1, state, { showcase: true, time: 0 });

  const hotkeys = { KeyC: 'camera', KeyF: 'cruise', KeyT: 'mood', KeyM: 'map', KeyP: 'photo', KeyH: 'hide', KeyR: 'reset', KeyQ: 'signalLeft', KeyE: 'signalRight', KeyG: 'garage' };
  addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (!started) { if (event.code === 'Enter' || event.code === 'Space') actions.start(); return; }
    if (!event.repeat && event.code === 'Escape') { if (screen === 'map') actions.close(); else actions.pause(); return; }
    if (!event.repeat && hotkeys[event.code]) { actions[hotkeys[event.code]](); return; }
    if (screen !== 'drive') return;
    if (['KeyS', 'ArrowDown'].includes(event.code) && !event.repeat && !keys.has(event.code)) reverseHeld = Math.abs(state.speed) < 0.4;
    keys.add(event.code);
  });
  addEventListener('keyup', (event) => { keys.delete(event.code); if (['KeyS', 'ArrowDown'].includes(event.code)) reverseHeld = false; });
  addEventListener('blur', () => { keys.clear(); touches.clear(); if (started && screen === 'drive') actions.pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { keys.clear(); touches.clear(); } lastFrame = performance.now(); accumulator = 0; });
  document.querySelectorAll('[data-drive]').forEach((button) => {
    button.addEventListener('pointerdown', (event) => { event.preventDefault(); button.setPointerCapture(event.pointerId); touches.add(button.dataset.drive); });
    const release = () => touches.delete(button.dataset.drive);
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (!photo) return;
    drag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || !photo) return;
    rig.orbit(event.clientX - drag.x, event.clientY - drag.y); drag = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('wheel', (event) => { if (photo) { event.preventDefault(); rig.zoom(event.deltaY); } }, { passive: false });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const wallDelta = Math.max(0, (now - lastFrame) / 1000);
    const dt = clamp(wallDelta, 0, 0.06); lastFrame = now;
    time += dt;
    const running = screen === 'drive';
    if (running) {
      accumulator += dt;
      while (accumulator >= 1 / 120) {
        const input = race && race.elapsed < 0 ? {} : controls();
        stepDriver(state, input, 1 / 120, road);
        updateRace(1 / 120);
        accumulator -= 1 / 120;
      }
      if (state.roadDistance > 90 || state.y < -4) {
        resetDriver(state, road, state.t); rig.reset(); ui.toast('已经帮你回到公路');
      }
    } else accumulator = 0;
    // Pure-pursuit cruise only needs a few degrees of lock on these long bends, which reads as a
    // frozen wheel from the driver's seat. Feed the visual wheel a curvature term so the hands move.
    const bendNear = road.sample(wrap(state.t + 6 / road.length));
    const bendFar = road.sample(wrap(state.t + 48 / road.length));
    const bend = -angleDelta(bendFar.heading, bendNear.heading);
    // A 42 m look-ahead lets the hands turn in before the bend, like a real driver's eyes do.
    const wheelTarget = running ? (state.cruise ? clamp(bend * 2.4 + state.steer, -0.9, 0.9) : state.steer) : 0;
    steerVisual += (wheelTarget - steerVisual) * (1 - Math.exp(-14 * dt));
    vehicle.update(running ? dt : 0, { speed: state.speed, steer: state.steer, steerVisual, throttle: state.throttle, brake: state.brake,
      time, rpm: state.rpm, gear: state.gear, fuel: state.fuel, coolant: state.coolant,
      odometer: state.odometer, turnSignal: state.turnSignal });
    placeCar();
    rig.update(dt, state, { showcase: !started, time });
    vehicle.updateMirrors?.(renderer, scene, !photo && rig.mode === 2, dt);
    world.update(dt, time);
    world.followFocus?.(state);
    dust.update(dt, state, running);
    const region = world.getRegion(state.t);
    audio.update(state, regions.indexOf(region), !running);
    hudTime += dt;
    if (hudTime > 0.09) { hudTime = 0; ui.update(state, { region, view: rig.name, viewMode: rig.mode, race: race && { ...race, elapsed: Math.max(0, race.elapsed) } }); }
    renderer.info.reset(); composer.render();
    fpsFrames++; fpsTime += wallDelta;
    if (fpsTime > 1) { fps = fpsFrames / fpsTime; fpsTime = 0; fpsFrames = 0; }
  });

  game = {
    state, world, vehicle, camera, rig, renderer, actions,
    get screen() { return screen; }, get mood() { return mood; }, get fps() { return fps; }, get race() { return race; },
    travel(index) { actions.travel(index); },
    snapshot() { return { screen, mood, view: rig.mode, viewName: rig.name, fps: Math.round(fps), speed: Math.round(state.speed * 3.6),
      rpm: Math.round(state.rpm), gear: state.gear, fuel: state.fuel, coolant: state.coolant, odometer: state.odometer,
      heading: state.heading, steer: state.steer, position: [state.x, state.y, state.z], region: world.getRegion(state.t).name,
      t: state.t, cruise: state.cruise, draws: renderer.info.render.calls, triangles: renderer.info.render.triangles }; },
  };
  window.__horizon = game;
  renderer.compile(scene, camera);
  // Compile and draw the interior once behind the loading screen. Without this the
  // first C press pays for every cabin shader and the cockpit shadow pass in one frame.
  const savedPosition = camera.position.clone(), savedQuaternion = camera.quaternion.clone(), savedFov = camera.fov;
  vehicle.setView('cockpit');
  vehicle.root.updateMatrixWorld(true);
  vehicle.cockpitCamera.getWorldPosition(camera.position);
  vehicle.cockpitCamera.getWorldQuaternion(camera.quaternion);
  camera.fov = 66; camera.updateProjectionMatrix();
  renderer.compile(scene, camera);
  renderer.render(scene, camera);
  vehicle.updateMirrors(renderer, scene, true, 1);
  camera.position.copy(savedPosition); camera.quaternion.copy(savedQuaternion);
  camera.fov = savedFov; camera.updateProjectionMatrix();
  vehicle.setView('chase');
  renderer.compile(scene, camera);
  ui.ready();
}

function makeDust(scene) {
  const count = 60;
  const positions = new Float32Array(count * 3);
  const age = new Float32Array(count).fill(9);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xe3c99b, size: 0.35, transparent: true, opacity: 0.35, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false; scene.add(points);
  let index = 0; let elapsed = 0;
  return { update(dt, state, running) {
    elapsed += dt;
    if (running && state.offroad && Math.abs(state.speed) > 4 && elapsed > 0.035) {
      elapsed = 0; const i = index++ % count; age[i] = 0;
      positions[i * 3] = state.x - Math.sin(state.heading) * 1.8 + (Math.random() - 0.5) * 1.7;
      positions[i * 3 + 1] = state.y + 0.25;
      positions[i * 3 + 2] = state.z - Math.cos(state.heading) * 1.8;
    }
    for (let i = 0; i < count; i++) { age[i] += dt; if (age[i] < 1.7) positions[i * 3 + 1] += dt * 0.8; else positions[i * 3 + 1] = -1000; }
    geometry.attributes.position.needsUpdate = true;
  } };
}

try { boot(); } catch (error) {
  console.error(error);
  document.getElementById('loading').hidden = true;
  document.getElementById('fatal-error').hidden = false;
  document.getElementById('fatal-message').textContent = `启动遇到问题：${error.message}。请使用支持 WebGL 2 的 Chrome 或 Edge 浏览器重新打开。`;
}
