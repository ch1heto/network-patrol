'use strict';
Patrol.data.chapters = [
  { id: 0, title: 'Вводная', summary: 'Знакомство с IT-службой, наставником и управлением.', dialogue: 'intro', completionEvent: 'introComplete', requiredFlags: ['introComplete','networkQuizPassed'] },
  { id: 1, title: 'Что такое компьютерная сеть', summary: 'Соединить два ПК через коммутатор и передать пакет.', dialogue: 'network', completionEvent: 'packetDelivered', xp: 100, requiredTasks: ['networkQuiz','switchQuiz','firstNetwork','packetTrue'], requiredFlags: ['briefingComplete','quizPassed','packetDelivered','packetQuizPassed'], learningOutcomes: [
    'Сеть соединяет устройства для обмена данными и совместного использования ресурсов.',
    'Switch соединяет устройства внутри локальной сети и направляет данные к нужному устройству.',
    'Пакет – небольшая порция данных, передаваемая по сети.',
  ] },
];
