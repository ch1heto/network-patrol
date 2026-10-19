'use strict';
const assert=require('node:assert/strict');
const {fixture}=require('./fixture.cjs'),P=require('../server/content.cjs'),C=P.network.course;
function solution(id,tickets=[]){const m=C.model(id),r={sent:true},T=P.network.topology;
 if(id===2)T.connect(m,'d3','d2');
 if(id===3)r.portsReviewed=true;
 if(id===3)for(const d of m.devices.filter(d=>d.type==='pc'))T.connect(m,d.id,'d2');
 if(id===5||id===6)m.devices[2].ip='192.168.1.20';
 if(id===7){const r=T.add(m,'router');r.interfaces[0].ip='192.168.1.1';r.interfaces[1].ip='192.168.2.1';T.connect(m,'d2',r.id);T.connect(m,r.id,m.devices.find(d=>d.name==='SW-B').id);}
 if(id===8)m.devices[2].gateway='192.168.2.1';
 if(id===9)r.commands=['ping 127.0.0.1','ping 192.168.1.20'];
 if(id===10){const l=m.devices.find(d=>d.type==='laptop');T.connect(m,l.id,'d2');assert.ok(C.dhcp(m,l.id).ok);}
 if(id===11){m.devices[0].dns='192.168.1.100';r.commands=['ping 192.168.1.100','nslookup college.ru','ping college.ru'];}
 return {model:m,response:id===12?{local:true,remote:true,disconnected:true,answer:'remote'}:id===13?['files','dns','dhcp','web','database']:id===14?{tested:['0','1','5'],answer:'backup'}:id===15?tickets.map(cause=>{const model=C.ticket(cause);C.repair(model,cause);return {cause,checks:['link','settings','ping'],fixed:true,model};}):r};
}
const base={location:'lab',completedChapters:[0,1],currentChapter:2,unlockedLocations:['office','corridor','lab','classroom','server'],introComplete:true,networkQuizPassed:true,briefingComplete:true,quizPassed:true,packetDelivered:true,packetQuizPassed:true,xp:100,currentObjective:'complete'};
(async()=>{
 const f=await fixture(),browser=await f.browser();let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
 try{
  const student=await f.student(base);for(const id of [0,1])f.db.prepare('INSERT INTO chapter_results VALUES(?,?,?,?)').run(student.id,id,100,new Date().toISOString());
  let p=(await f.call('/api/student/progress',{cookie:student.cookie})).body.progress;
  const call=async(action,data={})=>{const r=await f.call('/api/student/action',{method:'POST',cookie:student.cookie,data:{action,chapter:p.currentChapter,step:p.course[p.currentChapter].step,...data}});if(r.status===200)p=r.body.progress;return r;};
  eq(p.currentObjective,'course');eq(p.currentChapter,2);
  eq((await call('coursePractice',solution(2))).status,400);
  eq((await call('courseAdvance',{chapter:8})).status,409);
  for(let id=2;id<=15;id++){
    const c=P.data.curriculum[id];eq(p.currentChapter,id);
    const move=await f.call('/api/student/state',{method:'POST',cookie:student.cookie,data:{location:c.location}});eq(move.status,200);
    while(['intro','demo'].includes(C.info(p).stage)||C.info(p).stage.startsWith('theory-')){if([2,5,7].includes(id)&&C.info(p).stage==='demo')eq((await call('courseDemo',{model:C.model(id,true)})).status,200);eq((await call('courseAdvance')).status,200);}
    eq(C.info(p).stage,'training');const wrong=(c.training.answer+1)%c.training.options.length;
    const bad=await call('courseAnswer',{response:wrong});eq(bad.body.correct,false);assert.ok(bad.body.explanation.length>30);checks++;
    eq((await call('courseAnswer',{response:c.training.answer})).body.correct,true);eq(C.info(p).stage,'practical');
    if(id===2){for(const level of [1,2,3,3])eq((await call('courseHint')).body.level,level);}
    if(id===5){const invalid=solution(id);invalid.model.devices[2].ip='192.168.300.20';const r=await call('coursePractice',invalid);eq(r.body.ok,false);assert.ok(r.body.message.includes('255'));checks++;}
    if(id===8){const invalid=solution(id);invalid.model.devices[2].gateway='192.168.1.1';eq((await call('coursePractice',invalid)).body.ok,false);}
    const r=await call('coursePractice',solution(id,p.course[id].tickets));eq(r.body.ok,true);eq(C.info(p).stage,'result');assert.ok(p.completedChapters.includes(id));checks++;
    const xp=p.xp;const repeated=await call('coursePractice',solution(id,p.course[id].tickets));eq(repeated.status,200);eq(repeated.body.ok,true);eq(p.xp,xp);
    eq((await call('courseContinue')).status,200);eq(p.currentChapter,id+1);eq(p.currentObjective,id===15?'courseFinished':'course');
  }
  eq(p.xp,1860);eq(p.completedChapters.length,16);
  const summary=(await f.call(`/api/groups/${f.groupId}`,{cookie:f.teacher})).body.students.find(s=>s.id===student.id);eq(summary.progress,100);eq(summary.results.length,16);assert.ok(summary.topics.filter(t=>t.title).length>=18);checks++;
  const t=C.model(9);eq(C.terminal(t,'ping 127.0.0.1').ok,true);eq(C.terminal(t,'ping 127.0.0.1; whoami').ok,false);eq(C.terminal(t,'nslookup absent.test').ok,false);
  for(const type of C.faults){const m=C.ticket(type);C.repair(m,type);const r=type==='dns'?C.terminal(m,'nslookup college.ru'):C.terminal(m,`ping ${m.devices[2].ip}`);eq(r.ok,true);eq(m.resourceUp,true);}
  // Complete chapters 2–8 in the browser with actual forms, cables and settings.
  const page=await f.page(browser,base,{viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  for(const id of [0,1])f.db.prepare('INSERT INTO chapter_results VALUES(?,?,?,?)').run(page.student.id,id,100,new Date().toISOString());
  await page.goto(f.base+'/index.html');await page.waitForFunction(()=>typeof ready!=='undefined'&&ready);
  const enter=async(id,target)=>{await page.evaluate(id=>{const d=Patrol.engines.locations.current.doors.find(d=>d.id===id);Patrol.runtime.spawnAt(d.x,Patrol.runtime.scene.farY+75);},id);await page.keyboard.press('KeyE');await page.waitForFunction(target=>Patrol.progress.location===target&&!Patrol.engines.locations.transitioning,target);};
  const cable=async(a,b)=>require('./ux-helpers.cjs').cable(page,a,b);
  for(let id=2;id<=8;id++){
   const c=P.data.curriculum[id];if((await page.evaluate(()=>Patrol.progress.location))!==c.location){await enter((await page.evaluate(()=>Patrol.progress.location))==='lab'?'lab-exit':'class-exit','corridor');await enter(c.location==='lab'?'to-lab':'to-class',c.location);}
   eq(await page.locator('.quest-target').getAttribute('data-entity'),c.npc);
   await page.locator('#what-next').click();assert.ok((await page.locator('#overlay-content').textContent()).includes('Шаг')||(await page.locator('#overlay-content').textContent()).length>40);checks++;await page.keyboard.press('Escape');
   await page.evaluate(()=>{const id=Patrol.ui.course.current().c.npc,pos=Patrol.engines.locations.current.npcPositions[id];Patrol.runtime.spawnAt(pos.wx,pos.wy+55);});await page.keyboard.press('KeyE');await page.getByRole('button',{name:'Начать объяснение',exact:true}).click();
   for(const card of c.cards){await page.getByRole('heading',{name:card.title,exact:true}).waitFor();assert.ok((await page.locator('.course-diagram').textContent()).length>5);checks++;await page.getByRole('button',{name:'Показать пример на схеме',exact:true}).click();await page.getByRole('button',{name:'Понятно, следующий шаг',exact:true}).click();}
   await page.getByRole('button',{name:'Посмотреть демонстрацию на стенде',exact:true}).click();eq(await page.getByRole('button',{name:'+ PC',exact:true}).isDisabled(),true);await require('./ux-helpers.cjs').demo(page,id);await page.getByRole('button',{name:'Перейти к тренировке',exact:true}).click();
   await page.locator(`input[name="course-answer"][value="${(c.training.answer+1)%c.training.options.length}"]`).check();await page.getByRole('button',{name:'Проверить ответ',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#overlay-content [role=status]').textContent.length>20);
   await page.locator(`input[name="course-answer"][value="${c.training.answer}"]`).check();await page.getByRole('button',{name:'Проверить ответ',exact:true}).click();await page.getByRole('button',{name:'Перейти к практике',exact:true}).click();await page.getByRole('button',{name:'Открыть Network Lab',exact:true}).click();
   if(id===2)await cable('d3','d2');if(id===3){await cable('d1','d2');await cable('d3','d2');const third=await page.evaluate(()=>Patrol.ui.networkLab.model.devices.find(d=>d.name==='PC-03').id);await cable(third,'d2');await page.locator('[data-device=d2]').click();await page.getByRole('button',{name:'Таблица портов проверена',exact:true}).click();}
   if(id===5){await page.locator('[data-device=d3]').click();for(const [i,v]of ['192','168','1','20'].entries()){await page.getByLabel(`Октет ${i+1} PC-02`,{exact:true}).fill(v);await page.getByLabel(`Октет ${i+1} PC-02`,{exact:true}).press('Tab');}eq(await page.getByLabel('Шлюз',{exact:true}).count(),0);}
   if(id===6){await page.locator('[data-device=d3]').click();await page.getByLabel('IP-адрес',{exact:true}).fill('192.168.1.20');await page.getByLabel('IP-адрес',{exact:true}).press('Tab');}
   if(id===7){await page.getByRole('button',{name:'+ Router',exact:true}).click();eq(await page.getByLabel('IP-адрес',{exact:true}).count(),0);const ids=await page.evaluate(()=>({r:Patrol.ui.networkLab.model.devices.find(d=>d.type==='router').id,s:Patrol.ui.networkLab.model.devices.find(d=>d.name==='SW-B').id}));await cable('d2',ids.r);await cable(ids.r,ids.s);}
   if(id===8){await page.locator('[data-device=d3]').click();await page.getByLabel('Шлюз',{exact:true}).fill('192.168.2.1');await page.getByLabel('Шлюз',{exact:true}).press('Tab');}
   await page.getByRole('button',{name:[3,4].includes(id)?'Отправить данные':'Проверить сеть',exact:true}).click();await page.getByRole('button',{name:'Итоги главы',exact:true}).waitFor();await page.getByRole('button',{name:'Итоги главы',exact:true}).click();assert.ok((await page.locator('#overlay-content').textContent()).includes('XP +120'));checks++;
   await page.screenshot({animations:'disabled',path:`.prototype-checks/course-result-${id}.png`});await page.getByRole('button',{name:'Продолжить',exact:true}).click();await page.waitForFunction(id=>Patrol.progress.currentChapter===id+1,id);eq(await page.evaluate(()=>Patrol.progress.currentObjective),'course');assert.ok((await page.locator('#objective').textContent()).length>10);checks++;
  }
  await page.reload();await page.waitForFunction(()=>typeof ready!=='undefined'&&ready);eq(await page.evaluate(()=>Patrol.progress.currentChapter),9);
  for(let id=9;id<=15;id++){
   const c=P.data.curriculum[id],room=await page.evaluate(()=>Patrol.progress.location);if(room!==c.location){await enter({classroom:'class-exit',lab:'lab-exit',staff:'staff-exit',server:'server-exit'}[room],'corridor');await enter({staff:'to-staff',server:'to-server',classroom:'to-class'}[c.location],c.location);}
   await page.evaluate(()=>{const id=Patrol.ui.course.current().c.npc,pos=Patrol.engines.locations.current.npcPositions[id];Patrol.runtime.spawnAt(pos.wx,pos.wy+55);});await page.keyboard.press('KeyE');await page.getByRole('button',{name:'Начать объяснение',exact:true}).click();for(const card of c.cards){await page.getByRole('heading',{name:card.title,exact:true}).waitFor();await page.getByRole('button',{name:'Показать пример на схеме',exact:true}).click();await page.getByRole('button',{name:'Понятно, следующий шаг',exact:true}).click();}
   await page.getByRole('button',{name:'Перейти к тренировке',exact:true}).click();await page.locator(`input[name="course-answer"][value="${c.training.answer}"]`).check();await page.getByRole('button',{name:'Проверить ответ',exact:true}).click();await page.getByRole('button',{name:'Перейти к практике',exact:true}).click();
   if(id===9||id===11){
    if(id===11){await page.getByRole('button',{name:'Открыть Network Lab',exact:true}).click();await page.locator('[data-device=d1]').click();await page.getByLabel('DNS',{exact:true}).fill('192.168.1.100');await page.getByLabel('DNS',{exact:true}).press('Tab');await page.getByRole('button',{name:'Проверить сеть',exact:true}).click();await page.getByRole('button',{name:'Продолжить в терминале',exact:true}).click();}else await page.getByRole('button',{name:'Открыть учебный терминал',exact:true}).click();
    for(const cmd of id===9?['ping 127.0.0.1','ping 192.168.1.20']:['ping 192.168.1.100','nslookup college.ru','ping college.ru']){await page.getByLabel('Учебная команда').fill(cmd);await page.getByRole('button',{name:'Выполнить',exact:true}).click();}
    await page.screenshot({animations:'disabled',path:`.prototype-checks/course-terminal-${id}.png`});await page.getByRole('button',{name:'Проверить практику',exact:true}).click();
   }
   if(id===10){await page.getByRole('button',{name:'Открыть Network Lab',exact:true}).click();const laptop=await page.evaluate(()=>Patrol.ui.networkLab.model.devices.find(d=>d.type==='laptop').id);await cable(laptop,'d2');await page.locator(`[data-device=${laptop}]`).click();await page.getByRole('button',{name:'Получить настройки DHCP',exact:true}).click();assert.ok((await page.locator('.lab-message').textContent()).includes('ACK'));checks++;await page.getByRole('button',{name:'Проверить сеть',exact:true}).click();await page.getByRole('button',{name:'Итоги главы',exact:true}).click();}
   if(id===12){await page.getByRole('button',{name:'Сохранить example.txt на C:',exact:true}).click();await page.getByRole('button',{name:'Сохранить example.txt на Z:',exact:true}).click();await page.getByRole('button',{name:'Отключить сеть',exact:true}).click();await page.getByLabel('Почему Z: пропал?').selectOption('remote');}
   if(id===13){for(const [i,v]of ['files','dns','dhcp','web','database'].entries())await page.locator('.course-scenario select').nth(i).selectOption(v);}
   if(id===14){for(const level of ['0','1','5'])await page.getByRole('button',{name:`Отказ одного диска RAID ${level}`,exact:true}).click();await page.getByLabel('Защита от случайного удаления').selectOption('backup');}
   if(id===15){const tickets=await page.evaluate(()=>Patrol.progress.course[15].tickets);for(const [i,cause]of tickets.entries()){const t=page.locator('.shift-ticket').nth(i);await t.getByRole('button',{name:'Link и кабель',exact:true}).click();await t.getByRole('button',{name:'Настройки ПК',exact:true}).click();await page.getByLabel(`Причина заявки ${i+1}`).selectOption(cause);await t.getByRole('button',{name:'Применить выбранное исправление и проверить',exact:true}).click();}await page.screenshot({animations:'disabled',path:'.prototype-checks/course-final-shift.png'});}
   if(id>=12)await page.getByRole('button',{name:'Проверить практику',exact:true}).click();
   await page.getByRole('button',{name:'Продолжить',exact:true}).waitFor();assert.ok((await page.locator('#overlay-content').textContent()).includes('Результат'));checks++;await page.getByRole('button',{name:'Продолжить',exact:true}).click();await page.waitForFunction(id=>Patrol.progress.currentChapter===id+1,id);
  }
  eq(await page.evaluate(()=>Patrol.progress.currentChapter),16);eq(await page.evaluate(()=>Patrol.progress.xp),1860);await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await page.locator('#what-next').click();eq(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({animations:'disabled',path:'.prototype-checks/course-mobile-instructions.png'});eq(errors,[]);
  console.log(`PASS: ${checks} curriculum checks; chapters 2–15 API and full browser lessons/practice/results/routes, legacy chapter 1 in playthrough, errors/3 hints/gating, XP once, teacher reporting, terminal isolation, final faults, reload/mobile`);
 }finally{await browser.close();await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
