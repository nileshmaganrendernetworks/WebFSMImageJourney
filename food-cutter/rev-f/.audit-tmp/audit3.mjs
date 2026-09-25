// Audit part 3 — verify blade orientation hypothesis and remaining checks.
import { GEO, bladeOffsets, patternIndices, PATTERNS } from '../src/animation/config.js';
import { workflowTimeline, sampleAt, initialState, applyPhase, WORKFLOW, checkState } from '../src/animation/stateMachine.js';

const offs = bladeOffsets();

console.log('=== G. X-BANK BLADE ORIENTATION (verify ry=-90 mapping) ===');
// do it with our compose (Rz*Ry*Rx) vs three's actual order; compute BOTH and compare
function threeEulerMatrix(rx,ry,rz){
  const c1=Math.cos(rx),s1=Math.sin(rx),c2=Math.cos(ry),s2=Math.sin(ry),c3=Math.cos(rz),s3=Math.sin(rz);
  // three.js Matrix4.makeRotationFromEuler order 'XYZ':
  // te[0]=c2*c3; te[4]=-c2*s3; te[8]=s2;
  // te[1]=c1*s3+c3*s1*s2; te[5]=c1*c3-s1*s2*s3; te[9]=-c2*s1;
  // te[2]=s1*s3-c1*c3*s2; te[6]=c3*s1+c1*s2*s3; te[10]=c1*c2;
  return [
    c2*c3, -c2*s3, s2, 0,
    c1*s3+c3*s1*s2, c1*c3-s1*s2*s3, -c2*s1, 0,
    s1*s3-c1*c3*s2, c3*s1+c1*s2*s3, c1*c2, 0,
  ];
}
{
  const m=threeEulerMatrix(0,-Math.PI/2,0);
  const x=[m[0],m[4],m[8]], y=[m[1],m[5],m[9]], z=[m[2],m[6],m[10]];
  console.log(`  three 'XYZ' euler (0,-90,0): localX->world(${x.map(v=>v.toFixed(2))}) localY->(${y.map(v=>v.toFixed(2))}) localZ->(${z.map(v=>v.toFixed(2))})`);
  // So local +X (tail->tip, blade length) maps to world -Z ... wait x = column for local X = [m0,m4,m8] = [c2*c3, -c2*s3, s2] = [0,0,-1]. local +X -> world -Z. CONFIRMED.
  console.log(`  => X-bank blade length runs along world -Z; its travel (group.position.x) runs along world X.`);
  console.log(`  => An X-bank blade NEVER advances its tip (tip at world Z=-4.9 fixed). What actually happens on extension: the blade strip, lying along Z, slides sideways along X — i.e. it sweeps across the chamber like a moving wall, not like a blade driving into a receiver.`);
}

console.log('\n=== H. WHAT THE X-BANK BLADE ACTUALLY DOES over extend (zBlade too) ===');
{
  const tl=workflowTimeline('12mm');
  const ext=tl.steps.find(s=>s.step.n===4);
  for(const f of [0,0.25,0.5,0.75,1]){
    const s=sampleAt(ext.start+ext.dur*f,'12mm');
    const px=GEO.xTravelMin-GEO.parts.bladeParkedInset+(GEO.xTravelMax-GEO.xTravelMin+GEO.parts.bladeOvertravel)*s.bladeExtend;
    // X blade [i]: world X in [px+lz...] — thickness t along world X after rotation: local Z (thickness) -> world X
    // blade occupies world X [px - t/2... ] compute properly: local z in [-0.028,0.028] -> world x = px + lz
    console.log(`  extend k=${f.toFixed(2)}: bladeExtend=${s.bladeExtend.toFixed(2)} X-blade occupies world X [${(px-0.028).toFixed(2)}, ${(px+0.028).toFixed(2)}], Z [-4.90, +0.18]`);
  }
  console.log(`  => the engaged X blades sweep as a RAKE across the chamber (0.056-thick sheets moving along X). They DO pass through produce — arguably a valid 'slicing' motion? But the receivers at +X (x=2.15) are never reached: blade sheet stops at x=2.55 max while receiver comb spans x [2.02..2.22]. The blade SHEET passes through the receiver comb plane (sweeping past it), not into slots.`);
  console.log(`  Z-blades: occupy world Z [-2.3..2.55]-ish band of thickness 0.056 moving along Z, length X [o, o+4.9] — asymmetric: stick out +X to 5.92 max, tail at o (blade line). Tail never moves from blade line.`);
}

