import * as THREE from 'three';

const dummy = new THREE.Object3D(), axis = new THREE.Vector3(0, 1, 0);
const quaternion = new THREE.Quaternion(), delta = new THREE.Vector3();
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 10);

export function point(x, z, yaw, xx, zz, y = 0) {
  return { x: x + xx * Math.cos(yaw) + zz * Math.sin(yaw), y, z: z - xx * Math.sin(yaw) + zz * Math.cos(yaw) };
}

export class SceneryBatches {
  constructor(cellSize = 200) {
    this.cellSize = cellSize;
    this.buckets = new Map();
    this.stats = { instances: 0, batches: 0, treeCount: 0, houseCount: 0 };
  }

  add(name, geometry, material, p, { band = 'structure', shadow = true } = {}) {
    const gx = Math.floor(p.x / this.cellSize), gz = Math.floor(p.z / this.cellSize);
    const key = `${name}:${band}:${gx}:${gz}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { name, geometry, material, band, shadow, gx, gz, items: [] };
      this.buckets.set(key, bucket);
    }
    bucket.items.push(p); this.stats.instances++;
  }

  box(name, material, p, options) { this.add(name, BOX, material, p, options); }
  column(name, material, p, options) { this.add(name, CYLINDER, material, p, options); }

  beam(name, material, a, b, width, depth = width, options) {
    delta.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const length = delta.length();
    if (length < .001) return;
    quaternion.setFromUnitVectors(axis, delta.normalize());
    this.box(name, material, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, sx: width, sy: length, sz: depth, q: quaternion.clone() }, options);
  }

  finish(scene) {
    const cells = new Map();
    for (const bucket of this.buckets.values()) {
      const cellKey = `${bucket.gx}:${bucket.gz}`;
      let cell = cells.get(cellKey);
      if (!cell) {
        cell = { x: (bucket.gx + .5) * this.cellSize, y: 0, z: (bucket.gz + .5) * this.cellSize, count: 0, groups: new Map() };
        cells.set(cellKey, cell);
      }
      for (const p of bucket.items) { cell.y += p.y; cell.count++; }
    }
    for (const cell of cells.values()) cell.y /= cell.count;
    for (const bucket of this.buckets.values()) {
      const { gx, gz, band } = bucket, cellKey = `${gx}:${gz}`;
      const cell = cells.get(cellKey);
      let group = cell.groups.get(band);
      if (!group) { group = new THREE.Group(); group.name = `scenery-${band}-${cellKey}`; cell.groups.set(band, group); }
      const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, bucket.items.length);
      mesh.name = bucket.name;
      mesh.castShadow = bucket.shadow; mesh.receiveShadow = true;
      bucket.items.forEach((p, i) => {
        dummy.position.set(p.x - cell.x, p.y - cell.y, p.z - cell.z);
        if (p.q) dummy.quaternion.copy(p.q);
        else dummy.rotation.set(p.rx || 0, p.yaw || 0, p.rz || 0, 'YXZ');
        dummy.scale.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1); dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (p.color != null) mesh.setColorAt(i, new THREE.Color(p.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere(); group.add(mesh); this.stats.batches++;
    }
    const root = new THREE.Group(); root.name = 'detailed-scenery';
    for (const cell of cells.values()) {
      for (const band of ['structure', 'detail']) {
        const group = cell.groups.get(band); if (!group) continue;
        const lod = new THREE.LOD(); lod.position.set(cell.x, cell.y, cell.z);
        lod.addLevel(group, 0); lod.addLevel(new THREE.Group(), band === 'detail' ? 300 : 1550, .12);
        root.add(lod);
      }
      if (cell.groups.has('tree-near') || cell.groups.has('tree-far')) {
        const lod = new THREE.LOD(); lod.position.set(cell.x, cell.y, cell.z);
        lod.name = 'natural-tree-lod';
        lod.addLevel(cell.groups.get('tree-near') || new THREE.Group(), 0);
        lod.addLevel(cell.groups.get('tree-far') || new THREE.Group(), 410, .13);
        lod.addLevel(new THREE.Group(), 1650, .12); root.add(lod);
      }
    }
    root.userData.sceneryStats = this.stats;
    scene.add(root); this.buckets.clear(); return root;
  }
}
