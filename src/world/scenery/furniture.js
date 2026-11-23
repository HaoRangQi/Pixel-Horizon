import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TAU } from '../route.js';
import { point } from './batches.js';
import { signMaterial } from './materials.js';

export function addFurniture(batches, scene, route, landscape, m) {
  const railProfile = mergeGeometries([
    new THREE.BoxGeometry(.095,.16,1).translate(0,.145,0),
    new THREE.BoxGeometry(.095,.16,1).translate(0,-.145,0),
    new THREE.BoxGeometry(.07,.23,1).translate(.065,0,0),
  ]);
  const post = new THREE.BoxGeometry(.13,1.2,.16);
  for(let i=0;i<route.road.length/5;i++){
    const t=i*5/route.road.length,coast=t>.075&&t<.265,mountain=t>.708&&t<.923;
    if(!coast&&!mountain)continue;
    if(landscape.pads.some((p)=>Math.abs(t-p.t)*route.road.length<p.radius+8))continue;
    const junctionGap=route.mainJunctions.some((j)=>{const d=Math.abs(t-j.t);return Math.min(d,1-d)*route.road.length<j.width+26;});
    if(junctionGap)continue;
    for(const side of coast?[8.12]:[-8.12,8.12]){
      const a=route.frame(t,side),b=route.frame(t+5/route.road.length,side);
      batches.add('galvanized-guardrail-posts',post,m.metal,{x:a.position.x,y:a.position.y+.58,z:a.position.z,yaw:a.heading,color:0xa3afa9});
      const distance=a.position.distanceTo(b.position),yaw=Math.atan2(b.position.x-a.position.x,b.position.z-a.position.z);
      batches.add('profiled-metal-guardrails',railProfile,m.metal,{x:(a.position.x+b.position.x)/2,y:(a.position.y+b.position.y)/2+.92,z:(a.position.z+b.position.z)/2,sz:distance+.1,yaw,rx:-Math.atan2(b.position.y-a.position.y,Math.hypot(b.position.x-a.position.x,b.position.z-a.position.z)),color:0xc3cac0});
      if(i%3===0){
        const p=point(a.position.x,a.position.z,a.heading,side>0?-.12:.12,0,a.position.y+1.14);
        batches.box('guardrail-small-reflectors',m.solid,{...p,sx:.1,sy:.12,sz:.08,yaw:a.heading,color:side>0?0xddd9c4:0xb64b37});
      }
    }
  }
  for(let i=0;i<30;i++){
    const t=-.021+i*.0038,f=route.frame(t,-10.8),p=f.position,yaw=f.heading;
    if(route.branchDistance(p.x,p.z)<15)continue;
    batches.column('town-lamp-stems',m.darkMetal,{x:p.x,y:p.y+2.42,z:p.z,sx:.065,sy:4.84,sz:.065});
    batches.column('town-lamp-plinths',m.darkMetal,{x:p.x,y:p.y+.25,z:p.z,sx:.19,sy:.5,sz:.19});
    const head=point(p.x,p.z,yaw,0,.22,p.y+4.7);
    batches.box('town-lantern-glass',m.lamp,{...head,sx:.39,sy:.59,sz:.39,yaw});
    batches.add('town-lantern-caps',new THREE.ConeGeometry(.38,.23,4).rotateY(Math.PI/4),m.darkMetal,{...head,y:head.y+.4,yaw});
    for(const xx of[-.22,.22])for(const zz of[-.22,.22])batches.box('town-lantern-metal-frames',m.darkMetal,{...point(head.x,head.z,yaw,xx,zz,head.y),sx:.035,sy:.67,sz:.035,yaw});
    if(i%2===0){
      const f=route.frame(t,-14.1),p=f.position,y=landscape.height(p.x,p.z);
      batches.box('town-pavement-planters',m.stone,{x:p.x,y:y+.44,z:p.z,sx:1.45,sy:.72,sz:.9,yaw:f.heading,color:0xb8b19b});
      for(let j=0;j<5;j++)batches.add('town-planter-shrubs',new THREE.SphereGeometry(.32,8,5),m.solid,{...point(p.x,p.z,f.heading,(j-2)*.25,0,y+.98),sx:1,sy:.85,sz:1,color:j%2?0x6f8555:0x7a8b5c});
    }
  }
  const destinations=[['BAY','VILLAGE'],['LIGHTHOUSE','COAST'],['GOLDEN','FIELDS'],['AUTUMN','VALLEY'],['MIRROR','LAKE'],['SUMMIT','PASS']];
  [.074,.245,.405,.55,.71,.944].forEach((t,i)=>{
    const f=route.frame(t,-11.4),p=f.position,yaw=f.heading+Math.PI;
    const boardMaterial=signMaterial(destinations[i],i===2?0x637047:0x3c6261);
    batches.column('direction-signposts',m.metal,{x:p.x,y:p.y+1.95,z:p.z,sx:.065,sy:3.9,sz:.065,color:0x929c94});
    batches.box('direction-sign-rims',m.metal,{x:p.x,y:p.y+3.55,z:p.z,sx:3.28,sy:1.68,sz:.13,yaw,color:0xc9cebd});
    batches.add(`lettered-direction-sign-${i}`,new THREE.PlaneGeometry(3.1,1.51),boardMaterial,{x:p.x+Math.sin(yaw)*.08,y:p.y+3.55,z:p.z+Math.cos(yaw)*.08,yaw});
  });

  function bench(x,z,yaw,y){
    for(let i=0;i<5;i++){
      batches.box('lookout-bench-seat-slats',m.wood,{...point(x,z,yaw,0,(i-2)*.12,y+.5),sx:1.95,sy:.08,sz:.1,yaw,color:i%2?0x9b825e:0x927b5d});
      if(i<4)batches.box('lookout-bench-back-slats',m.wood,{...point(x,z,yaw,0,-.3,y+.69+i*.12),sx:1.95,sy:.09,sz:.075,yaw,color:0x9b825e});
    }
    for(const xx of[-.68,.68]){
      batches.box('lookout-bench-iron-legs',m.darkMetal,{...point(x,z,yaw,xx,0,y+.25),sx:.09,sy:.5,sz:.52,yaw});
      batches.box('lookout-bench-iron-backs',m.darkMetal,{...point(x,z,yaw,xx,-.33,y+.76),sx:.07,sy:.7,sz:.07,yaw});
      batches.box('lookout-bench-armrests',m.darkMetal,{...point(x,z,yaw,xx,0,y+.76),sx:.08,sy:.07,sz:.57,yaw});
    }
  }
  for(const [index,pad]of landscape.pads.entries()){
    let dockGate;
    if(index===2){
      const entry=route.frame(.624,-36).position,direction=new THREE.Vector3(landscape.lake.x-entry.x,0,landscape.lake.z-entry.z).normalize();
      for(let distance=0;distance<100;distance+=.5){const x=entry.x+direction.x*distance,z=entry.z+direction.z*distance;if(Math.hypot(x-pad.x,z-pad.z)>pad.radius-3.1){dockGate={x,z};break;}}
    }
    const geometry=new THREE.CircleGeometry(pad.radius-4.5,64).rotateX(-Math.PI/2),pos=geometry.attributes.position;
    for(let i=0;i<pos.count;i++){const x=pad.x+pos.getX(i),z=pad.z+pos.getZ(i);pos.setXYZ(i,x,landscape.height(x,z)+.045,z);}geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,m.stone.clone());mesh.material.color.setHex(0xb7af97);mesh.name=`stone-paved-lookout-${index}`;mesh.receiveShadow=true;scene.add(mesh);
    const viewYaw=pad.heading+(pad.side>0?Math.PI/2:-Math.PI/2);
    for(let j=-1;j<=1;j++){
      const p=point(pad.x,pad.z,viewYaw,j*4.3,pad.radius*.4);bench(p.x,p.z,viewYaw,landscape.height(p.x,p.z));
    }
    const sign=point(pad.x,pad.z,viewYaw,-7,-2,landscape.height(pad.x,pad.z));
    batches.column('lookout-information-posts',m.wood,{...sign,y:sign.y+.7,sx:.09,sy:1.4,sz:.09,color:0x847251});
    batches.box('lookout-information-desks',m.wood,{...sign,y:sign.y+1.4,sx:1.35,sy:.09,sz:.9,yaw:viewYaw,rx:.25,color:0x9d8b65});
    const words=index===0?['LIGHTHOUSE','36 M']:index===1?['OLD STONE','BRIDGE']:index===2?['MIRROR','LAKE']:['MOUNTAIN','PASS'];
    batches.add(`lookout-information-print-${index}`,new THREE.PlaneGeometry(1.21,.77).rotateX(-Math.PI/2),signMaterial(words,0x52655c),{...sign,y:sign.y+1.47,yaw:viewYaw,rx:.25});
    for(let i=0;i<36;i++){
      const a=i/36*TAU,b=(i+1)/36*TAU,r=pad.radius-3.1,x=pad.x+Math.cos(a)*r,z=pad.z+Math.sin(a)*r;
      if(route.query(x,z).distance<14||route.branchDistance(x,z)<12)continue;
      if(dockGate&&Math.hypot(x-dockGate.x,z-dockGate.z)<5)continue;
      const y=landscape.height(x,z),next={x:pad.x+Math.cos(b)*r,z:pad.z+Math.sin(b)*r};next.y=landscape.height(next.x,next.z);
      batches.box('lookout-wooden-railing-posts',m.wood,{x,y:y+.55,z,sx:.15,sy:1.1,sz:.15,color:0x8a7b5b});
      for(const h of[.51,1.02])batches.beam('lookout-timber-handrails',m.wood,{x,y:y+h,z},{...next,y:next.y+h},.12,.1);
      if(i%2===0)batches.box('lookout-perimeter-cobbles',m.stone,{x,y:y+.09,z,sx:1.42,sy:.16,sz:.65,yaw:-a,color:0xa79f8b});
    }
    if(index===1||index===2){
      const p=point(pad.x,pad.z,viewYaw,-pad.radius*.39,-pad.radius*.15),y=landscape.height(p.x,p.z);
      for(const xx of[-2.2,2.2])for(const zz of[-1.8,1.8])batches.box('lookout-pergola-pillars',m.wood,{...point(p.x,p.z,viewYaw,xx,zz,y+1.55),sx:.18,sy:3.1,sz:.18,yaw:viewYaw,color:0x927954});
      for(let j=0;j<15;j++)batches.box('lookout-pergola-roof-slats',m.wood,{...point(p.x,p.z,viewYaw,(j/14-.5)*5.2,0,y+3.12),sx:.14,sy:.16,sz:4.7,yaw:viewYaw,color:0x9c835d});
      for(const zz of[-1.85,1.85])batches.box('lookout-pergola-crossbeams',m.wood,{...point(p.x,p.z,viewYaw,0,zz,y+2.96),sx:5.1,sy:.22,sz:.16,yaw:viewYaw,color:0x8b7655});
      bench(p.x,p.z,viewYaw,y);
    }
    if(index===0||index===3){
      const p=point(pad.x,pad.z,viewYaw,5,pad.radius*.55),y=landscape.height(p.x,p.z);
      batches.column('lookout-telescope-pedestals',m.metal,{x:p.x,y:y+.67,z:p.z,sx:.11,sy:1.34,sz:.11,color:0x71817b});
      batches.add('lookout-binocular-viewers',new THREE.CylinderGeometry(.16,.2,.69,12).rotateX(Math.PI/2),m.metal,{x:p.x,y:y+1.47,z:p.z,yaw:viewYaw,rx:-.14,color:0x6c7e76});
      batches.box('lookout-telescope-crossbars',m.darkMetal,{x:p.x,y:y+1.24,z:p.z,sx:.47,sy:.1,sz:.11,yaw:viewYaw});
    }
    const bin=point(pad.x,pad.z,viewYaw,7,-1),y=landscape.height(bin.x,bin.z);
    batches.column('lookout-litter-bins',m.wood,{...bin,y:y+.52,sx:.33,sy:1.04,sz:.33,color:0x80745a});
    batches.add('lookout-bin-metal-rims',new THREE.TorusGeometry(.32,.045,5,16).rotateX(Math.PI/2),m.darkMetal,{...bin,y:y+1.06});
  }
}