console.log('\n=== I. PUSHER TRAVEL vs BLADES (correct blade envelopes: sheet model) ===');
{
  // X blade sheet: X in [px-0.028, px+0.028], Y [2.57,3.12], Z [-4.9,0.18]... wait length along -Z from group z=o:
  // local +X (len) -> world -Z; so blade spans world Z [o - 4.9, o + 0.18]. For o=offs[i].
  // pusher posts: X/Z ±0.965, bottom at pusherY-0.264.
  // During feed (pusher 4.3 -> 1.55) blades extended (seated): px at ext=1 = -2.3+4.45=2.15.
  // X blade sheets at X=2.15±0.028: pusher posts X ±0.965 -> NO overlap (sheets at 2.12..2.18, pusher max 0.965).
  console.log(`  At full ext X-blade sheets sit at world X ≈ 2.15±0.03 (OUTSIDE the chamber wall at 1.2!) — the entire X bank parks BEYOND the +X wall, inside the receiver zone; no blades are in the food zone at all during feed.`);
  console.log(`  Similarly Z-blade sheets at full ext sit at world Z ≈ 2.15±0.03 — also outside.`);
  console.log(`  => during 'Feed through grid', THERE IS NO GRID in the chamber. The pusher descends through an empty chamber.`);
  const tl=workflowTimeline('12mm');
  const feed=tl.steps.find(s=>s.step.n===7);
  const s=sampleAt(feed.start+feed.dur/2,'12mm');
  console.log(`  mid-feed: bladeExtend=${s.bladeExtend} (state) — but geometrically the blades are at x/z≈2.15, outside the chamber walls [±1.2].`);
}

console.log('\n=== J. PUSHER vs CHUTE + STRIPPER relationship over full stroke ===');
{
  const tl=workflowTimeline('12mm');
  // find min vertical clearance between pusher plate and stripper frame during strip phase
  const st=tl.steps.find(s=>s.step.n===11);
  for(const f of [0,0.25,0.5,0.75,1]){
    const s=sampleAt(st.start+st.dur*f,'12mm');
    const stripY=s.pusherY+0.35-s.stripProgress*0.5;
    console.log(`  strip k=${f.toFixed(2)}: pusherY=${s.pusherY.toFixed(2)} (plate top ${(s.pusherY+0.22*0.725).toFixed(2)}) stripperY=${stripY.toFixed(2)} (frame bottom ${(stripY-0.04).toFixed(2)}) gap=${(stripY-0.04-(s.pusherY+0.16)).toFixed(3)}`);
  }
  console.log(`  stripper stays ~0.15 above the pusher plate the whole return: it can never strip posts (posts stick DOWN from the plate). Stripper frame inner opening ±${(GEO.chuteSize/2+0.14-0.12).toFixed(2)} vs pusher plate half ${(((GEO.bladesPerBank-1)/2)*GEO.pitch+GEO.pitch/2).toFixed(3)} -> plate passes through frame opening: OK`);
  console.log(`  guide shoes Z ±${(GEO.chuteSize/2+0.03+0.04).toFixed(2)} vs chute wall inner face ±${(GEO.chuteSize/2-0.035).toFixed(3)}: shoes EMBED 0.075 into walls (ride ON the wall = intended contact) ✓`);
}

