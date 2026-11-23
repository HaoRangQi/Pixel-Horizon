import * as THREE from 'three';

export function createOutdoorEnvironment(renderer) {
  const width = 512, height = 256;
  const data = new Float32Array(width * height * 4);
  const sky = new THREE.Color(0x7fbfe6), horizon = new THREE.Color(0xe3eee6);
  const ground = new THREE.Color(0x6d7862), color = new THREE.Color();
  // Keep the IBL sun highlight aligned with the shader sky and the key light.
  const sun = new THREE.Vector3(-0.48, 0.69, -0.53).normalize();
  for (let y = 0; y < height; y++) {
    const theta = Math.PI * (y + 0.5) / height;
    const elevation = Math.cos(theta);
    for (let x = 0; x < width; x++) {
      const phi = (x + 0.5) / width * Math.PI * 2;
      const direction = new THREE.Vector3(-Math.sin(theta) * Math.cos(phi), elevation, Math.sin(theta) * Math.sin(phi));
      if (elevation > 0) color.copy(horizon).lerp(sky, Math.pow(elevation, 0.45));
      else color.copy(horizon).lerp(ground, Math.min(1, -elevation * 3.5));
      const glow = Math.pow(Math.max(0, direction.dot(sun)), 850) * 8;
      const offset = (y * width + x) * 4;
      data[offset] = color.r + glow;
      data[offset + 1] = color.g + glow * 0.89;
      data[offset + 2] = color.b + glow * 0.7;
      data[offset + 3] = 1;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromEquirectangular(texture);
  texture.dispose(); generator.dispose();
  return target;
}
