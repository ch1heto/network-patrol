'use strict';
const assert=require('node:assert/strict'),{N,T,S}=require('./state-helpers.cjs');let checks=0;
const m=S.initial({chapter:3}),before=()=>JSON.stringify(m),reject=(fn,code)=>{const snapshot=before();assert.throws(fn,e=>e.code===code);assert.equal(before(),snapshot);checks+=2;};
reject(()=>T.connect(m,'d1','missing'),'DEVICE_NOT_FOUND');reject(()=>T.connect(m,'d1','d2','missing'),'PORT_NOT_FOUND');reject(()=>T.connect(m,'d1','d1'),'INVALID_TARGET');
const first=T.connect(m,'d1','d2','eth0','eth0');T.assertInvariants(m);assert.equal(m.devices[0].ports[0].connectionId,first.id);checks++;
reject(()=>T.connect(m,'d1','d4'),'SOURCE_PORT_OCCUPIED');reject(()=>T.connect(m,'d3','d2',null,'eth0'),'DESTINATION_PORT_OCCUPIED');reject(()=>T.connect(m,'d1','d2'),'CONNECTION_ALREADY_EXISTS');
T.remove(m,first.id);assert.equal(T.portState(m,'d1','eth0').occupied,false);assert.equal(T.portState(m,'d2','eth0').occupied,false);T.assertInvariants(m);checks+=3;
const deleted=before();T.remove(m,first.id);assert.equal(before(),deleted);checks++;
T.connect(m,'d1','d2');T.remove(m,'d1');assert.ok(!m.links.some(l=>[l.fromDevice,l.toDevice].includes('d1')));assert.equal(T.portState(m,'d2','eth0').occupied,false);checks+=2;
let seed=1234567;const rnd=n=>{seed=(seed*1664525+1013904223)>>>0;return seed%n;};
for(let i=0;i<500;i++){const snapshot=before();try{if(rnd(3)===0&&m.links.length)T.remove(m,m.links[rnd(m.links.length)].id);else if(m.devices.length<10&&rnd(4)===0)T.add(m,rnd(2)?'pc':'switch');else if(m.devices.length>1)T.connect(m,m.devices[rnd(m.devices.length)].id,m.devices[rnd(m.devices.length)].id);}catch(e){assert.ok(e.code);assert.equal(before(),snapshot);checks+=2;}assert.ok(N.validModel(m));T.refresh(m);T.assertInvariants(m);checks+=2;}
const p=m.devices[0].ports[0];p.occupied=!p.occupied;assert.throws(()=>T.assertInvariants(m),e=>e.code==='TASK_STATE_INVALID');T.refresh(m);T.assertInvariants(m);checks+=2;
for(const fault of N.course.faults){const model=N.course.ticket(fault);T.refresh(model);T.assertInvariants(model);N.course.repair(model,fault);T.refresh(model);T.assertInvariants(model);checks+=2;}
console.log(`PASS: ${checks} topology-invariants checks; atomic rejection, double connect/delete, endpoint release, device cascade, 500 seeded actions and every final fault model`);
