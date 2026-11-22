import { MathUtils, Quaternion, Vector3 } from 'three';

const MODES = [
  { key: 'chase', name: '追尾视角', fov: 56 },
  { key: 'hood', name: '引擎盖', fov: 64 },
  { key: 'cockpit', name: '驾驶舱', fov: 66 },
  { key: 'high', name: '高位追踪', fov: 54 },
];
const UP = new Vector3(0, 1, 0);
const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
const angleDelta = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function createCameraRig(camera, car, road) {
  let modeIndex = 0;
  let photo = false;
  let initialized = false;
  let needsReset = true;
  let wasShowcase = false;
  let heading = 0;
  let photoYaw = 0;
  let photoElevation = 0.3;
  let photoDistance = 8.5;

  const center = new Vector3();
  const previousCenter = new Vector3();
  const desired = new Vector3();
  const focus = new Vector3();
  const lookPoint = new Vector3();
  const forward = new Vector3();
  const offset = new Vector3();
  const screenRight = new Vector3();
  const probe = new Vector3();
  const collisionOrigin = new Vector3();
  const anchorRotation = new Quaternion();

  function setCarView() {
    car.setView?.(photo ? 'chase' : MODES[modeIndex].key);
  }

  function terrainLift(position, origin) {
    let lift = 0;
    for (let i = 1; i <= 8; i++) {
      const fraction = i / 8;
      probe.lerpVectors(origin, position, fraction);
      const ground = road.groundHeight(probe.x, probe.z) + 0.55;
      // Cover the interval before each sample, including a sudden rise between probes.
      const nearFraction = Math.max(1 / 16, fraction - 1 / 8);
      const nearHeight = MathUtils.lerp(origin.y, position.y, nearFraction);
      lift = Math.max(lift, (ground - nearHeight) / nearFraction);
    }
    return lift;
  }

  function clearTerrain(position) {
    position.y = Math.max(position.y, road.groundHeight(position.x, position.z) + 0.55);
    let lift = terrainLift(position, collisionOrigin);
    // A steep hillside shortens the arm before it can send the camera far overhead.
    if (lift > 5) {
      position.lerp(collisionOrigin, 0.35);
      lift = terrainLift(position, collisionOrigin);
    }
    position.y += Math.max(0, lift);
  }

  function composeShowcase(time) {
    const yaw = heading - 0.64 + Math.sin(time * 0.13) * 0.045;
    offset.set(Math.sin(yaw) * 8.6, 2.55 + Math.sin(time * 0.18) * 0.07, Math.cos(yaw) * 8.6);
    desired.copy(center).add(offset);
    screenRight.crossVectors(UP, offset).normalize();
    focus.copy(center).addScaledVector(screenRight, -2.35);
    focus.y += 0.85;
    return 47;
  }

  function composePhoto() {
    const horizontal = photoDistance * Math.cos(photoElevation);
    desired.set(
      center.x + Math.sin(photoYaw) * horizontal,
      center.y + 0.8 + Math.sin(photoElevation) * photoDistance,
      center.z + Math.cos(photoYaw) * horizontal,
    );
    focus.copy(center);
    focus.y += 0.8;
    return 51;
  }

  function composeFollow(state, speed, dt, snap) {
    const sample = road.sample(((state.t + (12 + speed * 0.22) / road.length) % 1 + 1) % 1);
    const desiredHeading = state.heading + angleDelta(sample.heading, state.heading) * 0.1;
    heading = snap ? desiredHeading : heading + angleDelta(desiredHeading, heading) * ease(5.5, dt);
    forward.set(Math.sin(heading), 0, Math.cos(heading));
    const high = modeIndex === 3;
    desired.copy(center).addScaledVector(forward, high ? -17 - speed * 0.025 : -7.7 - speed * 0.013);
    desired.y += high ? 12 + speed * 0.025 : 3.05 + speed * 0.004;
    focus.copy(center).addScaledVector(forward, high ? 9 + speed * 0.05 : 5.2 + speed * 0.04);
    focus.y += high ? 1.1 : 1.4;
    return MODES[modeIndex].fov + MathUtils.clamp(speed / 70, 0, 1) * (high ? 2 : 4);
  }

  function applyInterior(speed, snap, dt) {
    const anchor = modeIndex === 1 ? car.hoodCamera : car.cockpitCamera;
    anchor.getWorldPosition(camera.position);
    anchor.getWorldQuaternion(anchorRotation);
    forward.set(0, -0.018, 1).applyQuaternion(anchorRotation).normalize();
    lookPoint.copy(camera.position).addScaledVector(forward, 100);
    camera.up.copy(UP);
    camera.lookAt(lookPoint);
    const fov = MODES[modeIndex].fov + MathUtils.clamp(speed / 70, 0, 1) * 2;
    setFov(fov, snap ? 1 : ease(4, dt));
  }

  function setFov(fov, amount) {
    const next = MathUtils.lerp(camera.fov, fov, amount);
    if (Math.abs(camera.fov - next) > 0.001) {
      camera.fov = next;
      camera.updateProjectionMatrix();
    }
  }

  setCarView();

  return {
    get mode() { return modeIndex; },
    get name() { return MODES[modeIndex].name; },

    setMode(index) {
      modeIndex = ((Math.trunc(index) % MODES.length) + MODES.length) % MODES.length;
      needsReset = true;
      setCarView();
    },

    cycle() { this.setMode(modeIndex + 1); },

    setPhoto(enabled) {
      if (photo === Boolean(enabled)) return;
      photo = Boolean(enabled);
      setCarView();
      if (!photo) {
        needsReset = true;
        return;
      }
      car.root.getWorldPosition(center);
      center.y += 0.8;
      offset.copy(camera.position).sub(center);
      if (!initialized || offset.length() < 3.5) {
        photoYaw = car.root.rotation.y - 0.64;
        photoElevation = 0.3;
        photoDistance = 8.5;
        needsReset = true;
      } else {
        photoYaw = Math.atan2(offset.x, offset.z);
        photoElevation = MathUtils.clamp(Math.atan2(offset.y, Math.hypot(offset.x, offset.z)), 0.08, 1.3);
        photoDistance = MathUtils.clamp(offset.length(), 3.5, 38);
      }
    },

    orbit(dx, dy) {
      if (!photo) return;
      photoYaw -= dx * 0.006;
      photoElevation = MathUtils.clamp(photoElevation + dy * 0.0045, 0.08, 1.3);
    },

    zoom(delta) {
      if (photo) photoDistance = MathUtils.clamp(photoDistance * Math.exp(delta * 0.001), 3.5, 38);
    },

    reset() { needsReset = true; },

    update(dt, state, { showcase = false, time = 0 } = {}) {
      const elapsed = MathUtils.clamp(dt, 0, 0.1);
      const speed = Math.abs(state.speed);
      center.set(state.x, state.y, state.z);
      const snap = needsReset || !initialized || center.distanceToSquared(previousCenter) > 1600 || showcase !== wasShowcase;
      if (snap) heading = state.heading;
      collisionOrigin.copy(center);
      collisionOrigin.y += 0.9;

      if (!photo && !showcase && (modeIndex === 1 || modeIndex === 2)) {
        applyInterior(speed, snap, elapsed);
      } else {
        const fov = photo ? composePhoto() : showcase ? composeShowcase(time) : composeFollow(state, speed, elapsed, snap);
        clearTerrain(desired);
        if (snap) {
          camera.position.copy(desired);
          lookPoint.copy(focus);
        } else {
          // Follow translation immediately; damping only the boom avoids a long lag at speed.
          offset.subVectors(center, previousCenter);
          camera.position.add(offset);
          lookPoint.add(offset);
          camera.position.lerp(desired, ease(photo ? 11 : showcase ? 4 : 8, elapsed));
          lookPoint.lerp(focus, ease(photo ? 11 : 7, elapsed));
        }
        clearTerrain(camera.position);
        camera.up.copy(UP);
        camera.lookAt(lookPoint);
        setFov(fov, snap ? 1 : ease(3, elapsed));
      }

      previousCenter.copy(center);
      initialized = true;
      needsReset = false;
      wasShowcase = showcase;
    },
  };
}
