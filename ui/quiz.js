'use strict';
(() => {
  function shuffledIndices(options) {
    const indices = options.map((_, index) => index);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  }
  function open(id) {
    const task = Patrol.data.tasks[id], ui = Patrol.engines.ui;
    if (!ui.open({ title: task.title, subtitle: 'Короткая проверка · можно попробовать снова' })) return;
    const form = document.createElement('form'); form.className = 'task-form';
    if (task.type === 'quiz') (task.mode === 'boolean' ? task.options.map((_, index) => index) : shuffledIndices(task.options)).forEach(index => {
      const label = document.createElement('label'), input = document.createElement('input');
      input.type = task.mode === 'multiple' ? 'checkbox' : 'radio'; input.name = 'answer'; input.value = index;
      label.append(input, document.createTextNode(task.options[index])); form.append(label);
    });
    else task.items.forEach((item, index) => {
      const label = document.createElement('label'); label.textContent = item;
      const select = document.createElement('select'); select.name = `item-${index}`;
      select.add(new Option('Выберите…', ''));
      task.options.forEach((text, option) => select.add(new Option(text, task.type === 'sequence' ? text : String(option))));
      label.append(select); form.append(label);
    });
    const feedback = document.createElement('p'); feedback.setAttribute('role','status'); form.append(feedback); ui.content.append(form);
    Patrol.ui.taskGuide?.mount(ui.content,{task:Patrol.data.taskContracts.registry[`quiz-${id}`]});
    const check = ui.button('Проверить ответ', async () => {
      const response = task.type === 'quiz' ? [...form.querySelectorAll('input:checked')].map(input => Number(input.value)) : [...form.querySelectorAll('select')].map(select => select.value);
      if (!response.length) { feedback.textContent = 'Выберите ответ, затем проверьте его.'; return; }
      check.disabled = true;
      let result;
      try { result = task.type === 'quiz' ? await Patrol.engines.save.action({action:'quiz',taskId:id,response}) : Patrol.engines.tasks.evaluate(task,response); }
      catch (e) { feedback.textContent=e.message; check.disabled=false; return; }
      if (!form.isConnected || !ui.isOpen) return;
      check.disabled = false;
      feedback.textContent = `${result.correct ? 'Верно.' : 'Попробуйте ещё раз.'} ${result.explanation}`;
      if (result.correct) {
        document.getElementById('overlay-actions').replaceChildren();
        ui.button(id === 'switchQuiz' ? 'Перейти к практике' : id === 'packetTrue' && Patrol.progress.completedChapters.includes(1) ? 'Итоги главы' : 'Закончить упражнение', () => { ui.close(); if (id === 'switchQuiz') Patrol.ui.networkLab.open(); if(id==='packetTrue'&&Patrol.progress.completedChapters.includes(1))ui.showCompletion(); });
      }
    });
    ui.button('Открыть объяснение', () => { Patrol.engines.save.action({action:'hint'}).catch(()=>{}); ui.close(); Patrol.ui.knowledge.open(({storageQuiz:'storage',serverServicesQuiz:'dns',subnetQuiz:'subnet',networkQuiz:'network'})[id] || (id.startsWith('packet')?'packet':'switch')); }, { secondary: true });
  }
  const originalOpen=open;
  Patrol.ui.quiz = { shuffledIndices, open(id){originalOpen(id);Patrol.ui.taskGuide?.addHelpButtons();} };
})();
