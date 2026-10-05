'use strict';
const {fixture}=require('./fixture.cjs');
const assert=require('node:assert/strict');
(async()=>{
  const f=await fixture(),browser=await f.browser(),errors=[];
  try {
    const progress={completedChapters:[0,1],currentChapter:16,currentObjective:'courseFinished',introComplete:true,networkQuizPassed:true,briefingComplete:true,quizPassed:true,packetDelivered:true,packetQuizPassed:true,xp:100,unlockedLocations:['office','corridor','lab','classroom']};
    const boot=async(location,touch=false)=>{
      const p=await f.page(browser,{...progress,location},{viewport:touch?{width:390,height:844}:{width:1280,height:800},hasTouch:touch,isMobile:touch});
      for(const chapter of [0,1])f.db.prepare('INSERT INTO chapter_results VALUES(?,?,?,?)').run(p.student.id,chapter,100,new Date().toISOString());
      p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
      await p.goto(f.base+'/index.html');await p.waitForFunction(()=>typeof ready!=='undefined'&&ready);await p.evaluate(()=>Patrol.engines.ui.dismissOnboarding());return p;
    };
    let cards=0;const npcIds=[];
    for(const location of ['office','corridor','lab','classroom','staff','server']){
      const p=await boot(location);
      npcIds.push(...await p.locator('.npc').evaluateAll(nodes=>nodes.map(n=>n.dataset.entity)));
      assert.equal(await p.evaluate(()=>document.querySelectorAll('.interaction-marker').length),1);
      assert.ok(await p.evaluate(()=>getComputedStyle(document.querySelector('button')).fontFamily.includes('system-ui')));
      await p.evaluate(()=>Patrol.runtime.spawnAt(1400,1100));
      assert.ok(await p.locator('.door-plaque').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).visibility==='visible'&&getComputedStyle(n).opacity==='1')));
      const objects=await p.evaluate(()=>Patrol.engines.scenery.interactions.map(i=>({id:i.id,x:i.point.x,y:i.point.y,type:i.type,title:i.data.name})));
      for(const item of objects){
        // Approach on the walkable floor from several sides; competing nearby objects
        // must not make a card permanently unreachable.
        let reached=false;
        for(const dy of [60,40,0,85]){
          for(const dx of [0,60,-60,100,-100]){
            reached=await p.evaluate(({x,y,id})=>{Patrol.runtime.spawnAt(x,y);return !document.getElementById('interaction-hint').hidden&&document.getElementById('interaction-hint').dataset.target===id;},{x:item.x+dx,y:item.y+dy,id:item.id});
            if(reached)break;
          }if(reached)break;
        }
        assert.ok(reached,`Cannot approach ${location}: ${item.type} ${item.id}`);
        assert.equal(await p.locator('#interaction-hint').isVisible(),true);
        await p.keyboard.press('KeyE');await p.locator('.world-card').waitFor();
        assert.equal(await p.locator('#overlay-title').textContent(),item.title);
        assert.ok((await p.locator('.world-card').textContent()).includes('Пример'));
        await p.waitForTimeout(200);assert.equal(await p.locator('#interaction-hint').isVisible(),false);
        if(['clock','rack','tools','socket'].includes(item.type)){await p.evaluate(()=>document.getElementById('overlay').scrollTop=0);await p.screenshot({animations:'disabled',path:`.prototype-checks/world-${location}-${item.type}.png`});}
        await p.keyboard.press('Escape');cards++;
      }
      if(location==='staff'){await p.evaluate(()=>Patrol.runtime.spawnAt(1000,1000));await p.screenshot({animations:'disabled',path:'.prototype-checks/world-staff.png'});}
      if(location==='corridor'){
        await p.evaluate(()=>Patrol.runtime.spawnAt(1120,620));await p.screenshot({animations:'disabled',path:'.prototype-checks/world-doors.png'});
        const plaques=await p.locator('.door-plaque').allTextContents();for(const n of ['214','216','218','220','222'])assert.ok(plaques.some(t=>t.includes(n)));
        await p.evaluate(()=>Patrol.runtime.spawnAt(2740,525));await p.keyboard.press('KeyE');await p.waitForFunction(()=>Patrol.progress.location==='server'&&!Patrol.engines.locations.transitioning);
        assert.equal(await p.locator('.npc').getAttribute('data-entity'),'administratorIrina');await p.screenshot({animations:'disabled',path:'.prototype-checks/world-server.png'});
        await p.evaluate(()=>Patrol.runtime.spawnAt(350,535));await p.keyboard.press('KeyE');await p.waitForFunction(()=>Patrol.progress.location==='corridor'&&!Patrol.engines.locations.transitioning);assert.equal(await p.evaluate(()=>Math.round(Patrol.runtime.point.x)),2740);
      }
      await p.close();
    }
    assert.deepEqual(npcIds,['alexey','teacherSergey','teacherAnna','olga','administratorIrina']);
    for(const touch of [false,true]){
      const p=await boot('classroom',touch);
      await p.evaluate(()=>Patrol.runtime.spawnAt(650,795));await p.locator('#interact-button').click();
      assert.equal(await p.locator('#overlay-portrait img').getAttribute('src'),'assets/npcs/teacher-anna.webp');
      await p.getByRole('button',{name:'Проверить настройки',exact:true}).click();assert.ok((await p.locator('#overlay-content [role=status]').textContent()).includes('Проверьте роли'));
      for(const [i,role] of ['Адрес устройства','Граница подсети','Путь в другие сети','Адрес по имени'].entries())await p.locator('.task-form select').nth(i).selectOption(role);
      await p.getByRole('button',{name:'Проверить настройки',exact:true}).click();assert.ok((await p.locator('#overlay-content [role=status]').textContent()).includes('Все роли сопоставлены'));
      assert.equal(await p.evaluate(()=>Patrol.progress.xp),100);
      assert.ok(await p.evaluate(()=>{const r=document.getElementById('overlay').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth;}));
      await p.evaluate(()=>document.getElementById('overlay').scrollTop=0);await p.screenshot({animations:'disabled',path:`.prototype-checks/world-classroom-${touch?'mobile':'desktop'}.png`});
      await p.keyboard.press('Escape');await p.evaluate(()=>Patrol.ui.knowledge.open('storage'));await p.screenshot({animations:'disabled',path:`.prototype-checks/world-knowledge-${touch?'mobile':'desktop'}.png`});
      assert.ok((await p.locator('.knowledge-card').textContent()).includes('RAID не заменяет'));
      assert.ok(await p.evaluate(()=>{const c=document.querySelector('.knowledge-card'),r=document.getElementById('overlay').getBoundingClientRect();return c.getBoundingClientRect().right<=r.right;}));
      await p.close();
    }
    const p=await boot('server',true);await p.evaluate(()=>Patrol.runtime.spawnAt(550,815));await p.locator('#interact-button').click();assert.equal(await p.locator('#overlay-title').textContent(),'Дмитрий');
    assert.ok(await p.locator('#overlay-portrait img').evaluate(i=>i.complete&&i.naturalWidth>0));await p.screenshot({animations:'disabled',path:'.prototype-checks/world-irina-mobile.png'});
    await p.getByRole('button',{name:'Сетевые службы',exact:true}).click();await p.locator('input[value="1"]').check();await p.getByRole('button',{name:'Проверить ответ',exact:true}).click();await p.waitForFunction(()=>document.querySelector('.task-form [role=status]').textContent.includes('Попробуйте'));
    await p.locator('input[value="0"]').check();await p.getByRole('button',{name:'Проверить ответ',exact:true}).click();await p.getByRole('button',{name:'Закончить упражнение',exact:true}).waitFor();assert.equal(await p.evaluate(()=>Patrol.progress.xp),100);assert.deepEqual(await p.evaluate(()=>Patrol.progress.completedChapters),[0,1]);await p.keyboard.press('Escape');
    await p.evaluate(()=>Patrol.ui.quiz.open('storageQuiz'));await p.locator('input[value="0"]').check();await p.getByRole('button',{name:'Проверить ответ',exact:true}).click();await p.getByRole('button',{name:'Закончить упражнение',exact:true}).waitFor();assert.equal(await p.evaluate(()=>Patrol.progress.xp),100);
    await p.reload();await p.waitForFunction(()=>typeof ready!=='undefined'&&ready);assert.equal(await p.evaluate(()=>Patrol.progress.location),'server');assert.ok(await p.evaluate(()=>Patrol.progress.unlockedLocations.includes('server')));
    assert.deepEqual(errors,[]);console.log(`PASS: ${cards} reachable scenery cards, one visible marker, permanent plaques, distinct NPCs, server unlock/return/persistence, classroom practice, optional quiz retry/no extra XP, desktop/mobile typography and cards, clean console`);
  }finally{await browser.close();await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
