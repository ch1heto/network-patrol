'use strict';
const P=require('../server/content.cjs'),N=P.network,C=P.data.taskContracts,T=N.topology,S=N.taskState;
function progress(chapter,model,draft={}){return {currentChapter:chapter,currentObjective:chapter===1?'connect':'course',completedChapters:chapter===1?[0]:Array.from({length:chapter},(_,i)=>i),location:chapter===1?'lab':P.data.curriculum[chapter].location,course:chapter===1?{}:{[chapter]:{step:N.course.stages(P.data.curriculum[chapter]).indexOf('practical'),model,draft,wrong:0,hints:0,tickets:['cable','ip','dns']}}};}
function apply(t,m,r){const [kind,value]=t.test.split(':'),find=name=>m.devices.find(d=>d.name===name);if(kind==='cable'){const pc=find(value),sw=find('SW-01');T.connect(m,pc.id,sw.id,null,t.chapterId===3?'eth'+(Number(value.slice(-1))-1):null);}
 else if(kind==='cmd')(r.commands??=[]).push(value);
 else if(t.test==='ip'){find('PC-02').ip='192.168.1.20';find('PC-02').mask='255.255.255.0';}
 else if(t.test==='gateway')find('PC-02').gateway='192.168.2.1';
 else if(t.test==='router'){const d=T.add(m,'router');d.interfaces[0].ip='192.168.1.1';d.interfaces[1].ip='192.168.2.1';}
 else if(t.test==='router-a'||t.test==='router-b'){const router=m.devices.find(d=>d.type==='router'),sw=find(t.test==='router-a'?'SW-A':'SW-B');T.connect(m,sw.id,router.id,null,t.test==='router-a'?'eth0':'eth1');}
 else if(t.test==='dhcp')N.course.dhcp(m,m.devices.find(d=>d.type==='laptop').id);
 else if(t.test==='dns')find('PC-01').dns='192.168.1.100';
 else if(kind==='role')(r.roles??=[])[Number(value)]=['files','dns','dhcp','web','database'][Number(value)];
 else if(kind==='raid')(r.tested??=[]).push(value);
 else if(kind.startsWith('ticket-')){const i=Number(value),cause=['cable','ip','dns'][i],a=(r.tickets??=[])[i]??=((r.tickets)[i]={model:N.course.ticket(cause)});if(kind==='ticket-check')a.checks=['link','settings'];if(kind==='ticket-cause')a.cause=cause;if(kind==='ticket-fix'){N.course.repair(a.model,cause);a.fixed=N.course.terminal(a.model,cause==='dns'?'nslookup college.ru':'ping 192.168.1.20').ok;}}
 else r[t.test]=t.test==='answer'?(t.chapterId===12?'remote':'backup'):true;
 T.refresh(m);
}
module.exports={P,N,C,T,S,progress,apply};
