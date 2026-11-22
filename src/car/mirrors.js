import * as THREE from 'three';

// One wide, low-resolution rear panorama feeds all three mirrors. A separate camera per
// mirror would cost three extra scene render passes; a single 4:1 pass is one draw-call
// sweep and stays comfortably inside the frame budget.
const PANO_WIDTH = 768;
const PANO_HEIGHT = 192;
const PANO_FOV = 62;
const UPDATE_HZ = 30;

/** Remap a plane's UVs onto a window of the shared panorama (physical mirrors crop it). */
function crop(geometry, u0, u1, v0, v1) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
}

/**
 * Simulated mirrors: a rear panorama camera plus three textured planes.
 * The interior glass lives with the cabin; the side glasses ride on the body so they
 * disappear with the exterior in chase view.
 */
export function createMirrors(materials, layout = {}) {
  const target = new THREE.WebGLRenderTarget(PANO_WIDTH, PANO_HEIGHT, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    samples: 2,
  });
  target.texture.generateMipmaps = false;
  target.texture.name = 'mirrorPanorama';

  const glass = new THREE.MeshBasicMaterial({ map: target.texture, toneMapped: false });
  glass.name = 'mirrorGlass';

  const camera = new THREE.PerspectiveCamera(PANO_FOV, PANO_WIDTH / PANO_HEIGHT, 0.5, 2600);
  camera.name = 'mirrorCamera';
  camera.position.set(0, 0.985, -0.1);
  camera.rotation.set(-0.05, 0, 0); // three cameras look down -Z: unrotated is out of the tail

  const bezel = new THREE.MeshBasicMaterial({ color: 0x05080b, toneMapped: false });

  // Interior mirror: frame and stalk are part of the cabin batch; this is the glass only.
  const interior = new THREE.Group();
  interior.name = 'interiorMirror';
  interior.position.set(0.1059, 1.098, 0.2167);
  interior.rotation.y = Math.PI - 0.42;
  const interiorBack = new THREE.Mesh(new THREE.PlaneGeometry(0.178, 0.052), bezel);
  interiorBack.position.z = -0.0015;
  const interiorPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.166, 0.044), glass);
  interiorPlane.name = 'interiorMirrorGlass';
  // A mirror reverses left/right, so each window is sampled right-to-left.
  crop(interiorPlane.geometry, 0.64, 0.36, 0.3, 0.7);
  interior.add(interiorBack, interiorPlane);

  // Door mirrors: one plane per housing, cropped from the left / right edge of the panorama.
  // Each body style supplies its glass transform, since the pods sit at different heights.
  const sides = new THREE.Group();
  sides.name = 'sideMirrors';
  const sidePlanes = [];
  for (const side of [1, -1]) {
    const spec = (layout.sides || {})[side > 0 ? 'left' : 'right'] || { position: [side * 1.058, 0.854, 0.5215], rotationY: Math.PI + side * 0.26 };
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(spec.size || 0.162, spec.height || 0.045), glass);
    plane.name = side > 0 ? 'leftMirrorGlass' : 'rightMirrorGlass';
    plane.position.set(...(spec.position || [side * 1.058, 0.854, 0.5215]));
    plane.rotation.y = spec.rotationY ?? Math.PI + side * 0.26;
    // Each door glass looks 20-55° off the tail, i.e. the shoulder of the panorama.
    crop(plane.geometry, side > 0 ? 0.9 : 0.34, side > 0 ? 0.66 : 0.1, 0.3, 0.7);
    sides.add(plane);
    sidePlanes.push(plane);
  }

  let clock = 1;
  let drawables = null;
  function render(renderer, scene, root, dt) {
    clock += dt;
    if (clock < 1 / UPDATE_HZ) return;
    clock = 0;
    // Hide only car meshes, never the cabin lights: dropping light count would change the
    // shader permutation for every material in the scene and cause a compile hitch here.
    drawables ??= (() => { const list = []; root.traverse((o) => { if (o.isMesh) list.push(o); }); return list; })();
    const wasVisible = drawables.map((o) => o.visible);
    drawables.forEach((o) => { o.visible = false; });
    const previousTarget = renderer.getRenderTarget();
    const shadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false; // light-space shadow map is camera independent
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(previousTarget);
    renderer.shadowMap.autoUpdate = shadowAuto;
    drawables.forEach((o, i) => { o.visible = wasVisible[i]; });
  }

  function setActive(active) {
    sides.visible = active;
    if (!active) clock = 1; // refresh immediately on the next cockpit entry
  }

  function dispose() {
    target.dispose();
    glass.dispose();
    bezel.dispose();
    interiorPlane.geometry.dispose();
    interiorBack.geometry.dispose();
    for (const plane of sidePlanes) plane.geometry.dispose();
  }

  return { camera, interior, sides, sidePlanes, target, render, setActive, dispose };
}
