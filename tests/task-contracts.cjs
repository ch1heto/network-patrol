'use strict';
const assert=require('node:assert/strict'),P=require('../server/content.cjs'),C=P.data.taskContracts;
let checks=0;
for(const t of Object.values(C.registry)){for(const key of C.required){assert.ok(t[key]!==undefined&&t[key]!==null,`${t.id}: ${key}`);checks++;}const room=P.data.locations[t.location];assert.ok(room.npcs.includes(t.targetId)||room.objects.includes(t.targetId)||C.sceneryTargets(room).some(p=>p.id===t.targetId),`${t.id}: missing physical target`);assert.ok(C.registry[t.nextStep]||t.nextStep==='active');checks+=2;}
for(const key of C.required){const template={...C.registry['c2-intro'],id:`bad-${key}`};delete template[key];assert.throws(()=>C.register(template),/missing/);checks++;}
for(let id=2;id<=15;id++){const c=P.data.curriculum[id];for(const stage of P.network.course.stages(c))assert.ok(C.registry[`c${id}-${stage}`]);assert.ok(C.flows[id].at(-1).validation);checks++;}
const modeBase={...C.registry['c2-intro'],id:'bad-mode',mode:'UNKNOWN'};assert.throws(()=>C.register(modeBase),/invalid mode/);checks++;
const p={completedChapters:[0,1],currentChapter:3,currentObjective:'course',course:{3:{step:P.network.course.stages(P.data.curriculum[3]).indexOf('practical')}},location:'lab'};
const model=P.network.course.model(3);for(let i=1;i<=3;i++){const t=C.resolve(p,{model});assert.ok(t.goal.includes(`PC-0${i}`));const pc=model.devices.find(d=>d.name===`PC-0${i}`);P.network.topology.connect(model,pc.id,'d2');checks++;}assert.equal(C.resolve(p,{model}).test,'portsReviewed');assert.equal(C.resolve(p,{model,response:{portsReviewed:true}}).test,'validation');
const step=C.resolve(p,{surface:'lab',model:P.network.course.model(3),mode:false});assert.equal(step.questMarkerTarget.id,'ethernet');assert.equal(step.mode,'TRAINING');checks+=2;
const route=C.resolve({...p,location:'corridor'},{model});assert.equal(route.targetType,'door');assert.equal(route.targetId,'to-lab');assert.ok(route.instructions.join(' ').includes('золотой'));
assert.equal(C.resolve(p,{surface:'lab',model:P.network.course.model(3),mode:true,cableSource:'d1',portChoice:{from:'d1',to:'d2',switchId:'d2'}}).goal,'Выберите свободный порт SW-01');
const dnsProgress={...p,currentChapter:11,location:'classroom',course:{11:{step:P.network.course.stages(P.data.curriculum[11]).indexOf('practical')}}},dnsModel=P.network.course.model(11);dnsModel.devices[0].dns='192.168.1.100';assert.equal(C.resolve(dnsProgress,{model:dnsModel,response:{commands:['ping 192.168.1.100']}}).id,'c11-practice-2');checks++;
assert.equal(C.validate(13,['dns','dns','dhcp','web','database']).failedTask,'c13-practice-0');checks++;
console.log(`PASS: ${checks} Task Contract checks; required fields, every physical target/next step, rejection of incomplete future steps, sequential PC goals and route/port instructions`);
