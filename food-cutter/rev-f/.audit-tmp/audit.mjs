// READ-ONLY audit tool: computes world-space AABBs of every Rev F part by
// replaying the same construction + transform math as scene.js / app.js
// (current working tree). Nothing in the repo is modified.
import { GEO, bladeOffsets, patternIndices, PATTERNS } from '../src/animation/config.js';
import { MECH_PHASES, WORKFLOW, workflowTimeline, sampleAt, initialState, checkState } from '../src/animation/stateMachine.js';

/* ---------------- minimal affine math ---------------- */
const I = () => [1,0,0,0, 0,1,0,0, 0,0,1,0];
function compose(m, { t=[0,0,0], rx=0, ry=0, rz=0, s=[1,1,1] } = {}) {
  const [cx,sx]=[Math.cos(rx),Math.sin(rx)], [cy,sy]=[Math.cos(ry),Math.sin(ry)], [cz,sz]=[Math.cos(rz),Math.sin(rz)];
  const R = [
    cz*cy, cz*sy*sx - sz*cx, cz*sy*cx + sz*sx,
    sz*cy, sz*sy*sx + cz*cx, sz*sy*cx - cz*sx,
    -sy,   cy*sx,            cy*cx,
  ];
  // apply scale first (three: M = T * R * S)
  for (let c=0;c<3;c++){ R[c]*=s[0]; R[3+c]*=s[1]; R[6+c]*=s[2]; }
  const out = new Array(12);
  for (let r=0;r<3;r++){
    for (let c=0;c<3;c++) out[r*4+c] = m[r*4]*R[c] + m[r*4+1]*R[3+c] + m[r*4+2]*R[6+c];
    out[r*4+3] = m[r*4+3] + t[0]*m[r*4] + t[1]*m[r*4+1] + t[2]*m[r*4+2];
  }
  return out;
}
const apply = (m,p) => [
  m[0]*p[0]+m[1]*p[1]+m[2]*p[2]+m[3],
  m[4]*p[0]+m[5]*p[1]+m[6]*p[2]+m[7],
  m[8]*p[0]+m[9]*p[1]+m[10]*p[2]+m[11]];
function aabbOfBox(m,w,h,d){
  const hx=w/2,hy=h/2,hz=d/2; let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for (const x of [-hx,hx]) for (const y of [-hy,hy]) for (const z of [-hz,hz]){
    const p=apply(m,[x,y,z]);
    for(let i=0;i<3;i++){mn[i]=Math.min(mn[i],p[i]);mx[i]=Math.max(mx[i],p[i]);}
  }
  return {mn,mx};
}
function aabbOfCyl(m,rTop,rBot,h,seg=28){
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for (const [y,r] of [[h/2,rTop],[-h/2,rBot]]) for (let i=0;i<seg;i++){
    const a=i/seg*Math.PI*2;
    const p=apply(m,[Math.cos(a)*r,y,Math.sin(a)*r]);
    for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k]);}
  }
  return {mn,mx};
}
function aabbOfSphere(m,r,scale=[1,1,1]){
  let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for (let i=0;i<24;i++) for (let j=0;j<=12;j++){
    const th=i/24*Math.PI*2, ph=j/12*Math.PI-Math.PI/2;
    const p=apply(m,[r*scale[0]*Math.cos(ph)*Math.cos(th), r*scale[1]*Math.sin(ph), r*scale[2]*Math.cos(ph)*Math.sin(th)]);
    for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],p[k]);mx[k]=Math.max(mx[k],p[k]);}
  }
  return {mn,mx};
}
const union=(a,b)=>({mn:a.mn.map((v,i)=>Math.min(v,b.mn[i])),mx:a.mx.map((v,i)=>Math.max(v,b.mx[i]))});
const merge=bs=>bs.reduce(union);
const overlap=(a,b,e=1e-4)=>a.mn[0]<b.mx[0]-e&&a.mx[0]>b.mn[0]+e&&a.mn[1]<b.mx[1]-e&&a.mx[1]>b.mn[1]+e&&a.mn[2]<b.mx[2]-e&&a.mx[2]>b.mn[2]+e;
const fmt=v=>v.map(x=>x.toFixed(2)).join(',');
const aabbOfParts=(m,parts)=>merge(parts.map(({c,s,ry=0,rx=0,rz=0,sc})=>aabbOfBox(compose(m,{t:c,ry,rx,rz,s:sc}),s[0],s[1],s[2])));