console.log('\n=== K. CAMSHAFT / D1 / COUPLING vs CHAMBER (dry base under wet cassette) ===');
{
  console.log(`  chamber floor plate bottom Y=${GEO.chamber.floorY.toFixed(2)}; camshaft axis Y=1.7, cam lobe radius 0.3*1.32=0.40 -> cams reach Y up to 2.10 > 1.62 floor bottom. Cam X positions: -1.4,-0.8,-0.2,0.4,1.0 (+camshaft group x=-0.2 -> -1.6..0.8). Chamber floor spans X ±1.2, Z ±1.2; camshaft at Z=-1.2: cams at Z -1.2±0.40 -> -0.8..-1.6: overlaps floor plate Z range [-1.2..1.2] for cam Z -0.8..-1.2 portion => cams DO intersect the chamber floor plate region? floor plate is X±1.2 Z±1.2 at Y [1.62,1.69]; cams reach Y 2.1 at X -1.6..0.8, Z -1.6..-0.8 => intersection volume exists (e.g. cam at x=-0.2,z=-1.0,y up to 2.1 is inside floor footprint and above floor top).`);
  console.log(`  coupling at (-0.2, 2.0, -0.2) r0.24 h0.2+teeth: Y [1.9,2.2] — INSIDE the chamber (floor 1.62, top 3.82, X/Z ±1.2). The coupling hangs inside the food chamber, 0.2 above the floor plate, in the food zone, crossing the Z-blade park plane? blades Y [2.57,3.12] — no. But crosscut rail Y=1.0 — no. It floats INSIDE the chamber volume unsupported (attached to dry base through the floor?).`);
  console.log(`  D1 at (-1.6,1.7,-1.2): gearbox dome reaches Y 1.2..2.2, X -2.9..-0.5 -> overlaps chamber -X wall (X -1.2..-1.13, Y 1.62..3.82) region: dome/barrel X extends to -0.53 which is INSIDE the chamber footprint (X>-1.13) at Y up to 2.2 > floor 1.62 => D1 pokes through the -X chamber wall into the food chamber.`);
}

console.log('\n=== L. LOCK RAIL / RECEIVER vs BLADE (sheet model, at seat+lock) ===');
{
  const tl=workflowTimeline('12mm');
  const lock=tl.steps.find(s=>s.step.n===6);
  const s=sampleAt(lock.start+lock.dur,'12mm');
  console.log(`  after lock: originLock=${s.originLock} farLock=${s.farLock} bladeExtend=${s.bladeExtend}`);
  // far rail closed centre x = 1.9+0.52-0.28 = 2.14; teeth depth 0.26 -> [2.01,2.27]
  // blade sheet at 2.15±0.028 -> INSIDE rail teeth span: teeth at midpoints between lines; blade sheet is a sheet in YZ plane at x=2.15
  // teeth boxes: x [2.01,2.27] (0.26), y [2.72..3.12]? rail at y=xBankY-0.2=2.92, toothH 0.4 -> [2.72,3.12]; teeth at z=midpoints w 0.0612
  // blade sheet Y [2.57,3.12] X [2.122,2.178] Z [-4.9..0.18]: teeth Z at midpoints (between -1.02..1.02): blade sheet spans all those Z -> sheet collides with EVERY tooth (x ranges overlap, y overlap, z overlap) — teeth are 0.0612 wide in Z, sheet covers Z fully.
  console.log(`  farRailX closed teeth X [2.01,2.27], Y [2.72,3.12], teeth at Z=midlines w=0.061; blade sheet X [2.122,2.178], Y [2.57,3.12], Z [-4.9,0.18] -> sheet PLOWS THROUGH all 14 far-rail teeth (not through slots: the sheet plane is YZ at x≈2.15, the teeth are boxes crossing that plane at z=midpoints).`);
  console.log(`  origin rail closed centre x=-1.9-0.25+0.28=-1.87, teeth X [-2.0,-1.74] — blade sheet at 2.15: no contact with origin rail (grid 'locked' at one end only).`);
  console.log(`  receiver comb centre 2.15 teeth X [2.08,2.22] — same story: sheet passes through teeth.`);
}

console.log('\n=== M. PRODUCE SPAWN vs CHUTE TOP and pusher slot assertion ===');
{
  console.log(`  produce spawns at y=${(GEO.chamber.floorY+0.9+1.6).toFixed(2)} = 4.12; chute spans Y [3.82, 6.4] -> produce materialises INSIDE the chute (not dropped from the lip at 6.4).`);
  console.log(`  carrot half-height ~1.17 (0.8+0.07 tip +leaves ~1.37); at spawn 4.12 top=5.49, bottom=2.95 -> carrot bottom at 2.95 is INSIDE the chamber below the chute mouth (3.82) and ABOVE the blade grid top 3.12 — bottom 2.95 < grid top 3.12: carrot bottom is INSIDE the grid plane even before feed starts (blades parked though: extend comes later — blades extend THROUGH the resting carrot during 'extend'!).`);
  console.log(`  blade tips sweep Z/X sheets through Y [2.57,3.12]; carrot bottom at 2.95 overlaps that band. Blades extend (sweep along X/Z) while the carrot rests at 4.12±1.17 -> blades sweep through the carrot's lower 0.17 during extend phase.`);
  // potato
  console.log(`  potato r=0.52 (scaled 0.78 y): at 4.12 spans Y [3.71,4.53] -> above grid top 3.12: OK, but chute interior is Y>=3.82 — potato bottom 3.71 pokes 0.11 BELOW the chute mouth into the chamber (through the open top, fine) but above blades 3.12. OK.`);
  console.log(`  load-clearance assertion requires pusherY >= contactY while produce entering; pusher bottoms out at contactY=4.3 plate bottom 4.04 vs carrot top 5.28: pusher INTERSECTS the carrot by 1.24 at the 'upper contact stop'. The carrot visibly compresses/clips through the plate.`);
}

