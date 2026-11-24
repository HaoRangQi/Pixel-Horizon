// NPC traffic behaviour. Pure maths over the road's sample(t) API — no Three.js — so the
// following/merging rules can be unit-tested in Node exactly as they run in the browser.
//
// Lane convention matches drive.js: the car's local +X is driver-left, so the right-hand
// lane centre sits at a negative lateral offset (`-road.width * 0.25`). Every car reports
// x/y/z/heading back to the renderer; this module never touches scene objects.

import { angleDelta } from '../drive.js';

const wrap = (v) => ((v % 1) + 1) % 1;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export const TRAFFIC_DEFAULTS = {
  // Absolute count wins when set; otherwise density (cars per km) sizes the fleet.
  count: null,
  density: 3,
  maxCount: 24,
  enabled: true,
  bothDirections: true,
  seed: 20261123,
  laneFraction: 0.25,
  cruise: [15.5, 23],
  speedScale: 1,
  renderDistance: 600,
  followGap: 26,
  stopGap: 6.4,
  lateralClear: 2.45,
  yieldGap: 48,
  yieldClear: 150,
  yieldHold: 3.2,
  bendSlowdown: 2.6,
  palette: [0xd8d4c6, 0x2a4b7c, 0x8c2f36, 0x2f5d50, 0xc9a24a, 0x555d66, 0x6c8fa8, 0xa8642f],
  styles: ['one', 'coupe'],
};

