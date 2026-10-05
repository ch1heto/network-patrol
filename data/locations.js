'use strict';
window.Patrol = { data: {}, engines: {}, network: {}, ui: {} };
const roomDefaults = { width: 2500, height: 1450, farY: 440, nearY: 1300, farWidth: .88, nearWidth: .96 };
Patrol.data.locations = {
  office: { ...roomDefaults, id: 'office', name: 'IT-кабинет', subtitle: 'IT-служба · база стажировки · 214', theme: 'office', spawn: { x: 760, y: 820 }, npcs: ['alexey'], npcPositions: { alexey: { wx: 930, wy: 740 } }, objects: ['reference'], doors: [{ id: 'office-exit', x: 400, target: 'corridor', entry: 'fromOffice', label: 'Главный коридор' }], entries: { fromCorridor: { x: 400, y: 560 } }, props: [
    ['desk', 1280, 940], ['desk', 1750, 1050], ['rack', 1920, 440], ['tools', 1450, 390], ['books', 680, 440], ['board', 1050, 410], ['clock', 1670, 250], ['router', 2040, 700], ['boxes', 2100, 1050], ['plant', 450, 900], ['light', 900, 150], ['light', 1800, 150],
  ] },
  corridor: { ...roomDefaults, width: 3000, height: 1250, farY: 430, nearY: 1120, farWidth: .94, nearWidth: .98, id: 'corridor', name: 'Главный коридор', subtitle: 'Второй этаж · общий маршрут ко всем кабинетам', theme: 'corridor', spawn: { x: 650, y: 620 }, npcs: [], objects: [], doors: [
    { id: 'to-office', x: 500, target: 'office', entry: 'fromCorridor', label: '214 · IT-служба' },
    { id: 'to-lab', x: 1120, target: 'lab', entry: 'fromCorridor', label: '216 · Лаборатория сетей' },
    { id: 'to-class', x: 1720, target: 'classroom', entry: 'fromCorridor', label: '218 · Компьютерный класс' },
    { id: 'to-staff', x: 2280, target: 'staff', entry: 'fromCorridor', label: '220 · Преподавательская' },
    { id: 'to-server', x: 2740, target: 'server', entry: 'fromCorridor', label: '222 · Серверная' },
  ], entries: { fromOffice: { x: 500, y: 565 }, fromLab: { x: 1120, y: 565 }, fromClassroom: { x: 1720, y: 565 }, fromStaff: { x: 2280, y: 565 }, fromServer: { x: 2740, y: 565 } }, props: [
    ['window', 800, 340], ['window', 2010, 340], ['bench', 800, 630], ['bench', 1900, 630], ['noticeboard', 1420, 400], ['extinguisher', 2450, 410], ['plant', 1400, 700], ['plant', 2570, 660], ['ap', 1550, 240], ['sign', 2600, 150], ['light', 450, 130], ['light', 1350, 130], ['light', 2300, 130], ['cable', 1800, 400],
  ] },
  lab: { ...roomDefaults, width: 2700, height: 1500, nearY: 1360, id: 'lab', name: 'Учебная лаборатория сетей', subtitle: '216 · оборудование, эксперименты и сетевой стенд', theme: 'lab', spawn: { x: 650, y: 850 }, npcs: ['teacherSergey'], npcPositions: { teacherSergey: { wx: 720, wy: 700 } }, objects: ['pc01', 'pc02', 'pc03', 'switch', 'labBench'], doors: [{ id: 'lab-exit', x: 350, target: 'corridor', entry: 'fromLab', label: 'Главный коридор' }], entries: { fromCorridor: { x: 350, y: 560 } }, props: [
    ['router', 2380, 720], ['plant', 2430, 1080], ['rack', 2380, 440], ['board', 1510, 410], ['cable', 1760, 430], ['tools', 2020, 400], ['socket', 2250, 420], ['light', 800, 150], ['light', 1800, 150], ['boxes', 2400, 1220],
  ] },
  classroom: { ...roomDefaults, id: 'classroom', name: 'Компьютерный класс', subtitle: '218 · IP, маска, шлюз и DNS', theme: 'classroom', spawn: { x: 400, y: 660 }, npcs: ['teacherAnna'], npcPositions: { teacherAnna: { wx: 650, wy: 740 } }, objects: ['comingSoon'], doors: [{ id: 'class-exit', x: 350, target: 'corridor', entry: 'fromClassroom', label: 'Главный коридор' }], entries: { fromCorridor: { x: 350, y: 560 } }, props: [
    ['board', 1400, 400], ['projector', 1400, 190], ['workstation', 900, 700], ['workstation', 1300, 700], ['workstation', 1700, 700], ['workstation', 900, 1000], ['workstation', 1300, 1000], ['workstation', 1700, 1000], ['workstation', 2170, 600], ['printer', 2170, 780], ['books', 2150, 440], ['light', 800, 140], ['light', 1800, 140],
  ] },
  staff: { ...roomDefaults, id: 'staff', name: 'Преподавательская', subtitle: '220 · заявки, общий принтер и сетевые ресурсы', theme: 'classroom', spawn: { x: 350, y: 560 }, entries: { fromCorridor: { x: 350, y: 560 } }, doors: [{id:'staff-exit',x:350,target:'corridor',entry:'fromStaff',label:'Главный коридор'}], npcs: ['olga'], npcPositions:{olga:{wx:650,wy:740}}, objects: [], props: [['workstation',1000,850],['printer',1700,900],['books',2100,440],['board',1400,410],['desk',1450,1100],['plant',2100,1050]] },
  server: { ...roomDefaults, id: 'server', name: 'Серверная', subtitle: '222 · хранение, питание и сетевые службы', theme: 'server', spawn: { x: 350, y: 560 }, entries: { fromCorridor: { x: 350, y: 560 } }, doors: [{ id: 'server-exit', x: 350, target: 'corridor', entry: 'fromServer', label: 'Главный коридор' }], npcs: ['administratorIrina'], npcPositions: { administratorIrina: { wx: 550, wy: 760 } }, objects: [], props: [['board', 1400, 410], ['clock', 2100, 250], ['cable', 1100, 390], ['socket', 2250, 420], ['rack', 800, 850], ['rack', 1200, 850], ['rack', 1600, 850], ['ups', 2000, 850], ['storage', 1500, 1100]] },
};
Patrol.data.objects = {
  reference: { name: 'База знаний', type: 'terminal', wx: 1270, wy: 690, role: 'Понятные объяснения и примеры' },
  pc01: { name: 'PC-01', type: 'pc', wx: 1050, wy: 850, role: 'Первый компьютер' },
  pc02: { name: 'PC-02', type: 'pc', wx: 1610, wy: 850, role: 'Второй компьютер' },
  pc03: { name: 'PC-03', type: 'pc', wx: 2150, wy: 850, role: 'Резервное оборудование' },
  switch: { name: 'SW-01', type: 'switch', wx: 1330, wy: 730, role: 'Коммутатор' },
  labBench: { name: 'Сетевой стенд', type: 'terminal', wx: 1840, wy: 630, role: 'Соберите свою учебную сеть' },
  comingSoon: { name: 'Диагностика сети', type: 'terminal', wx: 2150, wy: 1150, role: 'IP, маска, шлюз и DNS' },
};