console.log('\n=== N. WIPE phase geometry ===');
{
  console.log(`  wipe retracts blades while wiperProgress=k. Wipers are at x=${(GEO.xTravelMin+GEO.parts.wiperOffset).toFixed(2)} (X bank) but the blade SHEETS retract from x=2.15 to x=-2.3: they sweep back across the chamber and past the wiper plane at x=-1.8. Wiper Y span [2.95,3.29] vs blade Y [2.57,3.12]: wiper overlaps blade upper part [2.95,3.12] — squeegee plausible IF blades were strips passing through slots; as sheets they pass THROUGH the solid wiper block (wiper is a solid 0.1 x 0.34 x 2.4 box, NOT slotted: comment at scene.js:294 claims 'squeegee lips' but geometry is a solid bar). Blade sheets pass through the solid wiper box.`);
}

console.log('\n=== O. bin/drawer: pieces fall through chamber floor ===');
{
  console.log(`  pieces pile at bin y=${(GEO.bin.y-GEO.bin.h/2+0.12).toFixed(2)}+, bin is UNDER the chamber floor plate (floor 1.62..1.69, bin rim 1.06). There is NO opening in the floor plate model — cut pieces teleport from the grid (Y~2.6-3.1) into the sealed bin below the solid floor. Crosscut knife also operates below the floor (Y 1.08..1.37): it can never reach sticks that end at the grid (Y≥2.57).`);
}

console.log('\n=== P. slice pattern: feed with no grid ===');
{
  const tl=workflowTimeline('slice');
  const feed=tl.steps.find(s=>s.step.n===7);
  const s=sampleAt(feed.start+feed.dur,'slice');
  console.log(`  slice: pieces after feed=${s.cutPieces.length} kinds=${[...new Set(s.cutPieces.map(p=>p.kind))]} — sticks spawned even though NO blades engaged (selectedIndices=0 => Math.max(1,0)*2=2 sticks) then coins after crosscut=${s.cutPieces[0]?.kind}`);
  const sc=sampleAt(tl.steps.find(x=>x.step.n===8).start+2,'slice');
  console.log(`  after slice crosscut: kinds=${[...new Set(sc.cutPieces.map(p=>p.kind))]}`);
}

console.log('\n=== Q. crosscut dock vs -X chamber wall; rail vs wall ===');
{
  console.log(`  docked knife right end at x=${(GEO.crosscut.dockX+(GEO.chamber.w-0.1)/2).toFixed(2)} (chamber inner face -1.13): clears by ${(-1.13-(GEO.crosscut.dockX+(GEO.chamber.w-0.1)/2)).toFixed(2)}`);
  console.log(`  rail at dock: X [${(GEO.crosscut.dockX-2.3).toFixed(2)},${(GEO.crosscut.dockX+2.3).toFixed(2)}], Y [0.95,1.05]: passes through -X chamber wall (X -1.2..-1.13, Y 1.62..3.82)? rail Y 1.05 < wall bottom 1.62 -> NO (passes under the wall, through the gap between floor plate and plinth? floor bottom 1.62, plinth top 1.1: gap 1.1..1.62; rail at 0.95..1.05 passes through the PLINTH top plate (1.0..1.1)!).`);
  console.log(`  plinth spans X ±2.3 Z ±2.0, Y [0,1.0] + top skin [1.0,1.1]. Rail Y [0.95,1.05] X [-4.65,-0.05] Z ±0.05: intersects plinth top skin for X in [-2.3,-0.05]. The rail slides THROUGH the base top plate.`);
}
