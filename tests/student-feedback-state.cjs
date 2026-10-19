'use strict';
const assert=require('node:assert/strict'),{fixture}=require('./fixture.cjs'),{P,N,S,T,progress}=require('./state-helpers.cjs');
(async()=>{const f=await fixture();let checks=0;const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};try{
 const post=(s,data)=>f.call('/api/student/action',{method:'POST',cookie:s.cookie,data});
 const state=s=>f.call('/api/student/progress',{cookie:s.cookie});
 // Wrong answers followed by correct answers, including a repeated request in flight.
 const c=P.data.curriculum[13],step=N.course.stages(c).indexOf('training');
 const s=await f.student({...progress(13),course:{13:{step,wrong:0,hints:0}}});
 eq((await post(s,{action:'courseAnswer',chapter:13,step,response:(c.training.answer+1)%c.training.options.length})).body.correct,false);
 const good={action:'courseAnswer',chapter:13,step,response:c.training.answer};eq((await post(s,good)).body.correct,true);eq((await post(s,good)).body.correct,true);
 let cs=(await state(s)).body.progress.course[13];eq(cs.wrong,1);
 const practice={action:'coursePractice',chapter:13,step:cs.step,response:['dns','dns','dhcp','web','database']};
 eq((await post(s,practice)).body.ok,false);practice.response[0]='files';let r=await post(s,practice);eq(r.body.ok,true);const xp=r.body.progress.xp,score=r.body.progress.course[13].score;
 for(let i=0;i<2;i++){r=await post(s,practice);eq(r.status,200);eq(r.body.ok,true);eq(r.body.progress.xp,xp);eq(r.body.progress.course[13].score,score);}
 eq(f.db.prepare('SELECT COUNT(*) AS n FROM chapter_results WHERE student_id=? AND chapter_id=13').get(s.id).n,1);
 // Reset removes attempt hints, draft and transient failed target; generation rejects stale writes.
 const model=S.initial({chapter:5}),p=progress(5,model);p.course[5].hints=2;p.course[5].wrong=3;p.course[5].failedTask='c5-practice-0';p.ux={hintLevels:{'c5-practice-0':3,'c6-practice-0':1}};
 const resetStudent=await f.student(p),resetStep=p.course[5].step;
 r=await post(resetStudent,{action:'courseReset',chapter:5,step:resetStep});cs=r.body.progress.course[5];eq(cs.hints,0);eq(cs.wrong,0);eq(cs.draft,{});eq(cs.taskGeneration,1);eq(cs.failedTask,undefined);eq(r.body.progress.ux.hintLevels,{'c6-practice-0':1});eq(cs.model.devices[2].ip,'');
 model.devices[2].ip='192.168.1.20';r=await f.call('/api/student/state',{method:'POST',cookie:resetStudent.cookie,data:{courseDraft:{chapter:5,model,draft:{}}}});eq(r.body.stale,true);eq((await state(resetStudent)).body.progress.course[5].model.devices[2].ip,'');
 // Re-login restores the exact saved addresses and pending cable selection.
 const topology=S.initial({chapter:6});topology.devices[2].ip='192.168.1.123';const persisted=await f.student(progress(6,topology));
 const login=await f.call('/api/login',{method:'POST',data:{role:'student',login:persisted.login,password:'Student-password-2026'}});eq(login.status,200);eq((await state({...persisted,cookie:login.cookie})).body.progress.course[6].model.devices[2].ip,'192.168.1.123');
 // Final shift: all fault types, real checks, repeated submission, score and completion.
 for(const tickets of [N.course.faults.slice(0,3),N.course.faults.slice(3,6),N.course.faults.slice(6,9)]){
   const p=progress(15);p.course[15].tickets=tickets;p.course[15].wrong=1;p.course[15].hints=1;const student=await f.student(p);
   const response=tickets.map(cause=>{const model=N.course.ticket(cause);N.course.repair(model,cause);return {cause,model,checks:['link','settings'],fixed:true};});
   const action={action:'coursePractice',chapter:15,step:p.course[15].step,response};r=await post(student,action);eq(r.body.ok,true);eq(r.body.progress.course[15].score,85);eq(r.body.progress.completedChapters.includes(15),true);
   const earned=r.body.progress.xp;r=await post(student,action);eq(r.body.ok,true);eq(r.body.progress.xp,earned);
   r=await post(student,{action:'courseContinue',chapter:15,step:r.body.progress.course[15].step});eq(r.body.progress.currentChapter,16);eq(r.body.progress.currentObjective,'courseFinished');
 }
 const empty=await f.student(progress(15));eq((await state(empty)).body.progress.course[15].tickets.length,3);
 const intro={...progress(15),unlockedLocations:[]};intro.course[15].step=0;delete intro.course[15].tickets;N.course.migrate(intro);eq(intro.course[15].tickets,undefined); // Keep the normal random ticket assignment at courseAdvance.
 // A late successful check from the previous first-network attempt must not beat Reset.
 const first=await f.student({...progress(1),briefingComplete:true,quizPassed:true});
 const old=S.initial({chapter:1});T.connect(old,'d1','d2');T.connect(old,'d3','d2');
 eq((await post(first,{action:'resetTask'})).status,200);eq((await post(first,{action:'practice',model:old})).status,409);eq((await state(first)).body.progress.packetDelivered,false);
 const current=(await state(first)).body.progress.networkModel;T.connect(current,'d1','d2');T.connect(current,'d3','d2');
 eq((await post(first,{action:'practice',model:current})).body.ok,true);const attempts=f.db.prepare('SELECT COUNT(*) AS n FROM practice_attempts WHERE student_id=?').get(first.id).n;
 eq((await post(first,{action:'practice',model:current})).body.ok,true);eq(f.db.prepare('SELECT COUNT(*) AS n FROM practice_attempts WHERE student_id=?').get(first.id).n,attempts);
 // Repeating a passed quiz cannot change the first-chapter score by adding successes.
 const q=await f.student({introComplete:true});eq((await post(q,{action:'quiz',taskId:'networkQuiz',response:[0]})).body.correct,false);
 const quiz={action:'quiz',taskId:'networkQuiz',response:[0,1]};eq((await post(q,quiz)).body.correct,true);eq((await post(q,quiz)).body.correct,true);
 eq((await post(q,{...quiz,response:[0]})).body.correct,false);eq((await state(q)).body.progress.networkQuizPassed,true);
 eq(f.db.prepare('SELECT COUNT(*) AS n FROM quiz_attempts WHERE student_id=?').get(q.id).n,2);
 const misbound=S.initial({chapter:5});misbound.task.key='c6-practical';misbound.devices[2].ip='192.168.1.20';const invalid=await f.student(progress(5));
 r=await post(invalid,{action:'coursePractice',chapter:5,step:progress(5).course[5].step,model:misbound,response:{}});eq(r.body.ok,false);eq(r.body.progress.completedChapters.includes(5),false);
 console.log(`PASS: ${checks} student feedback state checks; retry/idempotence, reset/hints, re-login and final scoring`);
}finally{await f.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
