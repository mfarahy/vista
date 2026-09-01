import { readFileSync } from 'node:fs';
import { normalizeGeometry } from './src/lib/floorplan-pipeline/normalize.ts';
import { detectRooms } from './src/lib/floorplan-pipeline/rooms.ts';
import { buildFloorPlan3DModel } from './src/lib/floorplan-pipeline/model3d.ts';

const g = JSON.parse(readFileSync('src/lib/floorplan-pipeline/fixtures/recognition-c658e915-9247-4904-8032-717dd11ecfdd.json','utf8'));
const plan = normalizeGeometry(g,50);
detectRooms(plan);
const model = buildFloorPlan3DModel(plan);
const walls = plan.walls;

function pointToSeg(p,a,b){
  const dx=b.x-a.x, dy=b.y-a.y; const len2=dx*dx+dy*dy; if(len2===0) return Math.hypot(p.x-a.x,p.y-a.y);
  let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/len2; t=Math.max(0,Math.min(1,t)); return Math.hypot(p.x-(a.x+t*dx), p.y-(a.y+t*dy));
}
function segDist(a,b){
  return Math.min(Math.hypot(a.from.x-b.from.x,a.from.y-b.from.y), Math.hypot(a.from.x-b.to.x,a.from.y-b.to.y), Math.hypot(a.to.x-b.from.x,a.from.y-b.from.y), Math.hypot(a.to.x-b.to.x,a.from.y-b.to.y));
}
function segmentsIntersect(a,b){
  const p1=a.from,p2=a.to,q1=b.from,q2=b.to;
  function orient(p,q,r){ const v=(q.y-p.y)*(r.x-q.x)-(q.x-p.x)*(r.y-q.y); return v===0?0:(v>0?1:2);}
  function onSeg(p,q,r){ return q.x<=Math.max(p.x,r.x)&&q.x>=Math.min(p.x,r.x)&&q.y<=Math.max(p.y,r.y)&&q.y>=Math.min(p.y,r.y);}
  const o1=orient(p1,p2,q1), o2=orient(p1,p2,q2), o3=orient(q1,q2,p1), o4=orient(q1,q2,p2);
  if(o1!==o2 && o3!==o4) return true;
  if(o1===0&&onSeg(p1,q1,p2)) return true;
  if(o2===0&&onSeg(p1,q2,p2)) return true;
  if(o3===0&&onSeg(q1,p1,q2)) return true;
  if(o4===0&&onSeg(q1,p2,q2)) return true;
  return false;
}
function wallPoly(w){
  const dx=w.to.x-w.from.x, dy=w.to.y-w.from.y; const len=Math.hypot(dx,dy)||1; const nx=-dy/len, ny=dx/len; const hw=w.thickness/2;
  return [{x:w.from.x+nx*hw,y:w.from.y+ny*hw},{x:w.from.x-nx*hw,y:w.from.y-ny*hw},{x:w.to.x-nx*hw,y:w.to.y-ny*hw},{x:w.to.x+nx*hw,y:w.to.y+ny*hw}];
}
function rectsOverlap(r1,r2){
  const b1={minX:Math.min(...r1.map(p=>p.x)),maxX:Math.max(...r1.map(p=>p.x)),minY:Math.min(...r1.map(p=>p.y)),maxY:Math.max(...r1.map(p=>p.y))};
  const b2={minX:Math.min(...r2.map(p=>p.x)),maxX:Math.max(...r2.map(p=>p.x)),minY:Math.min(...r2.map(p=>p.y)),maxY:Math.max(...r2.map(p=>p.y))};
  return !(b1.maxX < b2.minX || b1.minX > b2.maxX || b1.maxY < b2.minY || b1.minY > b2.maxY);
}
console.log('=== ADVANCED CONNECTIVITY (endpoint + T-junction + thickness + intersect + collinear) ===');
const conns=[];
for(let i=0;i<walls.length;i++) for(let j=i+1;j<walls.length;j++){
  const a=walls[i], b=walls[j];
  const ep=segDist(a,b);
  const epClose=ep<=8;
  const tj=Math.min(pointToSeg(a.from,b.from,b.to), pointToSeg(a.to,b.from,b.to), pointToSeg(b.from,a.from,a.to), pointToSeg(b.to,a.from,a.to)) <= Math.max(a.thickness,b.thickness)/2 + 4;
  const inter=segmentsIntersect(a,b);
  const thick=rectsOverlap(wallPoly(a), wallPoly(b));
  // collinear
  let collinear=false;
  const angA=Math.atan2(a.to.y-a.from.y,a.to.x-a.from.x), angB=Math.atan2(b.to.y-b.from.y,b.to.x-b.from.x);
  let d=Math.abs(angA-angB)%Math.PI; d=Math.min(d,Math.PI-d); const angDeg=d*180/Math.PI;
  if(angDeg<7){
    const dx=a.to.x-a.from.x, dy=a.to.y-a.from.y; const len=Math.hypot(dx,dy)||1; const nx=-dy/len, ny=dx/len;
    const midA={x:(a.from.x+a.to.x)/2,y:(a.from.y+a.to.y)/2}, midB={x:(b.from.x+b.to.x)/2,y:(b.from.y+b.to.y)/2};
    const perp=Math.abs((midB.x-midA.x)*nx + (midB.y-midA.y)*ny);
    if(perp <= Math.max(a.thickness,b.thickness)){
      const ux=dx/len, uy=dy/len;
      const tA0=a.from.x*ux+a.from.y*uy, tA1=a.to.x*ux+a.to.y*uy, tB0=b.from.x*ux+b.from.y*uy, tB1=b.to.x*ux+b.to.y*uy;
      const overlap=Math.min(Math.max(tA0,tA1),Math.max(tB0,tB1)) - Math.max(Math.min(tA0,tA1),Math.min(tB0,tB1));
      if(overlap> -6) collinear=true;
    }
  }
  const connected = epClose||tj||inter||thick||collinear;
  if(connected){
    const rs=[]; if(epClose)rs.push('endpoint'); if(tj)rs.push('T'); if(inter)rs.push('intersect'); if(thick)rs.push('thick'); if(collinear)rs.push('collinear');
    conns.push([i,j,rs.join('+'),ep.toFixed(1)]);
    console.log(`${a.id} <-> ${b.id} ep=${ep.toFixed(1)} [${rs.join('+')}]`);
  }
}
// build components with advanced connectivity
const n=walls.length;
const adj=Array.from({length:n},()=>[]);
 // redo adj building
