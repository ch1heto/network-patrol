'use strict';
const assert=require('node:assert/strict'),{fixture}=require('./fixture.cjs');
(async()=>{const f=await fixture(),browser=await f.browser(),errors=[];let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};try{
 const boot=async location=>{const p=await f.page(browser,{currentChapter:16,completedChapters:Array.from({length:16},(_,i)=>i),location,unlockedLocations:['office','corridor','lab','classroom','staff','server']});p.on('pageerror',e=>errors.push(e.message));
   await p.addInitScript(()=>{window.clock=0;window.requestAnimationFrame=cb=>{window.frame=cb;return 1;};window.advance=n=>{for(let i=0;i<n;i++){clock+=1000/60;frame(clock);}};});
   await p.goto(f.base+'/index.html');await p.waitForFunction(()=>Patrol.runtime.ready,null,{polling:20});return p;};
 const p=await boot('office');await p.evaluate(()=>{Patrol.runtime.spawnAt(650,1100);advance(1);});await p.keyboard.down('KeyD');await p.evaluate(()=>advance(10));eq(await p.evaluate(()=>moving),true);
 // No keyup arrives while the menu is open. A bubbling contextmenu alone must stop input.
 await p.evaluate(()=>window.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,button:2})));
 const stopped=await p.evaluate(()=>Patrol.runtime.point);eq(await p.evaluate(()=>({held:inputs.size,x:movementX,y:movementY,moving})),{held:0,x:0,y:0,moving:false});
 await p.evaluate(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD',repeat:true}));advance(90);});eq(await p.evaluate(()=>Patrol.runtime.point),stopped,'autorrepeat after menu cannot resume lost key');
 await p.keyboard.up('KeyD');await p.keyboard.down('KeyD');await p.evaluate(()=>advance(10));eq(await p.evaluate(()=>moving),true,'fresh press resumes movement');
 await p.mouse.click(500,650,{button:'right'});eq(await p.evaluate(()=>inputs.size),0,'real right click clears WASD');
 await p.keyboard.up('KeyD');await p.keyboard.press('Escape');await p.evaluate(()=>advance(20));eq(await p.evaluate(()=>moving),false);
 // Pointer input and pressed-button indication are also reset, even if a child cancels the menu.
 await p.evaluate(()=>{press('pointer:right:42',directions.right);advance(2);const button=document.querySelector('[data-direction=right]');button.addEventListener('contextmenu',e=>e.stopPropagation(),{once:true});button.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));});
 eq(await p.evaluate(()=>({held:inputs.size,pressed:document.querySelector('[data-direction=right]').classList.contains('pressed'),moving})),{held:0,pressed:false,moving:false});await p.close();
 // Collision and clamp physics stay intact: hold each wall for two simulated seconds.
 for(const room of ['office','lab','classroom','staff','server']){
   const p=await boot(room);
   for(const [side,key]of [['left','KeyA'],['right','KeyD'],['up','KeyW'],['down','KeyS']]){
     await p.evaluate(side=>{const s=Patrol.runtime.scene;Patrol.runtime.spawnAt(side==='left'?0:side==='right'?s.width:1400,side==='up'?s.farY:side==='down'?s.nearY:1100);advance(1);},side);
     const before=await p.evaluate(()=>Patrol.runtime.point);await p.keyboard.down(key);await p.evaluate(()=>advance(120));
     eq(await p.evaluate(()=>Patrol.runtime.point),before,room+' '+side+' clamp unchanged');
     eq(await p.evaluate(()=>({moving,state,idle:lastDrawn.startsWith('idle:'),held:inputs.size,open:Patrol.engines.ui.isOpen})),{moving:false,state:'IDLE',idle:true,held:1,open:false},room+' '+side+' idle at wall, no boundary dialogue');
     await p.keyboard.up(key);
   }
   await p.evaluate(()=>{Patrol.runtime.spawnAt(1400,Patrol.runtime.scene.farY);advance(1);});await p.keyboard.down('KeyW');await p.keyboard.down('KeyD');await p.evaluate(()=>advance(30));
   eq(await p.evaluate(()=>moving),true,room+' diagonal slides along wall');eq(await p.evaluate(()=>Patrol.runtime.point.y===Patrol.runtime.scene.farY),true);await p.keyboard.up('KeyW');await p.keyboard.up('KeyD');
   await p.evaluate(()=>{Patrol.runtime.spawnAt(0,1100);advance(1);});await p.keyboard.down('KeyA');await p.evaluate(()=>advance(3));await p.keyboard.down('KeyD');await p.evaluate(()=>advance(3));eq(await p.evaluate(()=>moving),true,'direction away from wall runs');await p.keyboard.up('KeyD');await p.keyboard.up('KeyA');
   await p.close();
 }
 // Furniture also stops the run atlas, without clearing the user's movement intent.
 const furniture=await boot('office');await furniture.evaluate(()=>{Patrol.runtime.spawnAt(1280,1050);advance(1);});await furniture.keyboard.down('KeyW');await furniture.evaluate(()=>advance(120));
 eq(await furniture.evaluate(()=>Patrol.runtime.point.y),957);eq(await furniture.evaluate(()=>moving),false);await furniture.keyboard.up('KeyW');await furniture.close();
 // Corridor boundary dialogues still work although actual movement at the wall is zero.
 for(const [side,key,npc]of [['left','KeyA','Диспетчер расписания'],['right','KeyD','Директор'],['up','KeyW','Преподаватели']]){
   const p=await boot('corridor');await p.evaluate(side=>{const s=Patrol.runtime.scene;Patrol.runtime.spawnAt(side==='left'?0:side==='right'?s.width:1400,side==='up'?s.farY:1100);advance(1);},side);
   await p.keyboard.down(key);await p.evaluate(()=>advance(30));eq(await p.evaluate(()=>Patrol.engines.ui.isOpen),true,'corridor '+side+' dialogue');eq(await p.locator('#overlay-title').textContent(),npc);eq(await p.evaluate(()=>moving),false);await p.keyboard.up(key);await p.close();
 }
 eq(errors,[]);console.log(`PASS: ${checks} input/animation checks; context menu and missed keyup, pointer reset, all room walls, sliding/escape, furniture idle and corridor-only dialogues`);
}finally{await browser.close();await f.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
