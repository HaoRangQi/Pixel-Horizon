import * as THREE from 'three';
import { createRoadMaterials } from './surfaces.js';

const TAU = Math.PI * 2;
export const wrap = (t) => ((t % 1) + 1) % 1;
export const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// The mountain loop from the first playable build. Its length, sample spacing and
// parameterisation deliberately stay unchanged: regions, scenery, races and the map
// all anchor to this line.
const MAIN_POINTS = [
  [-630, 22, -860], [-300, 20, -1040], [100, 24, -1100],
  [500, 37, -1030], [850, 70, -830], [1080, 96, -480],
  [1180, 112, -100], [1080, 124, 300], [870, 135, 650],
  [550, 146, 900], [130, 157, 1030], [-170, 176, 1050],
  [-480, 177, 950], [-740, 190, 780], [-1040, 225, 620],
  [-1150, 235, 310], [-980, 220, 90], [-1200, 185, -90],
  [-1060, 135, -360], [-790, 90, -470], [-870, 55, -690],
];

// Interior junctions shared by two or more branch roads. Their height is taken from
// the finished terrain when the landscape is built, so every road meeting at a node
// settles on the same elevation and the surfaces join without a step.
const BRANCH_NODES = {
  V0: { x: 200, z: -980 },
  V1: { x: 600, z: -700 },
  V2: { x: 430, z: -120 },
  V3: { x: 420, z: 330 },
  V5: { x: -800, z: -250 },
};

const BRANCH_KINDS = {
  secondary: { width: 9.4, maxGrade: 0.15 },
  trail: { width: 7.4, maxGrade: 0.15 },
};

// Data-driven branch network. `startT` / `endT` are parameters on the main loop;
// a road may instead finish at a shared interior node. Ids are stable and become the
// route index carried in the driver state.
const BRANCH_DEFS = [
  {
    id: 1, name: '北岭林道', kind: 'trail', startT: 0.055, endT: 0.13,
    points: [{ x: -120, z: -930 }, { node: 'V0' }],
  },
  {
    id: 2, name: '东谷捷径', kind: 'secondary', startT: 0.105,
    points: [{ node: 'V0' }, { node: 'V1' }, { x: 720, z: -470 }, { node: 'V2' },
      { x: 520, z: 140 }, { x: 480, z: 250 }, { node: 'V3' }],
  },
  {
    id: 3, name: '北门支线', kind: 'secondary', startT: 0.19,
    points: [{ node: 'V1' }],
  },
  {
    id: 4, name: '中央横断线', kind: 'secondary', startT: 0.30,
    points: [{ x: 980, z: -230 }, { x: 820, z: -60 }, { x: 620, z: 30 }, { node: 'V2' }],
  },
  {
    id: 5, name: '南鞍林道', kind: 'trail', startT: 0.44,
    points: [{ x: 780, z: 560 }, { x: 680, z: 470 }, { x: 560, z: 380 }, { node: 'V3' }],
  },
  {
    id: 6, name: '西岭盘山线', kind: 'secondary', startT: 0.72, endT: 0.86,
    points: [{ x: -880, z: 560 }, { x: -760, z: 470 }, { x: -700, z: 350 },
      { x: -620, z: 220 }, { x: -600, z: 80 }, { x: -450, z: -50 },
      { x: -550, z: -200 }, { node: 'V5' }, { x: -950, z: -220 }, { x: -1100, z: -210 }],
  },
  {
    id: 7, name: '西坳连接线', kind: 'secondary', startT: 0.78,
    points: [{ x: -950, z: 150 }, { x: -850, z: 20 }, { node: 'V5' }],
  },
];

const MAIN_SPACING = 3.2;
const MAIN_CELL = 90;
const BRANCH_SPACING = 3.0;
const BRANCH_CELL = 72;
const JUNCTION_LEAD = 38;
const JUNCTION_LEAD_MIN = 150;

function segmentAt(line, i) {
  return [line.samples[i], line.samples[line.closed ? (i + 1) % line.count : i + 1]];
}

