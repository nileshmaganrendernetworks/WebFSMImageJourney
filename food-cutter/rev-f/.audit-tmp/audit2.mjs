// Audit part 2 — corrected geometry envelopes, targeted checks.
import { GEO, bladeOffsets, patternIndices, PATTERNS } from '../src/animation/config.js';
import { MECH_PHASES, WORKFLOW, workflowTimeline, sampleAt, checkState } from '../src/animation/stateMachine.js';

const I = () => [1,0,0,0, 0,1,0,0, 0,0,1,0];
function compose(m, { t=[0,0,0], rx=0, ry=0, rz=0, s=[1,1,1] } = {}) {
  const [cx,sx]=[Math.cos(rx),Math.sin(rx)], [cy,sy]=[Math.cos(ry),Math.sin(ry)], [cz,sz]=[Math.cos(rz),Math.sin(rz)];
  const R = [
    cz*cy, cz*sy*sx - sz*cx, cz*sy*cx + sz*sx,
    sz*cy, sz*sy*sx + cz*cx, sz*sy*cx - cz*sx,
    -sy,   cy*sx,            cy*cx,
  ];
  for (let c=0;c<3;c++){ R[c]*=s[0]; R[3+c]*=s[1]; R[6+c]*=s[2]; }
  const out = new Array(12);
  for (let r=0;r<3;r++){
    for (let c=0;c<3;c++) out[r*4+c] = m[r*4]*R[c] + m[r*4+1]*R[3+c] + m[r*4+2]*R[6+c];
    out[r*4+3] = m[r*4+3] + t[0]*m[r*4] + t[1]*m[r*4+1] + t[2]*m[r*4+2];
  }
  return out;
}
const apply=(m,p)=>[m[0]*p[0]+m[1]*p[1]+m[2]*p[2]+m[3],m[4]*p[0]+m[5]*p[1]+m[6]*p[2]+m[7],m[8]*p[0]+m[9]*p[1]+m[10]*p[2]+m[11]];
function aabbOfBox(m,w,h,d){
  const hx=w/2,hy=h/2,hz=d/2;let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const x of[-hx,hx])for(const y of[-hy,hy])for(const z of[-hz,hz]){
    const p=apply(m,[x,y,z]);for(let i=0;i<3;i++){mn[i]=Math.min(mn[i],p[i]);mx[i]=Math.max(mx[i],p[i]);}}
  return{mn,mx};
}
function aabbOfCyl(m,rTop,rBot,h,seg=28){
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const[y,r]of[[h/2,rTop],[-h/2,rBot]])for(let i=0;i<seg;i++){
    const a=i/seg*Math.PI*2;const p=apply(m,[Math.cos(a)*r,y,Math.sin(a)*r]);
    for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k]);}}
  return{mn,mx};
}
function aabbOfSphere(m,r,scale=[1,1,1]){
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(let i=0;i<24;i++)for(let j=0;j<=12;j++){
    const th=i/24*Math.PI*2,ph=j/12*Math.PI-Math.PI/2;
    const p=apply(m,[r*scale[0]*Math.cos(ph)*Math.cos(th),r*scale[1]*Math.sin(ph),r*scale[2]*Math.cos(ph)*Math.sin(th)]);
    for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k]);}}
  return{mn,mx};
}
const union=(a,b)=>({mn:a.mn.map((v,i)=>Math.min(v,b.mn[i])),mx:a.mx.map((v,i)=>Math.max(v,b.mx[i]))});
const merge=bs=>bs.reduce(union);
const overlap=(a,b,e=1e-4)=>a.mn[0]<b.mx[0]-e&&a.mx[0]>b.mn[0]+e&&a.mn[1]<b.mx[1]-e&&a.mx[1]>b.mn[1]+e&&a.mn[2]<b.mx[2]-e&&a.mx[2]>b.mn[2]+e;
const fmt=v=>v.map(x=>x.toFixed(2)).join(',');
const aabbOfParts=(m,parts)=>merge(parts.map(({c,s,ry=0,rx=0,rz=0,sc})=>aabbOfBox(compose(m,{t:c,ry,rx,rz,s:sc}),s[0],s[1],s[2])));

