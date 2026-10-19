'use strict';
const path=require('node:path');
const {spawnSync}=require('node:child_process');
for(const name of ['sanity','answer-order','input-animation','student-feedback-network','student-feedback-state','student-feedback-ui','content-consistency','markers','replay-sandbox','return-state','task-contracts','network-state','training-mode','task-preconditions','task-recovery','topology-invariants','network','backend','authentication','movement','lab-ui','polish','world','curriculum','instruction-ui','network-lab-e2e','playthrough']) {
  const r=spawnSync(process.execPath,[path.join(__dirname,name+'.cjs')],{stdio:'inherit',cwd:path.join(__dirname,'..'),env:process.env});
  if(r.status!==0)process.exit(r.status||1);
}
console.log('PASS: all 27 test suites');
