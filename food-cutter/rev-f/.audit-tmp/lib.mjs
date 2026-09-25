// Shared audit lib — current working-tree geometry (2026-09-25 state).
import { GEO, bladeOffsets, PATTERNS } from '../src/animation/config.js';
import { workflowTimeline, sampleAt } from '../src/animation/stateMachine.js';

export const I = () => [1,0,0,0, 0,1,0,0, 0,0,1,0];
export function compose(m, { t=[0,0,0], rx=0, ry=0, rz=0, s=[1,1,1] } = {}) {
  // three.js Matrix4.makeRotationFromEuler order 'XYZ'
  const c1=Math.cos(rx),s1=Math.sin(rx),c2=Math.cos(ry),s2=Math.sin(ry),c3=Math.cos(rz),s3=Math.sin(rz);
  const R = [
    c2*c3, -c2*s3, s2,
    c1*s3+c3*s1*s2, c1*c3-s1*s2*s3, -c2*s1,
    s1*s3-c1*c3*s2, c3*s1+c1*s2*s3, c1*c2,
  ];
  for (let c=0;c<3;c++){ R[c]*=s[0]; R[3+c]*=s[1]; R[6+c]*=s[2]; }
  const out = new Array(12);
  for (let r=0;r<3;r++){
    for (let c=0;c<3;c++) out[r*4+c] = m[r*4]*R[c] + m[r*4+1]*R[3+c] + m[r*4+2]*R[6+c];
    out[r*4+3] = m[r*4+3] + t[0]*m[r*4] + t[1]*m[r*4+1] + t[2]*m[r*4+2];
  }
  return out;
}
export const apply=(m,p)=>[m[0]*p[0]+m[1]*p[1]+m[2]*p[2]+m[3],m[4]*p[0]+m[5]*p[1]+m[6]*p[2]+m[7],m[8]*p[0]+m[9]*p[1]+m[10]*p[2]+m[11]];
export function aabbOfBox(m,w,h,d){
  const hx=w/2,hy=h/2,hz=d/2;let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const x of[-hx,hx])for(const y of[-hy,hy])for(const z of[-hz,hz]){
    const p=apply(m,[x,y,z]);for(let i=0;i<3;i++){mn[i]=Math.min(mn[i],p[i]);mx[i]=Math.max(mx[i],p[i]);}}
  return{mn,mx};
}
export function aabbOfCyl(m,rTop,rBot,h,seg=28){
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const[y,r]of[[h/2,rTop],[-h/2,rBot]])for(let i=0;i<seg;i++){
    const a=i/seg*Math.PI*2;const p=apply(m,[Math.cos(a)*r,y,Math.sin(a)*r]);
    for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k]);}}
  return{mn,mx};
}
export function aabbOfSphere(m,r,scale=[1,1,1]){
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(let i=0;i<24;i++)for(let j=0;j<=12;j++){
    const th=i/24*Math.PI*2,ph=j/12*Math.PI-Math.PI/2;
    const p=apply(m,[r*scale[0]*Math.cos(ph)*Math.cos(th),r*scale[1]*Math.sin(ph),r*scale[2]*Math.cos(ph)*Math.sin(th)]);
    for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k]);}}
  return{mn,mx};
}
export const union=(a,b)=>({mn:a.mn.map((v,i)=>Math.min(v,b.mn[i])),mx:a.mx.map((v,i)=>Math.max(v,b.mx[i]))});
export const merge=bs=>bs.reduce(union);
export const overlap=(a,b,e=1e-4)=>a.mn[0]<b.mx[0]-e&&a.mx[0]>b.mn[0]+e&&a.mn[1]<b.mx[1]-e&&a.mx[1]>b.mn[1]+e&&a.mn[2]<b.mx[2]-e&&a.mx[2]>b.mn[2]+e;
export const fmt=v=>v.map(x=>x.toFixed(2)).join(',');
export const aabbOfParts=(m,parts)=>merge(parts.map(({c,s,ry=0,rx=0,rz=0,sc})=>aabbOfBox(compose(m,{t:c,ry,rx,rz,s:sc}),s[0],s[1],s[2])));

export const offs=bladeOffsets();
export const BLADE_LEN=GEO.parts.bladeLen;
export const travelX=GEO.xTravelMax-GEO.xTravelMin;
export const travelZ=GEO.zTravelMax-GEO.zTravelMin;
export const W=GEO.chamber.w,H=GEO.chamber.h,D=GEO.chamber.d,WALL=GEO.chamber.wall,FLOOR=GEO.chamber.floorY;
const HX=-1.15, HY=2.4; // hinge axis (scene.js:576)

