'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),P=require('../server/content.cjs');
const files=['data/curriculum.js','data/lessons.js','data/worldObjects.js','data/taskContracts.js','data/dialogues.js','data/quizzes.js','network/course.js','ui/networkLab.js'];
for(const file of files){const text=fs.readFileSync(file,'utf8');assert.ok(!/college[.](test|local)/i.test(text),file+': inconsistent DNS domain');assert.ok(!/DHCP не моделируется/.test(text),file+': obsolete DHCP definition');}
require('node:vm').runInNewContext(fs.readFileSync('data/lessons.js','utf8'),{Patrol:P});
const lesson=id=>P.data.lessons.find(l=>l.id===id),text=id=>JSON.stringify(lesson(id));
assert.match(text('dhcp'),/Discover → Offer → Request → ACK/);assert.match(text('dhcp'),/согласно конфигурации/);assert.match(text('dhcp'),/не настоящий/);assert.match(text('dhcp'),/не работа DHCP/);
assert.match(text('dns'),/college.ru/);assert.match(text('dns'),/По IP связь может работать/);
assert.match(text('gateway'),/Для связи между ними – нет/);assert.match(text('localhost'),/локальный сетевой стек/);assert.match(text('localhost'),/а не кабель/);
assert.match(text('storage'),/не заменяет резервное копирование/);assert.match(text('ip'),/Синтаксически правильная запись ещё не означает/);assert.match(text('mask'),/Существуют и другие маски/);
assert.match(P.data.curriculum[4].cards[1].technical,/IP-пакет/);assert.match(P.data.curriculum[4].cards[1].technical,/TCP использует сегменты/);assert.match(P.data.curriculum[4].cards[1].technical,/Ethernet переносит его в кадре/);
assert.match(P.data.curriculum[3].practice,/соединения демонстрации сброшены/);
for(const [i,t]of P.data.taskContracts.flows[3].slice(0,3).entries())assert.ok(t.visibleInstruction.includes('Port '+(i+1)));
for(const t of Object.values(P.data.taskContracts.registry)){assert.ok(t.visibleInstruction&&t.expectedResult&&t.explanation,t.id);assert.ok(t.steps.length,t.id);}
const m=P.network.course.model(11);assert.equal(P.network.course.terminal(m,'ping 192.168.1.100').ok,true);assert.equal(P.network.course.terminal(m,'ping college.ru').ok,false);m.devices[0].dns='192.168.1.100';assert.equal(P.network.course.terminal(m,'nslookup college.ru').ok,true);
console.log('PASS: content consistency; DHCP model/configuration/prepared fields, one DNS domain, gateway/loopback/IPv4/masks/RAID, segment-packet-frame, chapter 3 reset and exact ports, all visible task contracts');
