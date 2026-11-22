import * as THREE from 'three';

function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function dataTexture(bytes, size, srgb = true) {
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export function makeSurface(kind, size = 256) {
  const rng = random(kind === 'asphalt' ? 6193 : kind === 'rock' ? 4901 : 1117);
  const pixels = new Uint8Array(size * size * 4);
  const height = new Uint8Array(size * size * 4);
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const n = (z * size + x) * 4;
      const grit = rng(), grain = rng();
      let r, g, b, h;
      if (kind === 'asphalt') {
        const wear = Math.exp(-(((x / size - .25) / .1) ** 2)) + Math.exp(-(((x / size - .75) / .1) ** 2));
        const value = 55 + grit * 19 + (grain > .93 ? 15 : 0) - wear * 5;
        r = value * .91; g = value; b = value * 1.04; h = grit * 150 + 55;
      } else if (kind === 'rock') {
        const layer = Math.sin(z * .15 + Math.sin(x * .032) * 1.3) * 8;
        const vein = Math.sin(z * .038 + x * .014 + Math.sin(x * .018) * 2) > .8 ? -18 : 0;
        r = 128 + grit * 35 + layer + vein; g = 117 + grit * 32 + layer + vein; b = 100 + grit * 32 + layer + vein;
        h = 75 + grit * 80 + layer * 3 + vein;
      } else if (kind === 'gravel') {
        const pebble = grain > .78 ? 31 : grain < .15 ? -28 : 0;
        r = 135 + grit * 31 + pebble; g = 123 + grit * 28 + pebble; b = 102 + grit * 27 + pebble; h = 100 + grit * 110;
      } else {
        const fleck = grain > .82 ? 21 : grain < .19 ? -15 : 0;
        r = 137 + grit * 32 + fleck; g = 150 + grit * 31 + fleck; b = 110 + grit * 28 + fleck; h = grit * 150 + 55;
      }
      pixels[n] = r; pixels[n + 1] = g; pixels[n + 2] = b; pixels[n + 3] = 255;
      height[n] = height[n + 1] = height[n + 2] = h; height[n + 3] = 255;
    }
  }
  if (kind === 'asphalt') {
    const point = (x, z, radius, shade) => {
      for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz > radius * radius + .5) continue;
        const n = (((z + dz + size) % size) * size + ((x + dx + size) % size)) * 4;
        pixels[n] = shade; pixels[n + 1] = shade + 3; pixels[n + 2] = shade + 4;
        height[n] = height[n + 1] = height[n + 2] = 80;
      }
    };
    for (let i = 0; i < 7; i++) {
      let x = Math.floor(rng() * size), z = Math.floor(rng() * size);
      const direction = rng() < .45 ? 1 : -1;
      for (let j = 0; j < 45 + rng() * 60; j++) {
        point(x, z, j % 7 === 0 ? 1 : 0, 32 + Math.floor(rng() * 8));
        x += rng() < .62 ? direction : -direction;
        z += rng() < .72 ? 1 : -1;
      }
    }
  }
  return { map: dataTexture(pixels, size), bumpMap: dataTexture(height, size, false) };
}

export function createRoadMaterials() {
  const asphalt = makeSurface('asphalt', 256), aggregate = makeSurface('gravel', 128);
  const pavement = new THREE.MeshStandardMaterial({ map: asphalt.map, bumpMap: asphalt.bumpMap, bumpScale: .085, roughness: .92, metalness: .015, envMapIntensity: .32 });
  const gravel = new THREE.MeshStandardMaterial({ map: aggregate.map, bumpMap: aggregate.bumpMap, bumpScale: .13, roughness: 1, color: 0xc2b69c });
  const paint = new THREE.MeshStandardMaterial({ color: 0xe4dfc4, roughness: .78, metalness: 0, bumpMap: aggregate.bumpMap, bumpScale: .012 });
  const seal = new THREE.MeshStandardMaterial({ color: 0x30393e, roughness: .79, metalness: .01 });
  return { pavement, gravel, paint, seal };
}

export function createGroundMaterial() {
  const grass = makeSurface('grass', 128), stone = makeSurface('rock', 128);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .97, metalness: 0, envMapIntensity: .3 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.groundTexture = { value: grass.map };
    shader.uniforms.stoneTexture = { value: stone.map };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      varying vec3 vGroundPosition;
      varying vec3 vGroundNormal;`);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vGroundPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      vGroundNormal = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vGroundPosition;
      varying vec3 vGroundNormal;
      uniform sampler2D groundTexture;
      uniform sampler2D stoneTexture;
      float terrainHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float terrainNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(terrainHash(i),terrainHash(i+vec2(1.,0.)),f.x),mix(terrainHash(i+vec2(0.,1.)),terrainHash(i+1.),f.x),f.y);
      }`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 worldNormal = normalize(vGroundNormal);
      float rockWeight = smoothstep(0.22,0.65,1.0-worldNormal.y);
      float dirt = terrainNoise(vGroundPosition.xz*0.055);
      float mottling = terrainNoise(vGroundPosition.xz*0.31)*0.09 + terrainNoise(vGroundPosition.xz*0.016)*0.15;
      vec3 turf = texture2D(groundTexture,vGroundPosition.xz*0.21).rgb;
      vec3 triWeights = pow(abs(worldNormal),vec3(4.0)); triWeights/=max(dot(triWeights,vec3(1.0)),0.001);
      vec3 strata = texture2D(stoneTexture,vGroundPosition.zy*0.052).rgb*triWeights.x;
      strata += texture2D(stoneTexture,vGroundPosition.xz*0.052).rgb*triWeights.y;
      strata += texture2D(stoneTexture,vGroundPosition.xy*0.052).rgb*triWeights.z;
      float ledge = smoothstep(0.40,0.54,fract(vGroundPosition.y*0.18+terrainNoise(vGroundPosition.xz*0.018)*0.7));
      vec3 rockColor = strata * vec3(0.94,0.89,0.84) * mix(0.79,1.08,ledge);
      diffuseColor.rgb *= mix(turf*1.8,vec3(0.78,0.67,0.49),smoothstep(0.58,0.78,dirt)*0.38)*(0.93+mottling);
      diffuseColor.rgb = mix(diffuseColor.rgb,rockColor,rockWeight*0.93);
    `);
  };
  material.customProgramCacheKey = () => 'pixel-horizon-ground-v2';
  return material;
}
