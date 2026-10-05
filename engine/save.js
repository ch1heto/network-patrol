'use strict';
(() => {
  const settingsKey = 'network-patrol.settings.v1';
  Patrol.progress = window.PATROL_INITIAL || {version:1,currentChapter:0,completedChapters:[],unlockedLocations:['office','corridor','classroom'],xp:0,warnings:[],demerits:[],achievements:[],currentObjective:'meet',location:'office',connections:[],networkModel:null};
  if (Patrol.progress.completedChapters.includes(1) && !Patrol.progress.unlockedLocations.includes('server')) Patrol.progress.unlockedLocations.push('server');
  Patrol.network.course.migrate(Patrol.progress);Patrol.network.taskState.recoverProgress(Patrol.progress);
  try { Patrol.progress.onboardingSeen = JSON.parse(localStorage.getItem(settingsKey))?.onboardingSeen === true; } catch {}
  let available = true, queue = Promise.resolve(), timer;
  async function request(url, data) {
    const r = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const result = await r.json();
    if (!r.ok) { if(r.status === 401) location.assign('/'); throw new Error(result.error); }
    return result;
  }
  function enqueue(action) {
    const next = queue.catch(()=>{}).then(action);
    queue = next;
    next.catch(e=>{available=false; Patrol.engines.ui?.toast(e.message+' Результат не подтверждён сервером. Повторите действие.');});
    return next;
  }
  function flush() {
    clearTimeout(timer);
    return enqueue(async()=>{
    const p = Patrol.progress;
    const data = {location:p.location};
    if(p.ux)data.ux=structuredClone(p.ux);
    if(p.courseDraft&&p.courseDraft.chapter===p.currentChapter){const info=Patrol.network.course.info(p);if(info&&(!p.courseDraft.demo||info.stage==='demo')&&(p.courseDraft.demo||info.stage==='practical'))data.courseDraft=structuredClone(p.courseDraft);}
    if (p.networkModel) data.networkModel = structuredClone(p.networkModel);
    await request('/api/student/state',data); available=true;});
  }
  Patrol.engines.save = {
    get available(){return available;}, get pending(){return queue;},
    write(){
      try {localStorage.setItem(settingsKey,JSON.stringify({onboardingSeen:!!Patrol.progress.onboardingSeen}));}catch{}
      clearTimeout(timer); timer=setTimeout(()=>flush().catch(()=>{}),200);
    },
    flush,
    action(data){return enqueue(async()=>{
      const result=await request('/api/student/action',data);
      const settings=Patrol.progress.onboardingSeen;
      if(!result.progress.replay)delete Patrol.progress.replay;
      if(['replayStart','replayEnd'].includes(data.action))delete Patrol.progress.courseDraft;
      Object.assign(Patrol.progress,result.progress,{onboardingSeen:settings});
      if(Patrol.progress.courseDraft&&Patrol.progress.courseDraft.chapter!==Patrol.progress.currentChapter)delete Patrol.progress.courseDraft;
      available=true; Patrol.ui.taskGuide?.refresh(); Patrol.ui.taskGuide?.paintMarker(); Patrol.engines.ui?.updateHUD();return result;
    });},
  };
  document.addEventListener('visibilitychange',()=>{if(document.hidden) flush().catch(()=>{});});
})();