const offs=bladeOffsets();
const BLADE_LEN=GEO.parts.bladeLen;
const travelX=GEO.xTravelMax-GEO.xTravelMin;
const travelZ=GEO.zTravelMax-GEO.zTravelMin;
const W=GEO.chamber.w,H=GEO.chamber.h,D=GEO.chamber.d,WALL=GEO.chamber.wall,FLOOR=GEO.chamber.floorY;

const cassetteMatrix=s=>compose(I(),{t:[0,0,GEO.cassette.seatZ+s.extractProgress*GEO.cassette.extractTravel]});
const halfLMatrix=s=>compose(cassetteMatrix(s),{rz:s.unfoldProgress*GEO.cassette.unfoldAngle*0.5});
const halfRMatrix=s=>compose(cassetteMatrix(s),{rz:-s.unfoldProgress*GEO.cassette.unfoldAngle*0.5});

function bladeLocalBoxes(L){
  const t=GEO.bladeThickness,Dp=GEO.bladeDepth;
  return [
    {c:[L/2,Dp*0.36,0],s:[L,Dp*0.72,t]},
    {c:[L/2,Dp*0.72+0.001,0],s:[L,Dp*0.5,t*0.9]},
    {c:[-0.08,Dp*0.4,0],s:[0.2,Dp*0.8,0.16]},
  ];
}
function combParts(len,toothH,toothD,alongX){
  const toothW=GEO.pitch*0.36,lines=bladeOffsets(),pts=[];
  for(let i=0;i<lines.length-1;i++)pts.push((lines[i]+lines[i+1])/2);
  pts.push(lines[0]-GEO.pitch/2,lines[lines.length-1]+GEO.pitch/2);
  const boxes=[];
  pts.forEach(off=>{boxes.push(alongX?{c:[0,0,off],s:[toothD,toothH,toothW]}:{c:[off,0,0],s:[toothW,toothH,toothD]});});
  boxes.push(alongX?{c:[-toothD*0.6,0,0],s:[toothD*0.7,toothH*0.5,len]}:{c:[0,0,-toothD*0.6],s:[len,toothH*0.5,toothD*0.7]});
  return boxes;
}