function sampleLine(line, t) {
  const raw = line.closed ? wrap(t) : THREE.MathUtils.clamp(t, 0, 1);
  const f = line.closed ? raw * line.count : raw * (line.count - 1);
  const i = Math.min(line.count - (line.closed ? 1 : 2), Math.floor(f));
  const u = Math.min(1, Math.max(0, f - i));
  const a = line.samples[i], b = line.samples[line.closed ? (i + 1) % line.count : i + 1];
  const tangent = new THREE.Vector3().subVectors(b, a).normalize();
  return {
    position: new THREE.Vector3().lerpVectors(a, b, u),
    tangent,
    heading: Math.atan2(tangent.x, tangent.z),
  };
}

function frameLine(line, t, lateral = 0) {
  const s = sampleLine(line, t);
  s.position.x += Math.cos(s.heading) * lateral;
  s.position.z -= Math.sin(s.heading) * lateral;
  return s;
}

function createIndex(line, cellSize) {
  const cells = new Map();
  const cellKey = (x, z) => `${x},${z}`;
  const segments = line.closed ? line.count : line.count - 1;
  const visited = new Uint32Array(segments);
  let stamp = 0;
  for (let i = 0; i < segments; i++) {
    const [a, b] = segmentAt(line, i);
    for (let x = Math.floor(Math.min(a.x, b.x) / cellSize); x <= Math.floor(Math.max(a.x, b.x) / cellSize); x++) {
      for (let z = Math.floor(Math.min(a.z, b.z) / cellSize); z <= Math.floor(Math.max(a.z, b.z) / cellSize); z++) {
        const key = cellKey(x, z);
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(i);
      }
    }
  }

  function query(x, z) {
    const cx = Math.floor(x / cellSize), cz = Math.floor(z / cellSize);
    let best = Infinity, bestI = 0, bestU = 0;
    stamp++;
    if (stamp === 0xffffffff) { visited.fill(0); stamp = 1; }
    const visitCell = (gx, gz) => {
      const list = cells.get(cellKey(gx, gz));
      if (!list) return;
      for (const i of list) {
        if (visited[i] === stamp) continue;
        visited[i] = stamp;
        const [a, b] = segmentAt(line, i);
        const dx = b.x - a.x, dz = b.z - a.z;
        const u = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
        const px = a.x + dx * u, pz = a.z + dz * u;
        const d = (x - px) ** 2 + (z - pz) ** 2;
        if (d < best) { best = d; bestI = i; bestU = u; }
      }
    };
    for (let radius = 0; radius < 1000; radius++) {
      if (!radius) visitCell(cx, cz);
      else {
        for (let i = -radius; i <= radius; i++) {
          visitCell(cx + i, cz - radius);
          visitCell(cx + i, cz + radius);
        }
        for (let j = -radius + 1; j < radius; j++) {
          visitCell(cx - radius, cz + j);
          visitCell(cx + radius, cz + j);
        }
      }
      const outsideDistance = Math.min(
        x - (cx - radius) * cellSize, (cx + radius + 1) * cellSize - x,
        z - (cz - radius) * cellSize, (cz + radius + 1) * cellSize - z,
      );
      if (best <= outsideDistance * outsideDistance) break;
    }
    return { i: bestI, u: bestU, distanceSq: best };
  }

  function nearest(x, z) {
    const q = query(x, z);
    return resultAt(line, q.i, q.u, x, z, q.distanceSq);
  }
  return { query, nearest };
}

function resultAt(line, i, u, x, z, distanceSq) {
  const [a, b] = segmentAt(line, i);
  const heading = Math.atan2(b.x - a.x, b.z - a.z);
  const px = THREE.MathUtils.lerp(a.x, b.x, u);
  const py = THREE.MathUtils.lerp(a.y, b.y, u);
  const pz = THREE.MathUtils.lerp(a.z, b.z, u);
  return {
    route: line.id, line, t: line.closed ? wrap((i + u) / line.count) : (i + u) / (line.count - 1),
    distance: Math.sqrt(distanceSq), x: px, y: py, z: pz, heading,
    point: new THREE.Vector3(px, py, pz),
    lateral: (x - px) * Math.cos(heading) - (z - pz) * Math.sin(heading),
  };
}

