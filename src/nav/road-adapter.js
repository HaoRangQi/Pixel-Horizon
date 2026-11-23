// Read-only adapter between the world's road data and the navigation layer.
// It never mutates the road objects: route generation stays owned by world/route.js.
//
// A source is either a single road (the current 7.46 km closed circuit) or
// `{ routes: [...] }` / an array of roads. Multiple routes are treated as an
// ordered chain: route 0 ends where route 1 starts, and the chain wraps from the
// last route back to the first. Branching topology (junctions, one-way links)
// belongs to the road-network workflow; this adapter only needs the ordered
// linearisation that a path query and the map highlight can share.

const wrap = (t) => ((t % 1) + 1) % 1;

function validateRoute(route, index) {
  if (!route || typeof route.sample !== 'function' || typeof route.nearest !== 'function') {
    throw new TypeError(`readRoadNetwork: route ${index} must expose sample(t) and nearest(x, z)`);
  }
  if (!Number.isFinite(route.length) || route.length <= 0) {
    throw new TypeError(`readRoadNetwork: route ${index} needs a positive length`);
  }
}

export function readRoadNetwork(source) {
  const routes = Array.isArray(source)
    ? source.slice()
    : source && Array.isArray(source.routes)
      ? source.routes.slice()
      : source
        ? [source]
        : [];
  if (!routes.length) throw new TypeError('readRoadNetwork: expected a road or { routes: [...] }');
  routes.forEach(validateRoute);

  if (routes.length === 1) {
    const [road] = routes;
    return {
      kind: 'single',
      routes: [{ road, index: 0, start: 0, length: road.length }],
      length: road.length,
      width: Number.isFinite(road.width) ? road.width : 12.2,
      sample: (t) => road.sample(wrap(t)),
      nearest: (x, z) => road.nearest(x, z),
      locate(t) {
        const station = wrap(t);
        return { routeIndex: 0, routeT: station, distance: station * road.length };
      },
    };
  }

  const total = routes.reduce((sum, road) => sum + road.length, 0);
  const segments = [];
  let start = 0;
  routes.forEach((road, index) => {
    segments.push({ road, index, start, length: road.length });
    start += road.length;
  });

  function locate(t) {
    const distance = wrap(t) * total;
    let segment = segments[segments.length - 1];
    for (const candidate of segments) {
      if (distance < candidate.start + candidate.length) { segment = candidate; break; }
    }
    const routeT = Math.min(1, Math.max(0, (distance - segment.start) / segment.length));
    return { routeIndex: segment.index, routeT, distance };
  }

  return {
    kind: 'chain',
    routes: segments,
    length: total,
    width: Math.min(...routes.map((road) => (Number.isFinite(road.width) ? road.width : 12.2))),
    sample(t) {
      const { routeIndex, routeT } = locate(t);
      return segments[routeIndex].road.sample(routeT);
    },
    nearest(x, z) {
      let best = null;
      for (const segment of segments) {
        const hit = segment.road.nearest(x, z);
        if (!hit || !hit.point || !Number.isFinite(hit.distance)) continue;
        if (!best || hit.distance < best.hit.distance) best = { segment, hit };
      }
      if (!best) throw new Error('readRoadNetwork: no route produced a nearest point');
      const { segment, hit } = best;
      // A route's own nearest() may report t=1 at its far end; clamp instead of
      // wrapping so the end of a segment is not mistaken for its start.
      const routeT = Math.min(1, Math.max(0, hit.t));
      return { ...hit, t: wrap((segment.start + routeT * segment.length) / total) };
    },
    locate,
  };
}