export const cassetteMatrix=s=>compose(I(),{t:[0,0,GEO.cassette.seatZ+s.extractProgress*GEO.cassette.extractTravel]});
// halves fan about hinge (hx,hy): position = h - R(A)*h, rotation.z = A
function halfMatrix(s, sign){
  const A=sign*s.unfoldProgress*GEO.cassette.unfoldAngle/2;
  const px=HX-(HX*Math.cos(A)-HY*Math.sin(A));
  const py=HY-(HX*Math.sin(A)+HY*Math.cos(A));
  return compose(cassetteMatrix(s),{t:[px,py,0],rz:A});
}
export const halfLMatrix=s=>halfMatrix(s,+1);
export const halfRMatrix=s=>halfMatrix(s,-1);

export function bladeLocalBoxes(L){
  const t=GEO.bladeThickness,Dp=GEO.bladeDepth;
  return [
    {c:[L/2,Dp*0.36,0],s:[L,Dp*0.72,t]},
    {c:[L/2,Dp*0.72+0.001,0],s:[L,Dp*0.5,t*0.9]},
    {c:[-0.08,Dp*0.4,0],s:[0.2,Dp*0.8,0.16]},
  ];
}
export function combParts(len,toothH,toothD,alongX){
  const toothW=GEO.pitch*0.36,lines=bladeOffsets(),pts=[];
  for(let i=0;i<lines.length-1;i++)pts.push((lines[i]+lines[i+1])/2);
  pts.push(lines[0]-GEO.pitch/2,lines[lines.length-1]+GEO.pitch/2);
  const boxes=[];
  pts.forEach(off=>{boxes.push(alongX?{c:[0,0,off],s:[toothD,toothH,toothW]}:{c:[off,0,0],s:[toothW,toothH,toothD]});});
  boxes.push(alongX?{c:[-toothD*0.6,0,0],s:[toothD*0.7,toothH*0.5,len]}:{c:[0,0,-toothD*0.6],s:[len,toothH*0.5,toothD*0.7]});
  return boxes;
}

