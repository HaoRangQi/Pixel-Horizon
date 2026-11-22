import * as THREE from 'three';
import { createRoute, roadMesh, seededRandom, TAU } from './world/route.js';
import { createLandscape, addTerrain, riverGeometry } from './world/terrain.js';
import { addScenery } from './world/scenery.js';

export const regions = [
  { id: 'bay', name: '晴湾小镇', subtitle: '海风、彩色屋顶与一段没有目的的旅程', color: '#78b8bb', t: .023 },
  { id: 'coast', name: '灯塔海岸', subtitle: '沿着悬崖，把碧蓝海面留在身旁', color: '#77afb8', t: .106 },
  { id: 'fields', name: '金穗原野', subtitle: '风车慢慢转，阳光落在麦田里', color: '#cfb865', t: .318 },
  { id: 'valley', name: '枫色河谷', subtitle: '越过老石桥，穿行金红色的树林', color: '#c98a66', t: .445 },
  { id: 'lake', name: '松影镜湖', subtitle: '在瀑布与湖光之间，停一会儿', color: '#88ab91', t: .616 },
  { id: 'summit', name: '云上垭口', subtitle: '回望山海，再顺着晚风回到海湾', color: '#a49cb8', t: .746 },
];

function createSky(scene) {
  const uniforms = {
    topColor: { value: new THREE.Color(0x408dc0) },
    horizonColor: { value: new THREE.Color(0xb9d7dc) },
    sunColor: { value: new THREE.Color(0xffdf9b) },
    sunDirection: { value: new THREE.Vector3(-.52, .33, -.71).normalize() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDirection;
      void main() { vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDirection;
      uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 sunColor; uniform vec3 sunDirection;
      void main() {
        vec3 d=normalize(vDirection); float h=pow(max(d.y,0.0),0.38);
        vec3 color=mix(horizonColor,topColor,h);
        float sun=max(dot(d,sunDirection),0.0);
        color=mix(color,sunColor,pow(sun,18.0)*0.22);
        color=mix(color,sunColor,smoothstep(0.9989,0.9993,sun));
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(6900, 32, 20), material);
  mesh.name = 'gradient-sky'; mesh.renderOrder = -10; scene.add(mesh);
  return uniforms;
}

function waterMaterial(deep, light) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, deepColor: { value: new THREE.Color(deep) }, lightColor: { value: new THREE.Color(light) }, ...THREE.UniformsLib.fog },
    fog: true,
    vertexShader: `varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vWorld=(modelMatrix*vec4(position,1.0)).xyz;
        vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `varying vec3 vWorld;
      uniform float time; uniform vec3 deepColor; uniform vec3 lightColor;
      #include <fog_pars_fragment>
      void main() {
        float broad=sin(vWorld.x*0.008+vWorld.z*0.006)*0.5+0.5;
        float lines=sin(vWorld.x*0.075+vWorld.z*0.13+sin(vWorld.x*0.018)*1.8+time*0.4);
        float flecks=smoothstep(0.94,1.0,lines)*0.13;
        vec3 color=mix(deepColor,lightColor,0.18+broad*0.22+flecks);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

function addWater(scene, landscape) {
  const oceanMaterial = waterMaterial(0x238d9c, 0x7fc7bd);
  const lakeMaterial = waterMaterial(0x537e83, 0x94bcb1);
  const riverMaterial = waterMaterial(0x6b999b, 0xaaccc2);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(19000, 19000).rotateX(-Math.PI / 2), oceanMaterial);
  ocean.position.y = -2.3; ocean.name = 'turquoise-ocean'; scene.add(ocean);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), lakeMaterial);
  lake.position.set(landscape.lake.x, landscape.lake.y, landscape.lake.z);
  lake.scale.set(landscape.lake.rx * 1.035, 1, landscape.lake.rz * 1.035);
  lake.name = 'forest-lake'; scene.add(lake);
  const river = new THREE.Mesh(riverGeometry(landscape.riverPoints, 23), riverMaterial);
  river.name = 'river-through-valley'; scene.add(river);
  return [oceanMaterial, lakeMaterial, riverMaterial];
}

function addClouds(scene) {
  const rng = seededRandom(2193), count = 72 * 3;
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0xf2e6cf, fog: true });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'soft-cloud-banks';
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count / 3; i++) {
    const x = (rng() - .5) * 8500, z = (rng() - .5) * 8500, y = 650 + rng() * 280;
    const scale = 65 + rng() * 90;
    for (let j = 0; j < 3; j++) {
      dummy.position.set(x + (j - 1) * scale * .8, y + (j === 1 ? 13 : 0), z);
      dummy.rotation.set(0, rng() * TAU, 0); dummy.scale.set(scale, 18 + rng() * 21, scale * .43);
      dummy.updateMatrix(); mesh.setMatrixAt(i * 3 + j, dummy.matrix);
    }
  }
  mesh.instanceMatrix.needsUpdate = true; scene.add(mesh);
  return { mesh, material };
}

