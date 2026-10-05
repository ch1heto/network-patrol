'use strict';
(() => {
  Patrol.engines.quests = {
    async event(name, payload) {
      if(name==='enterLocation') { if(payload==='lab'&&!Patrol.progress.briefingComplete&&!Patrol.progress.completedChapters.includes(1))Patrol.progress.currentObjective='briefing'; await Patrol.engines.save.flush(); Patrol.engines.ui.updateHUD(); return; }
      if(['introComplete','briefingComplete'].includes(name)) return Patrol.engines.save.action({action:name});
      if(name==='networkLabSuccess') return Patrol.engines.save.action({action:'practice',model:payload});
    },
    warning(kind){
      const label={left:'Возврат к расписанию',right:'Возврат к учебному заданию',up:'Занятие в соседней аудитории'}[kind];
      Patrol.progress.warnings.push({kind,label,location:Patrol.progress.location,time:Date.now()});
      Patrol.progress.warnings=Patrol.progress.warnings.slice(-50);return label;
    },
  };
})();
