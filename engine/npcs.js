'use strict';
(() => {
  let entities = [];
  let nearest = null;
  const ui = () => Patrol.engines.ui;
  function figure(id) {
    const npc = Patrol.data.npcs[id];
    return '<img src="'+npc.asset+'" class="npc-sprite" alt="" width="500" height="666" draggable="false">';
  }
  function portrait(id) {
    const npc=Patrol.data.npcs[id];
    const person = member => '<div class="portrait-person">'+figure(member)+'</div>';
    return npc.members ? '<div class="portrait-pair">'+npc.members.map(person).join('')+'</div>' : person(id);
  }
  function objectArt(type) {
    if (type === 'switch') return '<div class="switch-art"><span>SWITCH</span><i></i><i></i><i></i><i></i></div>';
    return '<div class="computer-art"><div class="monitor"><span>_</span></div><i></i><div class="keyboard"></div></div>';
  }
  function render(location) {
    nearest = null;
    document.querySelectorAll('.world-entity').forEach(node => node.remove());
    entities = [];
    for (const id of location.npcs) {
      const data = { ...Patrol.data.npcs[id], ...location.npcPositions?.[id] };
      const node = document.createElement('div'); node.className = 'world-entity npc';
      node.dataset.entity = id;
      node.innerHTML = `<div class="npc-shadow"></div><div class="npc-idle">${figure(id)}</div>`;
      const label = document.createElement('span'); label.className = 'entity-label'; label.textContent = data.name; node.append(label);
      node.setAttribute('role', 'img'); node.setAttribute('aria-label', `${data.name}, ${data.role}`);
      document.getElementById('world').append(node); entities.push({ id, kind: 'npc', data, node });
    }
    for (const id of location.objects) {
      const data = Patrol.data.objects[id];
      const node = document.createElement('div'); node.className = `world-entity object ${data.type}`;
      node.dataset.entity = id;
      node.innerHTML = objectArt(data.type);
      const label = document.createElement('span'); label.className = 'entity-label'; label.textContent = data.name; node.append(label);
      node.setAttribute('role', 'img'); node.setAttribute('aria-label', `${data.name}, ${data.role}`);
      document.getElementById('world').append(node); entities.push({ id, kind: 'object', data, node });
    }
    layout();
    const furniture = Patrol.engines.collisions.areas;
    for (const item of entities.filter(item => item.kind === 'object')) { const w=item.width*.88*item.scale; furniture.push({x:item.point.x-w/2,y:item.point.y-32*item.scale,w,h:32*item.scale,type:'device'}); }
    Patrol.engines.collisions.set(furniture);
  }
  function layout() {
    if (!Patrol.runtime?.scene) return;
    const scene = Patrol.runtime.scene;
    for (const item of entities) {
      const y = item.data.wy;
      // Props use the whole floor width. The player's bounds additionally reserve
      // its stride width; using those for props crowded the mobile laboratory.
      const x = item.data.wx;
      item.point = { x, y };
      item.scale = Patrol.runtime.scaleAt(y);
      const height = item.kind === 'npc' ? scene.playerHeight : item.data.type === 'switch' ? 115 : 175;
      const width = item.kind === 'npc' ? height * 250 / 333 : item.data.type === 'switch' ? 170 : 230;
      item.width = width;
      item.node.style.width = `${width}px`; item.node.style.height = `${height}px`;
      item.node.style.transform = `translate3d(${x - width / 2}px, ${y - height}px, 0) scale(${Patrol.runtime.scaleAt(y)})`;
      item.node.style.zIndex = String(100 + Math.round(y));
      item.node.classList.toggle('connected', Patrol.progress.connections.includes(item.id));
    }
    drawCables();
  }
  function drawCables() {
    const pc1 = entities.find(item => item.id === 'pc01');
    const pc2 = entities.find(item => item.id === 'pc02');
    const sw = entities.find(item => item.id === 'switch');
    const layer = document.getElementById('cables'); layer.replaceChildren();
    if (!sw) return;
    for (const pc of [pc1, pc2]) {
      if (!Patrol.progress.connections.includes(pc.id)) continue;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${pc.point.x} ${pc.point.y} L ${sw.point.x} ${sw.point.y}`);
      path.setAttribute('class', 'network-cable'); layer.append(path);
    }
  }
  function update(deltaTime) {
    Patrol.ui.taskGuide ? Patrol.ui.taskGuide.paintMarker() : Patrol.ui.course?.paintMarker();
    const point = Patrol.runtime.point;
    const range = Math.max(60, Math.min(110, Patrol.runtime.scene.playerHeight * .42));
    const candidates=[...entities,...Patrol.engines.scenery.interactions];
    nearest = candidates.map(item => ({ ...item, distance: Math.hypot(Math.max(0,Math.abs(item.point.x-point.x)-(item.kind !== 'npc' ? item.width*.35*item.scale : 0)), Math.abs(item.point.y-point.y)) }))
      .filter(item => item.distance < range).sort((a, b) => a.distance - b.distance)[0] || null;
    const door = Patrol.engines.locations.nearestDoor();
    if (door && (!nearest || door.distance < nearest.distance)) nearest = door;
    const button = document.getElementById('interact-button');
    button.disabled = !nearest || Patrol.runtime.blocked;
    button.hidden = !nearest || Patrol.runtime.blocked;
    button.textContent = nearest ? `[E] ${nearest.kind === 'door' ? 'Войти' : nearest.kind === 'npc' ? 'Поговорить' : 'Осмотреть'} · ${nearest.data.name}` : '';
    const task=Patrol.ui.taskGuide?.current();if(task&&nearest?.id===task.targetId)button.textContent=task.interactionAction;
    document.getElementById('interaction-hint').textContent='○';
    const marker=document.getElementById('interaction-hint');marker.hidden=!nearest||Patrol.runtime.blocked||nearest.id===task?.targetId;
    if(nearest){const node=nearest.kind==='door'?document.querySelector(`[data-door="${nearest.id}"]`):nearest.node;const anchor=nearest.kind==='door'?{x:nearest.x+90,y:Patrol.engines.locations.current.farY-220}:{x:nearest.point.x,y:(nearest.kind==='scenery'?parseFloat(node.style.top):nearest.point.y)-node.offsetHeight*(nearest.scale||1)-35};marker.style.left=`${anchor.x-14}px`;marker.style.top=`${anchor.y}px`;marker.dataset.target=nearest.id;}
    for (const item of candidates) item.node.classList.toggle('in-range', !Patrol.runtime.blocked && item.id === nearest?.id);
    document.querySelectorAll('.wall-door').forEach(node=>node.classList.toggle('in-range',!Patrol.runtime.blocked && node.dataset.door === nearest?.id));
  }
  function interact() {
    if (Patrol.runtime.blocked || !nearest) return;
    ui().dismissOnboarding();
    const item = nearest;
    if (item.kind === 'door') { Patrol.engines.locations.enter(item); return; }
    if (item.kind === 'scenery') { const c=Patrol.ui.course?.current();if(c?.stage==='practical'&&Patrol.progress.location===c.c.location&&['workstation','rack','storage'].includes(item.type)){Patrol.ui.course.open();return;}Patrol.ui.worldCards.open(item.type,null,item.id); return; }
    if (item.kind === 'npc') {
      const lesson=Patrol.ui.course?.current();
      if(lesson&&item.id===lesson.c.npc&&Patrol.progress.location===lesson.c.location){Patrol.ui.course.open();return;}
      if(item.id==='administratorIrina'&&Patrol.progress.currentChapter<13){if(ui().open({title:item.data.name,subtitle:item.data.role,npc:item.id})){ui().paragraph('Здесь находятся серверы – устройства, предоставляющие услуги другим компьютерам. Подробно разберём их после сетевых настроек, в главе 13. Сейчас продолжайте отмеченный учебный маршрут.');ui().button('Что делать?',()=>{ui().close();Patrol.ui.course.what();});ui().button('Вернуться в игру',ui().close,{secondary:true});}return;}
      if(item.id==='olga'){if(!ui().open({title:item.data.name,subtitle:item.data.role,npc:item.id}))return;ui().paragraph(Patrol.progress.currentChapter===16?'Самостоятельная смена завершена. Результаты сохранены; откройте журнал или повторите упражнения.':Patrol.progress.currentChapter>=12?'Продолжайте текущий учебный маршрут. К самостоятельным заявкам вернёмся в главе 15.':'Я собираю заявки на общие папки и печать. Сначала завершите учебные темы по маршруту; в главе 12 начнём работу с ресурсами.');ui().button('Что делать?',()=>{ui().close();Patrol.ui.course.what();});return;}
      if (item.id === 'alexey' && Patrol.progress.introComplete && !Patrol.progress.networkQuizPassed) Patrol.ui.quiz.open('networkQuiz');
      else if (item.id === 'alexey' && !Patrol.progress.completedChapters.includes(0)) Patrol.engines.dialogues.start('intro');
      else if (item.id === 'teacherSergey' && !Patrol.progress.briefingComplete) Patrol.engines.dialogues.start('network');
      else if (item.id === 'teacherAnna') Patrol.ui.worldCards.classroom();
      else {
        if (!ui().open({ title: item.data.name, subtitle: item.data.role, npc: item.id })) return;
        ui().paragraph(Patrol.progress.currentChapter===16?'Курс завершён. Можно повторять упражнения, исследовать предметы и использовать свободный стенд. Результаты сохранены в кабинете преподавателя.':item.id==='administratorIrina'?'В стойках работают серверы. Осмотрите оборудование: обсудим диски, резервное питание и сетевые службы.':`Сейчас продолжите: ${Patrol.ui.taskGuide.current().title}. Цель отмечена золотым !.`);ui().button('Показать цель',()=>{ui().close();Patrol.ui.taskGuide.showTarget();},{secondary:true});
        if (item.id === 'teacherSergey') {ui().button('Повторить объяснение', () => { ui().close(); Patrol.engines.dialogues.start('network'); });ui().button('Открыть сетевой стенд',()=>{ui().close();Patrol.ui.networkLab.open();});ui().button('Осмотреть инструменты',()=>{ui().close();Patrol.ui.worldCards.open('tools');},{secondary:true});}
        if(item.id==='administratorIrina'){ui().button('Как устроен сервер',()=>{ui().close();Patrol.ui.worldCards.open('rack');});ui().button('Диски и RAID',()=>{ui().close();Patrol.ui.worldCards.open('storage');});ui().button('Сетевые службы',()=>{ui().close();Patrol.ui.quiz.open('serverServicesQuiz');});}
        ui().button('Вернуться в игру', ui().close, { secondary: true });
      }
      return;
    }
    showObject(item);
  }
  function showObject(item) {
    const c=Patrol.ui.course?.current();if(c?.stage==='practical'&&Patrol.progress.location===c.c.location){Patrol.ui.course.open();return;}
    if (item.id === 'reference') { Patrol.ui.knowledge.open('network'); return; }
    if (['pc01','pc02','switch','labBench'].includes(item.id)) { Patrol.ui.networkLab.open(); return; }
    if(item.id==='comingSoon'){Patrol.ui.worldCards.classroom();return;}
    Patrol.ui.worldCards.open('workstation',item.data.name);
  }
  function sendPacket() { Patrol.ui.networkLab.open(); }
  document.getElementById('interact-button').addEventListener('click', interact);
  Patrol.engines.npcs = { render, layout, update, interact, portrait, sendPacket,
    pointFor(id) { const item = entities.find(item => item.id === id); return item ? { ...item.point, depth: item.data.depth } : null; },
    get packetActive() { return false; } };
})();