function worldBoxes(s){
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
    const m=compose(hR,{t:[GEO.xTravelMin-GEO.parts.bladeParkedInset+(travelX+GEO.parts.bladeOvertravel)*ext,GEO.xBankY-GEO.bladeDepth,o],ry:-Math.PI/2});
    const b=aabbOfParts(m,bparts);b.visible=ext>0.001;out[`xBlade[${i}]`]=b;
  });
  offs.forEach((o,i)=>{
    const on=engaged.has(i)&&s.tailEngaged[i];
    const ext=on?s.bladeExtend:0;
    const m=compose(hL,{t:[o,GEO.zBankY-GEO.bladeDepth,GEO.zTravelMin-GEO.parts.bladeParkedInset+(travelZ+GEO.parts.bladeOvertravel)*ext]});
    const b=aabbOfParts(m,bparts);b.visible=ext>0.001;out[`zBlade[${i}]`]=b;
  });
  { const r=GEO.magazine.r;   // mkMagazine(len, depth) called with depth=r; rotation maps len->travel-normal
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
    out['pusher driveCollar']=aabbOfCyl(compose(m,{t:[0,0.34,0]}),0.16,0.19,0.34,20);
    out['pusher driveScrew']=aabbOfCyl(compose(m,{t:[0,1.0,0]}),0.06,0.06,1.1,12);
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
    out['crosscut rail']=aabbOfCyl(compose(m,{t:[0,-0.24,0],rz:Math.PI/2}),0.05,0.05,4.6,12);
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
    const y=FLOOR+0.9+(1-s.feedProgress)*1.6;
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
    const pbs=[];
    for(const kind of Object.keys(sizes)){
      const n=counts[kind]||0;
      for(let i=0;i<n;i++){
        const golden=2.39996,r=0.1+0.55*Math.sqrt((i+0.5)/Math.max(1,n)),a=i*golden;
        const pm=compose(cas,{t:[Math.cos(a)*r,GEO.bin.y-GEO.bin.h/2+0.12+Math.floor(i/10)*0.12,Math.sin(a)*r],
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
  out['hinge']=aabbOfCyl(compose(cas,{t:[-1.15,2.4,0],rx:Math.PI/2}),0.09,0.09,2.0,12);
  out['ground']=aabbOfCyl(compose(I(),{t:[0,-0.15,0]}),10,10,0.3,48);
  return out;
}

// pairs that are joined/adjacent by design (static shell joints, mounted subassemblies)
const INTENDED = new Set();
const intend=(a,b)=>{INTENDED.add(a+'<>'+b);INTENDED.add(b+'<>'+a);};
[['chamber +Z wall','chamber -X wall'],['chamber -Z wall','chamber -X wall'],
 ['chamber +Z wall','chamber floor'],['chamber -Z wall','chamber floor'],['chamber -X wall','chamber floor'],
 ['chute +X wall','chute +Z wall'],['chute +X wall','chute -Z wall'],['chute -X wall','chute +Z wall'],
 ['chute -X wall','chute -Z wall'],
 ['chute +X wall','chute lip'],['chute -X wall','chute lip'],['chute +Z wall','chute lip'],['chute -Z wall','chute lip'],
 ['xWiper','xWiperLip'],['zWiper','zWiperLip'],
 ['pusher','pusher driveCollar'],['pusher driveCollar','pusher driveScrew'],
 ['plinth','plinthTop'],['plinth','bin'],['plinthTop','bin'],
 ['D1 motor','camshaft+cams'],
].forEach(([a,b])=>intend(a,b));

console.log('=== A. FILTERED OVERLAP SCAN (all patterns, 260 samples each) ===');
{
  const reported=new Map();
  for(const pat of Object.keys(PATTERNS)){
    const tl=workflowTimeline(pat);
    const N=260;
    for(let i=0;i<=N;i++){
      const t=(i/N)*tl.total;
      const s=sampleAt(t,pat);
      const wb=worldBoxes(s);
      const names=Object.keys(wb).filter(n=>wb[n].visible!==false&&n!=='ground');
      for(let i2=0;i2<names.length;i2++)for(let j=i2+1;j<names.length;j++){
        const a=names[i2],b=names[j];
        const key=a+'<>'+b;
        if(INTENDED.has(key))continue;
        // comb-vs-blade and wiper-vs-blade and pusher-vs-blade are slot interleavings — verified separately
        const combs=['xReceiver','zReceiver','originRailX','farRailX','originRailZ','farRailZ'];
        if((combs.includes(a)&&/^[xz]Blade/.test(b))||(combs.includes(b)&&/^[xz]Blade/.test(a)))continue;
        if((/^xWiper/.test(a)&&/^xBlade/.test(b))||(/^xWiper/.test(b)&&/^xBlade/.test(a)))continue;
        if((/^zWiper/.test(a)&&/^zBlade/.test(b))||(/^zWiper/.test(b)&&/^zBlade/.test(a)))continue;
        if((a==='pusher'&&/^[xz]Blade/.test(b))||(b==='pusher'&&/^[xz]Blade/.test(a)))continue;
        if(overlap(wb[a],wb[b])){
          if(!reported.has(key))reported.set(key,{pat,t,A:wb[a],B:wb[b],a,b});
        }
      }
    }
  }
  if(reported.size===0)console.log('  (none)');
  for(const {pat,t,a,b,A,B} of reported.values()){
    console.log(`  [${pat} t=${t.toFixed(1)}] OVERLAP ${a} <-> ${b}`);
    console.log(`      ${a}: [${fmt(A.mn)}]..[${fmt(A.mx)}]`);
    console.log(`      ${b}: [${fmt(B.mn)}]..[${fmt(B.mx)}]`);
  }
}

console.log('\n=== B. BLADE GEOMETRY FACTS ===');
{
  console.log(`  bladeLen=${BLADE_LEN} (= travel ${travelX} + 1.1)`);
  const px=GEO.xTravelMin-GEO.parts.bladeParkedInset;
  console.log(`  parked X-blade: group tail x=${px}, blade strip runs local X [0,${BLADE_LEN}] -> after ry=-90deg, maps to world Z [-0, -${BLADE_LEN}] i.e. Z [${px? '' : ''}${(-BLADE_LEN).toFixed(2)},0]+... computed:`);
  // X blade world: local (lx,ly,lz) -> world (group.x + lz, group.y + ly, group.z - lx)
  const g0=[px,GEO.xBankY-GEO.bladeDepth,0];
  console.log(`  X-blade[0] parked world: tail local x=-0.18..0.02 -> world z=+0.18..-0.02; blade body local x 0..${BLADE_LEN} -> world Z 0..${(-BLADE_LEN).toFixed(2)}`);
  console.log(`  => parked X blade occupies Z [${(-BLADE_LEN).toFixed(2)}, +0.18], X [${(offs[0]-0.028).toFixed(2)}..], i.e. ENTIRELY at negative Z, length 4.9 sticking out past the -Z chamber wall (-1.2) to Z=-4.9`);
  console.log(`  At full ext group x = ${(px+travelX+GEO.parts.bladeOvertravel).toFixed(2)} -> blade occupies Z [${(-BLADE_LEN).toFixed(2)},0] shifted in X only.`);
  console.log(`  X-blade travels along X but its LENGTH lies along Z => it is a wall-spanning blade oriented correctly only if its length should span Z; but then translating along X does NOT advance its tip toward a receiver at +X. The receiver/wiper/magazine for the X bank are arranged along X. MISMATCH.`);
  console.log(`  Z-blade (no rotation): local X length -> world X; group z = travel. Blade occupies X [0,${BLADE_LEN}] world at group x=offset o => X [o, o+${BLADE_LEN}] e.g. blade[0] X [-1.02, 3.88]; travels along Z. Tip is at +X?? but travel is along Z.`);
  console.log(`  For motion along Z to be 'tip travel', blade length should lie along Z. It lies along X. SAME MISMATCH for Z bank.`);
}

console.log('\n=== C. CROSSCUT vs BIN/PLINTH/CHAMBER ===');
{
  const tl=workflowTimeline('12mm');
  const cross=tl.steps.find(s=>s.step.phase==='crosscut');
  const s=sampleAt(cross.start+cross.dur/2,'12mm');
  const wb=worldBoxes(s);
  console.log(`  crosscutX at mid-sweep=${s.crosscutX.toFixed(2)}`);
  console.log(`  knife: [${fmt(wb['crosscut knife'].mn)}]..[${fmt(wb['crosscut knife'].mx)}]`);
  console.log(`  rail:  [${fmt(wb['crosscut rail'].mn)}]..[${fmt(wb['crosscut rail'].mx)}]`);
  console.log(`  bin:   [${fmt(wb['bin'].mn)}]..[${fmt(wb['bin'].mx)}]`);
  console.log(`  rail y=${(GEO.crosscutY-0.24).toFixed(2)} ± 0.05 -> [${(GEO.crosscutY-0.29).toFixed(2)},${(GEO.crosscutY-0.19).toFixed(2)}] vs bin rim top ${(GEO.bin.y+GEO.bin.h/2).toFixed(2)}: rail passes ${GEO.crosscutY-0.29 < GEO.bin.y+GEO.bin.h/2 ? 'THROUGH bin rim/walls' : 'above bin'}`);
  console.log(`  rail spans X [crosscutX-2.3, crosscutX+2.3]; at sweep max crosscutX=1.7 => rail X [-0.6,4.0] — bin spans X ±0.98 => overlap through bin walls for much of the sweep.`);
  console.log(`  knife edge bottom Y=${(GEO.crosscutY-0.14-0.025).toFixed(3)} vs bin rim ${(GEO.bin.y+GEO.bin.h/2).toFixed(2)} -> clears by ${(GEO.crosscutY-0.165-GEO.bin.y-GEO.bin.h/2).toFixed(3)}`);
  console.log(`  chamber floor top Y=${(FLOOR+WALL).toFixed(2)} vs crosscut top Y=${(GEO.crosscutY+0.13).toFixed(2)} -> knife is BELOW the chamber floor plate (floor ${(FLOOR).toFixed(2)}..${(FLOOR+WALL).toFixed(2)}). Knife at Y 1.11..1.37 passes UNDER the floor plate: pieces sitting ON the floor can never be cut; the knife sweeps through the floor plate? floor plate Y [1.62,1.69] vs knife top 1.37 -> no intersection, knife below floor.`);
  console.log(`  dock: crosscutX=${GEO.crosscut.dockX}, knife X [${(GEO.crosscut.dockX-(W-0.1)/2).toFixed(2)},${(GEO.crosscut.dockX+(W-0.1)/2).toFixed(2)}] vs chamber -X wall at -1.2: docked knife reaches ${(GEO.crosscut.dockX+(W-0.1)/2).toFixed(2)} — inside the chamber? (overlap if > -1.13)`);
}

console.log('\n=== D. PUSHER vs GRID (does the waffle actually clear engaged blades?) ===');
{
  const postHalf=(GEO.pitch-GEO.pusher.slotWidth)/2;
  console.log(`  pusher posts: ${GEO.bladesPerBank-1}x${GEO.bladesPerBank-1} at pitch ${GEO.pitch}, half ${postHalf.toFixed(3)}; post columns centred at (ix-5.5)*0.17 => outermost post centre ±${(5.5*0.17).toFixed(3)}, post face at ±${(5.5*0.17+postHalf).toFixed(3)}; blade lines at ±${(6*0.17).toFixed(2)}`);
  console.log(`  blade at line o has thickness ${GEO.bladeThickness}; slot = gap between posts = ${(GEO.pitch-2*postHalf).toFixed(3)} centred on lines => slot width ${GEO.pusher.slotWidth} ✓ by construction`);
  console.log(`  BUT pusher posts span X/Z ±${(5.5*0.17+postHalf).toFixed(3)} while the GRID spans ±${(6*0.17).toFixed(2)}: outermost blade lines at ±1.02 lie OUTSIDE the outermost post faces (±${(5.5*0.17+postHalf).toFixed(3)}) => outermost blades (all 4 banks' edge blades) pass BESIDE the pusher, not through slots — fine (no collision) but the pusher cannot press produce located under the outermost 0.085 ring.`);
  // vertical: at feedLimit posts bottom
  const bot=GEO.pusher.feedLimitY-0.22*1.2;
  console.log(`  at feedLimit pusherY=${GEO.pusher.feedLimitY}: posts bottom Y=${bot.toFixed(3)}; blade top Y=${(GEO.xBankY).toFixed(2)}; blade bottom Y=${(GEO.xBankY-GEO.bladeDepth).toFixed(2)}; posts bottom below blade bottom by ${(GEO.xBankY-GEO.bladeDepth-bot).toFixed(3)} => pusher sweeps fully through grid ✓`);
  console.log(`  crosscut top Y=${(GEO.crosscutY+0.13).toFixed(2)}; pusher bottom at feedLimit=${bot.toFixed(3)} -> clearance ${(bot-GEO.crosscutY-0.13).toFixed(3)}`);
  console.log(`  chamber floor top Y=${(FLOOR+WALL).toFixed(2)}; pusher bottom ${bot.toFixed(3)} -> pusher stops ${(bot-FLOOR-WALL).toFixed(3)} ABOVE the floor — pieces below are never purged (feedLimit claims 'purge bottom')`);
}

console.log('\n=== E. STATE-MACHINE vs SCENE MISMATCHES ===');
{
  // pusher during 'stored' load phase vs produce spawn position
  const tl=workflowTimeline('12mm');
  const load=tl.steps.find(s=>s.step.n===1);
  for(const f of [0.45,0.6,0.8,1.0]){
    const s=sampleAt(load.start+load.dur*f,'12mm');
    const py=s.pusherY, prodY=FLOOR+0.9+(1-s.feedProgress)*1.6;
    console.log(`  load k=${f}: pusherY=${py.toFixed(2)} (plate bottom ${(py-0.264).toFixed(2)}), produce centre y=${prodY.toFixed(2)} (carrot top ~${(prodY+1.16).toFixed(2)}) contact=${s.pusherY<=prodY+1.16?'YES (pusher plate intersects carrot)':'no'}`);
  }
  const s13=sampleAt(tl.steps.find(s=>s.step.n===13).start+0.5,'12mm');
  console.log(`  step13 (potato load): produce=${s13.produce} loaded=${s13.produceLoaded} pusherY=${s13.pusherY.toFixed(2)}`);
  // carrot disappears at feed end: visibility window
  const feed=tl.steps.find(s=>s.step.n===7);
  const sf=sampleAt(feed.start+feed.dur+0.001,'12mm');
  console.log(`  after feed: carrot visible=${sf.produce==='carrot'&&sf.produceLoaded&&sf.feedProgress<0.999} pieces=${sf.cutPieces.length} (kind=${sf.cutPieces[0]?.kind})`);
  // sticks during crosscut: pieces visible are 'stick' until crosscut k>=0.999
  const sc=sampleAt(feed.start+feed.dur+tl.steps.find(s=>s.step.n===8).dur/2+0.001,'12mm');
  console.log(`  mid-crosscut: pieces=${sc.cutPieces.length} kinds=${[...new Set(sc.cutPieces.map(p=>p.kind))]} -> sticks shown piled in bin DURING crosscut (before knife finishes) `);
}

console.log('\n=== F. UNFOLD SWEEP ===');
{
  const tl=workflowTimeline('12mm');
  const m=tl.steps.find(x=>x.step.n===26);
  for(const f of [0,0.5,1]){
    const s=sampleAt(m.start+m.dur*f,'12mm');
    const wb=worldBoxes(s);
    const lows=[];
    for(const n of Object.keys(wb)){
      if(wb[n].visible===false)continue;
      if(/chamber|chute|Blade|Magazine|Wiper|Receiver|Rail|pusher|stripper|crosscut|bin|hinge|produce/.test(n))lows.push([wb[n].mn[1],n]);
    }
    lows.sort((a,b)=>a[0]-b[0]);
    console.log(`  unfold k=${f}: lowest cassette points: ${lows.slice(0,4).map(([y,n])=>`${n}@${y.toFixed(2)}`).join(', ')} (ground top y=0.0)`);
    // halves vs each other: sample chamber wall (halfL) vs halfR parts
    const hits=[];
    const names=Object.keys(wb).filter(n=>wb[n].visible!==false);
    const left=/chamber|chute|zBlade|zMagazine|zWiper|zReceiver|originRailZ|farRailZ/;
    const right=/xBlade|xMagazine|xWiper|xReceiver|originRailX|farRailX/;
    for(const a of names.filter(n=>left.test(n)))for(const b of names.filter(n=>right.test(n))){
      if(overlap(wb[a],wb[b]))hits.push(`${a}<->${b}`);
    }
    console.log(`    halfL<->halfR overlaps at k=${f}: ${hits.length?hits.slice(0,6).join(' ; '):'none'}`);
  }
  // dry base vs cassette during extraction
  const m25=tl.steps.find(x=>x.step.n===25);
  for(const f of [0.5,1]){
    const s=sampleAt(m25.start+m25.dur*f,'12mm');
    const wb=worldBoxes(s);
    const dryNames=['plinth','plinthTop','D1 motor','camshaft+cams','D2 latch','electronics','coupling'];
    const hits=[];
    for(const dn of dryNames)for(const n of Object.keys(wb)){
      if(wb[n].visible===false||['ground','plinth','plinthTop','D1 motor','camshaft+cams','D2 latch','electronics','coupling'].includes(n))continue;
      if(overlap(wb[dn],wb[n]))hits.push(`${dn}<->${n}`);
    }
    console.log(`  extract k=${f}: dry-vs-cassette overlaps: ${hits.length?[...new Set(hits)].slice(0,8).join(' ; '):'none'}`);
  }
}
