'use strict';
(() => {
  function open(type, title = null, objectId = null) {
    const card=Patrol.data.worldCards[type],ui=Patrol.engines.ui;
    if(!card || !ui.open({title:title||card.title,subtitle:'Осмотр учебного оборудования'}))return;
    const article=document.createElement('article');article.className='world-card';
    for(const [label,key] of [['Простыми словами','simple'],['Представьте','analogy'],['Как это работает','technical'],['Пример','example']]) {
      if(!card[key])continue;const section=document.createElement('section'),h=document.createElement('h3'),p=document.createElement('p');h.textContent=label;p.textContent=card[key];section.append(h,p);article.append(section);
    }
    ui.content.append(article);
    const location=Patrol.progress.location,prop=Patrol.data.taskContracts.sceneryTargets(Patrol.data.locations[location]).find(p=>objectId?p.id===objectId:p.type===type);const task=Patrol.data.taskContracts.registry[`inspect-${location}-${prop?.id}`];if(task){Patrol.ui.taskGuide.mount(ui.content,{task});Patrol.ui.taskGuide.addHelpButtons();}
    if(card.lesson)ui.button('Открыть понятие в справочнике',()=>{ui.close();Patrol.ui.knowledge.open(card.lesson);},{secondary:true});
    if(card.activity==='lab'&&Patrol.progress.location==='lab')ui.button('Открыть сетевой стенд',()=>{ui.close();Patrol.ui.networkLab.open();});
    if(card.activity==='classroom'&&Patrol.progress.location==='classroom')ui.button('Разобрать сетевые настройки',()=>{ui.close();Patrol.ui.worldCards.classroom();});
    if(card.activity==='server'&&Patrol.progress.location==='server')ui.button('Проверить знания о хранении',()=>{ui.close();Patrol.ui.quiz.open('storageQuiz');});
    ui.button('Вернуться в игру',ui.close,{secondary:true});
  }
  function classroom(){
    if(!Patrol.progress.courseDone5&&Patrol.progress.currentChapter<6){const ui=Patrol.engines.ui;if(ui.open({title:'Сначала разберём адреса с нуля',subtitle:'Ирина Викторовна · учебный маршрут',npc:'teacherAnna'})){ui.paragraph('Настройки изучаются по очереди: IPv4, затем маска, шлюз и DNS. Сейчас выполните цель своей главы. К теме IPv4 перейдём после физической сети.');ui.button('Что делать?',()=>{ui.close();Patrol.ui.course.what();});ui.button('Вернуться в игру',ui.close,{secondary:true});}return;}
    const ui=Patrol.engines.ui;if(!ui.open({title:'Четыре сетевые настройки',subtitle:'Дополнительная тренировка в компьютерном классе',npc:'teacherAnna'}))return;
    ui.paragraph('IP обозначает устройство. Маска задаёт границу подсети. Шлюз передаёт данные в другие сети. DNS помогает найти адрес по имени.');
    const form=document.createElement('form');form.className='task-form';
    const items=[['IP','Адрес устройства'],['Маска','Граница подсети'],['Шлюз','Путь в другие сети'],['DNS','Адрес по имени']];
    for(const [name] of items){const l=document.createElement('label');l.textContent=name;const s=document.createElement('select');s.setAttribute('aria-label',name);s.add(new Option('Выберите роль',''));for(const [,role] of items)s.add(new Option(role,role));l.append(s);form.append(l);}
    const feedback=document.createElement('p');feedback.setAttribute('role','status');ui.content.append(form,feedback);
    Patrol.ui.taskGuide.mount(ui.content,{task:Patrol.data.taskContracts.registry['classroom-roles']});Patrol.ui.taskGuide.addHelpButtons();
    ui.button('Проверить настройки',()=>{const response=[...form.querySelectorAll('select')].map(s=>s.value);const result=Patrol.engines.tasks.evaluate({type:'matching',answer:items.map(i=>i[1]),explanation:'IP отвечает за адрес устройства, маска – за подсеть, шлюз – за другие сети, DNS – за поиск адреса по имени.'},response);feedback.textContent=`${result.correct?'Все роли сопоставлены.':'Проверьте роли ещё раз.'} ${result.explanation}`;});
    ui.button('Открыть пример IPv4',()=>{ui.close();Patrol.ui.knowledge.open('ip');},{secondary:true});
    ui.button('Выбрать адрес в своей подсети',()=>{ui.close();Patrol.ui.quiz.open('subnetQuiz');},{secondary:true});
    ui.button('Порядок диагностики',()=>{ui.close();Patrol.ui.quiz.open('diagnoseOrder');},{secondary:true});
    ui.button('Вернуться в игру',ui.close,{secondary:true});
  }
  Patrol.ui.worldCards={open,classroom};
})();