function createBranchIndex(lines, cellSize) {
  const cells = new Map();
  const entries = [];
  const cellKey = (x, z) => `${x},${z}`;
  for (const line of lines) {
    const segments = line.closed ? line.count : line.count - 1;
    for (let i = 0; i < segments; i++) {
      const entry = entries.length;
      entries.push({ line, i });
      const [a, b] = segmentAt(line, i);
      for (let x = Math.floor(Math.min(a.x, b.x) / cellSize); x <= Math.floor(Math.max(a.x, b.x) / cellSize); x++) {
        for (let z = Math.floor(Math.min(a.z, b.z) / cellSize); z <= Math.floor(Math.max(a.z, b.z) / cellSize); z++) {
          const key = cellKey(x, z);
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(entry);
        }
      }
    }
  }
  const visited = new Uint32Array(entries.length);
  let stamp = 0;

  // Returns the nearest branch overall and, when `preferredId` names a branch, the
  // nearest point on that branch as well. The driver uses the pair for lane-style
  // hysteresis through junctions.
  function query(x, z, preferredId = -1) {
    const cx = Math.floor(x / cellSize), cz = Math.floor(z / cellSize);
    let best = Infinity, bestEntry = -1, bestU = 0;
    let preferred = null;
    stamp++;
    if (stamp === 0xffffffff) { visited.fill(0); stamp = 1; }
    const visitCell = (gx, gz) => {
      const list = cells.get(cellKey(gx, gz));
      if (!list) return;
      for (const e of list) {
        if (visited[e] === stamp) continue;
        visited[e] = stamp;
        const { line, i } = entries[e];
        const [a, b] = segmentAt(line, i);
        const dx = b.x - a.x, dz = b.z - a.z;
        const u = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
        const px = a.x + dx * u, pz = a.z + dz * u;
        const d = (x - px) ** 2 + (z - pz) ** 2;
        if (d < best) { best = d; bestEntry = e; bestU = u; }
        if (line.id === preferredId && (!preferred || d < preferred.distanceSq)) {
          preferred = { entry: e, u, distanceSq: d };
        }
      }
    };
    for (let radius = 0; radius < 1000; radius++) {
      if (!radius) visitCell(cx, cz);
      else {
        for (let i = -radius; i <= radius; i++) {
          visitCell(cx + i, cz - radius);
          visitCell(cx + i, cz + radius);
        }
        for (let j = -radius + 1; j < radius; j++) {
          visitCell(cx - radius, cz + j);
          visitCell(cx + radius, cz + j);
        }
      }
      const outsideDistance = Math.min(
        x - (cx - radius) * cellSize, (cx + radius + 1) * cellSize - x,
        z - (cz - radius) * cellSize, (cz + radius + 1) * cellSize - z,
      );
      if (best <= outsideDistance * outsideDistance) break;
    }
    const nearest = bestEntry < 0 ? null : (() => {
      const { line, i } = entries[bestEntry];
      return resultAt(line, i, bestU, x, z, best);
    })();
    const pref = preferred ? (() => {
      const { line, i } = entries[preferred.entry];
      return resultAt(line, i, preferred.u, x, z, preferred.distanceSq);
    })() : null;
    return { nearest, preferred: pref };
  }
  return { query };
}

