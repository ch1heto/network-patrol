'use strict';
(() => {
  function open(id = 'network') {
    const ui = Patrol.engines.ui;
    if (!ui.open({ title: 'База знаний стажёра', subtitle: 'Одна карточка – один термин' })) return;
    const nav = document.createElement('div'); nav.className = 'knowledge-nav';
    const card = document.createElement('article'); card.className = 'knowledge-card';
    const layout=document.createElement('div');layout.className='knowledge-layout';layout.append(nav,card);ui.content.append(layout);
    function show(term) {
      card.replaceChildren();
      for (const button of nav.children) button.setAttribute('aria-pressed', String(button.dataset.id === term.id));
      const selected=[...nav.children].find(button=>button.dataset.id===term.id);
      if(selected)nav.scrollTop=Math.max(0,selected.offsetTop-nav.offsetTop-nav.clientHeight+selected.offsetHeight);
      const heading = document.createElement('h3'); heading.textContent = term.title; card.append(heading);
      for (const [label, key] of [['Простыми словами','simple'], ['Аналогия','analogy'], ['Технически','technical']]) {
        if(!term[key])continue;const h = document.createElement('h4'); h.textContent = label; const p = document.createElement('p'); p.textContent = term[key]; card.append(h,p);
      }
      const diagram = document.createElement('pre'); diagram.textContent = term.diagram; card.append(diagram);
      for (const [label, key] of [['Мини-пример','example'], ['Проверьте себя','check']]) {
        const h = document.createElement('h4'); h.textContent = label; const p = document.createElement('p'); p.textContent = term[key]; card.append(h,p);
      }
    }
    Patrol.data.lessons.forEach(term => { const b = document.createElement('button'); b.type = 'button'; b.dataset.id = term.id; b.textContent = term.title; b.addEventListener('click', () => show(term)); nav.append(b); });
    show(Patrol.data.lessons.find(term => term.id === id) || Patrol.data.lessons[0]);
    ui.button('Проверить знания о коммутаторе', () => { ui.close(); Patrol.ui.quiz.open('switchQuiz'); });
    ui.button('Сопоставление ролей', () => { ui.close(); Patrol.ui.quiz.open('matchBasics'); }, { secondary: true });
    ui.button('Порядок диагностики', () => { ui.close(); Patrol.ui.quiz.open('diagnoseOrder'); }, { secondary: true });
    ui.button('Несколько ответов', () => { ui.close(); Patrol.ui.quiz.open('networkMultiple'); }, { secondary: true });
    ui.button('Проверить знания о пакете', () => { ui.close(); Patrol.ui.quiz.open('packetTrue'); }, { secondary: true });
  }
  document.getElementById('knowledge-button').addEventListener('click', () => open());
  Patrol.ui.knowledge = { open };
})();