for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){
  const a=walls[i],b=walls[j];
  const ep=segDist(a,b);
  const tj=Math.min(pointToSeg(a.from,b.from,b.to), pointToSeg(a.to,b.from,b.to), pointToSeg(b.from,a.from,a.to), pointToSeg(b.to,a.from,a.to)) <= Math.max(a.thickness,b.thickness)/2 + 4;
  const inter=segmentsIntersect(a,b);
  const thick=rectsOverlap(wallPoly(a), wallPoly(b));
  let collinear=false;
  const angA=Math.atan2(a.to.y-a.from.y,a.to.x-a.from.x), angB=Math.atan2(b.to.y-b.from.y,b.to.x-b.from.x);
  let d=Math.abs(angA-angB)%Math.PI; d=Math.min(d,Math.PI-d); const angDeg=d*180/Math.PI;
  if(angDeg<7){
    const dx=a.to.x-a.from.x, dy=a.to.y-a.from.y; const len=Math.hypot(dx,dy)||1; const nx=-dy/len, ny=dx/len;
    const midA={x:(a.from.x+a.to.x)/2,y:(a.from.y+a.to.y)/2}, midB={x:(b.from.x+b.to.x)/2,y:(b.from.y+b.to.y)/2};
    const perp=Math.abs((midB.x-midA.x)*nx + (midB.y-midA.y)*ny);
    if(perp <= Math.max(a.thickness,b.thickness)){
      const ux=dx/len, uy=dy/len;
      const tA0=a.from.x*ux+a.from.y*uy, tA1=a.to.x*ux+a.to.y*uy, tB0=b.from.x*ux+b.from.y*uy, tB1=b.to.x*ux+b.to.y*uy;
      const overlap=Math.min(Math.max(tA0,tA1),Math.max(tB0,tB1)) - Math.max(Math.min(tA0,tA1),Math.min(tB0,tB1));
      if(overlap> -6) collinear=true;
    }
  }
  if(ep<=8||tj||inter||thick||collinear){ adj[i].push(j); adj[j].push(i); }
}
const visited=new Array(n).fill(false);
const comps=[];
for(let i=0;i<n;i++) if(!visited[i]){ const stack=[i]; visited[i]=true; const comp=[]; while(stack.length){const u=stack.pop(); comp.push(u); for(const v of adj[u]) if(!visited[v]){visited[v]=true; stack.push(v);}} comps.push(comp); }
console.log(`Advanced components: ${comps.length}`);
comps.sort((a,b)=>b.length-a.length).forEach((comp,idx)=>{
  const ids=comp.map(i=>walls[i].id).join(', ');
  console.log(`  Comp ${idx+1} (${comp.length}): ${ids}`);
  const ex=comp.filter(i=>walls[i].exterior).map(i=>walls[i].id); if(ex.length) console.log(`    exterior: ${ex.join(', ')}`);
});
console.log('\n=== WALL -> RECOGNITION POLYGON MAPPING ===');
const rawPolys = g.wall;
for(const w of walls){
  // find which raw polygon exactly equals w.polygon by reference? In normalize, polygon is stored as raw polygon slice - check overlap via bounds
  let bestIdx=-1; let bestArea=0;
  for(let pi=0;pi<rawPolys.length;pi++){
    const poly=rawPolys[pi];
    // check if w.polygon point is inside raw polygon bounds?
    const xs=poly.map(p=>p[0]), ys=poly.map(p=>p[1]);
    const bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
    // does wall center midpoint lie inside raw polygon? cheap test: bounds contains midpoint
    const mid={x:(w.from.x+w.to.x)/2,y:(w.from.y+w.to.y)/2};
    if(mid.x>=bounds[0]&&mid.x<=bounds[2]&&mid.y>=bounds[1]&&mid.y<=bounds[3]){ bestIdx=pi; break; }
  }
  const xs=w.polygon.map(p=>p.x), ys=w.polygon.map(p=>p.y);
  console.log(`${w.id}: len=${Math.hypot(w.to.x-w.from.x,w.to.y-w.from.y).toFixed(0)} thick=${w.thickness.toFixed(1)} polyPts=${w.polygon.length} rawPoly=${bestIdx} rawBounds=[${Math.min(...xs).toFixed(0)},${Math.min(...ys).toFixed(0)}]-[${Math.max(...xs).toFixed(0)},${Math.max(...ys).toFixed(0)}] from=(${w.from.x.toFixed(0)},${w.from.y.toFixed(0)}) to=(${w.to.x.toFixed(0)},${w.to.y.toFixed(0)}) exterior=${w.exterior}`);
}
console.log('\n=== ROOM VALIDATION ===');
for(const r of plan.rooms){
  const xs=r.polygon.map(p=>p.x), ys=r.polygon.map(p=>p.y);
  console.log(`${r.id} exterior=${r.exterior} hint=${r.hint} area=${r.area.toFixed(0)} (${r.areaM2.toFixed(1)}m2) bounds=[${Math.min(...xs).toFixed(0)},${Math.min(...ys).toFixed(0)}]-[${Math.max(...xs).toFixed(0)},${Math.max(...ys).toFixed(0)}] pts=${r.polygon.length}`);
  // check if room polygon overlaps wall thickness rect
  let wallOverlap=false;
  for(const w of walls){
    const rect=wallPoly(w);
    // check centroid inside room? just sample centroid
    const cx=(rect[0].x+rect[1].x+rect[2].x+rect[3].x)/4, cy=(rect[0].y+rect[1].y+rect[2].y+rect[3].y)/4;
    // simple pointInPoly for room
    let inside=false; const poly=r.polygon;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){
      const a=poly[i], b=poly[j];
      if(a.y>cy !== b.y>cy && cx < (b.x-a.x)*(cy-a.y)/(b.y-a.y)+a.x) inside=!inside;
    }
    if(inside) { wallOverlap=true; break; }
  }
  console.log(`  wall overlap? ${wallOverlap}`);
}
console.log('\n=== OPENINGS ===');
for(const o of plan.openings){
  console.log(`${o.id} kind=${o.kind} from=(${o.from.x.toFixed(0)},${o.from.y.toFixed(0)}) to=(${o.to.x.toFixed(0)},${o.to.y.toFixed(0)}) width=${o.width.toFixed(0)} wallId=${o.wallId} rooms=${o.roomIds.join(',')}`);
}
