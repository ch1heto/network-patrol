'use strict';
const assert=require('node:assert/strict'),{fixture}=require('./fixture.cjs'),{P,N,progress}=require('./state-helpers.cjs');
(async()=>{const f=await fixture(),browser=await f.browser(),errors=[];let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
try{
 const boot=async(state={},options={})=>{const p=await f.page(browser,state,options);p.on('pageerror',e=>errors.push(e.message));return p;};
 const load=async p=>{await p.goto(f.base+'/index.html');await p.waitForFunction(()=>Patrol.runtime?.ready);};
 const complete={briefingComplete:true,quizPassed:true,introComplete:true,networkQuizPassed:true,packetDelivered:true,packetQuizPassed:true,unlockedLocations:['office','corridor','lab','classroom','staff','server'],ux:{labTutorialSeen:true}};
 // Hold image downloads while exercising every entry point and input before readiness.
 const slow=await boot();let release;const gate=new Promise(r=>release=r);
 await slow.route('**/assets/{idle,run}.webp',async route=>{await gate;await route.continue();});
 await slow.goto(f.base+'/index.html',{waitUntil:'domcontentloaded'});
 eq(await slow.evaluate(()=>Patrol.runtime.ready),false);
 for(const id of ['what-next','show-target','map-button','lab-button'])await slow.locator('#'+id).click();
 eq(await slow.evaluate(()=>{Patrol.engines.npcs.update(0);Patrol.runtime.setBlocked(true);Patrol.runtime.setBlocked(false);return Patrol.engines.ui.open({title:'До загрузки'});}),false);
 await slow.keyboard.down('KeyD');release();await slow.waitForFunction(()=>Patrol.runtime.ready);await slow.waitForTimeout(150);
 eq(await slow.evaluate(()=>moving),false,'held startup key must not move player');await slow.keyboard.up('KeyD');
 // Modal close and repeated keydown cannot re-activate a key pressed in the modal.
 await slow.evaluate(()=>Patrol.engines.ui.showHelp());await slow.keyboard.down('KeyD');await slow.keyboard.press('Escape');
 await slow.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD',repeat:true,bubbles:true})));
 eq(await slow.evaluate(()=>moving),false);await slow.keyboard.up('KeyD');
 await slow.keyboard.down('KeyD');await slow.waitForFunction(()=>moving);eq(await slow.evaluate(()=>moving),true);await slow.keyboard.up('KeyD');
 await slow.evaluate(()=>{Patrol.engines.ui.showHelp();Patrol.engines.ui.toast('Проверка видимости');});
 eq(await slow.locator('#toast').evaluate(n=>!!n.closest('dialog[open]')),true);await slow.keyboard.press('Escape');
 eq(await slow.locator('#toast').evaluate(n=>n.parentElement.id),'room');
 // All room transitions including exiting 218 clear held inputs and recreate scene/NPCs.
 const world=await boot({...complete,currentChapter:16,completedChapters:Array.from({length:16},(_,i)=>i),location:'corridor'});await load(world);
 for(const [door,room,exit]of [['to-office','office','office-exit'],['to-lab','lab','lab-exit'],['to-class','classroom','class-exit'],['to-staff','staff','staff-exit'],['to-server','server','server-exit']]){
   const enter=async id=>{await world.evaluate(id=>{const d=Patrol.engines.locations.current.doors.find(d=>d.id===id);Patrol.runtime.spawnAt(d.x,Patrol.runtime.scene.farY+65);Patrol.engines.locations.enter(d);},id);await world.waitForFunction(()=>!Patrol.engines.locations.transitioning);};
   await enter(door);eq(await world.evaluate(()=>Patrol.progress.location),room);eq(await world.locator('.npc').count(),1);
   eq(await world.evaluate(()=>Patrol.runtime.blocked),false);eq(await world.evaluate(()=>moving),false);
   // Boundary dialogues belong to the corridor, not the walls of a classroom.
   await world.evaluate(()=>{const s=Patrol.runtime.scene;Patrol.runtime.spawnAt(0,1100);});await world.keyboard.down('KeyA');await world.waitForTimeout(500);await world.keyboard.up('KeyA');eq(await world.locator('#overlay').evaluate(n=>n.open),false);
   await enter(exit);eq(await world.evaluate(()=>Patrol.progress.location),'corridor');
 }
 await world.evaluate(()=>Patrol.engines.save.flush());await world.reload();await world.waitForFunction(()=>Patrol.runtime.ready);eq(await world.evaluate(()=>Patrol.progress.location),'corridor');
 // Full three-digit octets fit, and clicking Save after editing a field survives blur.
 const ip=await boot({...progress(5),...complete},{viewport:{width:390,height:844},isMobile:true,hasTouch:true});await load(ip);
 await ip.evaluate(()=>Patrol.ui.course.open());await ip.getByRole('button',{name:'Открыть Network Lab',exact:true}).click();await ip.locator('[data-device=d3]').click();
 for(const [i,v]of ['192','168','1','123'].entries())await ip.getByLabel(`Октет ${i+1} PC-02`,{exact:true}).fill(v);
 await ip.getByRole('button',{name:'Сохранить настройки',exact:true}).click();eq(await ip.evaluate(()=>Patrol.ui.networkLab.model.devices[2].ip),'192.168.1.123');
 await ip.locator('[data-task-guide] details').evaluate(n=>n.open=true);
 await ip.getByLabel('Октет 1 PC-02',{exact:true}).evaluate(n=>n.scrollIntoView({block:'start'}));
 eq(await ip.getByLabel('Октет 1 PC-02',{exact:true}).evaluate(n=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n;}),true,'expanded instruction cannot cover IP input');
 await ip.screenshot({path:'.prototype-checks/student-feedback-octets.png'});
 eq(await ip.locator('.ip-octets input').evaluateAll(inputs=>inputs.every(n=>{const s=getComputedStyle(n),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=`${s.fontSize} ${s.fontFamily}`;return n.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)>=ctx.measureText('255').width;})),true);
 await ip.evaluate(()=>Patrol.engines.save.flush());await ip.reload();await ip.waitForFunction(()=>Patrol.runtime.ready);eq(await ip.evaluate(()=>Patrol.progress.course[5].model.devices[2].ip),'192.168.1.123');
 const dns=await boot({...progress(11),...complete});await load(dns);await dns.evaluate(()=>Patrol.ui.course.open());await dns.getByRole('button',{name:'Открыть Network Lab',exact:true}).click();await dns.locator('[data-device=d1]').click();
 await dns.getByLabel('DNS',{exact:true}).fill('192.168.1.100');await dns.getByRole('button',{name:'Сохранить настройки',exact:true}).click();eq(await dns.locator('.lab-message').textContent().then(t=>t.includes('Настройки сохранены')),true);
 // Delay hint response, edit again, and verify the server reply does not overwrite the new draft.
 let releaseHint,arrived;const hintGate=new Promise(r=>releaseHint=r),seen=new Promise(r=>arrived=r);
 await dns.route('**/api/student/action',async route=>{if(route.request().postDataJSON().action==='courseHint'){const response=await route.fetch();arrived();await hintGate;await route.fulfill({response});}else await route.continue();});
 await dns.getByRole('button',{name:'Нужна подсказка',exact:true}).click();await seen;
 await dns.getByLabel('DNS',{exact:true}).fill('192.168.1.123');await dns.getByLabel('DNS',{exact:true}).press('Tab');releaseHint();await dns.evaluate(()=>Patrol.engines.save.pending);
 eq(await dns.evaluate(()=>Patrol.progress.course[11].model.devices[0].dns),'192.168.1.123');await dns.evaluate(()=>Patrol.engines.save.flush());await dns.reload();await dns.waitForFunction(()=>Patrol.runtime.ready);eq(await dns.evaluate(()=>Patrol.progress.course[11].model.devices[0].dns),'192.168.1.123');
 // Step 6/7: check button stays inside the dialog at both desktop and phone sizes.
 const finalProgress={...progress(15),...complete};finalProgress.course[15].tickets=['dhcp','dns','gateway'];
 const shift=await boot(finalProgress,{viewport:{width:1280,height:800}});await load(shift);await shift.evaluate(()=>Patrol.ui.course.open());
 const accessible=async()=>{const check=shift.getByRole('button',{name:'Проверить практику',exact:true});eq(await check.isEnabled(),true);eq(await check.evaluate(n=>{const r=n.getBoundingClientRect(),modal=n.closest('dialog').getBoundingClientRect();return r.top>=modal.top&&r.bottom<=modal.bottom&&r.bottom<=innerHeight;}),true);};
 await accessible();await shift.setViewportSize({width:390,height:844});await accessible();
 await shift.screenshot({path:'.prototype-checks/student-feedback-shift-mobile.png'});
 // One wrong hypothesis, recovery without reset, F5 with actual observations, and completion.
 const ticket=shift.locator('.shift-ticket').first();await ticket.getByRole('button',{name:'Link и кабель',exact:true}).click();await ticket.getByRole('button',{name:'Настройки ПК',exact:true}).click();
 await shift.getByLabel('Причина заявки 1').selectOption('ip');await ticket.getByRole('button',{name:'Применить выбранное исправление и проверить',exact:true}).click();
 eq(await shift.evaluate(()=>Patrol.progress.course[15].draft.tickets[0].fixed),false,'manual IP cannot substitute DHCP lease');
 await shift.evaluate(()=>Patrol.engines.save.flush());await shift.reload();await shift.waitForFunction(()=>Patrol.runtime.ready);await shift.evaluate(()=>Patrol.ui.course.open());eq(await shift.locator('.shift-ticket').first().locator('pre').textContent().then(t=>t.includes('Настройки ПК')),true);
 for(const [i,cause]of ['dhcp','dns','gateway'].entries()){
   const t=shift.locator('.shift-ticket').nth(i);for(const name of ['Link и кабель','Настройки ПК'])await t.getByRole('button',{name,exact:true}).click();
   await shift.getByLabel(`Причина заявки ${i+1}`).selectOption(cause);await t.getByRole('button',{name:'Применить выбранное исправление и проверить',exact:true}).click();
   eq(await shift.evaluate(i=>Patrol.progress.course[15].draft.tickets[i].fixed,i),true);
 }
 await accessible();await shift.getByRole('button',{name:'Проверить практику',exact:true}).click();await shift.getByRole('button',{name:'Продолжить',exact:true}).waitFor();
 await shift.getByRole('button',{name:'Продолжить',exact:true}).click();await shift.waitForFunction(()=>Patrol.progress.currentChapter===16);await shift.evaluate(()=>Patrol.engines.save.flush());await shift.reload();await shift.waitForFunction(()=>Patrol.runtime.ready);eq(await shift.evaluate(()=>Patrol.progress.currentChapter),16);
 eq(errors,[]);console.log(`PASS: ${checks} student feedback UI checks; delayed startup, modals/input, all doors, octets, delayed saves and chapter 15`);
}finally{await browser.close();await f.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
