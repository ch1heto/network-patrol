'use strict';
(() => {
  const handlers = new Map();
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const register = (type, evaluate, description) => handlers.set(type, { evaluate, description });
  register('quiz', (task, response) => Array.isArray(response) && new Set(response).size === response.length && equal([...response].map(Number).sort((a,b)=>a-b), [...task.answer].sort((a,b)=>a-b)), 'Один ответ, несколько ответов, true/false');
  register('matching', (task, response) => equal(response, task.answer), 'Сопоставление пар');
  register('classify', (task, response) => Object.entries(task.answer).every(([key, value]) => response[key] === value), 'Распределение по категориям');
  register('sequence', (task, response) => equal(response, task.answer), 'Порядок действий');
  register('connectDevices', (task, model) => Patrol.network.simulator.firstTask(model).ok, 'Подключение устройств на стенде');
  register('configureDevice', (task, device) => Patrol.network.simulator.host(device.ip, device.mask) && Object.entries(task.expected).every(([key, value]) => device[key] === value), 'Проверка настроек модели');
  register('terminalTask', (task, response) => response.command === task.command && response.result?.ok === task.expectedSuccess, 'Адаптер безопасных учебных команд, без real shell');
  register('troubleshooting', (task, response) => response.cause === task.answer, 'Диагностика заданной неисправности');
  function validateTopology(model) {
    if (!Patrol.network.validModel(model)) return {ok:false,message:'Схема повреждена. Восстановите исходную схему и соедините устройства заново.',path:[]};
    return Patrol.network.simulator.firstTask(model);
  }
  Patrol.engines.tasks = { register, validateTopology, validateIPv4: value => Patrol.network.simulator.ip(value) !== null, get types() { return [...handlers.keys()]; }, evaluate(task, response) {
    const handler = handlers.get(task.type); if (!handler) throw new Error('Неизвестный тип задания');
    const correct = !!handler.evaluate(task, response);
    const details = task.optionExplanations && Array.isArray(response) ? response.map(i => task.optionExplanations[i]).filter(Boolean).join(' ') : '';
    return { correct, explanation: correct ? (details || task.explanation || handler.description) : [details, task.explanation || handler.description].filter(Boolean).join(' ') };
  } };
})();