function createLine({ id, name, kind, width, closed, points, spacing, cellSize, divisions }) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  curve.arcLengthDivisions = divisions;
  curve.updateArcLengths();
  const length = curve.getLength();
  const count = Math.max(16, Math.ceil(length / spacing)) + (closed ? 0 : 1);
  const samples = Array.from({ length: count }, (_, i) => curve.getPointAt(closed ? i / count : i / (count - 1)));
  const line = {
    id, name, kind, width, closed, length, count, curve, samples,
    sample: (t) => sampleLine(line, t),
    frame: (t, lateral = 0) => frameLine(line, t, lateral),
  };
  line.index = createIndex(line, cellSize);
  line.query = line.index.nearest;
  return line;
}

function branchControlPoints(def, main) {
  const pts = [], anchors = [];
  const add = (x, z, anchor) => { pts.push(new THREE.Vector3(x, 0, z)); if (anchor) anchors.push({ ...anchor, x, z }); };
  const start = def.startT == null ? null : main.sample(def.startT);
  const end = def.endT == null ? null : main.sample(def.endT);
  const pointOf = (p) => p.node ? { x: BRANCH_NODES[p.node].x, z: BRANCH_NODES[p.node].z } : { x: p.x, z: p.z };

  const blendLead = (junction, target, tangent, direction) => {
    const dx = target.x - junction.x, dz = target.z - junction.z;
    const len = Math.hypot(dx, dz) || 1;
    const dot = (dx / len) * tangent.x + (dz / len) * tangent.z;
    const sign = dot >= 0 ? 1 : -1;
    const bx = dx / len + tangent.x * sign * 0.55;
    const bz = dz / len + tangent.z * sign * 0.55;
    const bl = Math.hypot(bx, bz) || 1;
    return {
      x: junction.x + direction * (bx / bl) * JUNCTION_LEAD,
      z: junction.z + direction * (bz / bl) * JUNCTION_LEAD,
    };
  };

  if (start) {
    add(start.position.x, start.position.z, { kind: 'main', mainT: def.startT });
    const first = pointOf(def.points[0]);
    if (Math.hypot(first.x - start.position.x, first.z - start.position.z) > JUNCTION_LEAD_MIN) {
      const lead = blendLead(start.position, first, new THREE.Vector3(Math.sin(start.heading), 0, Math.cos(start.heading)), 1);
      add(lead.x, lead.z);
    }
  }
  for (const p of def.points) {
    if (p.node) {
      const node = BRANCH_NODES[p.node];
      add(node.x, node.z, { kind: 'node', node: p.node });
    } else add(p.x, p.z);
  }
  if (end) {
    const last = pointOf(def.points[def.points.length - 1]);
    if (Math.hypot(end.position.x - last.x, end.position.z - last.z) > JUNCTION_LEAD_MIN) {
      const lead = blendLead(end.position, last, new THREE.Vector3(Math.sin(end.heading), 0, Math.cos(end.heading)), -1);
      add(lead.x, lead.z);
    }
    add(end.position.x, end.position.z, { kind: 'main', mainT: def.endT });
  }
  return { points: pts, anchors };
}

function smoothPass(values, closed, radius) {
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0, n = 0;
    for (let j = -radius; j <= radius; j++) {
      let k = i + j;
      if (closed) k = ((k % values.length) + values.length) % values.length;
      else if (k < 0 || k >= values.length) continue;
      sum += values[k]; n++;
    }
    out[i] = sum / n;
  }
  return out;
}