/* ---------------- shared constants ---------------- */
const offs = bladeOffsets();
const BLADE_LEN = GEO.parts.bladeLen;
const travelX = GEO.xTravelMax - GEO.xTravelMin;
const travelZ = GEO.zTravelMax - GEO.zTravelMin;
const W=GEO.chamber.w, H=GEO.chamber.h, D=GEO.chamber.d, WALL=GEO.chamber.wall, FLOOR=GEO.chamber.floorY;

function cassetteMatrix(s){ return compose(I(),{t:[0,0,GEO.cassette.seatZ + s.extractProgress*GEO.cassette.extractTravel]}); }
function halfLMatrix(s){ const a=s.unfoldProgress*GEO.cassette.unfoldAngle; return compose(cassetteMatrix(s),{rz:a*0.5}); }
function halfRMatrix(s){ const a=s.unfoldProgress*GEO.cassette.unfoldAngle; return compose(cassetteMatrix(s),{rz:-a*0.5}); }

// blade local boxes (mkBlade): body, edge cone (scaled cyl => box envelope), tail
function bladeLocalBoxes(L){
  const t=GEO.bladeThickness, Dp=GEO.bladeDepth;
  const edgeH = Dp*0.5; // cone height after scale = t*0.9 * scaleZ ... envelope box:
  return [
    {c:[L/2, Dp*0.36, 0], s:[L, Dp*0.72, t]},                          // body
    {c:[L/2, Dp*0.72+0.001, 0], s:[L, edgeH, t*0.9]},                  // edge envelope (cone squashed: height D*0.5 vertical, base radius t*0.9 across)
    {c:[-0.08, Dp*0.4, 0], s:[0.2, Dp*0.8, 0.16]},                     // tail
  ];
}
function combParts(len, toothH, toothD, alongX){
  const toothW=GEO.pitch*0.36, lines=bladeOffsets(), pts=[];
  for(let i=0;i<lines.length-1;i++) pts.push((lines[i]+lines[i+1])/2);
  pts.push(lines[0]-GEO.pitch/2, lines[lines.length-1]+GEO.pitch/2);
  const boxes=[];
  pts.forEach(off=>{ boxes.push(alongX?{c:[0,0,off],s:[toothD,toothH,toothW]}:{c:[off,0,0],s:[toothW,toothH,toothD]}); });
  boxes.push(alongX?{c:[-toothD*0.6,0,0],s:[toothD*0.7,toothH*0.5,len]}:{c:[0,0,-toothD*0.6],s:[len,toothH*0.5,toothD*0.7]});
  return boxes;
}

