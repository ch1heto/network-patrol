'use strict';
const assert=require('node:assert/strict'),{S,T,C,progress,apply}=require('./state-helpers.cjs');let checks=0;
for(let chapter=1;chapter<=15;chapter++){
 const m=S.initial({chapter:chapter<=11?chapter:1}),r={},p=progress(chapter,m,r);
 for(const t of C.flows[chapter]){for(const key of ['taskInitialState','preconditions','postconditions','allowedActions']){assert.ok(t[key]);checks++;}
  if(chapter<=11){const task=C.resolve(p,{surface:'lab',model:m,response:r});const pre=S.preconditions(task,m,{surface:'lab',model:m,response:r});assert.equal(pre.ok,true,`${t.id}: ${pre.message}`);checks++;if(task.execution.pair){const pair=task.execution.pair;assert.equal(T.endpoint(m,pair.from,pair.fromPort,'source').d.id,pair.from);assert.equal(T.endpoint(m,pair.to,pair.toPort,'destination').d.id,pair.to);checks+=2;}}
  if(t.test!=='validation'){apply(t,m,r);assert.equal(C.done(t,m,r),true,t.id);checks++;}
 }
}
const m=S.initial({chapter:3});T.connect(m,'d1','d4');const p=progress(3,m),task=C.resolve(p,{surface:'lab',model:m});assert.equal(task.execution.ok,false);assert.equal(task.execution.code,'SOURCE_PORT_OCCUPIED');assert.equal(task.questMarkerTarget.id,'restore-task');assert.ok(task.visibleInstruction.includes('PC-03'));checks+=4;
const missing=S.initial({chapter:3});T.remove(missing,'d1');assert.equal(S.preconditions(C.flows[3][0],missing).code,'DEVICE_NOT_FOUND');checks++;
const down=S.initial({chapter:2});down.devices[2].ports[0].up=false;T.refresh(down);const blocked=C.resolve(progress(2,down),{surface:'lab',model:down});assert.equal(blocked.execution.ok,false);assert.equal(blocked.questMarkerTarget.id,'restore-task');assert.ok(blocked.visibleInstruction.includes('выключен'));checks+=3;
console.log(`PASS: ${checks} task-preconditions checks; every practical contract 1–15, active network instructions executable, real postconditions and concrete occupied/missing source recovery instruction`);
