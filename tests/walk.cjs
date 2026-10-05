'use strict';
// Route calculation is read-only. Movement uses the production keyboard/RAF/collision loop.
const assert=require('node:assert/strict');
async function walk(page,target){
 const path=await page.evaluate(goal=>{const s=Patrol.runtime.scene,start=Patrol.runtime.point,areas=Patrol.engines.collisions.areas,step=30;
 const valid=(x,y)=>{if(y<s.farY+25||y>s.nearY-25)return false;const dep=(y-s.farY)/(s.nearY-s.farY),edge=s.farLeft+(s.nearLeft-s.farLeft)*dep+s.playerWidth*.38*(.75+.25*dep)+10;return x>edge&&x<s.width-edge&&!areas.some(a=>x>a.x-25&&x<a.x+a.w+25&&y>a.y-25&&y<a.y+a.h+25);};
 const points=[];for(let y=s.farY+30;y<s.nearY-25;y+=step)for(let x=30;x<s.width-30;x+=step)if(valid(x,y))points.push({x,y});
 const near=p=>points.reduce((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)<Math.hypot(b.x-p.x,b.y-p.y)?a:b),a=near(start),b=near(goal),key=p=>p.x+','+p.y,map=new Map(points.map(p=>[key(p),p])),queue=[a],prev=new Map([[key(a),null]]);
 for(let i=0;i<queue.length&&!prev.has(key(b));i++){const p=queue[i];for(const [dx,dy]of [[step,0],[-step,0],[0,step],[0,-step]]){const n=map.get((p.x+dx)+','+(p.y+dy));if(n&&!prev.has(key(n))){prev.set(key(n),p);queue.push(n);}}}
 if(!prev.has(key(b)))throw Error('No walkable route to '+JSON.stringify(goal));const route=[];let n=b;while(n){route.unshift(n);n=prev.get(key(n));}const compressed=[route[0]];for(let i=1;i<route.length-1;i++){const p=route[i-1],q=route[i],r=route[i+1];if(q.x-p.x!==r.x-q.x||q.y-p.y!==r.y-q.y)compressed.push(q);}compressed.push(b);return compressed;
 },target);
 for(const point of path){for(const axis of ['x','y']){const from=await page.evaluate(()=>Patrol.runtime.point),delta=point[axis]-from[axis];if(Math.abs(delta)<8)continue;const positive=delta>0,k=axis==='x'?(positive?'KeyD':'KeyA'):(positive?'KeyS':'KeyW');await page.keyboard.down(k);try{await page.waitForFunction(({axis,wanted,positive})=>positive?Patrol.runtime.point[axis]>=wanted-5:Patrol.runtime.point[axis]<=wanted+5,{axis,wanted:point[axis],positive},{timeout:15000});}finally{await page.keyboard.up(k);}}}
 const end=await page.evaluate(()=>Patrol.runtime.point);assert.ok(Math.hypot(end.x-target.x,end.y-target.y)<80,'Walk did not reach interaction target');
}
async function door(page,id){const target=await page.evaluate(id=>{const d=Patrol.engines.locations.current.doors.find(d=>d.id===id);return {x:d.x,y:Patrol.runtime.scene.farY+75,room:d.target};},id);await walk(page,target);await page.keyboard.press('KeyE');await page.waitForFunction(room=>Patrol.progress.location===room&&!Patrol.engines.locations.transitioning,target.room);}
async function talk(page){const target=await page.evaluate(()=>{const t=Patrol.ui.taskGuide.current(),p=Patrol.engines.npcs.pointFor(t.targetId);return {x:p.x,y:p.y+55};});await walk(page,target);await page.keyboard.press('KeyE');}
module.exports={walk,door,talk};
