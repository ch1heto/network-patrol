'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const content=require('../server/content.cjs');
const root=path.resolve(__dirname,'..');let scripts=0,assets=0,doors=0;
function visit(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.prototype-checks','storage','.git'].includes(item.name))continue;const f=path.join(dir,item.name);if(item.isDirectory())visit(f);else if(/\.(js|cjs)$/.test(f)){const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);scripts++;}}}
visit(root);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(match[1].startsWith('/')||match[1].startsWith('data:'))continue;assert.ok(fs.existsSync(path.join(root,match[1])),match[1]);}
for(const npc of Object.values(content.data.npcs)){if(npc.asset){assert.ok(fs.existsSync(path.join(root,npc.asset)),npc.asset);assets++;}for(const id of npc.members||[])assert.ok(content.data.npcs[id]);}
const animations=JSON.parse(fs.readFileSync(path.join(root,'assets/animations.json'),'utf8'));
for(const a of Object.values(animations.animations)){assert.ok(fs.existsSync(path.join(root,a.src)));assets++;}
for(const L of Object.values(content.data.locations)){for(const id of L.npcs)assert.ok(content.data.npcs[id]);for(const id of L.objects)assert.ok(content.data.objects[id]);for(const d of L.doors){const target=content.data.locations[d.target];assert.ok(target,`${L.id}/${d.id} target`);const entry=target.entries[d.entry];assert.ok(entry,`${L.id}/${d.id} entry`);assert.ok(Number.isFinite(entry.x)&&entry.x>=0&&entry.x<=target.width);assert.ok(Number.isFinite(entry.y)&&entry.y>=target.farY&&entry.y<=target.nearY);doors++;}}
assert.ok(fs.existsSync(path.join(root,'assets/npcs/alexey.webp')));
for(const c of content.data.chapters.filter(c=>!c.planned))assert.ok(c.requiredFlags.length>0);
for(const id of content.data.chapters[1].requiredTasks)assert.ok(id==='firstNetwork'||content.data.tasks[id]);
for(const task of Object.values(content.data.tasks).filter(t=>t.type==='quiz'))assert.ok(task.explanation&&task.options.length&&task.answer.every(n=>n>=0&&n<task.options.length));
console.log(`PASS: ${scripts} JavaScript syntax checks, ${assets} image assets, ${doors} doors/entry points and required content`);
