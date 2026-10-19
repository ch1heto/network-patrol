'use strict';
const assert=require('node:assert/strict'),P=require('../server/content.cjs'),N=P.network,T=N.topology,S=N.simulator,C=N.course;
let checks=0;const eq=(actual,expected,label)=>{assert.equal(actual,expected,label);checks++;};
// Ethernet alone must not establish IP reachability, including router interfaces.
let m=C.model(8,true),router=m.devices.find(d=>d.type==='router');
eq(S.check(m,'d1','d3').ok,true,'configured routed network');
eq(S.check(m,'d1','192.168.1.1').ok,true,'ping local router interface');
m.devices[0].ip='192.168.1.1';eq(S.check(m,'d1','d3').code,'IP_CONFLICT','PC conflicts with its gateway');
m.devices[0].ip='192.168.1.10';m.devices[2].ip='192.168.2.1';eq(S.check(m,'d1','d3').code,'IP_CONFLICT','destination conflicts with router');
m.devices[2].ip='192.168.2.20';m.devices[2].mask='255.0.255.0';eq(S.check(m,'d1','d3').code,'INVALID_IPV4','bad destination mask');
m.devices[2].mask='255.255.255.0';m.devices[0].gateway='192.168.2.1';eq(S.check(m,'d1','d3').code,'INVALID_GATEWAY','remote gateway');
m.devices[0].gateway='192.168.1.1';router.ports[1].up=false;eq(S.check(m,'d1','d3').ok,false,'disabled router port');router.ports[1].up=true;
const peer=T.add(m,'pc');peer.ip='192.168.1.10';T.connect(m,peer.id,m.devices.find(d=>d.name==='SW-B').id);
eq(S.check(m,'d1','d3').ok,true,'same address in separate broadcast domains is not an ARP conflict');
// Prefer an existing LAN path over a shorter physical route through a router.
m=C.model(8,true);m.devices[2].ip='192.168.1.20';const sw2=m.devices.find(d=>d.name==='SW-B');
const sw3=T.add(m,'switch');T.connect(m,'d2',sw3.id);T.connect(m,sw3.id,sw2.id);
eq(S.check(m,'d1','d3').ok,true,'alternative switched path');
// A domain-looking device label cannot silently bypass DNS.
m=C.model(11);m.devices[2].name='college.ru';eq(C.terminal(m,'ping college.ru').ok,false,'DNS is required for names');
// Existing valid leases survive renewal and validation after a lower address is freed.
m=C.model(10);const laptop=m.devices.find(d=>d.type==='laptop'),other=T.add(m,'pc');other.ip='192.168.1.45';T.connect(m,laptop.id,'d2');
eq(C.dhcp(m,laptop.id).ok,true);eq(laptop.ip,'192.168.1.46');T.remove(m,other.id);
let snapshot=JSON.stringify(m);eq(C.validate(10,{},m).ok,true,'valid lease need not be lowest free address');eq(JSON.stringify(m),snapshot,'validation is read only');
eq(C.dhcp(m,laptop.id).ok,true);eq(laptop.ip,'192.168.1.46','renewal keeps lease');
laptop.dns='192.168.1.99';eq(C.validate(10,{},m).ok,false,'lease parameters must match DHCP');
delete laptop.services.dhcpLease.address;eq(C.dhcp(m,laptop.id).ok,true,'malformed saved lease is recoverable');
// All nine faults must fail before repair and pass repeatedly without mutations.
for(const type of C.faults){m=C.ticket(type);eq(C.ticketResult(m,type).ok,false,type+' initially fails');C.repair(m,type);snapshot=JSON.stringify(m);for(let i=0;i<2;i++){eq(C.ticketResult(m,type).ok,true,type+' repaired');eq(JSON.stringify(m),snapshot,type+' recheck is read only');}}
eq(C.validate(15,[],null,[]).ok,false,'empty shift cannot complete');
for(const reverse of [false,true]){m=N.taskState.initial({chapter:7});const router=T.add(m,'router'),switches=m.devices.filter(d=>d.type==='switch');for(const sw of reverse?switches.reverse():switches)T.connect(m,sw.id,router.id);eq(C.validate(7,{},m).ok,true,'physical router cabling in either order');for(const task of P.data.taskContracts.flows[7].slice(0,3))eq(P.data.taskContracts.done(task,m),true,'next goal recognizes completed cabling');}
for(const reverse of [false,true]){m=N.taskState.initial({chapter:1});for(const id of reverse?['d3','d1']:['d1','d3'])T.connect(m,id,'d2');snapshot=JSON.stringify(m);eq(S.firstTask(m).ok,true,'allowed cable order');eq(S.firstTask(m).ok,true,'repeat correct network');eq(JSON.stringify(m),snapshot);}
for(const task of Object.values(P.data.tasks).filter(t=>['quiz','matching','sequence'].includes(t.type))){
 const wrong=task.type==='quiz'?[]:task.answer.map(()=>''),answer=structuredClone(task.answer);
 eq(P.engines.tasks.evaluate(task,wrong).correct,false,task.id+' rejects incomplete answer');
 eq(P.engines.tasks.evaluate(task,answer).correct,true,task.id+' accepts correct answer after error');
 eq(P.engines.tasks.evaluate(task,answer).correct,true,task.id+' accepts repeated correct answer');
}
console.log(`PASS: ${checks} student feedback network checks; routing, LAN conflicts, DNS, DHCP and all nine final faults`);
