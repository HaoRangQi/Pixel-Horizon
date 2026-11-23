import * as THREE from 'three';
import { createRoute, roadMesh } from './world/route.js';
import { createLandscape, addTerrain } from './world/terrain.js';
import { createAtmosphere } from './world/atmosphere.js';
import { makeSurface } from './world/surfaces.js';
import { addScenery } from './world/scenery.js';

export const regions = [
  { id: 'bay', name: '晴湾小镇', subtitle: '海风、彩色屋顶与一段没有目的的旅程', color: '#78b8bb', t: .023 },
  { id: 'coast', name: '灯塔海岸', subtitle: '沿着悬崖，把碧蓝海面留在身旁', color: '#77afb8', t: .106 },
  { id: 'fields', name: '金穗原野', subtitle: '风车慢慢转，阳光落在麦田里', color: '#cfb865', t: .318 },
  { id: 'valley', name: '枫色河谷', subtitle: '越过老石桥，穿行金红色的树林', color: '#c98a66', t: .445 },
  { id: 'lake', name: '松影镜湖', subtitle: '在瀑布与湖光之间，停一会儿', color: '#88ab91', t: .616 },
  { id: 'summit', name: '云上垭口', subtitle: '回望山海，再顺着晚风回到海湾', color: '#a49cb8', t: .746 },
];


function addWaterfall(scene, landscape) {
  const p = landscape.waterfall;
  const rockSurface=makeSurface('rock',128);
  const stone = new THREE.MeshStandardMaterial({ color: 0x9e9b88,map:rockSurface.map,bumpMap:rockSurface.bumpMap,bumpScale:.28,roughness:.95 });
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), stone, 5);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 5; i++) {
    dummy.position.set(p.x + (i - 2) * 13, p.y + 18 + (i % 2) * 8, p.z - 13 - (i % 2) * 5);
    dummy.rotation.set(i * .2, i * .6, .2); dummy.scale.set(20, 31 + (i % 2) * 10, 18);
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true; rocks.castShadow=true; rocks.receiveShadow=true; scene.add(rocks);
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
  const hemisphere = new THREE.HemisphereLight(0xc8d9e4,0x70614c,.72);
  const sunlight = new THREE.DirectionalLight(0xffebc8,2.7);
  sunlight.name='traveling-sun-key'; sunlight.castShadow=true;
  sunlight.shadow.mapSize.set(2048,2048);
  sunlight.shadow.camera.left=-105; sunlight.shadow.camera.right=105;
  sunlight.shadow.camera.top=105; sunlight.shadow.camera.bottom=-105;
  sunlight.shadow.camera.near=1; sunlight.shadow.camera.far=520;
  sunlight.shadow.bias=-.00016; sunlight.shadow.normalBias=.15;
  sunlight.shadow.radius=2;
  scene.add(hemisphere,sunlight,sunlight.target);
  addTerrain(scene,route,landscape);
  const atmosphere=createAtmosphere(scene,landscape);
  roadMesh(scene,route);
  const scenery=addScenery(scene,route,landscape);
  const waterfall=addWaterfall(scene,landscape);
  const focus=route.road.sample(0).position;
  function followFocus(position) {
    focus.set(position.x,position.y||0,position.z);
    sunlight.target.position.copy(focus);
    sunlight.position.copy(focus).addScaledVector(atmosphere.sunDirection,230);
    sunlight.target.updateMatrixWorld();
  }
  function setMood(name) {
    const sunset=name==='sunset';
    atmosphere.setMood(name);
    hemisphere.color.setHex(sunset?0xbfc9e0:0xc8d9e4);
    hemisphere.groundColor.setHex(sunset?0x71574b:0x70614c);
    hemisphere.intensity=sunset?.64:.72;
    sunlight.color.setHex(sunset?0xffbd87:0xffebc8);
    sunlight.intensity=sunset?2.45:2.7;
    followFocus(focus);
    return {name:sunset?'sunset':'day',exposure:sunset?.98:1.03};
  }
  setMood('day');
  return {
    road:route.road,regions,followFocus,
    // Both map canvases consume these same road centre lines.
    mapPaths:route.mapPaths,mainJunctions:route.mainJunctions,
    get networkLength(){return route.lines.reduce((sum,line)=>sum+line.length,0);},
    getRegion(t) {
      t=((t%1)+1)%1;
      if(t<.09||t>=.95)return regions[0];
      if(t<.255)return regions[1];
      if(t<.415)return regions[2];
      if(t<.56)return regions[3];
      if(t<.72)return regions[4];
      return regions[5];
    },
    setMood,
    update(dt,time) {
      const seconds=Number.isFinite(time)?time:0;
      atmosphere.update(seconds);waterfall.uniforms.time.value=seconds;
      scenery.update(seconds);
    },
  };
}