// Blend the raw hillside elevation into a road profile: smooth the ground, pull the
// ends onto their junction heights, then clamp longitudinal grade. Anchors stay
// pinned during every relaxation pass so merges never end in a step.
function draftElevation(line, anchors, groundY, mainQuery, mainWidth, maxGrade) {
  const { samples, count, closed, length } = line;
  const ds = length / (closed ? count : count - 1);
  const raw = samples.map((s) => groundY(s.x, s.z, mainQuery(s.x, s.z)));
  let y = smoothPass(raw, closed, 18);
  for (const anchor of anchors) {
    let best = Infinity, index = 0;
    for (let i = 0; i < count; i++) {
      const d = (samples[i].x - anchor.x) ** 2 + (samples[i].z - anchor.z) ** 2;
      if (d < best) { best = d; index = i; }
    }
    anchor.index = index;
    anchor.offset = Math.sqrt(best);
  }
  for (let pass = 0; pass < 2; pass++) {
    for (const anchor of anchors) {
      for (let i = 0; i < y.length; i++) {
        let dist = Math.abs(i - anchor.index) * ds;
        if (closed) dist = Math.min(dist, length - dist);
        const w = Math.exp(-((dist / (pass ? 40 : 75)) ** 2));
        y[i] = y[i] * (1 - w) + anchor.y * w;
      }
      y[anchor.index] = anchor.y;
    }
    y = smoothPass(y, closed, pass ? 2 : 5);
    for (const anchor of anchors) y[anchor.index] = anchor.y;
  }
  // Branch mouths run on top of the main carriageway for up to ~50 m before the
  // centre lines separate. Follow the main road's longitudinal profile wherever
  // the branch is still within reach of that pavement; otherwise the smoothed
  // hillside profile can stand more than a metre proud of the main ribbon, which
  // reads as a floating road and steps the car's height when it changes route.
  const mouth = mainWidth / 2 + 1.9;
  for (let i = 0; i < count; i++) {
    const main = mainQuery(samples[i].x, samples[i].z);
    const w = 1 - smooth(mouth, mouth + 10, main.distance);
    if (w > 0) y[i] = THREE.MathUtils.lerp(y[i], main.point.y, w);
  }
  // Roads that meet at a shared interior node get a short flat plateau around it.
  // Both branches are pinned to the same node height across the width where their
  // ribbons overlap, so the join is flush for the whole crossing, not just at the
  // single nearest sample.
  const plateau = new Map();
  for (const anchor of anchors) {
    if (anchor.kind !== 'node') continue;
    for (let i = 0; i < count; i++) {
      let dist = Math.abs(i - anchor.index) * ds;
      if (closed) dist = Math.min(dist, length - dist);
      if (dist <= 14) { y[i] = anchor.y; plateau.set(i, anchor.y); }
      else if (dist < 34) y[i] = THREE.MathUtils.lerp(y[i], anchor.y, 1 - smooth(14, 34, dist));
    }
  }
  const pinned = new Map(anchors.map((a) => [a.index, a.y]));
  for (const [i, v] of plateau) pinned.set(i, v);
  const pin = () => { for (const [i, v] of pinned) y[i] = v; };
  for (let pass = 0; pass < 8; pass++) {
    pin();
    for (let i = 1; i < y.length; i++) {
      if (pinned.has(i)) continue;
      const step = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z) || ds;
      y[i] = THREE.MathUtils.clamp(y[i], y[i - 1] - maxGrade * step, y[i - 1] + maxGrade * step);
    }
    pin();
    for (let i = y.length - 2; i >= 0; i--) {
      if (pinned.has(i)) continue;
      const step = Math.hypot(samples[i].x - samples[i + 1].x, samples[i].z - samples[i + 1].z) || ds;
      y[i] = THREE.MathUtils.clamp(y[i], y[i + 1] - maxGrade * step, y[i + 1] + maxGrade * step);
    }
    pin();
  }
  for (let i = 0; i < count; i++) samples[i].y = y[i];
  return { min: Math.min(...y), max: Math.max(...y) };
}

