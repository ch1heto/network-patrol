'use strict';
// User actions only; evaluations below read the resulting state/await the save queue.
const assert=require('node:assert/strict'),{tutorial,cable}=require('./ux-helpers.cjs');
const click=(p,n)=>p.getByRole('button',{name:n,exact:true}).click();
async function repeatedCable(p,a,b){await click(p,'Ethernet');await p.locator(`[data-device=${a}]`).click();await p.locator(`[data-device=${b}]`).click();const port=p.locator('.lab-properties button').filter({hasText:/^Подключить к Port \d+$/}).first();await port.evaluate(n=>{n.click();n.click();});}
async function reopen(p){await require('./walk.cjs').talk(p);if(!await p.locator('.network-lab').count())await click(p,'Открыть Network Lab');await tutorial(p);}
module.exports=async function stress(p,chapter){
 const before=await p.evaluate(()=>({xp:Patrol.progress.xp,completed:Patrol.progress.completedChapters,links:Patrol.ui.networkLab.model.links.length}));
 await click(p,'Ethernet');await p.locator(`[data-device=${chapter===2?'d3':'d1'}]`).click();if(!await p.locator('.lab-message').getAttribute('data-error-code'))await p.locator(`[data-device=${chapter===3?'d4':chapter===2?'d1':'d3'}]`).click();if(chapter===1){assert.equal(await p.evaluate(()=>Patrol.ui.networkLab.model.links.length),1);await click(p,'Ethernet');await p.locator('[data-device=d1]').click();}assert.ok((await p.locator('.lab-message').textContent()).length>15);assert.ok(await p.locator('.lab-message').getAttribute('data-error-code'));
 if(await p.getByRole('button',{name:'Удалить лишний кабель',exact:true}).count())await click(p,'Удалить лишний кабель');
 await click(p,'Восстановить задание');await p.waitForFunction(()=>document.querySelector('.lab-message')?.textContent.includes('восстановлен'));
 // Repeat a correct available physical action, or save an address action, before reset.
 if([1,2,3].includes(chapter)){await repeatedCable(p,chapter===2?'d3':'d1','d2');assert.equal(await p.evaluate(()=>Patrol.ui.networkLab.model.links.length),chapter===2?2:1);}
 else if(chapter===7){await click(p,'+ Router');const router=await p.locator('.lab-device.router').getAttribute('data-device');await repeatedCable(p,'d2',router);}
 else if([5,6,8].includes(chapter)){await p.locator('[data-device=d3]').click();if(chapter===5){await p.getByLabel('Октет 1 PC-02',{exact:true}).fill('192');await p.getByLabel('Октет 1 PC-02',{exact:true}).press('Tab');}else{await p.getByLabel(chapter===6?'IP-адрес':'Шлюз',{exact:true}).fill(chapter===6?'192.168.1.20':'192.168.2.1');}await p.getByRole('button',{name:'Сохранить настройки',exact:true}).evaluate(n=>{n.click();n.click();});}
 else {await p.locator('[data-device=d1]').dblclick();assert.equal(await p.evaluate(()=>Patrol.ui.networkLab.model.links.length),before.links);}
 await p.waitForTimeout(250);await p.evaluate(()=>Patrol.engines.save.pending);await p.reload();await p.waitForFunction(()=>typeof ready!=='undefined'&&ready);await reopen(p);
 if(chapter===3){assert.equal(await p.evaluate(()=>Patrol.ui.networkLab.model.links.length),1);await click(p,'Ethernet');await p.locator('[data-device=d3]').click();await p.waitForTimeout(250);await p.evaluate(()=>Patrol.engines.save.pending);await p.reload();await p.waitForFunction(()=>typeof ready!=='undefined'&&ready);await reopen(p);assert.equal(await p.locator('.quest-target').getAttribute('data-device'),'d2');await p.locator('[data-device=d2]').click();await p.getByRole('button',{name:'Подключить к Port 2',exact:true}).click();}
 await click(p,'Восстановить задание');await p.waitForFunction(()=>document.querySelector('.lab-message')?.textContent.includes('восстановлен'));await p.waitForTimeout(250);await p.evaluate(()=>Patrol.engines.save.pending);await p.reload();await p.waitForFunction(()=>typeof ready!=='undefined'&&ready);await reopen(p);
 const after=await p.evaluate(()=>({xp:Patrol.progress.xp,completed:Patrol.progress.completedChapters,links:Patrol.ui.networkLab.model.links.length,tool:Patrol.ui.networkLab.model.ui.selectedTool}));assert.equal(after.xp,before.xp);assert.deepEqual(after.completed,before.completed);assert.equal(after.links,before.links);assert.equal(after.tool,null);assert.equal(await p.locator('[data-task-guide] .task-visible-instruction').isVisible(),true);
 console.log(`PASS: chapter ${chapter} UI wrong-device/repeat/reset/refresh/restore remains executable; XP and completed chapters preserved`);
};