export function worldBoxes(s){
  const out={};
  const cas=cassetteMatrix(s),hL=halfLMatrix(s),hR=halfRMatrix(s);
  const yc=FLOOR+H/2;
  out['chamber +Z wall']=aabbOfBox(compose(hL,{t:[0,yc,D/2-WALL/2]}),W,H,WALL);
  out['chamber -Z wall']=aabbOfBox(compose(hL,{t:[0,yc,-D/2+WALL/2]}),W,H,WALL);
  out['chamber -X wall']=aabbOfBox(compose(hL,{t:[-W/2+WALL/2,yc,0]}),WALL,H,D);
  out['chamber floor']=aabbOfBox(compose(hL,{t:[0,FLOOR+WALL/2,0]}),W,WALL,D);
  { const cs=GEO.chuteSize/2,topY=GEO.chuteTop,botY=FLOOR+H,h=topY-botY,cy=(topY+botY)/2;
    out['chute +X wall']=aabbOfBox(compose(hL,{t:[cs,cy,0]}),WALL,h,cs*2);
    out['chute -X wall']=aabbOfBox(compose(hL,{t:[-cs,cy,0]}),WALL,h,cs*2);
    out['chute +Z wall']=aabbOfBox(compose(hL,{t:[0,cy,cs]}),cs*2,h,WALL);
    out['chute -Z wall']=aabbOfBox(compose(hL,{t:[0,cy,-cs]}),cs*2,h,WALL);
    out['chute lip']=aabbOfBox(compose(hL,{t:[0,topY+0.02,0]}),cs*2+0.3,0.1,cs*2+0.3);
  }
  const engaged=new Set(s.selectedIndices);
  const bparts=bladeLocalBoxes(BLADE_LEN);
  offs.forEach((o,i)=>{
    const on=engaged.has(i)&&s.tailEngaged[i];
    const ext=on?s.bladeExtend:0;
    const px=GEO.xTravelMin-GEO.parts.bladeParkedInset+(travelX+GEO.parts.bladeOvertravel)*ext;
    const m=compose(hR,{t:[px,GEO.xBankY-GEO.bladeDepth,o]});
    const b=aabbOfParts(m,bparts);b.visible=ext>0.001;out[`xBlade[${i}]`]=b;
  });
  offs.forEach((o,i)=>{
    const on=engaged.has(i)&&s.tailEngaged[i];
    const ext=on?s.bladeExtend:0;
    const pz=GEO.zTravelMin-GEO.parts.bladeParkedInset+(travelZ+GEO.parts.bladeOvertravel)*ext;
    const m=compose(hL,{t:[o,GEO.zBankY-GEO.bladeDepth,pz],ry:-Math.PI/2});
    const b=aabbOfParts(m,bparts);b.visible=ext>0.001;out[`zBlade[${i}]`]=b;
  });
  { const r=GEO.magazine.r;
    const m=compose(hR,{t:[GEO.xTravelMin-r-0.12,GEO.xBankY-GEO.bladeDepth/2,0],ry:Math.PI/2});
    out['xMagazine']=aabbOfParts(m,[{c:[0,0,0],s:[r,2*r,D+0.2]},{c:[r*0.55,r*0.7,0],s:[r*0.6,r*0.4,D+0.2]},{c:[r*0.55,-r*0.7,0],s:[r*0.6,r*0.4,D+0.2]}]);
    const mz=compose(hL,{t:[0,GEO.zBankY-GEO.bladeDepth/2,GEO.zTravelMin-r-0.12]});
    out['zMagazine']=aabbOfParts(mz,[{c:[0,0,0],s:[r,2*r,W+0.2]},{c:[r*0.55,r*0.7,0],s:[r*0.6,r*0.4,W+0.2]},{c:[r*0.55,-r*0.7,0],s:[r*0.6,r*0.4,W+0.2]}]);
  }
  out['xWiper']=aabbOfBox(compose(hR,{t:[GEO.xTravelMin+GEO.parts.wiperOffset,GEO.xBankY,0]}),0.1,0.34,D);
  out['xWiperLip']=aabbOfBox(compose(hR,{t:[GEO.xTravelMin+GEO.parts.wiperOffset+0.06,GEO.xBankY-0.2,0]}),0.06,0.12,D);
  out['zWiper']=aabbOfBox(compose(hL,{t:[0,GEO.zBankY,GEO.zTravelMin+GEO.parts.wiperOffset]}),W,0.34,0.1);
  out['zWiperLip']=aabbOfBox(compose(hL,{t:[0,GEO.zBankY-0.2,GEO.zTravelMin+GEO.parts.wiperOffset+0.06]}),W,0.12,0.06);
  out['xReceiver']=aabbOfParts(compose(hR,{t:[GEO.xTravelMax+GEO.parts.combOffset,GEO.xBankY-0.17,0]}),combParts(D,0.34,GEO.parts.combDepth,true));
  out['zReceiver']=aabbOfParts(compose(hL,{t:[0,GEO.zBankY-0.17,GEO.zTravelMax+GEO.parts.combOffset]}),combParts(W,0.34,GEO.parts.combDepth,false));
  const lk=GEO.parts.lockStroke;
  out['originRailX']=aabbOfParts(compose(hR,{t:[GEO.xTravelMin-GEO.parts.railOffsetOrigin+s.originLock*lk,GEO.xBankY-0.2,0]}),combParts(D,0.4,GEO.parts.railDepth,true));
  out['farRailX']=aabbOfParts(compose(hR,{t:[GEO.xTravelMax+GEO.parts.railOffsetFar-s.farLock*lk,GEO.xBankY-0.2,0]}),combParts(D,0.4,GEO.parts.railDepth,true));
  out['originRailZ']=aabbOfParts(compose(hL,{t:[0,GEO.zBankY-0.2,GEO.zTravelMin-GEO.parts.railOffsetOrigin+s.originLock*lk]}),combParts(W,0.4,GEO.parts.railDepth,false));
  out['farRailZ']=aabbOfParts(compose(hL,{t:[0,GEO.zBankY-0.2,GEO.zTravelMax+GEO.parts.railOffsetFar-s.farLock*lk]}),combParts(W,0.4,GEO.parts.railDepth,false));
  { const mX=compose(cas,{t:[GEO.xTravelMin-0.55,GEO.xBankY-GEO.bladeDepth,0],ry:-s.selectorProgress*0.5});
    const boxes=[{c:[0,0,0],s:[0.34,0.12,D]}];
    offs.forEach(o=>boxes.push({c:[0.3,0,o],s:[0.3,0.1,0.1]}));
    out['shuttleArmX']=aabbOfParts(mX,boxes);
    const mZ=compose(cas,{t:[0,GEO.zBankY-GEO.bladeDepth,GEO.zTravelMin-0.55],ry:s.selectorProgress*0.5});
    const zb=[{c:[0,0,0],s:[W,0.12,0.34]}];
    offs.forEach(o=>zb.push({c:[o,0,0.3],s:[0.1,0.1,0.3]}));
    out['shuttleArmZ']=aabbOfParts(mZ,zb);
  }
  { const m=compose(cas,{t:[0,s.pusherY,0]});
    const p=GEO.pusher,T=p.faceThickness;
    const edge=(GEO.bladesPerBank-1)/2*GEO.pitch+GEO.pitch/2;
    const postHalf=(GEO.pitch-p.slotWidth)/2;
    const boxes=[{c:[0,T*0.45,0],s:[edge*2,T*0.55,edge*2]}];
    for(let ix=0;ix<GEO.bladesPerBank-1;ix++){
      const cx=(ix-(GEO.bladesPerBank-2)/2)*GEO.pitch;
      for(let iz=0;iz<GEO.bladesPerBank-1;iz++)
        boxes.push({c:[cx,-T*0.4,(iz-(GEO.bladesPerBank-2)/2)*GEO.pitch],s:[postHalf*2,T*1.6,postHalf*2]});
    }
    boxes.push({c:[0,0,GEO.chuteSize/2+0.03],s:[0.3,0.4,0.08]});
    boxes.push({c:[0,0,-GEO.chuteSize/2-0.03],s:[0.3,0.4,0.08]});
    out['pusher']=aabbOfParts(m,boxes);
    out['pusher driveCollar']=aabbOfCyl(compose(m,{t:[0,0.14,0]}),0.16,0.19,0.2,20);   // current: h=0.2 at y=0.14
    out['pusher driveScrew']=aabbOfCyl(compose(m,{t:[0,0.3,0]}),0.06,0.06,0.25,12);    // current: h=0.25 at y=0.3
  }
  { const y=s.pusherY+0.35-s.stripProgress*0.5;
    const m=compose(cas,{t:[0,y,0]});
    const e=GEO.chuteSize/2+0.14;
    out['stripper']=aabbOfParts(m,[
      {c:[0,0,e-0.06],s:[e*2,0.08,0.12]},{c:[0,0,-e+0.06],s:[e*2,0.08,0.12]},
      {c:[e-0.06,0,0],s:[0.12,0.08,e*2]},{c:[-e+0.06,0,0],s:[0.12,0.08,e*2]}]);
  }
  { const m=compose(cas,{t:[s.crosscutX,GEO.crosscutY,0]});
    out['crosscut knife']=aabbOfParts(m,[
      {c:[0,0,0],s:[W-0.1,0.26,0.05]},
      {c:[0,-0.14,0],s:[W-0.1,0.05,0.05]},
      {c:[-W/2-0.1,0,0],s:[0.3,0.22,0.4]}]);
    out['crosscut rail']=aabbOfCyl(compose(m,{t:[0,-0.24,0],rz:Math.PI/2}),0.05,0.05,W-0.2,12); // current: len W-0.2
  }
  { const m=compose(cas,{t:[0,GEO.bin.y,0]});
    const {w:bw,h:bh,d:bd}=GEO.bin,wallT=0.06;
    out['bin']=aabbOfParts(m,[
      {c:[0,0,bd/2],s:[bw,bh,wallT]},{c:[0,0,-bd/2],s:[bw,bh,wallT]},
      {c:[bw/2,0,0],s:[wallT,bh,bd]},{c:[-bw/2,0,0],s:[wallT,bh,bd]},
      {c:[0,-bh/2-0.04,0],s:[bw,0.08,bd]}]);
    out['bin handle']=aabbOfCyl(compose(m,{t:[0,bh/2+0.12,bd/2+0.08],rz:Math.PI/2}),0.04,0.04,bw*0.5,12);
  }
  for(const kind of['carrot','potato']){
    const on=s.produce===kind&&s.produceLoaded&&s.feedProgress<0.999;
    const restY=GEO.xBankY+0.1;
    const y=restY+(1-s.feedProgress)*0.9;
    if(kind==='carrot'){
      const parts=[aabbOfCyl(compose(cas,{t:[0,y,0],ry:0.2}),0.15,0.03,1.6,18)];
      parts.push(aabbOfCyl(compose(cas,{t:[0,y-0.86,0],rx:Math.PI}),0.001,0.03,0.14,10));
      for(let i=0;i<3;i++)parts.push(aabbOfCyl(compose(cas,{t:[(i-1)*0.07,y+0.95,(i%2)*0.05-0.02],rz:(i-1)*0.35}),0.001,0.045,0.42,8));
      out['produce carrot']=merge(parts);out['produce carrot'].visible=on;
    }else{
      out['produce potato']=aabbOfSphere(compose(cas,{t:[0,y,0]}),0.52,[1,0.78,0.85]);
      out['produce potato'].visible=on;
    }
  }
  { const counts={stick:0,cube:0,coin:0};
    s.cutPieces.forEach(pc=>{counts[pc.kind]=(counts[pc.kind]||0)+1;});
    const sizes={stick:[0.13,0.13,1.0],cube:[0.15,0.15,0.15],coin:[0.32,0.05,0.32]};
    const drop=Math.min(1, s.stripProgress*1.5 + ((s.phaseId==='park'||s.phaseId==='disengage')?1:0));
    const pbs=[];
    for(const kind of Object.keys(sizes)){
      const n=counts[kind]||0;
      for(let i=0;i<n;i++){
        const golden=2.39996,r=0.1+0.55*Math.sqrt((i+0.5)/Math.max(1,n)),a=i*golden;
        const by=GEO.bin.y-GEO.bin.h/2+0.12+Math.floor(i/10)*0.12;
        const gy=GEO.crosscutY-0.2-i*0.03;
        const y=gy+(by-gy)*drop;
        const pm=compose(cas,{t:[Math.cos(a)*r,y,Math.sin(a)*r],
                              rx:(i*0.7)%1.2-0.6,ry:a,rz:(i*1.1)%0.9-0.45});
        pbs.push(aabbOfBox(pm,...sizes[kind]));
      }
    }
    if(pbs.length&&s.feedProgress>=0.999&&s.extractProgress<=0){out['cutPieces']=merge(pbs);out['cutPieces'].visible=true;}
  }
  out['plinth']=aabbOfBox(compose(I(),{t:[0,0.5,0]}),4.6,1.0,4.0);
  out['plinthTop']=aabbOfBox(compose(I(),{t:[0,1.05,0]}),4.6,0.1,4.0);
  { const m=compose(I(),{t:[-1.6,1.7,-1.2],rz:Math.PI/2});
    out['D1 motor']=merge([
      aabbOfCyl(m,0.47,0.47,0.95,16),
      aabbOfCyl(compose(m,{t:[0,0.55,0]}),0.34,0.34,0.16,16),
      aabbOfCyl(compose(m,{t:[0,-0.64,0]}),0.5,0.5,0.36,16),
      aabbOfSphere(compose(m,{t:[0,-0.82,0]}),0.5,[1,0.5,1]),
      aabbOfCyl(compose(m,{t:[0,0.98,0]}),0.08,0.08,0.7,8)]);
  }
  { const parts=[aabbOfCyl(compose(I(),{t:[-0.2,1.7,-1.2],rz:Math.PI/2}),0.07,0.07,3.2,12)];
    parts.push(aabbOfCyl(compose(I(),{t:[-0.2-1.72,1.7,-1.2],rz:Math.PI/2}),0.26*1.35,0.26*1.35,0.12,16));
    for(let i=0;i<5;i++)parts.push(aabbOfCyl(compose(I(),{t:[-0.2-1.2+i*0.6,1.7,-1.2],rz:Math.PI/2}),0.3*1.32,0.3*1.32,0.14,20));
    out['camshaft+cams']=merge(parts);
  }
  out['D2 latch']=merge([
    aabbOfCyl(compose(I(),{t:[1.9,1.4,1.9],rx:Math.PI/2}),0.1,0.1,0.3,12),
    aabbOfBox(compose(I(),{t:[1.9,1.66,1.9]}),0.09,0.62,0.09),
    aabbOfSphere(compose(I(),{t:[1.9,2.0,1.9]}),0.09)]);
  out['electronics']=aabbOfBox(compose(I(),{t:[1.4,1.3,-1.4]}),1.2,0.5,0.9);
  out['coupling']=aabbOfCyl(compose(I(),{t:[-0.2,2.0+(s.couplingEngaged?0:0.35),-0.2]}),0.24,0.24,0.32,20);
  out['hinge']=aabbOfCyl(compose(cas,{t:[HX,HY,0],rx:Math.PI/2}),0.09,0.09,2.0,12);
  out['ground']=aabbOfCyl(compose(I(),{t:[0,-0.15,0]}),10,10,0.3,48);
  return out;
}
export { GEO, PATTERNS, workflowTimeline, sampleAt };