export function createRoute() {
  const mainLine = createLine({
    id: 0, name: '山海环线', kind: 'main', width: 12.2, closed: true,
    points: MAIN_POINTS.map((p) => new THREE.Vector3(...p)),
    spacing: MAIN_SPACING, cellSize: MAIN_CELL, divisions: 8400,
  });
  mainLine.points = MAIN_POINTS;
  const lines = [mainLine];
  const branches = [];
  const mainJunctions = [];
  let finalized = false;

  for (const def of BRANCH_DEFS) {
    const { points, anchors } = branchControlPoints(def, mainLine);
    const kind = BRANCH_KINDS[def.kind];
    const line = createLine({
      id: def.id, name: def.name, kind: def.kind, width: kind.width, closed: false,
      points, spacing: BRANCH_SPACING, cellSize: BRANCH_CELL, divisions: 6000,
    });
    line.def = def;
    line.anchors = anchors;
    line.maxGrade = kind.maxGrade;
    branches.push(line);
    lines.push(line);
    if (def.startT != null) mainJunctions.push({ t: def.startT, route: def.id, width: line.width });
    if (def.endT != null) mainJunctions.push({ t: def.endT, route: def.id, width: line.width });
  }

  const branchIndex = createBranchIndex(branches, BRANCH_CELL);

  function networkQuery(x, z, preferredRoute = 0) {
    const main = mainLine.index.nearest(x, z);
    const { nearest, preferred } = branchIndex.query(x, z, preferredRoute);
    const best = !nearest || (main.distance <= nearest.distance) ? main : nearest;
    let candidate = preferredRoute === 0 ? main : preferred;
    if (!candidate) candidate = best;
    if (candidate.line !== best.line) {
      const margin = Math.max(1.4, candidate.line.width * 0.12);
      const atOpenEnd = !candidate.line.closed && (candidate.t > 0.985 || candidate.t < 0.015);
      // While the car is still inside the preferred carriageway, a merging slip
      // road can be physically closer to the centreline than the road itself.
      // Stay with the current route until the car has actually left that corridor;
      // otherwise cruise would turn onto every branch mouth it passes.
      const onPreferred = candidate.distance <= candidate.line.width * 0.55;
      if (atOpenEnd && best.distance < candidate.line.width * 1.6) candidate = best;
      else if (!onPreferred && best.distance < candidate.distance - margin) candidate = best;
    }
    return { ...candidate, route: candidate.line.id, width: candidate.line.width };
  }

  function branchDistance(x, z) {
    const { nearest } = branchIndex.query(x, z);
    return nearest ? nearest.distance : Infinity;
  }

  function roadDistance(x, z) {
    const main = mainLine.index.nearest(x, z);
    return Math.min(main.distance, branchDistance(x, z));
  }

  function finalizeBranches(groundY) {
    if (finalized) return;
    for (const node of Object.values(BRANCH_NODES)) {
      node.y = groundY(node.x, node.z, mainLine.index.nearest(node.x, node.z));
    }
    for (const line of branches) {
      for (const anchor of line.anchors) {
        anchor.y = anchor.kind === 'node'
          ? BRANCH_NODES[anchor.node].y
          : mainLine.sample(anchor.mainT).position.y;
      }
      line.elevation = draftElevation(line, line.anchors, groundY, (x, z) => mainLine.index.nearest(x, z), mainLine.width, line.maxGrade);
    }
    finalized = true;
  }

  const road = {
    id: 0, name: mainLine.name, kind: 'main', width: mainLine.width, length: mainLine.length, closed: true,
    sample(t) { return mainLine.sample(t); },
    sampleOn(route, t) { return lines[route].sample(t); },
    lengthOf(route) { return lines[route].length; },
    widthOf(route) { return lines[route].width; },
    kindOf(route) { return lines[route].kind; },
    isClosed(route) { return lines[route].closed; },
    nameOf(route) { return lines[route].name; },
    mainNearest(x, z) { return mainLine.index.nearest(x, z); },
    nearest(x, z, preferredRoute = 0) { return networkQuery(x, z, preferredRoute); },
    groundHeight: () => 0,
    lines,
  };

  const mapPaths = lines.map((line) => ({
    id: line.id, name: line.name, kind: line.kind, width: line.width, closed: line.closed,
    points: line.samples.filter((_, i) => i % 8 === 0 || i === line.samples.length - 1).map((p) => ({ x: p.x, z: p.z })),
  }));

  return {
    road, lines, branches, main: mainLine,
    query: mainLine.query, frame: mainLine.frame, samples: mainLine.samples,
    networkQuery, branchDistance, roadDistance, mainJunctions, mapPaths,
    branchQuery: (x, z) => branchIndex.query(x, z).nearest,
    finalizeBranches,
  };
}

