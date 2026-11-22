import * as THREE from 'three';
import { createWorld } from '../../world.js';
import { createOutdoorEnvironment } from '../../environment.js';

const canvas = document.querySelector('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(), world = createWorld(scene);
const environment = createOutdoorEnvironment(renderer); scene.environment = environment.texture; scene.environmentIntensity = .5;
const camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, .08, 11000);
const labels = { town: '晴湾小镇 · 门窗、屋檐与店铺', coast: '灯塔海岸 · 叶簇与沿路草丛', fields: '金穗原野 · 风车与田埂', valley: '枫色河谷 · 分叉树干与碎叶', lake: '松影镜湖 · 真实水边码头', summit: '云上垭口 · 内侧矮松与观景台' };
let pose = 'coast', time = 12;
function setPose(name = 'coast') {
  pose = name; const road = world.road;
  const t = { town: .023, coast: .106, fields: .318, valley: .445, lake: .616, summit: .746, lighthouse: .137, bridge: .462, shop: .023, tree: .432 }[name] ?? .106;
  const f = road.sample(t), focus = f.position.clone();
  const right = new THREE.Vector3(Math.cos(f.heading), 0, -Math.sin(f.heading));
  const front = new THREE.Vector3(Math.sin(f.heading), 0, Math.cos(f.heading));
  camera.position.copy(f.position).addScaledVector(front, -8).add(new THREE.Vector3(0, 3.4, 0));
  const target = f.position.clone().addScaledVector(front, 36).add(new THREE.Vector3(0, 1.2, 0));
  if (name === 'shop') { camera.position.copy(f.position).addScaledVector(right, -4).addScaledVector(front,-3).add(new THREE.Vector3(0, 2.8, 0)); target.copy(f.position).addScaledVector(right, -25).add(new THREE.Vector3(0, 4.1, 0)); }
  if (name === 'tree') { camera.position.copy(f.position).addScaledVector(right, -10).add(new THREE.Vector3(0, 2.2, 0)); target.copy(f.position).addScaledVector(right, -25).addScaledVector(front, 8).add(new THREE.Vector3(0, 8.4, 0)); }
  if (name === 'bridge') { camera.position.copy(f.position).addScaledVector(right, 73).addScaledVector(front, -46).add(new THREE.Vector3(0, -8, 0)); target.copy(f.position).add(new THREE.Vector3(0, -9, 0)); }
  if (name === 'lighthouse') { camera.position.copy(f.position).addScaledVector(right, 40).addScaledVector(front, -52).add(new THREE.Vector3(0, 4.5, 0)); target.copy(f.position).addScaledVector(right, 99).add(new THREE.Vector3(0, 11, 0)); }
  if(name==='dock'){
    scene.updateMatrixWorld(true);let deck;scene.traverse((o)=>{if(o.name==='lake-dock-individual-planks'&&!deck)deck=o;});
    const mat=new THREE.Matrix4();deck.getMatrixAt(Math.floor(deck.count/2),mat);mat.premultiply(deck.matrixWorld);target.setFromMatrixPosition(mat);
    camera.position.copy(target).add(new THREE.Vector3(15,9,17));target.y+=.1;focus.copy(target);
  }
  camera.lookAt(target); camera.updateMatrixWorld(); world.followFocus?.(focus);
  document.querySelector('#caption').textContent = `${labels[name] || name} · 原生 3D 检查`;
  render(); return snapshot();
}
function render() { world.update(0, time); renderer.render(scene, camera); }
function snapshot() { return { pose, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, camera: camera.position.toArray(), stats: scene.getObjectByName('detailed-scenery')?.userData.sceneryStats }; }
window.__sceneryPreview = { scene, world, camera, renderer, setPose, snapshot, render };
setPose(new URLSearchParams(location.search).get('pose') || 'coast');
renderer.setAnimationLoop(() => { time += 1 / 60; render(); });
window.addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