// Same generator as route.js's seededRandom. Duplicated rather than exported from the road
// builder so this module stays free of world/Three imports (and the road network stays
// untouched by traffic work).
function seededRandom(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Distance from `fromT` to `toT` along a car's travel direction, in (-L/2, L/2]. */
function signedAlong(fromT, toT, dir, length) {
  const d = wrap((toT - fromT) * dir) * length;
  return d > length / 2 ? d - length : d;
}

export function createTrafficModel(road, options = {}) {
  const config = { ...TRAFFIC_DEFAULTS, ...options };
  if (!Array.isArray(config.styles) || !config.styles.length) config.styles = ['one'];
  if (!Array.isArray(config.palette) || !config.palette.length) config.palette = TRAFFIC_DEFAULTS.palette;
  const length = road.length;
  const lane = road.width * config.laneFraction;

  let random = seededRandom(config.seed);
  let cars = [];
  let enabled = config.enabled !== false;
  let time = 0;
  let lastPlayer = null;

  function targetCount() {
    if (Number.isFinite(config.count)) return clamp(Math.round(config.count), 0, config.maxCount);
    return clamp(Math.round(length / 1000 * config.density), 0, config.maxCount);
  }

  function spawn(index, total, colorOffset) {
    const twoWay = config.bothDirections && total > 1;
    const dir = twoWay && index % 2 === 1 ? -1 : 1;
    const [low, high] = config.cruise;
    const cruise = (low + random() * (high - low)) * config.speedScale;
    const baseOffset = (dir > 0 ? -lane : lane) + (random() - 0.5) * 0.4;
    const t = wrap(0.012 + (index + 0.5) / Math.max(1, total) + (random() - 0.5) * 0.012);
    return {
      id: index, dir,
      style: config.styles[index % config.styles.length],
      color: config.palette[(colorOffset + index) % config.palette.length],
      t, speed: cruise * 0.75, cruise, freeSpeed: cruise,
      baseOffset, offset: baseOffset, offsetTarget: baseOffset,
      yielding: false, yieldHold: 0, yieldCooldown: 1.5 + random() * 2.5,
      think: random() * 0.2, curve: 0, wheelAngle: 0, roll: 0, pitch: 0,
      x: 0, y: 0, z: 0, heading: NaN,
      playerGap: Infinity, gap: Infinity, spin: 0,
    };
  }

  /** Place every car on its lane from its current t, easing visual heading/roll. */
  function place(dt) {
    const ease = 1 - Math.exp(-8 * Math.max(dt, 0));
    for (const car of cars) {
      const s = road.sample(car.t);
      car.x = s.position.x + Math.cos(s.heading) * car.offset;
      car.y = s.position.y;
      car.z = s.position.z - Math.sin(s.heading) * car.offset;
      const target = s.heading + (car.dir < 0 ? Math.PI : 0);
      // +Z is forward, so a left bend (heading increasing) is positive roll on local Z.
      car.roll = clamp(car.curve * Math.abs(car.speed) * 0.02, -0.05, 0.05);
      car.wheelAngle = clamp(car.curve * 0.8, -0.55, 0.55);
      if (Number.isFinite(car.heading)) car.heading += angleDelta(target, car.heading) * ease;
      else car.heading = target;
    }
  }

  function rebuild() {
    random = seededRandom(config.seed);
    const total = targetCount();
    const colorOffset = Math.floor(random() * config.palette.length);
    cars = Array.from({ length: total }, (_, i) => spawn(i, total, colorOffset));
    place(1);
    if (lastPlayer) avoidPlayer(lastPlayer);
  }

  /** Bend, slope and steering angle only change slowly; four times a second is plenty. */
  function think(car) {
    const step = (metres) => road.sample(wrap(car.t + car.dir * metres / length));
    const here = road.sample(car.t), near = step(8), far = step(46), slope = step(6);
    car.curve = angleDelta(far.heading, near.heading);
    const bend = Math.abs(car.curve);
    car.freeSpeed = car.cruise / (1 + bend * config.bendSlowdown);
    car.pitch = Math.atan2(slope.position.y - here.position.y, 6);
  }

  function oncomingClear(car) {
    const targetOffset = -car.baseOffset;
    for (const other of cars) {
      if (other === car) continue;
      const along = signedAlong(car.t, other.t, car.dir, length);
      if (Math.abs(along) >= config.yieldClear) continue;
      if (Math.abs(other.offset - targetOffset) < 3) {
        if (other.dir !== car.dir) return false;
        if (Math.abs(along) < 40) return false;
      }
    }
    return true;
  }

  function oncomingConflict(car) {
    const targetOffset = -car.baseOffset;
    for (const other of cars) {
      if (other === car || other.dir === car.dir) continue;
      if (Math.abs(other.offset - targetOffset) > 3) continue;
      const along = signedAlong(car.t, other.t, car.dir, length);
      if (along > 0 && along < 60) return true;
    }
    return false;
  }

  /**
   * Keep the car out of the player's car in the same lane: if the centres are closer than
   * stopGap along the road, park the NPC on the far side of the player along its own travel
   * direction. This is what prevents interpenetration even when the player rams a car.
   */
  function separateFrom(car, otherT, otherLateral, stopGap) {
    if (Math.abs(otherLateral - car.offset) >= config.lateralClear) return 0;
    const along = signedAlong(car.t, otherT, car.dir, length);
    if (Math.abs(along) >= stopGap) return 0;
    const side = along > 0 ? -1 : 1; // player ahead → stay behind; player behind → stay ahead
    car.t = wrap(otherT + car.dir * side * stopGap / length);
    return stopGap - Math.abs(along);
  }

  function update(dt, player) {
    if (!enabled || !(dt > 0) || !cars.length) return;
    time += dt;
    const playerT = wrap(player?.mainT ?? player?.t ?? 0);
    const playerSpeed = Math.abs(player?.speed ?? 0);
    const ps = road.sample(playerT);
    const playerLateral = player
      ? (player.x - ps.position.x) * Math.cos(ps.heading) - (player.z - ps.position.z) * Math.sin(ps.heading)
      : -lane;
    lastPlayer = player ?? lastPlayer;

    for (const car of cars) {
      if (car.yieldCooldown > 0) car.yieldCooldown -= dt;
    }

    for (const car of cars) {
      car.think -= dt;
      if (car.think <= 0) {
        car.think = 0.2 + random() * 0.15;
        think(car);
      }

      // Nearest same-direction NPC ahead in the same lane.
      let leaderGap = Infinity;
      for (const other of cars) {
        if (other === car || other.dir !== car.dir) continue;
        const gap = wrap((other.t - car.t) * car.dir) * length;
        if (gap < 0.01 || gap > 120) continue;
        if (Math.abs(other.offset - car.offset) > config.lateralClear) continue;
        if (gap < leaderGap) leaderGap = gap;
      }
      car.gap = leaderGap;

      const alongPlayer = signedAlong(car.t, playerT, car.dir, length); // + player ahead
      const sameLane = Math.abs(playerLateral - car.offset) < config.lateralClear;
      const playerAhead = sameLane && alongPlayer > 0 ? alongPlayer : Infinity;
      const playerBehind = sameLane && alongPlayer < 0 ? -alongPlayer : Infinity;
      car.playerGap = sameLane ? Math.abs(alongPlayer) : Infinity;

      let target = car.freeSpeed;
      if (playerAhead < config.followGap) {
        target = Math.min(target, car.freeSpeed * clamp((playerAhead - config.stopGap) / (config.followGap - config.stopGap), 0, 1));
      }
      if (leaderGap < config.followGap) {
        target = Math.min(target, car.cruise * clamp((leaderGap - config.stopGap) / (config.followGap - config.stopGap), 0, 1));
      }

      // Yield to a player closing from behind: indicate by moving into the opposite lane
      // (never across the player) when it is clear, then rejoin once the player is past.
      if (!car.yielding && car.dir > 0 && playerBehind < config.yieldGap
        && playerSpeed > car.speed + 1 && car.yieldCooldown <= 0) {
        if (oncomingClear(car)) {
          car.yielding = true;
          car.yieldHold = config.yieldHold;
          car.offsetTarget = -car.baseOffset;
        } else {
          car.yieldCooldown = 2.5;
          target = Math.min(car.freeSpeed * 1.18, car.cruise * 1.2);
        }
      }
      if (car.yielding) {
        car.yieldHold -= dt;
        const playerPast = alongPlayer > 14; // player is ahead of the car now
        const aborted = oncomingConflict(car) && Math.abs(alongPlayer) > 14;
        if (aborted || (car.yieldHold <= 0 && playerPast)) {
          car.yielding = false;
          car.offsetTarget = car.baseOffset;
          car.yieldCooldown = 3.5;
        } else {
          target = Math.min(car.freeSpeed * 1.08, car.cruise * 1.15);
        }
      }

      const rate = target > car.speed ? 2.4 : 6.0;
      car.speed += clamp(target - car.speed, -rate * dt, rate * dt);
      if (target < 0.2 && car.speed < 0.25) car.speed = 0;
      car.t = wrap(car.t + car.dir * car.speed * dt / length);

      const laneStep = 2.2 * dt;
      car.offset += clamp(car.offsetTarget - car.offset, -laneStep, laneStep);
    }

    // Hard separation pass, player first (it has priority over NPC-NPC spacing).
    for (const car of cars) separateFrom(car, playerT, playerLateral, config.stopGap);
    for (const car of cars) {
      for (const other of cars) {
        if (other === car || other.dir !== car.dir) continue;
        const gap = wrap((other.t - car.t) * car.dir) * length;
        if (gap > 0 && gap < config.stopGap) {
          car.t = wrap(other.t - car.dir * config.stopGap / length);
          car.speed = Math.min(car.speed, other.speed);
        }
      }
    }
    place(dt);
    // Publish the post-clamp gap so stats and the HUD read the state the camera sees.
    for (const car of cars) {
      const along = signedAlong(car.t, playerT, car.dir, length);
      car.playerGap = Math.abs(playerLateral - car.offset) < config.lateralClear ? Math.abs(along) : Infinity;
    }
  }

  /** Move any car near a freshly teleported player out of sight instead of bumping it. */
  function avoidPlayer(player) {
    lastPlayer = player ?? lastPlayer;
    if (!player) return;
    const playerT = wrap(player.t);
    const ps = road.sample(playerT);
    const playerLateral = (player.x - ps.position.x) * Math.cos(ps.heading) - (player.z - ps.position.z) * Math.sin(ps.heading);
    for (const car of cars) {
      const along = signedAlong(car.t, playerT, car.dir, length); // + player ahead of car
      if (Math.abs(along) > 90 || Math.abs(playerLateral - car.offset) > 5) continue;
      car.t = wrap(playerT - car.dir * 120 / length); // re-enter from 120 m behind
      car.speed = car.cruise * 0.7;
      car.heading = NaN;
      car.yielding = false;
      car.offset = car.baseOffset;
      car.offsetTarget = car.baseOffset;
    }
    place(1);
  }

  function setEnabled(value) {
    enabled = Boolean(value);
  }

  function setCount(value) {
    config.count = value;
    rebuild();
  }

  function configure(next = {}) {
    if (next.count !== undefined) config.count = next.count;
    else if (next.density !== undefined) config.count = null; // density takes over from a pinned count
    if (next.density !== undefined) config.density = next.density;
    if (next.enabled !== undefined) enabled = Boolean(next.enabled);
    if (next.renderDistance !== undefined) config.renderDistance = next.renderDistance;
    if (next.speedScale !== undefined) config.speedScale = next.speedScale;
    if (next.count !== undefined || next.density !== undefined || next.speedScale !== undefined) rebuild();
  }

  function stats() {
    const gaps = cars.map((car) => car.playerGap).filter((gap) => Number.isFinite(gap));
    return {
      enabled,
      count: cars.length,
      maxCount: config.maxCount,
      lane,
      length,
      minPlayerGap: gaps.length ? Math.min(...gaps) : null,
      cars: cars.map((car) => ({
        id: car.id, dir: car.dir, style: car.style, color: car.color,
        t: +car.t.toFixed(5), speed: +car.speed.toFixed(2), offset: +car.offset.toFixed(2),
        playerGap: Number.isFinite(car.playerGap) ? +car.playerGap.toFixed(2) : null,
        x: +car.x.toFixed(2), z: +car.z.toFixed(2),
      })),
    };
  }

  rebuild();

  return {
    get cars() { return cars; },
    config,
    update,
    place,
    avoidPlayer,
    setEnabled,
    setCount,
    configure,
    stats,
    get enabled() { return enabled; },
    get count() { return cars.length; },
    get length() { return length; },
  };
}