function appendRibbon(arrays, line, from, to, left, right, y, segments) {
  const { positions, uvs, indices } = arrays;
  const base = positions.length / 3;
  const span = to - from;
  for (let i = 0; i <= segments; i++) {
    const t = from + span * i / segments;
    const s = line.frame(t, 0);
    const nx = Math.cos(s.heading), nz = -Math.sin(s.heading);
    positions.push(s.position.x + nx * left, s.position.y + y, s.position.z + nz * left);
    positions.push(s.position.x + nx * right, s.position.y + y, s.position.z + nz * right);
    const v = t * line.length / 12.2;
    uvs.push(left / 12.2, v, right / 12.2, v);
    if (i < segments) {
      const n = base + i * 2;
      indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
}

function ribbonArrays() { return { positions: [], uvs: [], indices: [] }; }

function arraysToGeometry(arrays) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(arrays.positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(arrays.uvs, 2));
  geometry.setIndex(arrays.indices);
  geometry.computeVertexNormals();
  return geometry;
}

// A single merged ribbon per material keeps the branch network to a handful of draw
// calls instead of one pair of meshes per road.
function addBranchRibbons(scene, route, materials) {
  const { gravel, pavement, paint } = materials;
  const surfaces = {
    secondary: { arrays: ribbonArrays(), material: pavement.clone(), name: 'branch-asphalt' },
    shoulder: { arrays: ribbonArrays(), material: gravel, name: 'branch-gravel-shoulders' },
    paint: { arrays: ribbonArrays(), material: paint, name: 'branch-edge-lines' },
    trail: { arrays: ribbonArrays(), material: new THREE.MeshStandardMaterial({
      map: gravel.map, bumpMap: gravel.bumpMap, bumpScale: 0.12, roughness: 1, color: 0x9a8b72,
    }), name: 'branch-gravel-trail' },
  };
  surfaces.secondary.material.color.setHex(0xc9c4b6);
  surfaces.secondary.material.needsUpdate = true;

  for (const line of route.branches) {
    const half = line.width / 2;
    const y = 0.045 + line.id * 0.001;
    const trim = Math.min(0.02, 34 / line.length);
    const from = trim, to = 1 - trim;
    const segments = Math.max(24, Math.ceil((to - from) * line.length / 2.7));
    if (line.kind === 'trail') {
      appendRibbon(surfaces.trail.arrays, line, 0, 1, -half, half, y, Math.max(24, Math.ceil(line.length / 2.7)));
      appendRibbon(surfaces.shoulder.arrays, line, 0, 1, -half - 2.1, half + 2.1, -0.055, Math.max(24, Math.ceil(line.length / 2.7)));
    } else {
      appendRibbon(surfaces.secondary.arrays, line, 0, 1, -half, half, y, segments);
      appendRibbon(surfaces.shoulder.arrays, line, 0, 1, -half - 2.4, half + 2.4, -0.06, segments);
      appendRibbon(surfaces.paint.arrays, line, from, to, -half + 0.32, -half + 0.5, y + 0.012, Math.max(20, Math.ceil((to - from) * line.length / 3.2)));
      appendRibbon(surfaces.paint.arrays, line, from, to, half - 0.5, half - 0.32, y + 0.012, Math.max(20, Math.ceil((to - from) * line.length / 3.2)));
    }
  }
  for (const surface of Object.values(surfaces)) {
    if (!surface.arrays.positions.length) continue;
    const mesh = new THREE.Mesh(arraysToGeometry(surface.arrays), surface.material);
    mesh.name = surface.name;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

export function ribbonGeometry(road, from, to, left, right, y = 0, segments = 1600) {
  const vertices = [], indices = [], uvs = [];
  for (let i = 0; i <= segments; i++) {
    const s = road.sample(from + (to - from) * i / segments);
    const nx = Math.cos(s.heading), nz = -Math.sin(s.heading);
    vertices.push(s.position.x + nx * left, s.position.y + y, s.position.z + nz * left);
    vertices.push(s.position.x + nx * right, s.position.y + y, s.position.z + nz * right);
    uvs.push(left / 12.2, (from + (to - from) * i / segments) * road.length / 12.2);
    uvs.push(right / 12.2, (from + (to - from) * i / segments) * road.length / 12.2);
    if (i < segments) {
      const n = i * 2;
      indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function roadMesh(scene, route) {
  const { road } = route;
  const materials = createRoadMaterials();
  const { gravel, pavement, paint, seal } = materials;
  const addRibbon = (from, to, left, right, y, material, name) => {
    const mesh = new THREE.Mesh(ribbonGeometry(road, from, to, left, right, y, Math.max(20, Math.ceil((to - from) * road.length / 2.7))), material);
    mesh.name = name; mesh.receiveShadow = true; scene.add(mesh); return mesh;
  };
  addRibbon(0, 1, -9.4, 9.4, -.1, gravel, 'aggregate-road-shoulder');
  addRibbon(0, 1, -6.1, 6.1, .035, pavement, 'textured-asphalt');
  addRibbon(0, 1, -5.5, -5.3, .058, paint, 'left-edge-line');
  addRibbon(0, 1, 5.3, 5.5, .058, paint, 'right-edge-line');
  const kerb = new THREE.MeshStandardMaterial({ color: 0xb2ab94, map: gravel.map, roughness: .97, bumpMap: gravel.bumpMap, bumpScale: .03 });
  for (const [from, to] of [[0, .087], [.975, 1]]) {
    addRibbon(from, to, -11.2, -7.4, .12, kerb, 'village-pavement');
    addRibbon(from, to, 7.4, 11.2, .12, kerb, 'coastal-footpath');
    addRibbon(from, to, -7.5, -7.25, .19, paint, 'stone-kerb');
    addRibbon(from, to, 7.25, 7.5, .19, paint, 'stone-kerb');
  }
  const dashes = Math.floor(road.length / 15);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.035, 5.2), paint, dashes);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < dashes; i++) {
    const s = road.sample(i / dashes);
    dummy.position.copy(s.position); dummy.position.y += 0.065;
    dummy.rotation.set(-Math.asin(s.tangent.y), s.heading, 0, 'YXZ'); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  const rng = seededRandom(3127), repairs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), seal, 100);
  for (let i = 0; i < 100; i++) {
    const t = rng(), s = route.frame(t, (rng() - .5) * 9);
    dummy.position.copy(s.position); dummy.position.y += .046;
    dummy.rotation.set(-Math.asin(s.tangent.y), s.heading, 0, 'YXZ');
    dummy.scale.set(.32 + rng() * 1.8, 1, .5 + rng() * 3.2); dummy.updateMatrix(); repairs.setMatrixAt(i, dummy.matrix);
  }
  repairs.receiveShadow = true; repairs.instanceMatrix.needsUpdate = true; repairs.name = 'asphalt-repairs'; scene.add(repairs);
  const studs = new THREE.InstancedMesh(new THREE.BoxGeometry(.13, .035, .25), new THREE.MeshStandardMaterial({ color: 0xf1d78d, roughness: .3, metalness: .2 }), dashes * 2);
  for (let i = 0; i < dashes; i++) for (let side = 0; side < 2; side++) {
    const s = route.frame((i + .5) / dashes, side ? 5.15 : -5.15);
    dummy.position.copy(s.position); dummy.position.y += .085; dummy.rotation.set(0, s.heading, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); studs.setMatrixAt(i * 2 + side, dummy.matrix);
  }
  studs.instanceMatrix.needsUpdate = true; studs.name = 'road-reflective-studs'; scene.add(studs);
  addBranchRibbons(scene, route, materials);
  return { gravel, pavement, paint, seal };
}

export function seededRandom(seed = 97127) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export { TAU };
