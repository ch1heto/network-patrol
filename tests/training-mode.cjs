'use strict';
const assert=require('node:assert/strict'),{S,T,C,progress}=require('./state-helpers.cjs');let checks=0;const m=S.initial({chapter:3}),p=progress(3,m),ctx={surface:'lab',model:m,response:{}};
for(const [i,id]of ['d1','d3','d4'].entries()){
 const current=()=>C.resolve(p,ctx),allow=(type,id)=>S.allowed(current(),m,ctx,{type,id});
 assert.equal(allow('device','d4').ok,false);assert.equal(allow('control','ethernet').ok,true);ctx.mode=true;assert.equal(allow('device',id).ok,true);assert.equal(allow('control','remove-device').ok,false);checks+=4;
 ctx.cableSource=id;assert.equal(allow('device','d4').ok,false);assert.equal(allow('device','d2').ok,true);ctx.portChoice={from:id,to:'d2',switchId:'d2'};assert.equal(allow('control','port-'+(i+1)).ok,true);assert.equal(allow('control','port-'+(i+2)).ok,false);checks+=4;
 const t=current();T.connect(m,id,'d2','eth0','eth'+i);assert.equal(C.done(C.flows[3][i],m),true);assert.equal(T.portState(m,'d2','eth'+i).peerId,id);checks+=2;ctx.mode=false;ctx.cableSource=null;ctx.portChoice=null;
}
assert.equal(C.resolve(p,ctx).test,'portsReviewed');assert.equal(S.allowed(C.resolve(p,ctx),m,ctx,{type:'control',id:'delete-link'}).ok,false);checks+=2;
const early=S.initial({chapter:3});T.connect(early,'d3','d2',null,'eth1');assert.equal(S.prepare(early,{chapter:3}).recovered,true);checks++;
console.log(`PASS: ${checks} training-mode checks; exact PC/Switch/Port order, wrong endpoint/port/delete blocked, actual Link postconditions and early-action recovery`);
