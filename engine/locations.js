'use strict';
(() => {
  let current = Patrol.data.locations[Patrol.progress.location] || Patrol.data.locations.office;
  let transitioning = false, cooldown = 0, boundaryKind = null, boundaryTime = 0;
  const unlocked = id => Patrol.progress.unlockedLocations.includes(id) && !Patrol.data.locations[id]?.locked;
  function render() {
    document.getElementById('room').dataset.location = current.theme;
    document.querySelector('h1').textContent = current.name;
    document.getElementById('location-subtitle').textContent = current.subtitle;
    document.getElementById('world-decoration').textContent = current.name;
    const doors = document.getElementById('doors'); doors.replaceChildren();
    for (const door of current.doors) {
      const node = document.createElement('div'); node.className = 'wall-door' + (unlocked(door.target) ? '' : ' locked');
      node.dataset.door = door.id; node.style.left = `${door.x}px`; node.style.top = `${current.farY}px`;
      node.innerHTML = '<div class="door-plaque"></div><div class="door-leaf"><div class="door-glass"></div><i class="door-handle"></i></div>';
      const plaque=node.querySelector('.door-plaque'),parts=door.label.split(' · ');
      const number=document.createElement('strong'),name=document.createElement('span');number.textContent=parts.length>1?parts[0]:'←';name.textContent=parts.length>1?parts.slice(1).join(' · '):door.label;plaque.append(number,name);
      if(!unlocked(door.target)){const status=document.createElement('small');status.textContent='Пока закрыто';plaque.append(status);}
      doors.append(node);
    }
    Patrol.engines.scenery.render(current); Patrol.engines.npcs.render(current);
    Patrol.engines.ui.updateHUD();
  }
  function layout() { Patrol.engines.npcs.layout(); }
  function nearestDoor(point = Patrol.runtime.point) {
    return current.doors.map(d => ({ ...d, kind: 'door', distance: Math.hypot(d.x-point.x,current.farY+65-point.y), data: { name: d.label } }))
      .filter(d => d.distance < 145).sort((a,b) => a.distance-b.distance)[0] || null;
  }
  function enter(door) {
    if (!Patrol.runtime?.ready || transitioning || Patrol.engines.ui.isOpen || Patrol.runtime.blocked || !current.doors.some(d => d.id === door.id)) return;
    if (!unlocked(door.target)) {
      const ui = Patrol.engines.ui;
      if (ui.open({ title: 'Проход пока закрыт', subtitle: door.label })) {
        ui.paragraph(door.target === 'lab' ? 'Завершите знакомство с Алексеем в IT-кабинете. Наставник откроет лабораторию.' : door.target === 'server' ? 'Завершите первую главу: соберите сеть и доставьте пакет. Затем Ирина покажет серверы и дисковую систему.' : door.target==='staff' ? 'Преподавательская откроется к главе 12 – после подготовки к работе с сетевыми ресурсами. Текущий маршрут показан в цели.' : 'Сначала выполните текущую учебную цель.');
        if (door.target === 'server') { const preview = document.createElement('div'); preview.className = 'server-preview'; preview.setAttribute('aria-label','Серверные шкафы, UPS и дисковая система за закрытой дверью'); preview.innerHTML = '<div class="prop-rack"><i></i><i></i><i></i><i></i><i></i></div><div class="prop-rack"><i></i><i></i><i></i><i></i><i></i></div><div class="prop-rack ups-rack"><span>UPS</span><i></i></div><div class="prop-rack storage-rack"><i></i><i></i><i></i></div>'; ui.content.append(preview); }
        ui.button('Продолжить', ui.close);
      } return;
    }
    transitioning = true; boundaryTime = 0; Patrol.runtime.setBlocked(true);
    const screen = document.getElementById('transition-screen');
    document.getElementById('transition-location').textContent = Patrol.data.locations[door.target].name;
    screen.classList.remove('leaving'); screen.hidden = false; screen.focus();
    setTimeout(() => {
      current = Patrol.data.locations[door.target]; Patrol.progress.location = current.id;
      Patrol.runtime.refreshScene(); render();
      const entry = current.entries[door.entry] || current.spawn;
      Patrol.runtime.spawnAt(entry.x,entry.y);
      Patrol.engines.quests.event('enterLocation',current.id).catch(()=>{}); Patrol.engines.save.write();
      screen.classList.add('leaving');
      setTimeout(() => { screen.hidden = true; transitioning = false; cooldown = 1; Patrol.runtime.setBlocked(false); document.getElementById('room').focus({preventScroll:true}); },150);
    },800);
  }
  function update(dt, attempted) {
    cooldown = Math.max(0,cooldown-dt);
    if (transitioning || Patrol.runtime.blocked || cooldown) { boundaryTime = 0; return; }
    const scene = Patrol.runtime.scene, point = Patrol.runtime.point, bounds = Patrol.runtime.boundsAt(point.y);
    const kind = attempted.y < scene.farY-.1 ? 'up' : attempted.x < bounds.minX-.1 ? 'left' : attempted.x > bounds.maxX+.1 ? 'right' : null;
    if (current.id !== 'corridor' || !kind || (kind === 'up' && nearestDoor())) { boundaryKind = null; boundaryTime = 0; return; }
    if (kind !== boundaryKind) { boundaryKind = kind; boundaryTime = 0; }
    boundaryTime += dt;
    if (boundaryTime >= .35) {
      Patrol.engines.quests.warning(kind); boundaryTime = 0;
      Patrol.engines.dialogues.start({left:'dispatcher',right:'director',up:'teachers'}[kind], () => {
        Patrol.runtime.spawnAt(point.x + (kind === 'left' ? 90 : kind === 'right' ? -90 : 0), point.y + (kind === 'up' ? 110 : 0)); cooldown = 1.5;
      });
    }
  }
  Patrol.engines.locations = {render,layout,update,nearestDoor,enter, get current(){return current;}, get transitioning(){return transitioning;}};
})();