function addWaterfall(scene, landscape) {
  const p = landscape.waterfall;
  const stone = new THREE.MeshLambertMaterial({ color: 0x89908a, flatShading: true });
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), stone, 5);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 5; i++) {
    dummy.position.set(p.x + (i - 2) * 13, p.y + 18 + (i % 2) * 8, p.z - 13 - (i % 2) * 5);
    dummy.rotation.set(i * .2, i * .6, .2); dummy.scale.set(20, 31 + (i % 2) * 10, 18);
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true; scene.add(rocks);
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, ...THREE.UniformsLib.fog }, side: THREE.DoubleSide, fog: true,
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `varying vec2 vUv;uniform float time;
      #include <fog_pars_fragment>
      void main(){float streak=sin(vUv.x*51.0+sin(vUv.y*16.0+time*3.0))*0.5+0.5;
      float foam=sin(vUv.y*42.0+time*5.0)*0.5+0.5;
      gl_FragColor=vec4(mix(vec3(0.45,0.65,0.65),vec3(0.87,0.91,0.84),streak*0.7+foam*0.25),1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
      }`,
  });
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(12, p.height), material);
  fall.position.set(p.x, p.y + p.height / 2, p.z + 4); fall.name = 'animated-lake-waterfall'; scene.add(fall);
  const foam = new THREE.Mesh(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd2ded1, transparent: true, opacity: .65, depthWrite: false }));
  foam.position.set(p.x, p.y + .13, p.z + 8); foam.scale.set(15, 1, 10); scene.add(foam);
  return material;
}

export function createWorld(scene) {
  const route = createRoute();
  const landscape = createLandscape(route);
  const sky = createSky(scene);
  const hemisphere = new THREE.HemisphereLight(0xd8e2d6, 0x877560, 1.65);
  const sunlight = new THREE.DirectionalLight(0xffe1b0, 1.9);
  sunlight.position.set(-700, 1300, -1100);
  scene.add(hemisphere, sunlight);
  addTerrain(scene, route, landscape);
  const waters = addWater(scene, landscape);
  roadMesh(scene, route);
  const scenery = addScenery(scene, route, landscape);
  const clouds = addClouds(scene);
  const waterfall = addWaterfall(scene, landscape);

  function setMood(name) {
    const sunset = name === 'sunset';
    sky.topColor.value.setHex(sunset ? 0x647da4 : 0x408dc0);
    sky.horizonColor.value.setHex(sunset ? 0xeab48e : 0xb9d7dc);
    sky.sunColor.value.setHex(sunset ? 0xffce90 : 0xffe9b0);
    sky.sunDirection.value.set(sunset ? -.65 : -.52, sunset ? .16 : .33, -.71).normalize();
    scene.background = sky.horizonColor.value.clone();
    scene.fog = new THREE.Fog(sunset ? 0xc4aaa5 : 0xa7c3cd, 800, 5800);
    hemisphere.color.setHex(sunset ? 0xc8c7dc : 0xd8e2d6);
    hemisphere.groundColor.setHex(sunset ? 0x8a665c : 0x877560);
    hemisphere.intensity = sunset ? 1.25 : 1.3;
    sunlight.color.setHex(sunset ? 0xffbf87 : 0xffe1b0);
    sunlight.intensity = sunset ? 1.85 : 2.1;
    sunlight.position.set(-700, sunset ? 500 : 1300, -1100);
    clouds.material.color.setHex(sunset ? 0xe5c4b1 : 0xf2e6cf);
    waters[0].uniforms.deepColor.value.setHex(sunset ? 0x5c8a94 : 0x238d9c);
    waters[0].uniforms.lightColor.value.setHex(sunset ? 0xb4b8a4 : 0x7fc7bd);
    return { name: sunset ? 'sunset' : 'day', exposure: sunset ? .95 : .97 };
  }
  setMood('day');

  return {
    road: route.road, regions,
    getRegion(t) {
      t = ((t % 1) + 1) % 1;
      if (t < .09 || t >= .95) return regions[0];
      if (t < .255) return regions[1];
      if (t < .415) return regions[2];
      if (t < .56) return regions[3];
      if (t < .72) return regions[4];
      return regions[5];
    },
    setMood,
    update(dt, time) {
      const seconds = Number.isFinite(time) ? time : 0;
      for (const material of waters) material.uniforms.time.value = seconds;
      waterfall.uniforms.time.value = seconds;
      scenery.update(seconds);
      clouds.mesh.position.x = Math.sin(seconds * .0007) * 65;
    },
  };
}
