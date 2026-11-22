import * as THREE from 'three';
import { riverGeometry } from './terrain.js';

const noiseGLSL = `
float hash21(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
float noise21(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),mix(hash21(i+vec2(0.,1.)),hash21(i+1.),f.x),f.y);
}
float fbm(vec2 p) { return noise21(p)*.54+noise21(p*2.13)*.26+noise21(p*4.17)*.13+noise21(p*8.31)*.07; }
`;

export function createAtmosphere(scene, landscape) {
  const sunDirection = new THREE.Vector3(-.48, .69, -.53).normalize();
  const uniforms = {
    time: { value: 0 },
    zenith: { value: new THREE.Color(0x438bc0) }, horizon: { value: new THREE.Color(0xc9dfe0) },
    sunColor: { value: new THREE.Color(0xffe4b4) }, cloudColor: { value: new THREE.Color(0xf7f0df) },
    sunDirection: { value: sunDirection }, sunset: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(8500, 48, 24), new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vSkyDirection; void main(){vSkyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec3 vSkyDirection;uniform float time;uniform vec3 zenith;uniform vec3 horizon;uniform vec3 sunColor;uniform vec3 cloudColor;uniform vec3 sunDirection;uniform float sunset;
      ${noiseGLSL}
      void main(){
        vec3 d=normalize(vSkyDirection);float elevation=max(d.y,0.0);
        vec3 color=mix(horizon,zenith,pow(elevation,.48));
        float towardSun=max(dot(d,sunDirection),0.0);
        color+=sunColor*pow(towardSun,16.)*.13;
        color=mix(color,sunColor*1.9,smoothstep(.99935,.99965,towardSun));
        vec2 cloudUV=d.xz/max(.15,d.y+.24)*2.1+vec2(time*.0016,time*.0004);
        float billow=fbm(cloudUV*1.7);
        float density=smoothstep(.53,.72,billow)*(smoothstep(.02,.16,elevation))*(1.-smoothstep(.66,.95,elevation));
        float lightEdge=fbm(cloudUV*1.7+sunDirection.xz*.18);
        vec3 cloud=mix(cloudColor*vec3(.68,.76,.82),cloudColor,smoothstep(.43,.68,lightEdge));
        float wisps=smoothstep(.58,.8,fbm(d.xz/max(.1,d.y+.25)*vec2(4.5,20.)+time*.0003))*.13*smoothstep(.1,.35,elevation);
        color=mix(color,cloud,density*.83);color=mix(color,cloudColor,wisps);
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.name = 'layered-natural-sky'; sky.renderOrder = -20; scene.add(sky);

  const heightSize = 256, heightData = new Float32Array(heightSize * heightSize);
  for (let z = 0; z < heightSize; z++) for (let x = 0; x < heightSize; x++) {
    heightData[z * heightSize + x] = landscape.height(-2250 + x / (heightSize - 1) * 4500, -2250 + z / (heightSize - 1) * 4500);
  }
  const heightTexture = new THREE.DataTexture(heightData, heightSize, heightSize, THREE.RedFormat, THREE.FloatType);
  heightTexture.minFilter = heightTexture.magFilter = THREE.LinearFilter; heightTexture.needsUpdate = true;
  const waters = [];
  function material(deep, shallow, waterY, kind) {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        time: uniforms.time, sunDirection: uniforms.sunDirection, sunColor: uniforms.sunColor,
        skyTop: uniforms.zenith, skyHorizon: uniforms.horizon,
        deepColor: { value: new THREE.Color(deep) }, shallowColor: { value: new THREE.Color(shallow) },
        waterY: { value: waterY }, lake: { value: kind === 'lake' ? 1 : 0 },
        terrainHeight: { value: heightTexture }, ...THREE.UniformsLib.fog,
      }, fog: true,
      vertexShader: `varying vec3 vWaterWorld;uniform float time;
        #include <fog_pars_vertex>
        void main(){
          vec3 p=position;
          vec4 world=modelMatrix*vec4(p,1.0);vWaterWorld=world.xyz;
          vec4 mvPosition=viewMatrix*world;gl_Position=projectionMatrix*mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `varying vec3 vWaterWorld;uniform float time;uniform float waterY;uniform float lake;uniform sampler2D terrainHeight;
        uniform vec3 deepColor;uniform vec3 shallowColor;uniform vec3 skyTop;uniform vec3 skyHorizon;uniform vec3 sunDirection;uniform vec3 sunColor;
        #include <fog_pars_fragment>
        ${noiseGLSL}
        void main(){
          vec2 p=vWaterWorld.xz;
          vec2 sampleUV=(p+2250.)/4500.;
          float inBounds=step(0.,sampleUV.x)*step(0.,sampleUV.y)*step(sampleUV.x,1.)*step(sampleUV.y,1.);
          float ground=mix(-35.,texture2D(terrainHeight,clamp(sampleUV,0.,1.)).r,inBounds);
          float depth=max(0.,vWaterWorld.y-ground);
          float distortion=fbm(p*.017)*4.7;
          float phase1=dot(p,vec2(.12,.08))+time*.58+distortion;
          float phase2=dot(p,vec2(-.09,.18))-time*.44+distortion*.7;
          float phase3=dot(p,vec2(.51,.34))+time*.9+noise21(p*.16)*2.0;
          float detail=1.-smoothstep(75.,620.,distance(cameraPosition,vWaterWorld));
          vec3 normal=normalize(vec3(-cos(phase1)*.033-cos(phase3)*.018*detail,1.,-cos(phase2)*.038-cos(phase3)*.016*detail));
          vec3 viewDirection=normalize(cameraPosition-vWaterWorld);
          float fresnel=.06+.94*pow(1.-max(dot(normal,viewDirection),0.),4.0);
          vec3 reflected=reflect(-viewDirection,normal);
          vec3 reflection=mix(skyHorizon,skyTop,pow(max(reflected.y,0.),.45));
          float cloudReflection=smoothstep(.57,.72,fbm(reflected.xz*3.7+normal.xz*4.))*smoothstep(.05,.22,reflected.y);
          reflection=mix(reflection,vec3(.79,.84,.82),cloudReflection*.5);
          float glint=pow(max(dot(reflect(-sunDirection,normal),viewDirection),0.),185.);
          float glitter=pow(max(dot(normal,normalize(sunDirection+viewDirection)),0.),260.);
          vec3 color=mix(shallowColor,deepColor,smoothstep(0.,35.,depth));
          color=mix(color,reflection,fresnel*mix(.49,.36,lake));
          color+=sunColor*(glint*.65+glitter*.42);
          float ripples=sin(phase1*2.2+sin(phase2))*sin(phase2*1.7)*.5+.5;
          color+=shallowColor*pow(ripples,11.)*.025*detail;
          float shore=1.-smoothstep(.1,3.4,depth);
          float wave=sin(depth*2.7-time*1.15+fbm(p*.14)*4.0);
          float foam=shore*smoothstep(.35,.8,wave)*smoothstep(.18,.65,noise21(p*1.7+time*.04));
          color=mix(color,vec3(.83,.9,.82),foam*.8);
          gl_FragColor=vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    waters.push(m); return m;
  }
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(19000, 19000).rotateX(-Math.PI / 2), material(0x246c86,0x72b6a4,-2.3,'sea'));
  ocean.position.y = -2.3; ocean.name = 'reflective-coastal-water'; scene.add(ocean);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 128).rotateX(-Math.PI / 2), material(0x285d69,0x72a89b,landscape.lake.y,'lake'));
  lake.position.set(landscape.lake.x,landscape.lake.y,landscape.lake.z); lake.scale.set(landscape.lake.rx*1.035,1,landscape.lake.rz*1.035);
  lake.name = 'reflective-forest-lake'; scene.add(lake);
  const river = new THREE.Mesh(riverGeometry(landscape.riverPoints,72),material(0x427b82,0x91c0ad,0,'river'));
  river.name='rippled-valley-river';scene.add(river);
  addLakeShore(scene,landscape);

  return {
    sunDirection,
    setMood(name) {
      const sunset = name === 'sunset';
      uniforms.zenith.value.setHex(sunset ? 0x566c96 : 0x438bc0);
      uniforms.horizon.value.setHex(sunset ? 0xe5b18d : 0xc9dfe0);
      uniforms.sunColor.value.setHex(sunset ? 0xffb980 : 0xffe4b4);
      uniforms.cloudColor.value.setHex(sunset ? 0xefc8a7 : 0xf7f0df);
      sunDirection.set(sunset ? -.64 : -.48,sunset ? .3 : .69,-.53).normalize();
      scene.background=uniforms.horizon.value.clone();
      scene.fog = new THREE.Fog(sunset ? 0xb8a3a3 : 0xadc6cf,1050,6100);
    },
    update(time) { uniforms.time.value=time; },
  };
}

function addLakeShore(scene,landscape) {
  const positions=[],colors=[],indices=[],lake=landscape.lake;
  const color=new THREE.Color();
  for(let i=0;i<=180;i++) {
    const a=i/180*Math.PI*2;
    const irregular=1+Math.sin(a*9)*.016+Math.sin(a*17+.7)*.008;
    for(const r of [.985,1.025,1.07]) {
      const x=lake.x+Math.cos(a)*lake.rx*r*irregular,z=lake.z+Math.sin(a)*lake.rz*r*irregular;
      const h=landscape.height(x,z);
      positions.push(x,Math.max(lake.y-.2,h+.025),z);
      color.setHex(r<1?0x9aab86:r<1.05?0xb2ae8b:0x8f9b75);colors.push(color.r,color.g,color.b);
    }
    if(i<180){const n=i*3;indices.push(n,n+3,n+1,n+1,n+3,n+4,n+1,n+4,n+2,n+2,n+4,n+5);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));mesh.receiveShadow=true;mesh.name='graded-lake-shore';scene.add(mesh);
}