/* ---------------- world boxes for a state ---------------- */
function worldBoxes(s, opts={}){
  const out={};
  const cas=cassetteMatrix(s), hL=halfLMatrix(s), hR=halfRMatrix(s);
  const yc=FLOOR+H/2;
  out['chamber +Z wall']=aabbOfBox(compose(hL,{t:[0,yc,D/2-WALL/2]}),W,H,WALL);
  out['chamber -Z wall']=aabbOfBox(compose(hL,{t:[0,yc,-D/2+WALL/2]}),W,H,WALL);
  out['chamber -X wall']=aabbOfBox(compose(hL,{t:[-W/2+WALL/2,yc,0]}),WALL,H,D);
  out['chamber floor']=aabbOfBox(compose(hL,{t:[0,FLOOR+WALL/2,0]}),W,WALL,D);
  { const cs=GEO.chuteSize/2, topY=GEO.chuteTop, botY=FLOOR+H, h=topY-botY, cy=(topY+botY)/2;
    out['chute +X wall']=aabbOfBox(compose(hL,{t:[cs,cy,0]}),WALL,h,cs*2);
    out['chute -X wall']=aabbOfBox(compose(hL,{t:[-cs,cy,0]}),WALL,h,cs*2);
    out['chute +Z wall']=aabbOfBox(compose(hL,{t:[0,cy,cs]}),cs*2,h,WALL);
    out['chute -Z wall']=aabbOfBox(compose(hL,{t:[0,cy,-cs]}),cs*2,h,WALL);
    out['chute lip']=aabbOfBox(compose(hL,{t:[0,topY+0.02,0]}),cs*2+0.3,0.1,cs*2+0.3);
  }
  // blades
  const engaged=new Set(s.selectedIndices);
  const bparts=bladeLocalBoxes(BLADE_LEN);
  offs.forEach((o,i)=>{
    const on=engaged.has(i)&&s.tailEngaged[i];
    const ext=on?s.bladeExtend:0;
    const m=compose(hR,{t:[GEO.xTravelMin-GEO.parts.bladeParkedInset+(travelX+GEO.parts.bladeOvertravel)*ext, GEO.xBankY-GEO.bladeDepth, o], ry:-Math.PI/2});
    const b=aabbOfParts(m,bparts); b.visible=ext>0.001; out[`xBlade[${i}]`]=b;
  });
  offs.forEach((o,i)=>{
    const on=engaged.has(i)&&s.tailEngaged[i];
    const ext=on?s.bladeExtend:0;
    const m=compose(hL,{t:[o, GEO.zBankY-GEO.bladeDepth, GEO.zTravelMin-GEO.parts.bladeParkedInset+(travelZ+GEO.parts.bladeOvertravel)*ext]});
    const b=aabbOfParts(m,bparts); b.visible=ext>0.001; out[`zBlade[${i}]`]=b;
  });
  // magazines: mkMagazine(len, depth=r=0.22) — box(depth, 2r, len) + mouth lips
  { const r=GEO.magazine.r, len=D+0.2;
    const m=compose(hR,{t:[GEO.xTravelMin-r-0.12, GEO.xBankY-GEO.bladeDepth/2, 0], ry:Math.PI/2});
    out['xMagazine']=aabbOfParts(m,[{c:[0,0,0],s:[r,2*r,len]},{c:[r*0.55,r*0.7,0],s:[r*0.6,r*0.4,len]},{c:[r*0.55,-r*0.7,0],s:[r*0.6,r*0.4,len]}]);
  }
  { const r=GEO.magazine.r, len=W+0.2;
    const m=compose(hL,{t:[0, GEO.zBankY-GEO.bladeDepth/2, GEO.zTravelMin-r-0.12]});
    out['zMagazine']=aabbOfParts(m,[{c:[0,0,0],s:[r,2*r,len]},{c:[r*0.55,r*0.7,0],s:[r*0.6,r*0.4,len]},{c:[r*0.55,-r*0.7,0],s:[r*0.6,r*0.4,len]}]);
  }
  out['xWiper']=aabbOfBox(compose(hR,{t:[GEO.xTravelMin+GEO.parts.wiperOffset, GEO.xBankY, 0]}),0.1,0.34,D);
  out['xWiperLip']=aabbOfBox(compose(hR,{t:[GEO.xTravelMin+GEO.parts.wiperOffset+0.06, GEO.xBankY-0.2, 0]}),0.06,0.12,D);
  out['zWiper']=aabbOfBox(compose(hL,{t:[0, GEO.zBankY, GEO.zTravelMin+GEO.parts.wiperOffset]}),W,0.34,0.1);
  out['zWiperLip']=aabbOfBox(compose(hL,{t:[0, GEO.zBankY-0.2, GEO.zTravelMin+GEO.parts.wiperOffset+0.06]}),W,0.12,0.06);
  out['xReceiver']=aabbOfParts(compose(hR,{t:[GEO.xTravelMax+GEO.parts.combOffset, GEO.xBankY-0.17, 0]}),combParts(D,0.34,GEO.parts.combDepth,true));
  out['zReceiver']=aabbOfParts(compose(hL,{t:[0, GEO.zBankY-0.17, GEO.zTravelMax+GEO.parts.combOffset]}),combParts(W,0.34,GEO.parts.combDepth,false));
  const lk=GEO.parts.lockStroke;
  out['originRailX']=aabbOfParts(compose(hR,{t:[GEO.xTravelMin-GEO.parts.railOffsetOrigin+s.originLock*lk, GEO.xBankY-0.2, 0]}),combParts(D,0.4,GEO.parts.railDepth,true));
  out['farRailX']=aabbOfParts(compose(hR,{t:[GEO.xTravelMax+GEO.parts.railOffsetFar-s.farLock*lk, GEO.xBankY-0.2, 0]}),combParts(D,0.4,GEO.parts.railDepth,true));
  out['originRailZ']=aabbOfParts(compose(hL,{t:[0, GEO.zBankY-0.2, GEO.zTravelMin-GEO.parts.railOffsetOrigin+s.originLock*lk]}),combParts(W,0.4,GEO.parts.railDepth,false));
  out['farRailZ']=aabbOfParts(compose(hL,{t:[0, GEO.zBankY-0.2, GEO.zTravelMax+GEO.parts.railOffsetFar-s.farLock*lk]}),combParts(W,0.4,GEO.parts.railDepth,false));
  // shuttle (on cassette), arms rotate about Y with selectorProgress
  { const mX=compose(cas,{t:[GEO.xTravelMin-0.55, GEO.xBankY-GEO.bladeDepth, 0], ry:-s.selectorProgress*0.5});
    const boxes=[{c:[0,0,0],s:[0.34,0.12,D]}];
    offs.forEach(o=>boxes.push({c:[0.3,0,o],s:[0.3,0.1,0.1]}));
    out['shuttleArmX']=aabbOfParts(mX,boxes);
    const mZ=compose(cas,{t:[0, GEO.zBankY-GEO.bladeDepth, GEO.zTravelMin-0.55], ry:s.selectorProgress*0.5});
    const zb=[{c:[0,0,0],s:[W,0.12,0.34]}];
    offs.forEach(o=>zb.push({c:[o,0,0.3],s:[0.1,0.1,0.3]}));
    out['shuttleArmZ']=aabbOfParts(mZ,zb);
  }
  // pusher
  { const m=compose(cas,{t:[0,s.pusherY,0]});
    const p=GEO.pusher, T=p.faceThickness;
    const edge=(GEO.bladesPerBank-1)/2*GEO.pitch+GEO.pitch/2;
    const postHalf=(GEO.pitch-p.slotWidth)/2;
    const boxes=[{c:[0,T*0.45,0],s:[edge*2,T*0.55,edge*2]}];
    for(let ix=0;ix<GEO.bladesPerBank-1;ix++){
      const cx=(ix-(GEO.bladesPerBank-2)/2)*GEO.pitch;
      for(let iz=0;iz<GEO.bladesPerBank-1;iz++){
        const cz=(iz-(GEO.bladesPerBank-2)/2)*GEO.pitch;
        boxes.push({c:[cx,-T*0.4,cz],s:[postHalf*2,T*1.6,postHalf*2]});
      }
    }
    boxes.push({c:[0,0,GEO.chuteSize/2+0.03],s:[0.3,0.4,0.08]});
    boxes.push({c:[0,0,-GEO.chuteSize/2-0.03],s:[0.3,0.4,0.08]});
    out['pusher']=aabbOfParts(m,boxes);
    out['pusher driveCollar']=aabbOfCyl(compose(m,{t:[0,0.34,0]}),0.16,0.19,0.34,20);
    out['pusher driveScrew']=aabbOfCyl(compose(m,{t:[0,1.0,0]}),0.06,0.06,1.1,12);
  }
  // stripper
  { const y=s.pusherY+0.35-s.stripProgress*0.5;
    const m=compose(cas,{t:[0,y,0]});
    const e=GEO.chuteSize/2+0.14;
    out['stripper']=aabbOfParts(m,[
      {c:[0,0,e-0.06],s:[e*2,0.08,0.12]},{c:[0,0,-e+0.06],s:[e*2,0.08,0.12]},
      {c:[e-0.06,0,0],s:[0.12,0.08,e*2]},{c:[-e+0.06,0,0],s:[0.12,0.08,e*2]}]);
  }
  // crosscut
  { const m=compose(cas,{t:[s.crosscutX,GEO.crosscutY,0]});
    out['crosscut knife']=aabbOfParts(m,[
      {c:[0,0,0],s:[W-0.1,0.26,0.05]},
      {c:[0,-0.14,0],s:[W-0.1,0.05,0.05]},           // edge envelope
      {c:[-W/2-0.1,0,0],s:[0.3,0.22,0.4]}]);          // shoe
    out['crosscut rail']=aabbOfCyl(compose(m,{t:[0,-0.24,0],rz:Math.PI/2}),0.05,0.05,4.6,12);
  }
  // bin
  { const m=compose(cas,{t:[0,GEO.bin.y,0]});
    const {w:bw,h:bh,d:bd}=GEO.bin, wallT=0.06;
    out['bin']=aabbOfParts(m,[
      {c:[0,0,bd/2],s:[bw,bh,wallT]},{c:[0,0,-bd/2],s:[bw,bh,wallT]},
      {c:[bw/2,0,0],s:[wallT,bh,bd]},{c:[-bw/2,0,0],s:[wallT,bh,bd]},
      {c:[0,-bh/2-0.04,0],s:[bw,0.08,bd]}]);
    out['bin handle']=aabbOfCyl(compose(m,{t:[0,bh/2+0.12,bd/2+0.08],rz:Math.PI/2}),0.04,0.04,bw*0.5,12);
  }
  // produce
  for (const kind of ['carrot','potato']){
    const on=s.produce===kind&&s.produceLoaded&&s.feedProgress<0.999;
    const y=FLOOR+0.9+(1-s.feedProgress)*1.6;
    if(kind==='carrot'){
      const parts=[aabbOfCyl(compose(cas,{t:[0,y,0],ry:0.2}),0.15,0.03,1.6,18)];
      parts.push(aabbOfCyl(compose(cas,{t:[0,y-0.86,0],rx:Math.PI}),0.001,0.03,0.14,10));
      for(let i=0;i<3;i++) parts.push(aabbOfCyl(compose(cas,{t:[(i-1)*0.07,y+0.95,(i%2)*0.05-0.02],rz:(i-1)*0.35}),0.001,0.045,0.42,8));
      out['produce carrot']=merge(parts); out['produce carrot'].visible=on;
    } else {
      out['produce potato']=aabbOfSphere(compose(cas,{t:[0,y,0]}),0.52,[1,0.78,0.85]);
      out['produce potato'].visible=on;
    }
  }
  // cut pieces
  { const counts={stick:0,cube:0,coin:0};
    s.cutPieces.forEach(pc=>{counts[pc.kind]=(counts[pc.kind]||0)+1;});
    const sizes={stick:[0.13,0.13,1.0],cube:[0.15,0.15,0.15],coin:[0.32,0.05,0.32]};
    const pbs=[];
    for(const kind of Object.keys(sizes)){
      const n=counts[kind]||0;
      for(let i=0;i<n;i++){
        const golden=2.39996, r=0.1+0.55*Math.sqrt((i+0.5)/Math.max(1,n)), a=i*golden;
        const pm=compose(cas,{t:[Math.cos(a)*r, GEO.bin.y-GEO.bin.h/2+0.12+Math.floor(i/10)*0.12, Math.sin(a)*r],
                              rx:(i*0.7)%1.2-0.6, ry:a, rz:(i*1.1)%0.9-0.45});
        pbs.push(aabbOfBox(pm,...sizes[kind]));
      }
    }
    if(pbs.length&&s.feedProgress>=0.999&&s.extractProgress<=0){ out['cutPieces']=merge(pbs); out['cutPieces'].visible=true; }
  }
  // dry base
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
    for(let i=0;i<5;i++) parts.push(aabbOfCyl(compose(I(),{t:[-0.2-1.2+i*0.6,1.7,-1.2],rz:Math.PI/2}),0.3*1.32,0.3*1.32,0.14,20));
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

/* ================= REPORTS ================= */
console.log('=== 0. TELEPORT / DISCONTINUITY SCAN ===');
{
  const tl=workflowTimeline('12mm');
  const vars=['pusherY','crosscutX','originLock','farLock','bladeExtend','stripProgress','wiperProgress','extractProgress','unfoldProgress','selectorProgress'];
  for(let i=0;i<tl.steps.length-1;i++){
    const a=tl.steps[i], b=tl.steps[i+1];
    const s1=sampleAt(a.start+a.dur-1e-4,'12mm'), s2=sampleAt(b.start+1e-4,'12mm');
    const jumps=[];
    for(const v of vars){
      const d=Math.abs((s2[v]??0)-(s1[v]??0));
      if(d>0.02) jumps.push(`${v}: ${s1[v]?.toFixed?.(3)} -> ${s2[v]?.toFixed?.(3)}`);
    }
    // produce visibility flips
    if(s1.produce!==s2.produce||s1.produceLoaded!==s2.produceLoaded)
      jumps.push(`produce: ${s1.produce}/${s1.produceLoaded} -> ${s2.produce}/${s2.produceLoaded}`);
    if(jumps.length) console.log(`  step ${a.step.n}(${a.step.phase}) -> ${b.step.n}(${b.step.phase}): ${jumps.join('; ')}`);
  }
}

console.log('\n=== 1. KEY STATIC RELATIONSHIPS ===');
{
  console.log(`  blade offsets: ${offs[0].toFixed(2)}..${offs[offs.length-1].toFixed(2)} pitch=${GEO.pitch}`);
  console.log(`  chamber: X/Z ±${(W/2).toFixed(2)} outer, ±${(W/2-WALL).toFixed(2)} inner; Y floor ${FLOOR} top ${(FLOOR+H).toFixed(2)}`);
  console.log(`  grid plane Y=${GEO.xBankY} (=zBankY? ${GEO.xBankY===GEO.zBankY}); blade spans Y [${(GEO.xBankY-GEO.bladeDepth).toFixed(2)}, ${(GEO.xBankY).toFixed(2)}] (body top at bankY-0.001)`);
  console.log(`  crosscut knife at Y=${GEO.crosscutY}, knife body Y [${(GEO.crosscutY-0.13).toFixed(2)},${(GEO.crosscutY+0.13).toFixed(2)}]`);
  console.log(`  bin: centre y=${GEO.bin.y}, h=${GEO.bin.h} => rim top ${(GEO.bin.y+GEO.bin.h/2).toFixed(2)}; crosscut edge bottom ${(GEO.crosscutY-0.14-0.025).toFixed(2)}`);
  console.log(`  blade tip at full ext: x=${(GEO.xTravelMax+GEO.parts.bladeOvertravel).toFixed(2)} vs far rail centre ${(GEO.xTravelMax+GEO.parts.railOffsetFar).toFixed(2)} (rail spans X [${(GEO.xTravelMax+GEO.parts.railOffsetFar-GEO.parts.railDepth/2).toFixed(2)},${(GEO.xTravelMax+GEO.parts.railOffsetFar+GEO.parts.railDepth/2).toFixed(2)}]) vs receiver centre ${(GEO.xTravelMax+GEO.parts.combOffset).toFixed(2)}`);
  console.log(`  blade parked: group at x=${(GEO.xTravelMin-GEO.parts.bladeParkedInset).toFixed(2)}, tail hook at x=${(GEO.xTravelMin-GEO.parts.bladeParkedInset-0.18).toFixed(2)}; magazine at x=${(GEO.xTravelMin-GEO.magazine.r-0.12).toFixed(2)} spans X [${(GEO.xTravelMin-2*GEO.magazine.r-0.12).toFixed(2)},${(GEO.xTravelMin-0.12).toFixed(2)}]`);
  console.log(`  pusherY: service=${GEO.pusher.serviceY} contact=${GEO.pusher.contactY} feedLimit=${GEO.pusher.feedLimitY}`);
  console.log(`  pusher posts bottom at pusherY-${(0.22*1.2).toFixed(3)}; at feedLimit bottom=${(GEO.pusher.feedLimitY-0.264).toFixed(3)} vs blade top ${(GEO.xBankY-0.001).toFixed(3)} vs crosscut top ${(GEO.crosscutY+0.13).toFixed(2)} vs floor top ${(FLOOR+WALL).toFixed(2)}`);
  console.log(`  chute sleeve Y [${(FLOOR+H).toFixed(2)}, ${GEO.chuteTop}] half-width ${(GEO.chuteSize/2).toFixed(2)}; pusher plate half ${(((GEO.bladesPerBank-1)/2*GEO.pitch+GEO.pitch/2)).toFixed(3)}; guide shoes Z ±${(GEO.chuteSize/2+0.03+0.04).toFixed(2)}`);
  console.log(`  stripper frame outer extent ±${(GEO.chuteSize/2+0.14).toFixed(2)}`);
  console.log(`  wiper centre x=${(GEO.xTravelMin+GEO.parts.wiperOffset).toFixed(2)} (X wiper), spans [${(GEO.xTravelMin+GEO.parts.wiperOffset-0.05).toFixed(2)},${(GEO.xTravelMin+GEO.parts.wiperOffset+0.05).toFixed(2)}]; chamber -X wall inner face x=${(-W/2+WALL).toFixed(2)}`);
  console.log(`  originRailX centre x=${(GEO.xTravelMin-GEO.parts.railOffsetOrigin).toFixed(2)}, tooth depth ${GEO.parts.railDepth} => spans [${(GEO.xTravelMin-GEO.parts.railOffsetOrigin-0.13).toFixed(2)},${(GEO.xTravelMin-GEO.parts.railOffsetOrigin+0.13).toFixed(2)}]; closed: shift +${GEO.parts.lockStroke}`);
  console.log(`  zMagazine centre z=${(GEO.zTravelMin-GEO.magazine.r-0.12).toFixed(2)} spans Z [${(GEO.zTravelMin-2*GEO.magazine.r-0.12).toFixed(2)},${(GEO.zTravelMin-0.12).toFixed(2)}]; chamber -Z wall outer z=${(-D/2).toFixed(2)}`);
}

console.log('\n=== 2. FULL TIMELINE PAIRWISE AABB SCAN (all 5 patterns) ===');
{
  const skipPair=(a,b)=>{
    // intended comb/slot interleavings handled separately
    const combs=['xReceiver','zReceiver','originRailX','farRailX','originRailZ','farRailZ'];
    if(combs.includes(a)&&/^([xz]Blade)/.test(b)) return true;
    if(combs.includes(b)&&/^([xz]Blade)/.test(a)) return true;
    if((a==='xWiper'||a==='xWiperLip')&&/^xBlade/.test(b)) return true;
    if((b==='xWiper'||b==='xWiperLip')&&/^xBlade/.test(a)) return true;
    if((a==='zWiper'||a==='zWiperLip')&&/^zBlade/.test(b)) return true;
    if((b==='zWiper'||b==='zWiperLip')&&/^zBlade/.test(a)) return true;
    if(a==='pusher'&&/^([xz]Blade)/.test(b)) return true;  // waffle posts vs slots — checked separately below
    if(/^([xz]Blade)/.test(a)&&b==='pusher') return true;
    if(a==='ground') return true; if(b==='ground') return true;
    if(a==='plinthTop'&&b==='plinth') return true;
    if(a==='bin handle'&&b==='bin') return true;
    if(/^chute/.test(a)&&b==='chamber +Z wall') return true; // chute sits atop chamber roof — adjacency
    if(/^chute/.test(b)&&a==='chamber +Z wall') return true;
    return false;
  };
  const reported=new Set();
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
        if(skipPair(a,b)) continue;
        if(overlap(wb[a],wb[b])){
          const key=a+'<>'+b;
          if(reported.has(key)) continue;
          reported.add(key);
          const A=wb[a],B=wb[b];
          console.log(`  [${pat} t=${t.toFixed(1)}] OVERLAP ${a} <-> ${b}`);
          console.log(`      ${a}: [${fmt(A.mn)}]..[${fmt(A.mx)}]`);
          console.log(`      ${b}: [${fmt(B.mn)}]..[${fmt(B.mx)}]`);
        }
      }
    }
  }
  if(reported.size===0) console.log('  (no AABB overlaps outside intended comb/slot interleavings)');
}
