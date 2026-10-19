'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('./fixture.cjs'),P=require('../server/content.cjs');
let checks=0;const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
// Deterministic Fisher–Yates checks, including source immutability and every permutation.
const sandbox={Patrol:{ui:{}},Math:Object.create(Math)};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('ui/quiz.js','utf8'),sandbox);
const shuffle=options=>Array.from(sandbox.Patrol.ui.quiz.shuffledIndices(options));
sandbox.Math.random=()=>0;const source=['A','B','C','D'];eq(shuffle(source),[1,2,3,0]);eq(source,['A','B','C','D']);
eq(shuffle([]),[]);eq(shuffle(['A']),[0]);
const permutations=new Set();
for(let a=0;a<4;a++)for(let b=0;b<3;b++)for(let c=0;c<2;c++){
 const draws=[(a+.5)/4,(b+.5)/3,(c+.5)/2];sandbox.Math.random=()=>draws.shift();const order=shuffle(source);
 eq([...order].sort(),[0,1,2,3]);permutations.add(order.join(','));
}
eq(permutations.size,24,'all permutations are reachable without a fixed correct position');
(async()=>{const f=await fixture(),browser=await f.browser(),errors=[];try{
 const ready=async p=>{p.on('pageerror',e=>errors.push(e.message));await p.goto(f.base+'/index.html');await p.waitForFunction(()=>Patrol.runtime.ready);};
 // Only open the training question in each chapter; no chapter playthrough.
 for(let chapter=2;chapter<=15;chapter++){
   const c=P.data.curriculum[chapter],p=await f.page(browser,{currentChapter:chapter,completedChapters:Array.from({length:chapter},(_,i)=>i),location:c.location,course:{[chapter]:{step:P.network.course.stages(c).indexOf('training'),wrong:0,hints:0}}});
   const requests=[];p.on('request',r=>{if(r.url().endsWith('/api/student/action'))requests.push(r.postDataJSON());});await ready(p);
   const initial=await p.evaluate(()=>JSON.stringify(Patrol.data.curriculum));
   await p.evaluate(()=>{Math.random=()=>0;Patrol.ui.course.open();});
   const order=await p.locator('input[name=course-answer]').evaluateAll(ns=>ns.map(n=>Number(n.value)));
   eq(order,[...c.training.options.keys()].slice(1).concat(0),`chapter ${chapter}: shuffled display`);
   eq(await p.locator('input[name=course-answer]').evaluateAll(ns=>ns.map(n=>n.parentElement.textContent)),order.map(i=>c.training.options[i]),'text maps to original index');
   // A fresh opening uses a fresh order, without changing curricular data.
   await p.evaluate(()=>{Patrol.engines.ui.close();Math.random=()=>.999999;Patrol.ui.course.open();});
   eq(await p.locator('input[name=course-answer]').evaluateAll(ns=>ns.map(n=>Number(n.value))),[...c.training.options.keys()]);
   await p.evaluate(()=>{Patrol.engines.ui.close();Math.random=()=>0;Patrol.ui.course.open();});
   const wrong=(c.training.answer+1)%c.training.options.length;
   await p.locator(`input[name=course-answer][value="${wrong}"]`).check();await p.getByRole('button',{name:'Проверить ответ',exact:true}).click();
   await p.waitForFunction(()=>Patrol.ui.course.current().state.wrong===1);
   eq(await p.locator('input[name=course-answer]').evaluateAll(ns=>ns.map(n=>Number(n.value))),order,'retry keeps the displayed order');
   eq(await p.locator('#overlay-content [role=status]').textContent(),c.training.explanations[wrong]);
   await p.getByLabel(c.training.options[c.training.answer],{exact:true}).check();await p.getByRole('button',{name:'Проверить ответ',exact:true}).click();
   await p.getByRole('button',{name:'Перейти к практике',exact:true}).waitFor();
   eq(requests.filter(r=>r.action==='courseAnswer').map(r=>r.response),[wrong,c.training.answer],'server receives source indices');
   eq(await p.locator('#overlay-content [role=status]').textContent(),c.training.explanations[c.training.answer]);
   eq(await p.evaluate(()=>JSON.stringify(Patrol.data.curriculum)),initial);await p.close();
 }
 // Review all existing quiz/matching/sequence data without changing it.
 const p=await f.page(browser,{currentChapter:16,completedChapters:Array.from({length:16},(_,i)=>i),introComplete:true,briefingComplete:true,packetDelivered:true});await ready(p);
 const data=await p.evaluate(()=>JSON.stringify(Patrol.data.tasks));
 for(const task of Object.values(P.data.tasks).filter(t=>t.type)){
   await p.evaluate(id=>{Patrol.engines.ui.close();Math.random=()=>0;Patrol.ui.quiz.open(id);},task.id);
   if(task.type==='quiz'){
     const order=await p.locator('.task-form input').evaluateAll(ns=>ns.map(n=>Number(n.value)));
     eq(order,task.mode==='boolean'?[...task.options.keys()]:[...task.options.keys()].slice(1).concat(0));
     eq(await p.locator('.task-form label').allTextContents(),order.map(i=>task.options[i]));
     for(const index of task.answer)await p.locator(`.task-form input[value="${index}"]`).check();
   }else{
     eq(await p.locator('.task-form select').first().locator('option').allTextContents(),['Выберите…',...task.options],'matching/sequence keep semantic option order');
     for(const [i,value]of task.answer.entries())await p.locator('.task-form select').nth(i).selectOption(value);
   }
   await p.getByRole('button',{name:'Проверить ответ',exact:true}).click();
   const finish=task.id==='switchQuiz'?'Перейти к практике':task.id==='packetTrue'?'Итоги главы':'Закончить упражнение';await p.getByRole('button',{name:finish,exact:true}).waitFor();
   eq((await p.locator('.task-form [role=status]').textContent()).startsWith('Верно.'),true,task.id+' source answer is accepted');
   eq(await p.evaluate(()=>JSON.stringify(Patrol.data.tasks)),data);
 }
 eq(errors,[]);console.log(`PASS: ${checks} answer-order checks; permutations, fresh openings, source indices, explanations/retry in training 2–15 and all quiz types; content unchanged`);
}finally{await browser.close();await f.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
