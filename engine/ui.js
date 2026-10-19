'use strict';
(() => {
  const modal = document.getElementById('overlay');
  const content = document.getElementById('overlay-content');
  const heading = document.getElementById('overlay-title');
  const role = document.getElementById('overlay-role');
  const portrait = document.getElementById('overlay-portrait');
  const actions = document.getElementById('overlay-actions');
  let onClose = null;
  let toastTimer;
  function text(tag, value, className) {
    const element = document.createElement(tag); element.textContent = value;
    if (className) element.className = className;
    return element;
  }
  function button(label, action, options = {}) {
    const element = text('button', label, options.secondary ? 'secondary' : 'primary');
    element.type = 'button';element.setAttribute('aria-label',label); element.disabled = !!options.disabled;
    let pending=false;element.addEventListener('click', async () => { if(element.disabled||pending)return;pending=true;try{await action();}catch(e){toast(e.message);}finally{pending=false;} }); actions.append(element); return element;
  }
  function close() {
    if (!modal.open) return;
    const callback = onClose; onClose = null;
    modal.close(); document.getElementById('room').append(document.getElementById('toast')); Patrol.runtime.setBlocked(false);
    callback?.();
  }
  function open({ title, subtitle = '', npc = null, closed = null, wide = false }) {
    if (!Patrol.runtime?.ready || modal.open || Patrol.engines.locations?.transitioning || Patrol.engines.npcs?.packetActive) return false;
    heading.textContent = title; role.textContent = subtitle;
    modal.classList.toggle('wide', wide);
    modal.classList.toggle('dialogue', !!npc);
    modal.classList.toggle('paired', npc === 'teachers');
    document.getElementById('game-menu').open = false;
    dismissOnboarding();
    portrait.replaceChildren();
    if (npc) portrait.innerHTML = Patrol.engines.npcs.portrait(npc);
    portrait.hidden = !npc;
    content.replaceChildren(); actions.replaceChildren();
    onClose = closed;
    Patrol.runtime.setBlocked(true); modal.showModal(); modal.append(document.getElementById('toast'));
    queueMicrotask(()=>{if(modal.open&&heading.textContent===title&&Patrol.ui.taskGuide&&!['Что делать сейчас?','Учебный маршрут'].includes(title)){if(!content.querySelector('[data-task-guide]'))Patrol.ui.taskGuide.mount(content);Patrol.ui.taskGuide.addHelpButtons();}});
    return true;
  }
  function paragraph(value) { content.append(text('p', value)); }
  function updateHUD() {
    const p = Patrol.progress;
    const lesson=Patrol.ui.course?.current();
    const task=Patrol.ui.taskGuide?.current();
    document.getElementById('chapter-label').textContent = lesson ? `Глава ${lesson.c.id} · ${lesson.c.title} · шаг ${lesson.state.step+1}/${Patrol.network.course.stages(lesson.c).length}` : p.currentChapter === 16 ? 'Курс завершён' : `Глава ${p.currentChapter} · ${Patrol.data.chapters[p.currentChapter].title}`;
    document.getElementById('objective').textContent = task?.goal || Patrol.ui.course?.objective() || Patrol.data.objectives[p.currentObjective];
    document.getElementById('task-location').textContent=task?`Где: ${task.locationName} · ${task.targetName}`:'';
    document.getElementById('task-action').textContent=task?`${task.interactionAction} · действие ${task.index}/${task.count}`:'';
    document.getElementById('task-result').textContent=task?`Результат: ${task.expectedResult}`:'';
    document.getElementById('xp').textContent = `${p.xp} XP`;
    layoutHUD();
  }
  function layoutHUD() { document.getElementById('room').style.setProperty('--quest-top', `${document.querySelector('.hud').getBoundingClientRect().bottom + 12}px`); }
  function toast(value) {
    const node = document.getElementById('toast'); node.textContent = value; node.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { node.hidden = true; }, 3500);
  }
  function showMap() {
    if(Patrol.ui.taskGuide)return Patrol.ui.taskGuide.route();
    if (!open({ title: 'Учебный маршрут', subtitle: 'Кабинеты и учебные зоны' })) return;
    paragraph('Из IT-кабинета выйдите через дверь в стене. Из главного коридора двери ведут в лабораторию, компьютерный класс, преподавательскую и серверную. Подойдите к двери и нажмите E. Вы вернётесь возле той же двери.');
    const list = document.createElement('ul'); list.className = 'location-list';
    for (const location of Object.values(Patrol.data.locations)) {
      const current = location.id === Patrol.progress.location;
      const unlocked = Patrol.progress.unlockedLocations.includes(location.id);
      const item = text('li', `${location.name} – ${current ? 'вы здесь' : unlocked ? 'доступна' : 'заблокирована'}`);
      if (location.id === 'classroom') item.append(text('small', 'IP, маска, шлюз, DNS и базовая диагностика'));
      if (location.id === 'lab' && !unlocked) item.append(text('small', 'Сначала завершите знакомство с Алексеем'));
      if (location.id === 'server') item.append(text('small', unlocked ? 'Серверы, хранение, RAID и сетевые службы' : 'Откроется после первой главы'));
      list.append(item);
    }
    content.append(list); button('Вернуться в игру', close);
  }
  function patrolJournalCourse(){return Patrol.progress.course||{};}
  function showJournal() {
    const p=Patrol.progress;
    if (!open({ title: 'Журнал стажёра', subtitle: 'Главы и учебный прогресс' })) return;
    for (const chapter of Patrol.data.chapters) {
      const done = Patrol.progress.completedChapters.includes(chapter.id);
      paragraph(`Глава ${chapter.id}. ${chapter.title} – ${done ? 'пройдена' : chapter.id === Patrol.progress.currentChapter ? 'текущая' : 'ожидает прохождения'}`);
    }
    for(const [id,state] of Object.entries(patrolJournalCourse())){const c=Patrol.data.curriculum[id];if(!c)continue;paragraph(`Глава ${id} · ${c.title}: ${state.score===undefined?'в процессе':state.score+' из 100'} · подсказок ${state.hints||0}.`);if(p.completedChapters.includes(Number(id))){paragraph('Теперь умеете: '+c.outcomes.join(' · '));if(!p.replay)button(`Повторить тренировку · глава ${id}`,()=>Patrol.ui.course.replay(Number(id)),{secondary:true});}}paragraph(`Подсказки справочника и интерфейса: ${Object.values(p.ux?.hintLevels||{}).reduce((a,b)=>a+b,0)}.`);if(p.completedChapters.includes(1))paragraph(`Глава 1 · результат ${p.chapterScore ?? 100}% · что изучено: сеть, Switch, передача порциями.`);paragraph(`XP: ${Patrol.progress.xp}. Достижения: ${Patrol.progress.achievements.join(', ') || 'пока нет'}.`);
    paragraph(`Напоминания о маршруте: ${Patrol.progress.warnings.length}.`);
    if (Patrol.progress.warnings.length) paragraph(`Последнее: ${Patrol.progress.warnings.at(-1).label}`);
    if(p.replay)button('Завершить повтор',()=>Patrol.ui.course.endReplay(),{secondary:true});if(p.completedChapters.includes(0))button('Повторить вводный вопрос',()=>{close();Patrol.ui.quiz.open('networkMultiple');},{secondary:true});if(p.completedChapters.includes(11))button('Песочница',()=>{close();Patrol.ui.networkLab.open({sandbox:true});},{secondary:true});button('Продолжить', close);
  }
  function showCompletion() {
    if (!open({ title: 'Глава 1 · Что такое компьютерная сеть', subtitle: 'Результат учебной практики', npc: Patrol.progress.location === 'lab' ? 'teacherSergey' : 'alexey' })) return;
    content.append(text('h3','Глава завершена'));
    paragraph('Что вы сделали');paragraph('Соединили два ПК с коммутатором и передали данные.');
    paragraph('Что теперь умеете');const list=document.createElement('ul');for(const item of Patrol.data.chapters[1].learningOutcomes)list.append(text('li',item));content.append(list);
    paragraph(`Результат – ${Patrol.progress.chapterScore ?? 100}%. Первая награда – 100 XP и достижение «Первое подключение». Повтор не начисляет XP.`);
    paragraph('Следующая цель');const task=Patrol.ui.taskGuide.current();paragraph(`${task.goal}. Куда идти – ${task.locationName}. Цель – ${task.targetName}.`);
    button('Продолжить',close);button('Повторить тренировку',()=>{close();Patrol.ui.quiz.open('packetTrue');},{secondary:true});
  }
  document.getElementById('overlay-close').addEventListener('click', close);
  modal.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.getElementById('map-button').addEventListener('click', showMap);
  document.getElementById('journal-button').addEventListener('click', showJournal);
  function dismissOnboarding() { document.getElementById('onboarding').hidden = true; if (!Patrol.progress.onboardingSeen) { Patrol.progress.onboardingSeen = true; Patrol.engines.save.write(); } }
  function showOnboarding() { document.getElementById('onboarding').hidden = !!Patrol.progress.onboardingSeen; }
  function showHelp() { if (!open({title:'Помощь стажёру',subtitle:'Управление и учебный маршрут'})) return; paragraph('WASD или стрелки – движение. E – действие рядом с человеком, дверью или оборудованием. На сенсорном экране используйте крестик и контекстную кнопку действия. Escape закрывает окно.'); paragraph('Маршрут показывает доступные кабинеты. Справочник объясняет термины. На стенде можно собрать и проверить сеть.'); paragraph(Patrol.engines.save.available ? 'Учебный прогресс сохраняется на сервере.' : 'Сервер не подтвердил сохранение. Проверьте соединение и повторите действие.'); button('Продолжить',close); }
  document.getElementById('help-button').addEventListener('click',showHelp);
  document.getElementById('onboarding-close').addEventListener('click',dismissOnboarding);
  document.addEventListener('pointerdown',event=>{const menu=document.getElementById('game-menu');if(!menu.contains(event.target)) menu.open=false;});
  Patrol.engines.ui = { open, close, button, paragraph, updateHUD, layoutHUD, toast, showCompletion, dismissOnboarding, showOnboarding, showHelp, get isOpen() { return modal.open; }, get content() { return content; } };
})();
