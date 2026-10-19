'use strict';
(() => {
  let model = null, selected = null, cableSource = null, mode = false, busy = false;
  let lesson = null, taskOptions=null, actionLock=false,sandbox=false;
  let board, svg, panel, message, source, target, portChoice=null,tutorialActive=false,demoSaved=false;
  const topology = Patrol.network.topology;
  const validModel = Patrol.network.validModel;
  const node = (tag, text = '', className = '') => { const n = document.createElement(tag); n.textContent = text; n.className = className; return n; };
  function persist() { if(!model)return;topology.refresh(model);if(taskOptions){const prepared=Patrol.network.taskState.prepare(model,taskOptions);if(prepared.recovered){model=prepared.model;selected=null;mode=false;cableSource=null;portChoice=null;demoSaved=false;const cs=Patrol.ui.course.current()?.state;if(cs){cs.draft={};delete cs.failedTask;}report(prepared.message);render();}}model.ui={selectedTool:mode?'ethernet':null,selectedDevice:selected,cableSource,portChoice:portChoice?{...portChoice}:null,demoSaved,currentSubstep:portChoice?'port':cableSource?'destination':mode?'source':'tool'};topology.assertInvariants(model); if(lesson?.demo){if(lesson.guided){const cs=Patrol.progress.course[lesson.chapter];cs.demoModel=structuredClone(model);cs.demoSaved=demoSaved;Patrol.progress.courseDraft={chapter:lesson.chapter,model:structuredClone(model),demo:true,demoSaved};Patrol.engines.save.write();}syncGuide();return;}if(lesson){Patrol.progress.course[lesson.chapter].model=structuredClone(model);Patrol.progress.courseDraft={chapter:lesson.chapter,model:structuredClone(model),draft:Patrol.progress.course[lesson.chapter].draft||{}};}else Patrol.progress.networkModel = structuredClone(model); Patrol.engines.save.write();syncGuide(); }
  function syncGuide(){if(!model)return;const ctx={surface:'lab',sandbox,busy,guided:lesson?.guided,demo:lesson?.demo,model,selected,mode,cableSource,portChoice,demoSaved,response:Patrol.ui.course.current()?.state.draft};Patrol.ui.taskGuide?.setContext(ctx);Patrol.ui.taskGuide?.refresh();}
  function guarded(){return taskOptions?.mode==='TRAINING';}
  function allowDevice(id){const guide=Patrol.ui.taskGuide,allowed=Patrol.network.taskState.allowed(guide.current(),model,guide.context,{type:'device',id});if(allowed.ok)return true;reportError(topology.error(allowed.code,allowed.message,allowed.details));return false;}
  function packetLessonButton() {
    if (document.querySelector('#overlay-actions [data-packet-lesson]')) return;
    const button = Patrol.engines.ui.button('Узнать о пакете и завершить главу', () => { Patrol.engines.ui.close(); Patrol.engines.dialogues.start('packet'); });
    button.dataset.packetLesson = 'true';button.dataset.taskControl='packet-lesson';
  }
  function button(text, action, parent, className = '') {
    const b = node('button', text, className); b.type = 'button';if(text)b.setAttribute('aria-label',text);b.addEventListener('click', async () => { if (!actionLock&&b.isConnected&&!busy&&(!tutorialActive||b.closest('.lab-tutorial'))){const q=Patrol.ui.taskGuide.current().questMarkerTarget;if(guarded()&&b.dataset.taskControl!=='restore-task'&&!b.closest('.lab-tutorial')&&q?.type==='control'&&b.dataset.taskControl!==q.id){reportError(topology.error('WRONG_DEVICE_FOR_STEP',Patrol.ui.taskGuide.current().wrongActionFeedback));return;}if(guarded()&&b.dataset.taskControl!=='restore-task'&&!b.closest('.lab-tutorial')&&q?.type==='device'&&!b.classList.contains('lab-device')){report(Patrol.ui.taskGuide.current().wrongActionFeedback,false);return;}actionLock=true;try{await action();}catch(e){reportError(e);}finally{actionLock=false;}} }); const key=text==='Восстановить задание'?'restore-task':text==='Ethernet'?'ethernet':text==='+ Router'?'add-router':text==='Таблица портов проверена'?'ports-reviewed':['Проверить сеть','Отправить данные'].includes(text)?'check-network':text==='Сохранить настройки'?'save-settings':text.startsWith('Подключить к Port ')?'port-'+text.match(/Port (\d+)/)[1]:null;if(key)b.dataset.taskControl=key;parent.append(b); return b;
  }
  function report(text, ok = null) { if(!message?.isConnected)return;message.parentElement?.querySelector('.lab-repair-actions')?.remove();delete message.dataset.errorCode;message.textContent = text; message.className = `lab-message ${ok === true ? 'ok' : ok === false ? 'error' : ''}`; }
  function reportError(e){report(e.message,false);if(!message?.isConnected)return;message.dataset.errorCode=e.code||'TASK_STATE_INVALID';if(e.details?.connectionId&&!guarded()){const actions=node('div','','lab-repair-actions');button('Удалить лишний кабель',()=>{topology.remove(model,e.details.connectionId);mode=false;cableSource=null;portChoice=null;render();persist();report('Лишний кабель удалён. Оба порта свободны. '+Patrol.ui.taskGuide.current().visibleInstruction,true);},actions);message.after(actions);}}
  async function resetTask(){if(busy)return;await Patrol.engines.save.flush();const i=Patrol.ui.course.current();if(lesson&&i){await Patrol.engines.save.action({action:'courseReset',chapter:i.c.id,step:i.state.step});taskOptions=Patrol.network.taskState.settings({chapter:lesson.chapter,demo:lesson.demo,generation:i.state[lesson.demo?'demoGeneration':'taskGeneration']||0});const cs=Patrol.ui.course.current().state;taskOptions.generation=cs[lesson.demo?'demoGeneration':'taskGeneration']||0;}else if(!Patrol.progress.completedChapters.includes(1)){await Patrol.engines.save.action({action:'resetTask'});taskOptions=Patrol.network.taskState.settings({chapter:1,generation:Patrol.progress.networkGeneration||0});}model=Patrol.network.taskState.initial(taskOptions);selected=null;mode=false;cableSource=null;portChoice=null;demoSaved=false;delete Patrol.progress.courseDraft;render();persist();report('Учебный стенд восстановлен для текущего задания.',true);}
  function select(id) {
    if (busy||tutorialActive) return;
    if(!allowDevice(id))return;
    if(lesson?.demo&&!lesson.guided){selected=id;render();return;}
    if (mode && cableSource && cableSource !== id) {
      const a=model.devices.find(d=>d.id===cableSource),b=model.devices.find(d=>d.id===id);
      try{topology.endpoint(model,a?.id,null,'source');topology.endpoint(model,b?.id,null,'destination');}catch(e){reportError(e);return;}if(a?.type==='switch'||b?.type==='switch'){portChoice={from:cableSource,to:id,switchId:a.type==='switch'?a.id:b.id};selected=portChoice.switchId;render();persist();return;}
      try { topology.connect(model, cableSource, id); report('Готово. Ethernet-кабель подключён. Link UP. Дальше выполните новое действие над полем.',true);cableSource = null; mode = false; }
      catch (e) { reportError(e); }
    } else if (mode) {try{topology.endpoint(model,id,null,'source');}catch(e){reportError(e);return;} cableSource = id; report('Теперь выберите второе устройство. Используется первый свободный Ethernet-порт.'); }
    selected = id; render(); persist();
  }
  function drawLinks() {
    svg.replaceChildren();
    for (const link of model.links) {
      const a = model.devices.find(d => d.id === link.fromDevice), b = model.devices.find(d => d.id === link.toDevice);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      for (const [key, value] of Object.entries({ x1: a.x + 55, y1: a.y + 35, x2: b.x + 55, y2: b.y + 35, class: `lab-link ${link.status === 'up' ? '' : 'down'}`, 'data-link': link.id })) line.setAttribute(key, value);
      line.addEventListener('click', () => { if (!busy) linkProperties(link); }); svg.append(line);
    }
  }
  function render() {
    topology.refresh(model); drawLinks();
    board.querySelectorAll('.lab-device').forEach(n => n.remove());
    for (const d of model.devices) {
      const b = button('', () => select(d.id), board, `lab-device ${d.type} ${selected === d.id ? 'selected' : ''} ${cableSource === d.id ? 'cable-source' : ''}`);
      b.dataset.device = d.id;b.setAttribute('aria-label',d.name); b.style.left = `${d.x}px`; b.style.top = `${d.y}px`;
      b.append(node('span', { pc: '▣', laptop: '▱', switch: '▤', router: '⇄', server: '▥', printer: '▧', ap: '◉' }[d.type], 'device-icon'), node('strong', d.name), node('small', d.linkState === 'up' ? 'Link UP · физическая связь есть' : 'Link DOWN · физической связи нет'));
      let drag = null, dragged = false;
      b.addEventListener('pointerdown', e => {
        if (busy || guarded() || mode || (e.pointerType === 'mouse' && e.button !== 0)) return;
        drag = { cx: e.clientX, cy: e.clientY, x: d.x, y: d.y }; dragged = false; b.setPointerCapture(e.pointerId);
      });
      b.addEventListener('pointermove', e => {
        if (!drag || busy) return;
        const dx = e.clientX - drag.cx, dy = e.clientY - drag.cy;
        if (Math.hypot(dx,dy) > 5) dragged = true;
        if (!dragged) return;
        d.x = Math.max(10, Math.min(875, drag.x + dx)); d.y = Math.max(10, Math.min(500, drag.y + dy));
        b.style.left = `${d.x}px`; b.style.top = `${d.y}px`; drawLinks();
      });
      b.addEventListener('pointerup', e => { if (drag) { drag = null; persist(); if (dragged) { e.preventDefault(); selected = d.id; properties(d); } } });
      b.addEventListener('pointercancel', () => { drag = null; persist(); });
      b.addEventListener('keydown', e => {
        const vector = { ArrowLeft: [-10,0], ArrowRight: [10,0], ArrowUp: [0,-10], ArrowDown: [0,10] }[e.key];
        if (!vector || busy || guarded()) return; e.preventDefault(); d.x = Math.max(10,Math.min(875,d.x+vector[0])); d.y = Math.max(10,Math.min(500,d.y+vector[1]));
        b.style.left = `${d.x}px`; b.style.top = `${d.y}px`; drawLinks(); persist();
      });
    }
    const previous = source.value; source.replaceChildren();
    model.devices.filter(d => ['pc','laptop','server','printer'].includes(d.type)).forEach(d => source.add(new Option(d.name,d.id)));
    source.value = model.devices.some(d => d.id === previous) ? previous : 'd1';
    if (selected) properties(model.devices.find(d => d.id === selected));
    else { panel.replaceChildren(node('h3','Свойства'), node('p','Выберите устройство или кабель на поле.')); }
    syncGuide();
  }
  function field(label, value, change, help = '') {
    const wrapper = node('label', label); const input = node('input'); input.value = value || ''; input.title = help;input.setAttribute('aria-label',label);if(label==='Шлюз')input.dataset.taskControl='gateway';if(label==='DNS')input.dataset.taskControl='dns';if(label==='IP-адрес')input.dataset.taskControl='ip-1';
    input.addEventListener('change', () => { if (!busy&&!guarded()) { change(input.value.trim()); persist(); } }); wrapper.append(input); panel.append(wrapper);if(help)panel.append(node('small',help,'field-help'));return input;
  }
  function linkProperties(link) {
    if(guarded()){report(Patrol.ui.taskGuide.current().wrongActionFeedback,false);return;}selected = null; panel.replaceChildren(node('h3', 'Ethernet-кабель'));
    const names = [link.fromDevice,link.toDevice].map(id => model.devices.find(d => d.id === id).name);
    panel.append(node('p', `${names[0]} ${link.fromPort} ↔ ${names[1]} ${link.toPort}`));
    button(link.status === 'up' ? 'Выключить link' : 'Включить link', () => { link.status = link.status === 'up' ? 'down' : 'up'; persist(); render(); }, panel);
    button('Удалить кабель', () => { topology.remove(model, link.id); persist(); render(); }, panel);
  }
  function properties(d) {
    if (!d) return; panel.replaceChildren(node('h3', d.name));
    const nameField=field('Название', d.name, value => { d.name = value.slice(0,30) || d.name; });nameField.disabled=!!lesson||!Patrol.progress.completedChapters.includes(1);
    panel.append(node('small', `Link ${d.linkState.toUpperCase()}`));
    if(portChoice&&d.id===portChoice.switchId){panel.append(node('h4','Выберите порт для кабеля'));d.ports.forEach((port,i)=>{const state=topology.portState(model,d.id,port.id),occupied=state.occupied;const b=button(`Подключить к Port ${i+1}${occupied?' · '+model.devices.find(n=>n.id===state.peerId)?.name:''}`,()=>{try{topology.connect(model,portChoice.from,portChoice.to,portChoice.from===d.id?port.id:null,portChoice.to===d.id?port.id:null);portChoice=null;cableSource=null;mode=false;render();persist();report(`Готово. Кабель подключён к Port ${i+1}. Link UP означает активную физическую связь. Дальше – ${Patrol.ui.taskGuide.current().goal}.`,true);}catch(e){reportError(e);}},panel);let sourceFree=true;try{topology.endpoint(model,portChoice.from===d.id?portChoice.to:portChoice.from,null,'source');}catch{sourceFree=false;}b.disabled=occupied||!sourceFree;});}
    const level=lesson?.chapter||(Patrol.progress.currentChapter===0&&Patrol.progress.completedChapters.includes(1)?15:Patrol.progress.currentChapter);
    if(level>=5 && !['switch','ap','router'].includes(d.type)) {
      if(level===5){const wrap=node('fieldset','','ip-octets');wrap.append(node('legend','IPv4 · четыре октета'));const values=d.ip.split('.');for(let i=0;i<4;i++){const input=node('input');input.type='number';input.min='0';input.max='255';input.setAttribute('aria-label',`Октет ${i+1} ${d.name}`);input.value=values[i]||'';input.dataset.taskControl='ip-'+(i+1);input.addEventListener('change',()=>{if(lesson?.guided&&Patrol.ui.taskGuide.current().questMarkerTarget.id!==input.dataset.taskControl){input.value=d.ip.split('.')[i]||'';report(Patrol.ui.taskGuide.current().wrongActionFeedback,false);return;}if(lesson?.guided&&input.value!==['192','168','1','10'][i]){input.value=d.ip.split('.')[i]||'';reportError(topology.error('INVALID_IPV4','В текущем поле введите '+['192','168','1','10'][i]+'.'));return;}const v=[...wrap.querySelectorAll('input')].map(n=>n.value);d.ip=v.join('.');persist();});const holder=node('label','','octet-field');holder.append(input);wrap.append(holder);}panel.append(wrap);panel.append(node('small','Маска подготовлена преподавателем. Значения октетов – от 0 до 255.'));}
      else {
      field('IP-адрес', d.ip, v => d.ip = v, 'Адрес этого компьютера в сети. Он должен быть уникальным.');
      field('Маска', d.mask, v => d.mask = v, 'Помогает определить, какие устройства относятся к одной подсети.');
      }
      if(level>=8)
      field('Шлюз', d.gateway, v => d.gateway = v, 'Адрес маршрутизатора для выхода в другие сети.');
      if(level>=11)
      field('DNS', d.dns, v => d.dns = v, 'Помогает находить IP по доменному имени. В поле нужен адрес DNS-сервера.');
    }
    if(level<5&&!['switch','ap'].includes(d.type))panel.append(node('p','В этой главе изучаем физическую связь. Адреса подготовлены преподавателем; настройка IPv4 будет в главе 5.'));
    if (d.type === 'router') {
      panel.append(node('h4','Интерфейсы Router'));
      for (const iface of d.interfaces) {
        field(`${iface.port} IP`, iface.ip, v => iface.ip = v); field(`${iface.port} маска`, iface.mask, v => iface.mask = v);
      }
      panel.append(node('small','Проверяются напрямую подключённые подсети. Динамических протоколов нет.'));
    }
    if (d.type === 'server') {
      const wrapper = node('label', 'Служба DNS'); const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.checked = !!d.services.dns;
      checkbox.addEventListener('change', () => { if (!busy) { d.services.dns = checkbox.checked; persist(); } }); wrapper.append(checkbox); panel.append(wrapper);
      field('Имя DNS (учебная запись)', Object.keys(d.services.records)[0], value => { const old = Object.values(d.services.records)[0]; d.services.records = { [value]: old }; });
      field('Адрес DNS-записи', Object.values(d.services.records)[0], value => { d.services.records[Object.keys(d.services.records)[0]] = value; });
      if(level>=10){const label=node('label','Служба DHCP'),input=node('input');input.type='checkbox';input.checked=!!d.services.dhcp;input.onchange=()=>{d.services.dhcp=input.checked;persist();};label.append(input);panel.append(label);}
    }
    if(level>=10&&['pc','laptop'].includes(d.type))button('Получить настройки DHCP',()=>{const r=Patrol.network.course.dhcp(model,d.id);report(r.message,r.ok);persist();render();},panel);
    if(d.type==='switch'&&lesson?.chapter===3&&!lesson.demo)button('Таблица портов проверена',()=>{const cs=Patrol.ui.course.current().state;cs.draft??={};cs.draft.portsReviewed=true;persist();report('Таблица проверена: каждый ПК занимает отдельный порт; Link UP. Теперь отправьте данные PC-01 → PC-02.',true);},panel);
    panel.append(node('h4','Ethernet-порты'));
    d.ports.forEach(p => {
      const index=d.ports.indexOf(p),link=model.links.find(l=>(l.fromDevice===d.id&&l.fromPort===p.id)||(l.toDevice===d.id&&l.toPort===p.id)),peer=link&&model.devices.find(n=>n.id===(link.fromDevice===d.id?link.toDevice:link.fromDevice));
      const label = node('label', `Port ${index+1} (${p.id}) · ${peer?.name||'свободен'} · ${link?.status==='up'&&p.up&&peer?.ports.find(n=>n.id===(link.fromDevice===d.id?link.toPort:link.fromPort))?.up?'Link UP':'Link DOWN'}`); const input = node('input'); input.type = 'checkbox'; input.checked = p.up;
      input.addEventListener('change', () => { if (!busy&&!guarded()) { p.up = input.checked; persist(); render(); } });input.disabled=guarded()||!!lesson?.demo;label.dataset.portId=p.id;label.dataset.deviceId=d.id;label.dataset.connectionId=p.connectionId||'';label.append(input); panel.append(label);
    });
    if (d.type === 'ap') panel.append(node('small','Wi-Fi AP пока соединяется только по Ethernet. Радиоканал появится позже.'));
    button('Соединить Ethernet-кабелем', () => { try{topology.endpoint(model,d.id,null,'source');}catch(e){reportError(e);return;}mode = true; cableSource = d.id; report('Выберите второе устройство на поле.');persist(); }, panel);
    const remove=button('Удалить устройство', () => { topology.remove(model,d.id); selected = null; persist(); render(); }, panel);const original=lesson?Patrol.network.course.model(lesson.chapter,lesson.demo):Patrol.network.firstTask();remove.disabled=(!Patrol.progress.completedChapters.includes(1)||!!lesson)&&original.devices.some(n=>n.id===d.id);if(remove.disabled)remove.title='Это исходное оборудование задания. Для восстановления нажмите «Восстановить задание».';
    if(level>=5)button('Сохранить настройки',()=>{document.activeElement?.blur();demoSaved=true;persist();report(lesson?.guided?'Адрес сохранён. IPv4 различает получателей в сети; маска подготовлена. Завершите демонстрацию, затем назначьте другой адрес PC-02 самостоятельно.':'Настройки сохранены. Теперь нажмите «Проверить сеть»; проверка покажет, подходят ли они для задания.',true);},panel);
    if(lesson?.demo)panel.querySelectorAll('input,button').forEach(n=>n.disabled=!lesson.guided||(lesson.chapter===5?(n.dataset.taskControl?.startsWith('ip-')?false:n.dataset.taskControl!=='save-settings'):n.tagName==='INPUT'||!n.textContent.startsWith('Подключить к Port')));
    syncGuide();
  }
  async function check() {
    if (busy||tutorialActive) return;
    if(!model.devices.length){reportError(topology.error('DEVICE_NOT_FOUND','На поле нет устройств. Восстановите задание.'));return;}
    if(lesson?.chapter===3&&!Patrol.progress.course[3].draft?.portsReviewed){report('Сначала подключите три ПК и подтвердите таблицу портов SW-01.',false);return;}
    const first = !Patrol.progress.completedChapters.includes(1);
    busy = true; board.classList.add('checking');syncGuide();
    let result;
    const activeBoard = board;
    try {
      if(lesson && !lesson.demo){await Patrol.engines.save.flush();result=lesson.chapter===11?Patrol.network.simulator.check(model,source.value,target.value.trim()):await Patrol.ui.course.validate({sent:true,...(Patrol.ui.course.current()?.state.draft||{})},structuredClone(model));}
      else if (first) { await Patrol.engines.save.flush(); result = await Patrol.engines.quests.event('networkLabSuccess', structuredClone(model)); }
      else result = Patrol.network.simulator.check(model, source.value, target.value.trim());
    } catch(e) { busy=false; activeBoard.classList.remove('checking'); if(activeBoard.isConnected){syncGuide();report(e.message,false);} return; }
    if (!activeBoard.isConnected) return;
    result.path ||= (model.devices[2]?topology.path(model,model.devices[0].id,model.devices[2].id):null) || [model.devices[0].id];
    report(`Что правильно: ${result.ok?result.message:'Link UP: '+(model.devices.filter(d=>d.linkState==='up').map(d=>d.name).join(', ')||'активных соединений пока нет')}.\nЧто требует исправления: ${result.ok?'ошибок проверки нет':result.message}\nСледующее действие: ${result.ok?(lesson?.chapter===11?'продолжите в учебном терминале':lesson&&!lesson.demo?'откройте итоги главы':first?'изучите карточку о пакете':lesson?.demo?'вернитесь к главе':'можно продолжить работу со схемой'):Patrol.ui.taskGuide.current().visibleInstruction}`, result.ok);
    if(!result.ok)message.dataset.errorCode=result.code||'TASK_STATE_INVALID';
    busy = true; board.classList.add('checking');
    if (result.failedAt) board.querySelector(`[data-device="${result.failedAt}"]`)?.classList.add('problem');
    Patrol.network.packetAnimation.play(model, result, svg, () => {
      busy = false; board.classList.remove('checking');
      if(result.ok&&lesson&&!lesson.demo){const resultButton=Patrol.engines.ui.button(lesson.chapter===11?'Продолжить в терминале':'Итоги главы',()=>{persist();Patrol.engines.ui.close();lesson.chapter===11?Patrol.ui.course.terminal():Patrol.ui.course.open();});resultButton.dataset.taskControl='chapter-results';}
      else if (result.ok && first) {
        Patrol.progress.connections = ['pc01','pc02']; Patrol.engines.npcs.layout();
        report('Оба компьютера физически подключены к одному коммутатору. Теперь у них есть путь для обмена данными. Пакет прошёл PC-01 → SW-01 → PC-02. В следующих главах разберём сетевые адреса.', true);
        packetLessonButton();
      }
      persist();if(!result.ok){report(`Что требует исправления: ${result.message}\nСледующее действие: ${Patrol.ui.taskGuide.current().visibleInstruction}`,false);message.dataset.errorCode=result.code||'TASK_STATE_INVALID';}
    });
  }
  function open(context = null) {
    sandbox=!!context?.sandbox||(!context?.chapter&&Patrol.progress.currentChapter===16&&Patrol.progress.completedChapters.includes(11));lesson=context && Number.isInteger(context.chapter)?context:null;if(sandbox&&!Patrol.progress.completedChapters.includes(11)){Patrol.engines.ui.toast('Песочница откроется после главы 11, когда изучены адреса, Router, DHCP и DNS.');return;}
    if(lesson?.demo&&[2,5,7].includes(lesson.chapter)){lesson={...lesson,guided:true};lesson.model=Patrol.network.course.model(lesson.chapter);if(lesson.chapter===5)lesson.model.devices[0].ip='';}
    if(lesson?.demo&&lesson.chapter===2){lesson={...lesson,guided:true};lesson.model=Patrol.network.firstTask();lesson.model.devices[0].ip='192.168.1.10';lesson.model.devices[2].ip='192.168.1.20';}
    const ui = Patrol.engines.ui;
    const active=Patrol.ui.course?.current();
    if(!lesson&&active&&!sandbox){
      if(active.stage==='practical'&&Patrol.progress.location===active.c.location&&[2,3,4,5,6,7,8,10,11].includes(active.c.id))lesson={chapter:active.c.id,model:active.state.model||Patrol.network.course.model(active.c.id)};
      else {if(ui.open({title:'Сначала объяснение текущей темы',subtitle:'Практика открывается после демонстрации и тренировки'})){ui.paragraph(Patrol.ui.course.objective());ui.button('Открыть текущий шаг',()=>{ui.close();Patrol.ui.course.open();});ui.button('Вернуться в игру',ui.close,{secondary:true});}return;}
    }
    if (!Patrol.progress.briefingComplete || !Patrol.progress.quizPassed) {
      if (ui.open({ title: 'Перед практикой', subtitle: 'Сначала объяснение и короткая проверка' })) {
        ui.paragraph(!Patrol.progress.briefingComplete ? 'Поговорите с Сергеем в лаборатории. Он объяснит сеть и коммутатор с нуля.' : 'Объяснение пройдено. Ответьте на один вопрос о коммутаторе, затем начинайте практику.');
        if (Patrol.progress.briefingComplete) ui.button('Пройти проверку', () => { ui.close(); Patrol.ui.quiz.open('switchQuiz'); });
      }
      return;
    }
    if (!ui.open({ title: sandbox?'Песочница':lesson?.demo?'Демонстрация с NPC':'Сетевой стенд', subtitle: lesson?`Глава ${lesson.chapter} · ${Patrol.data.curriculum[lesson.chapter].title}`:'Два компьютера через SW-01 · адреса первой работы уже настроены', wide: true, closed: () => { Patrol.network.packetAnimation.stop(); busy = false; persist();Patrol.ui.taskGuide.setContext(); } })) return;
    const cs=Patrol.ui.course.current()?.state;taskOptions=Patrol.network.taskState.settings({chapter:lesson?.chapter||1,demo:lesson?.demo,free:!lesson&&Patrol.progress.completedChapters.includes(1),generation:lesson?(cs?.[lesson.demo?'demoGeneration':'taskGeneration']||0):(Patrol.progress.networkGeneration||0)});const saved=lesson?(lesson.demo&&lesson.guided?cs?.demoModel:!lesson.demo?cs?.model||lesson.model:lesson.model):Patrol.progress.networkModel;const prepared=Patrol.network.taskState.prepare(saved,taskOptions);model=prepared.model;selected=model.ui.selectedDevice;mode=model.ui.selectedTool==='ethernet';cableSource=model.ui.cableSource;portChoice=model.ui.portChoice;tutorialActive=false;demoSaved=model.ui.demoSaved;busy=false;actionLock=false;
    const root = node('div','','network-lab'); const equipment = node('aside','','lab-equipment'); const center = node('section','','lab-center'); panel = node('aside','','lab-properties');
    equipment.append(node('h3','Оборудование'));
    for (const [type,name] of Object.entries(Patrol.network.types)) {if(lesson&&((type==='router'&&lesson.chapter<7)||(type==='server'&&lesson.chapter<10)||(type==='laptop'&&lesson.chapter<10)||['printer','ap'].includes(type)))continue;button(`+ ${name}`, () => { try { const added=topology.add(model,type);if(lesson?.chapter===7&&type==='router'){added.interfaces[0].ip='192.168.1.1';added.interfaces[1].ip='192.168.2.1';}selected=added.id;render();persist();} catch(e) { report(e.message,false); } }, equipment);}
    equipment.append(node('h3','Соединения')); button('Ethernet', () => { mode = !mode; cableSource = null;portChoice=null; report(mode ? 'Нажмите нужный ПК на поле. Затем выберите коммутатор.' : 'Соединение отменено.');persist(); }, equipment);
    button('Восстановить задание',resetTask,equipment);
    const instructions = node('p','Перетаскивайте устройства. Для соединения выберите Ethernet и нажмите на два устройства. Стрелки перемещают выбранное устройство.','lab-instructions');
    const scroller = node('div','','lab-scroller'); board = node('div','','lab-board');
    svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 1000 600'); svg.classList.add('lab-lines'); board.append(svg); scroller.append(board);
    const toolbar = node('div','','lab-toolbar'); source = node('select'); source.setAttribute('aria-label','Отправитель'); target = node('input'); target.setAttribute('aria-label','Получатель: IP или доменное имя'); target.value = '192.168.10.12';
    if(lesson)target.value=lesson.chapter===8?'192.168.2.20':lesson.chapter===11?'college.ru':'192.168.1.20';
    if((lesson?.chapter||Patrol.progress.currentChapter)<5){target.value='PC-02';target.setAttribute('aria-label','Получатель – имя устройства');}
    toolbar.append(node('span','Отправитель'),source,node('span','Получатель'),target); button([3,4].includes(lesson?.chapter)?'Отправить данные':'Проверить сеть',check,toolbar);
    message = node('p','Для первой работы нужны два кабеля от PC-01 и PC-02 к SW-01. IP заполнены автоматически; менять их не нужно.','lab-message'); message.setAttribute('role','status');
    if(sandbox)message.textContent='Свободный стенд без XP и изменения учебного маршрута. Добавляйте устройства, соединяйте их и проверяйте сеть.';if(lesson)message.textContent=lesson.demo?Patrol.data.curriculum[lesson.chapter].demo:lesson.chapter===3&&!model.links.length?Patrol.data.curriculum[3].practice:'Выполните текущий шаг над схемой. Результаты действий и проверок появятся здесь.';
    if(lesson?.demo&&!model.ui.selectedDevice)selected=lesson.chapter===5?null:lesson.chapter===7?model.devices.find(d=>d.type==='router')?.id:lesson.chapter===10?model.devices.find(d=>d.type==='laptop')?.id:lesson.chapter<=3?'d2':'d1';
    if(lesson?.guided)toolbar.querySelector('button').hidden=true;center.append(instructions,scroller,toolbar,message); root.append(equipment,center,panel); ui.content.append(root); render();
    Patrol.ui.taskGuide.mount(root);syncGuide();
    if(lesson?.demo)equipment.querySelectorAll('button').forEach(n=>n.disabled=n.dataset.taskControl!=='restore-task'&&(!lesson.guided||!['Ethernet',...(lesson.chapter===7?['+ Router']:[])].includes(n.textContent)));
    if(lesson?.guided)root.querySelector('[data-task-guide] details').open=true;
    if(lesson&&!lesson.demo)ui.button('Нужна подсказка',async()=>{try{const i=Patrol.ui.course.current(),r=await Patrol.engines.save.action({action:'courseHint',chapter:i.c.id,step:i.state.step});report(`Подсказка ${r.level}/3 · ${r.hint}`);}catch(e){report(e.message,false);}},{secondary:true});
    if(lesson){const back=ui.button('Вернуться к главе',()=>{ui.close();Patrol.ui.course.open();},{secondary:true});back.dataset.taskControl='back-to-chapter';syncGuide();}
    if(lesson?.guided){const finish=ui.button('Завершить демонстрацию',async()=>{try{const i=Patrol.ui.course.current();await Patrol.engines.save.action({action:'courseDemo',chapter:i.c.id,step:i.state.step,model});ui.close();Patrol.ui.course.open();}catch(e){report(e.message,false);}});finish.dataset.taskControl='finish-demo';syncGuide();}
    ui.button('Что делать?',()=>Patrol.ui.taskGuide.what(),{secondary:true});
    const tutorial=()=>{let step=0;tutorialActive=true;const box=node('section','','lab-tutorial');const title=node('h3'),text=node('p');const messages=Patrol.data.taskContracts.labTutorial;const b=button('Далее',()=>{if(++step===messages.length){Patrol.progress.ux??={};Patrol.progress.ux.labTutorialSeen=true;Patrol.engines.save.write();box.remove();tutorialActive=false;}else paint();},box);function paint(){title.textContent=`Знакомство со стендом · ${step+1} из 4`;text.textContent=messages[step];b.textContent=step===3?'Начать':'Далее';b.setAttribute('aria-label',b.textContent);}box.prepend(title,text);center.prepend(box);paint();};
    ui.button('? Как пользоваться стендом',tutorial,{secondary:true});if(!Patrol.progress.ux?.labTutorialSeen)tutorial();
    ui.button('Закрыть стенд',ui.close,{secondary:true});
    if (Patrol.progress.packetDelivered && !Patrol.progress.packetQuizPassed) packetLessonButton();if(prepared.recovered||Patrol.progress.labRecovery){report(prepared.message||Patrol.progress.labRecovery);Patrol.engines.ui.toast(prepared.message||Patrol.progress.labRecovery);delete Patrol.progress.labRecovery;}persist();
  }
  document.getElementById('lab-button').addEventListener('click',open);
  Patrol.ui.networkLab = { open, get model() { return model; }, validModel };
})();
