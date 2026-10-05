'use strict';
(() => {
 const N=Patrol.network,S=N.simulator,T=N.topology;
 const stages=c=>['intro',...c.cards.map((_,i)=>`theory-${i}`),'demo','training','practical','result'];
 function migrate(p){
   p.course??={};
   if(p.completedChapters.includes(1)&&p.currentChapter>=2&&p.currentChapter<=15){p.course[p.currentChapter]??={step:0,wrong:0,hints:0};p.currentObjective='course';}
   if(p.currentChapter>=12&&!p.unlockedLocations.includes('staff'))p.unlockedLocations.push('staff');
   return p;
 }
 function info(p){const c=Patrol.data.curriculum[p.currentChapter];if(!c||!p.completedChapters.includes(1))return null;const state=p.course?.[c.id]||{step:0,wrong:0,hints:0};return {c,state,stage:stages(c)[state.step]||'intro'};}
 function model(chapter,demo=false){
   const m=N.firstTask(),[a,sw,b]=m.devices;a.ip='192.168.1.10';b.ip='192.168.1.20';
   if(chapter===2){T.connect(m,a.id,sw.id);if(demo)return m;}
   else if(chapter===3){if(demo){T.connect(m,a.id,sw.id);T.connect(m,b.id,sw.id);}const third=T.add(m,'pc');third.name='PC-03';third.ip='192.168.1.30';third.x=440;third.y=60;}
   else {T.connect(m,a.id,sw.id);T.connect(m,b.id,sw.id);}
   if(chapter===5)b.ip=demo?'192.168.1.20':'';
   if(chapter===6)b.ip=demo?'192.168.1.20':'192.168.2.20';
   if(chapter===7||chapter===8){
     T.remove(m,m.links.find(l=>[l.fromDevice,l.toDevice].includes(b.id)).id);b.ip='192.168.2.20';b.x=810;sw.name='SW-A';sw.x=290;
     const sw2=T.add(m,'switch');sw2.name='SW-B';sw2.x=640;sw2.y=280;T.connect(m,b.id,sw2.id);
     if(chapter===8||demo){const r=T.add(m,'router');r.name='RT-01';r.x=470;r.y=140;r.interfaces[0].ip='192.168.1.1';r.interfaces[1].ip='192.168.2.1';T.connect(m,sw.id,r.id);T.connect(m,r.id,sw2.id);a.gateway='192.168.1.1';b.gateway=demo?'192.168.2.1':'';}
   }
   if(chapter>=10){const server=T.add(m,'server');server.name='SRV-01';server.ip='192.168.1.100';server.x=700;server.y=350;server.services={dns:true,records:{'college.ru':server.ip},dhcp:true,poolStart:45,poolEnd:60,gateway:'192.168.1.1',dnsAddress:server.ip};T.connect(m,server.id,sw.id);a.dns=chapter===11&&!demo?'':server.ip;
     if(chapter===10){const laptop=T.add(m,'laptop');laptop.name='Новый Laptop';laptop.ip='';laptop.x=250;laptop.y=380;if(demo){T.connect(m,laptop.id,sw.id);dhcp(m,laptop.id);}}
   }
   return m;
 }
 function dhcp(m,id){
   const d=m.devices.find(d=>d.id===id),server=m.devices.find(s=>s.type==='server'&&s.services?.dhcp&&T.path(m,id,s.id)&&!T.path(m,id,s.id).some(x=>m.devices.find(n=>n.id===x)?.type==='router'));
   if(!d||!server)return {ok:false,message:'DHCP не ответил. Проверьте Link, доступность сервера в своей LAN и включение службы. Настройки не получены.'};
   const start=server.services.poolStart,end=server.services.poolEnd;
   if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end>254||start>end)return {ok:false,message:'Пул DHCP настроен неправильно – допустимые свободные адреса должны принадлежать этой учебной подсети.'};
   const prefix=server.ip.split('.').slice(0,3).join('.');let address;
   for(let n=start;n<=end;n++){const v=`${prefix}.${n}`;if(!m.devices.some(p=>p.id!==id&&p.ip===v)){address=v;break;}}
   if(!address)return {ok:false,message:'Свободных адресов в пуле нет. Расширьте допустимый пул или освободите аренду.'};
   Object.assign(d,{ip:address,mask:server.mask,gateway:server.services.gateway,dns:server.services.dnsAddress});d.services.dhcpLease={server:server.id,address};T.refresh(m);
   return {ok:true,message:`Discover → Offer ${address} → Request → ACK. Получены IP ${d.ip}, маска ${d.mask}, шлюз ${d.gateway}, DNS ${d.dns}.`};
 }
 function terminal(m,command){
   const tokens=typeof command==='string'?command.trim().toLowerCase().split(/\s+/):[];
   if(tokens.length!==2||!['ping','nslookup'].includes(tokens[0]))return {ok:false,message:'Учебный терминал принимает только ping <IP/имя> и nslookup <имя>. Он не выполняет команды компьютера.'};
   const src=m.devices.find(d=>d.name==='PC-01');if(!src)return {ok:false,message:'В модели нет PC-01.'};
   if(tokens[0]==='ping'&&['127.0.0.1','localhost'].includes(tokens[1]))return {ok:true,message:'Ответ 127.0.0.1 · loopback. Проверка осталась внутри PC-01, физический кабель не участвовал.',path:[src.id]};
   if(tokens[0]==='nslookup'){
     const server=m.devices.find(d=>d.ip===src.dns&&d.services?.dns);if(!server)return {ok:false,message:'DNS-сервер не настроен или служба выключена. Сравните поле DNS и адрес серверной службы.'};
     const path=S.check(m,src.id,server.id);if(!path.ok)return path;
     const address=server.services.records[tokens[1]];return address?{ok:true,message:`${tokens[1]} → ${address} · ответ учебного DNS.`,path:path.path}:{ok:false,message:'Сервер доступен, но DNS-записи такого имени нет. Проверьте имя и запись.'};
   }
   return S.check(m,src.id,tokens[1]);
 }
 const faults=['cable','link','ip','duplicate','mask','gateway','dns','dhcp','resource'];
 const faultNames=['Кабель отключён','Link DOWN / порт выключен','Неправильный IP','Конфликт IP','Неправильная маска','Неправильный шлюз','DNS не настроен','DHCP не работает','Файловая служба недоступна'];
 function ticket(type){const m=model(type==='gateway'?8:11,true),a=m.devices[0];m.resourceUp=true;
   if(type==='gateway'){const server=T.add(m,'server');server.name='SRV-01';server.ip='192.168.1.100';server.services={dns:true,records:{'college.ru':server.ip},dhcp:true,poolStart:45,poolEnd:60,gateway:'192.168.1.1',dnsAddress:server.ip};a.dns=server.ip;T.connect(m,server.id,m.devices[1].id);}
   if(type==='cable')T.remove(m,m.links[0].id);
   if(type==='link')a.ports[0].up=false;
   if(type==='ip')a.ip='192.168.300.10';
   if(type==='duplicate')a.ip='192.168.1.20';
   if(type==='mask')a.mask='255.0.255.0';
   if(type==='gateway')a.gateway='192.168.1.99';
   if(type==='dns')a.dns='';
   if(type==='dhcp'){m.devices.find(d=>d.type==='server').services.dhcp=false;a.ip='';}
   if(type==='resource')m.resourceUp=false;
   T.refresh(m);return m;
 }
 function repair(m,cause){const a=m.devices[0],server=m.devices.find(d=>d.type==='server'),sw=m.devices.find(d=>d.type==='switch');
   if(cause==='cable'&&!m.links.some(l=>[l.fromDevice,l.toDevice].includes(a.id)&&[l.fromDevice,l.toDevice].includes(sw.id)))T.connect(m,a.id,sw.id);
   if(cause==='link'){a.ports.forEach(p=>p.up=true);m.links.forEach(l=>l.status='up');}
   if(cause==='ip'||cause==='duplicate')a.ip='192.168.1.10';
   if(cause==='mask')a.mask='255.255.255.0';
   if(cause==='gateway')a.gateway='192.168.1.1';
   if(cause==='dns')a.dns='192.168.1.100';
   if(cause==='dhcp'){server.services.dhcp=true;return dhcp(m,a.id);}
   if(cause==='resource')m.resourceUp=true;
   T.refresh(m);return {ok:true,message:'Изменение применено к учебной модели.'};
 }
 function observations(m,check){const a=m.devices[0];T.refresh(m);
   if(check==='link')return `${a.name} · ${a.linkState}; кабелей ${a.connectedLinks.length}; порт ${a.ports[0].up?'включён':'выключен'}.`;
   if(check==='settings')return `IP ${a.ip||'не задан'}, маска ${a.mask}, шлюз ${a.gateway||'не задан'}, DNS ${a.dns||'не задан'}.`;
   if(check==='ping')return terminal(m,`ping ${m.devices.find(d=>d.name==='PC-02').ip}`).message;
   if(check==='dns')return terminal(m,'nslookup college.ru').message;
   if(check==='dhcp')return `Служба DHCP ${m.devices.find(d=>d.type==='server')?.services.dhcp?'включена':'выключена'}.`;
   if(check==='resource')return m.resourceUp?'Файловая служба включена; доступ зависит от пути.':'Файловая служба выключена, общая папка недоступна.';
   return 'Выберите проверку.';
 }
 function validate(chapter,response,m,tickets=[]){
   const bad=(message,code='TASK_STATE_INVALID')=>({ok:false,code,message}),good=message=>({ok:true,message});
   if([2,3,4,5,6,7,8,9,10,11].includes(chapter)&&!N.validModel(m))return bad('Схема повреждена. Восстановите учебную схему, затем повторите настройку.');
   if(chapter>=2&&chapter<=11&&(!m.devices[0]||!m.devices[1]||!m.devices[2]||m.devices[0].type!=='pc'||m.devices[1].type!=='switch'||m.devices[2].type!=='pc'))return bad('В схеме должны оставаться исходные PC-01, Switch и PC-02. Нажмите «Восстановить задание» и повторите текущие подключения или настройки.');
   if(chapter===15){if(!Array.isArray(response)||response.length!==tickets.length)return bad('Нужно завершить каждую заявку.');for(let i=0;i<tickets.length;i++){const r=response[i];if(!r||!r.fixed||r.cause!==tickets[i]||!Array.isArray(r.checks)||new Set(r.checks.filter(x=>['link','settings','ping','dns','dhcp','resource'].includes(x))).size<2)return bad(`Заявка ${i+1}: сопоставьте наблюдения с причиной, выполните минимум две разные проверки и примените выбранное исправление. Готовое решение NPC не выдаёт.`);if(!N.validModel(r.model)||typeof r.model.resourceUp!=='boolean')return bad(`Заявка ${i+1}: отсутствует исправленная учебная схема. Примените изменение и повторите исходную проверку.`);const restored=structuredClone(r.model);if(tickets[i]==='dhcp'&&!restored.devices[0].services.dhcpLease)return bad(`Заявка ${i+1}: нужна автоматическая аренда DHCP, а не ручная подмена адреса.`);const tested=tickets[i]==='dns'?terminal(restored,'nslookup college.ru'):terminal(restored,`ping ${restored.devices[2].ip}`);if(!tested.ok||!restored.resourceUp)return bad(`Заявка ${i+1}: исходная проверка после исправления не прошла.`);}return good('Все заявки диагностированы и подтверждены. Причины и порядок проверок записаны.');}
   if(chapter===12)return response?.local&&response?.remote&&response?.disconnected&&response?.answer==='remote'?good('C: остался доступен, Z: требует сети до другого устройства.'):bad('Сначала сохраните файл в C: и Z:, затем отключите сеть. C: хранится здесь, Z: находится на файловом сервере.');
   if(chapter===13){const expected=['files','dns','dhcp','web','database'],roles={files:'файлового сервера',dns:'DNS',dhcp:'DHCP',web:'веб-сервера',database:'базы данных'};const labels=['Общая папка','Поиск адреса по имени','Автонастройка','Страница сайта','Записи приложения'];const i=expected.findIndex((v,i)=>response?.[i]!==v);return i<0?good('Все серверные роли выбраны по запросам клиентов.'):bad(`${labels[i]} – нужна служба ${roles[expected[i]]}. DNS ищет адрес, DHCP выдаёт настройки, файлы предоставляет файловая служба, страницы – веб, записи – база данных.`);}
   if(chapter===14)return response?.tested?.includes('0')&&response.tested.includes('1')&&response.tested.includes('5')&&response.answer==='backup'?good('RAID 0 не выдерживает отказ диска. RAID 1/5 в модели выдерживают один; резервная копия нужна отдельно.'):bad('Проверьте отказ одного диска во всех трёх моделях. RAID не защищает от случайного удаления – нужна отдельная резервная копия.');
   const [a,sw,b]=m.devices;
   if(chapter===4&&!response?.sent)return bad('Нажмите Отправить данные и проследите путь через SW-01. Физическая схема уже готова.');
   if(chapter===2||chapter===3){const pcs=m.devices.filter(d=>d.type==='pc');if(pcs.length!==(chapter===2?2:3))return bad('Сохраните требуемые ПК и один учебный Switch.');T.refresh(m);if(pcs.some(d=>d.linkState!=='up'||!m.links.some(l=>[l.fromDevice,l.toDevice].includes(d.id)&&[l.fromDevice,l.toDevice].includes(sw.id)&&l.status==='up')))return bad('Каждому ПК нужен отдельный активный Ethernet-кабель до SW-01. Посмотрите Link и включение портов.');if(chapter===2)return good('Оба Link UP. Физическое соединение готово.');}
   if(chapter===7){const r=m.devices.find(d=>d.type==='router'),sws=m.devices.filter(d=>d.type==='switch');if(!r||sws.length!==2||sws.some(d=>!T.path(m,d.id,r.id)))return bad('Для двух LAN добавьте один Router и отдельные кабели к обоим Switch.');const first=m.links.find(l=>[l.fromDevice,l.toDevice].includes(sw.id)&&[l.fromDevice,l.toDevice].includes(r.id));if(!first||(first.fromDevice===r.id?first.fromPort:first.toPort)!=='eth0')return bad('SW-A должен подключаться к eth0 – интерфейсу сети 192.168.1.0/24.');return good('Две LAN физически связаны через Router. Продолжите главой 8 с Ириной Викторовной: настроим шлюзы ПК.');}
   if(chapter===5){if(S.ip(b.ip)===null)return bad('IPv4 должен иметь четыре октета от 0 до 255. Число 300 недопустимо.','INVALID_IPV4');if(a.ip===b.ip)return bad('Такой адрес уже использует PC-01. Назначьте PC-02 свободный адрес.','IP_CONFLICT');if(!S.same(a.ip,b.ip,'255.255.255.0'))return bad('Адрес корректно записан, но относится к другой подсети учебного примера. Маску подробно изучим в следующей главе.','WRONG_SUBNET');}
   if(chapter===6&&(a.mask!=='255.255.255.0'||b.mask!=='255.255.255.0'))return bad('В этой работе используйте /24, то есть 255.255.255.0. Другие маски меняют границу учебной сети.');
   if(chapter===9){const required=['ping 127.0.0.1','ping 192.168.1.20'];if(required.some(cmd=>!response?.commands?.includes(cmd)||!terminal(m,cmd).ok))return bad('Выполните две успешные проверки: loopback и соседний ПК по IP. Первая не проверяет кабель.');return good('Loopback проверен внутри ПК, соседний адрес – по физическому пути.');}
   if(chapter===10){const laptop=m.devices.find(d=>d.type==='laptop');if(!laptop?.services.dhcpLease)return bad('Новый ноутбук должен получить аренду DHCP, а не только ручной IP.');const copy=structuredClone(m),lease=dhcp(copy,laptop.id);if(!lease.ok)return lease;if(copy.devices.find(d=>d.id===laptop.id).ip!==laptop.ip)return bad('Параметры не соответствуют свободной аренде учебного DHCP. Запросите настройки снова.');return S.check(m,laptop.id,'192.168.1.100');}
   if(chapter===11){if(!response?.commands?.includes('nslookup college.ru')||!response.commands.includes('ping college.ru'))return bad('После настройки DNS выполните nslookup college.ru и ping college.ru. Сравните ответ имени и сетевую доступность.');const result=terminal(m,'nslookup college.ru');return result.ok?terminal(m,'ping college.ru'):result;}
   return S.check(m,a.id,b.id);
 }
 N.course={stages,migrate,info,model,dhcp,terminal,validate,faults,faultNames,ticket,repair,observations};
})();
