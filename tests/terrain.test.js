import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoute } from '../src/world/route.js';
import { createLandscape, addTerrain } from '../src/world/terrain.js';

test('rendered terrain triangles leave both branch lanes unobstructed', () => {
  const route = createRoute(), landscape = createLandscape(route), scene = new THREE.Scene();
  addTerrain(scene, route, landscape);
  scene.updateMatrixWorld(true);
  const meshes = scene.children.filter((mesh) => ['textured-smooth-island', 'detailed-roadside-landform', 'detailed-branch-landform'].includes(mesh.name));
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  try {
    for (const line of route.branches) for (let d = 24; d < line.length; d += 24) {
      for (const side of [-0.25, 0, 0.25]) {
        const p = line.frame(d / line.length, line.width * side).position;
        ray.set(new THREE.Vector3(p.x, p.y + 60, p.z), down);
        const hit = ray.intersectObjects(meshes, false)[0];
        assert.ok(hit, `${line.name} has a hole under its road at ${d}m`);
        assert.ok(hit.point.y < p.y + 0.08,
          `${line.name} at ${d}m: ${hit.object.name} intrudes ${(hit.point.y - p.y).toFixed(2)}m above pavement`);
      }
    }
  } finally {
    for (const mesh of scene.children) mesh.geometry.dispose();
  }
});
