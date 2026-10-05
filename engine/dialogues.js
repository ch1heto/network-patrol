'use strict';
(() => {
  function start(id, closed = null) {
    const dialogue = Patrol.data.dialogues[id];
    const npc = Patrol.data.npcs[dialogue.npc];
    const ui = Patrol.engines.ui;
    let page = 0;
    let finished = false;
    if (!ui.open({ title: npc.name, subtitle: npc.role, npc: dialogue.npc, closed: () => { closed?.(); if (finished && dialogue.finish) finish(dialogue.finish); } })) return;
    function render() {
      ui.content.replaceChildren();
      document.getElementById('overlay-actions').replaceChildren();
      ui.paragraph(dialogue.pages[page]);
      if (dialogue.pages[page].includes('PC-01')) {
        const diagram = document.createElement('div'); diagram.className='lesson-diagram';
        diagram.setAttribute('role','img'); diagram.setAttribute('aria-label', 'Два компьютера соединены через коммутатор');
        for (const label of ['PC-01','⇄','SW-01','⇄','PC-02']) { const item=document.createElement('span');item.textContent=label;diagram.append(item); }
        ui.content.append(diagram);
      }
      const marker = document.createElement('small'); marker.className = 'page-marker';
      marker.textContent = `${page + 1} / ${dialogue.pages.length}`; ui.content.append(marker);
      Patrol.ui.taskGuide?.mount(ui.content);
      ui.button(page + 1 < dialogue.pages.length ? 'Далее' : dialogue.action || 'Понятно', () => {
        if (++page < dialogue.pages.length) render();
        else { finished = true; ui.close(); }
      });
      document.querySelector('#overlay-actions button').focus();
      Patrol.ui.taskGuide?.addHelpButtons();
    }
    render();
  }
  async function finish(event) {
    if (event === 'sendPacket') Patrol.engines.npcs.sendPacket();
    else if (event === 'packetQuiz') Patrol.ui.quiz.open('packetTrue');
    else {
      try {
        await Patrol.engines.quests.event(event);
        if (event === 'introComplete' && !Patrol.progress.networkQuizPassed) Patrol.ui.quiz.open('networkQuiz');
        if (event === 'briefingComplete' && !Patrol.progress.quizPassed) Patrol.ui.quiz.open('switchQuiz');
      } catch { /* Save engine displays the server error and allows retry. */ }
    }
  }
  Patrol.engines.dialogues = { start };
})();
