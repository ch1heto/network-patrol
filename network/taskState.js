'use strict';
// The same task binding, recovery and executable-step checks run in browser and server.
(() => {
  const N=Patrol.network,T=N.topology,C=Patrol.data.taskContracts;
  const TASK_REVISION=1,NETWORK_CHAPTERS=[1,2,3,4,5,6,7,8,9,10,11];
  function settings(o={}){const chapter=o.chapter||1,demo=!!o.demo,free=!!o.free;return {...o,chapter,demo,free,generation:o.generation||0,key:free?'free-lab':`c${chapter}-${demo?'demo':'practical'}`,mode:!free&&(chapter===3&&!demo||demo&&[2,5,7].includes(chapter))?'TRAINING':o.mode||'PRACTICE'};}
  function initial(options={}){
    const o=settings(options);let model=o.chapter===1?N.firstTask():N.course.model(o.chapter,o.demo);
    if(o.mode==='TRAINING'&&o.demo){model=o.chapter===2?N.firstTask():N.course.model(o.chapter);if(o.chapter===2){model.devices[0].ip='192.168.1.10';model.devices[2].ip='192.168.1.20';}if(o.chapter===5)model.devices[0].ip='';}
    model.version=N.NETWORK_STATE_VERSION;model.task={key:o.key,revision:TASK_REVISION,generation:o.generation,mode:o.mode};
    model.ui={selectedTool:null,selectedDevice:null,cableSource:null,portChoice:null,currentSubstep:0,demoSaved:false};T.refresh(model);return model;
  }
  function snapshot(options={}){const m=initial(options);return {devices:structuredClone(m.devices),connections:structuredClone(m.links),deviceSettings:Object.fromEntries(m.devices.map(d=>[d.id,{ip:d.ip,mask:d.mask,gateway:d.gateway,dns:d.dns}])),portStates:m.devices.flatMap(d=>d.ports.map(p=>T.portState(m,d.id,p.id))),selectedTool:null,selectedDevice:null,currentSubstep:0};}
  const signature=l=>[[l.fromDevice,l.fromPort],[l.toDevice,l.toPort]].map(a=>a.join(':')).sort().join('|');
  function trainingLinks(model,o){
    if(o.chapter===3)return ['PC-01','PC-02','PC-03'].map((name,i)=>({fromDevice:model.devices.find(d=>d.name===name)?.id,fromPort:'eth0',toDevice:'d2',toPort:`eth${i}`}));
    if(o.chapter===2)return [{fromDevice:'d1',fromPort:'eth0',toDevice:'d2',toPort:'eth0'}];
    if(o.chapter===7){const r=model.devices.find(d=>d.type==='router'),sw=model.devices.find(d=>d.name==='SW-B');return r?[{fromDevice:'d2',fromPort:'eth1',toDevice:r.id,toPort:'eth0'},{fromDevice:r.id,fromPort:'eth1',toDevice:sw.id,toPort:'eth1'}]:[];}
    return [];
  }
  function compatible(model,o,base){
    if(!o.free){for(const d of base.devices){const saved=model.devices.find(n=>n.id===d.id);if(!saved||saved.name!==d.name||saved.type!==d.type||d.ports.some(p=>!saved.ports.some(n=>n.id===p.id)))return false;
      // Parameters hidden by this chapter cannot be repaired through its UI.
      const hidden=o.chapter<5?['ip','mask','gateway','dns']:o.chapter===5?['mask','gateway','dns']:o.chapter<8?['gateway','dns']:o.chapter<11?['dns']:[];
      if(hidden.some(k=>saved[k]!==d[k])&&!(o.chapter===10&&saved.services?.dhcpLease))return false;
    }}
    if(o.mode!=='TRAINING')return true;
    if(model.devices.length!==base.devices.length+(o.chapter===7&&model.devices.some(d=>d.type==='router')?1:0))return false;
    if(model.devices.some(d=>d.ports.some(p=>!p.up)))return false;
    for(const d of base.devices){const saved=model.devices.find(n=>n.id===d.id);if(['ip','mask','gateway','dns'].some(k=>!(o.chapter===5&&d.id==='d1'&&k==='ip')&&saved[k]!==d[k]))return false;}
    if(o.chapter===5){const values=model.devices[0].ip.split('.'),expected=['192','168','1','10'];let empty=false;for(let i=0;i<Math.max(4,values.length);i++){if(!values[i])empty=true;else if(empty||values[i]!==expected[i])return false;}}
    const signatures=new Set(model.links.map(signature));if(base.links.some(l=>!signatures.has(signature(l))))return false;
    const baseLinks=new Set(base.links.map(signature)),extra=model.links.filter(l=>!baseLinks.has(signature(l))),allowed=trainingLinks(model,o);let gap=false;
    for(const l of allowed){if(!signatures.has(signature(l)))gap=true;else if(gap)return false;}
    if(extra.some(l=>!allowed.some(n=>signature(l)===signature(n))))return false;
    if(model.links.some(l=>l.status!=='up'))return false;
    const router=model.devices.find(d=>d.type==='router');if(o.chapter===7&&router&&(!router.interfaces.some(i=>i.port==='eth0'&&i.ip==='192.168.1.1'&&i.mask==='255.255.255.0')||!router.interfaces.some(i=>i.port==='eth1'&&i.ip==='192.168.2.1'&&i.mask==='255.255.255.0')))return false;
    return true;
  }
  function prepare(saved,options={}){
    const o=settings(options),base=initial(o);
    if(!saved)return {model:base,recovered:false,migrated:false};
    if(!N.validModel(saved)||!o.free&&saved.task&&(saved.task.key!==o.key||saved.task.revision!==TASK_REVISION||saved.task.generation!==o.generation)||!compatible(saved,o,base))return {model:base,recovered:true,migrated:false,code:'TASK_STATE_INVALID',message:'Учебный стенд восстановлен для текущего задания.'};
    const model=structuredClone(saved),migrated=model.version!==N.NETWORK_STATE_VERSION||!model.task;model.version=N.NETWORK_STATE_VERSION;model.task=base.task;
    const old=model.ui||{};model.ui={...base.ui,...old};
    if(model.ui.selectedDevice&&!model.devices.some(d=>d.id===model.ui.selectedDevice))model.ui.selectedDevice=null;
    if(model.ui.cableSource&&!model.devices.some(d=>d.id===model.ui.cableSource))model.ui.cableSource=null;
    if(!['ethernet',null].includes(model.ui.selectedTool))model.ui.selectedTool=null;
    if(model.ui.portChoice&&(!['from','to','switchId'].every(k=>model.devices.some(d=>d.id===model.ui.portChoice[k]))||![model.ui.portChoice.from,model.ui.portChoice.to].includes(model.ui.portChoice.switchId)||model.devices.find(d=>d.id===model.ui.portChoice.switchId)?.type!=='switch')){model.ui.portChoice=null;model.ui.cableSource=null;model.ui.selectedTool=null;}
    if(model.ui.cableSource){try{T.endpoint(model,model.ui.cableSource,null,'source');}catch{model.ui.cableSource=null;model.ui.portChoice=null;model.ui.selectedTool=null;}}
    if(model.ui.portChoice){try{T.endpoint(model,model.ui.portChoice.from,null,'source');T.endpoint(model,model.ui.portChoice.to,null,'destination');}catch{model.ui.portChoice=null;model.ui.cableSource=null;model.ui.selectedTool=null;}}
    if(o.mode==='TRAINING'){
      const next=trainingLinks(model,o).find(l=>!model.links.some(n=>signature(n)===signature(l)));
      if(next&&(model.ui.cableSource&&model.ui.cableSource!==next.fromDevice||model.ui.portChoice&&(model.ui.portChoice.from!==next.fromDevice||model.ui.portChoice.to!==next.toDevice))){model.ui.cableSource=null;model.ui.portChoice=null;model.ui.selectedTool=null;}
      if(o.chapter===5&&model.ui.selectedDevice!=='d1')model.ui.selectedDevice=null;
    }
    if(model.ui.portChoice){model.ui.selectedDevice=model.ui.portChoice.switchId;model.ui.selectedTool='ethernet';}
    else if(model.ui.cableSource){model.ui.selectedDevice=model.ui.cableSource;model.ui.selectedTool='ethernet';}
    T.refresh(model);T.assertInvariants(model);return {model,recovered:false,migrated};
  }
  function connection(task,model,ctx={}){
    if(ctx.portChoice)return {from:ctx.portChoice.from,to:ctx.portChoice.to};
    let from,to;const find=name=>model.devices.find(d=>d.name===name)?.id;
    if(task.test?.startsWith('cable:')){from=find(task.test.slice(6));to=find('SW-01');}
    else if(task.test==='router-a'){from=find('SW-A');to=model.devices.find(d=>d.type==='router')?.id;}
    else if(task.test==='router-b'){from=model.devices.find(d=>d.type==='router')?.id;to=find('SW-B');}
    else if(ctx.guided&&task.chapterId===2){from=find('PC-01');to=find('SW-01');}
    if(!from&&!to&&!task.test?.startsWith('cable:')&&!['router-a','router-b'].includes(task.test)&&!(ctx.guided&&task.chapterId===2))return null;
    const spec=model.task?.mode==='TRAINING'?trainingLinks(model,settings({chapter:task.chapterId,demo:ctx.demo})).find(l=>[l.fromDevice,l.toDevice].includes(from)&&[l.fromDevice,l.toDevice].includes(to)):null;
    return {from,to,fromPort:spec?.fromPort,toPort:spec?.toPort};
  }
  function preconditions(task,model,ctx={}){
    try{
      if(!N.validModel(model))throw T.error('TASK_STATE_INVALID','Схема повреждена. Восстановите задание.');
      if(model.task&&!model.task.key.startsWith(`c${task.chapterId}-`)&&model.task.key!=='free-lab')throw T.error('TASK_STATE_INVALID','Схема относится к другому заданию. Восстановите задание.');
      const pair=connection(task,model,ctx);
      if(pair&&task.questMarkerTarget?.id!=='finish-demo'){for(const end of [T.endpoint(model,pair.from,pair.fromPort,'source'),T.endpoint(model,pair.to,pair.toPort,'destination')])if(!end.d.ports.find(p=>p.id===end.portId).up)throw T.error('TASK_STATE_INVALID',`Порт ${end.d.name} ${end.portId} выключен. Включите его или восстановите задание.`);}
      if(task.test==='router'&&model.devices.length>=30)throw T.error('TASK_STATE_INVALID','Для Router нет места. Удалите лишнее устройство или восстановите задание.');
      if(['ip','gateway','dns'].includes(task.test)&&!model.devices.some(d=>d.name===(ctx.guided||task.test==='dns'?'PC-01':'PC-02')))throw T.error('DEVICE_NOT_FOUND','Нужного ПК нет. Восстановите задание.');
      return {ok:true,pair};
    }catch(e){return {ok:false,code:e.code||'TASK_STATE_INVALID',message:e.message,details:e.details||{}};}
  }
  function plan(task,model,ctx={}){
    const pre=preconditions(task,model,ctx),target=task.questMarkerTarget;
    return {...pre,taskId:task.id,substep:ctx.portChoice?'port':ctx.cableSource?'destination':ctx.mode?'source':'tool',allowedActions:pre.ok?[{type:target?.type,id:target?.id}]:[{type:'control',id:'restore-task'}],expectedResult:task.expectedResult,postconditions:task.postconditions};
  }
  function allowed(task,model,ctx,action){if(model.task?.mode!=='TRAINING'||action.id==='restore-task')return {ok:true};const state=plan(task,model,ctx);if(!state.ok)return state;const target=task.questMarkerTarget;if(target?.type===action.type&&target.id===action.id)return {ok:true};if(action.id?.startsWith('port-')&&ctx.portChoice){const sw=model.devices.find(d=>d.id===ctx.portChoice.switchId),port=sw?.ports[Number(action.id.slice(5))-1];if(port&&T.portState(model,sw.id,port.id).occupied)return {ok:false,code:'DESTINATION_PORT_OCCUPIED',message:'Этот Port уже используется. Выберите свободный требуемый порт.'};}return {ok:false,code:'WRONG_DEVICE_FOR_STEP',message:task.wrongActionFeedback};}
  function prepareTicket(type,saved){const base=N.course.ticket(type);if(!saved)return {model:base,recovered:false};if(!N.validModel(saved)||base.devices.some(d=>!saved.devices.some(n=>n.id===d.id&&n.name===d.name&&n.type===d.type&&d.ports.every(p=>n.ports.some(q=>q.id===p.id)))))return {model:base,recovered:true};const model=structuredClone(saved);model.version=N.NETWORK_STATE_VERSION;T.refresh(model);T.assertInvariants(model);return {model,recovered:false};}
  function recoverProgress(p){
    p.course??={};const active=N.course.info(p);
    if(p.networkModel){const o={chapter:1,free:p.completedChapters.includes(1),generation:p.networkGeneration||0},r=prepare(p.networkModel,o);p.networkModel=r.model;if(r.recovered)p.labRecovery=r.message;}
    for(const [key,cs]of Object.entries(p.course)){const chapter=Number(key);if(chapter===15){for(const [i,r]of (cs.draft?.tickets||[]).entries()){if(!r?.model||!cs.tickets?.[i])continue;const prepared=prepareTicket(cs.tickets[i],r.model);r.model=prepared.model;if(prepared.recovered){r.checks=[];r.cause='';r.fixed=false;if(active?.c.id===chapter)p.labRecovery='Учебный стенд восстановлен для текущего задания.';}}}if(!NETWORK_CHAPTERS.includes(chapter))continue;
      for(const [field,demo]of [['model',false],['demoModel',true]])if(cs[field]){const r=prepare(cs[field],{chapter,demo,generation:cs[demo?'demoGeneration':'taskGeneration']||0});cs[field]=r.model;if(r.recovered){if(demo){cs.demoSaved=false;cs.guidedCable=false;}else{cs.draft={};delete cs.failedTask;}if(active?.c.id===chapter)p.labRecovery=r.message;}}
    }
    return p;
  }
  for(const t of new Set(Object.values(C.registry))){const data=t.taskInitialState;if(data.scenario==='network')Object.assign(data,snapshot({chapter:t.chapterId,demo:t.id.endsWith('-demo')||t.id==='guided-cable'}));else Object.assign(data,{devices:[],connections:[],deviceSettings:{},portStates:[]});Object.freeze(data);}
  N.taskState={TASK_REVISION,NETWORK_CHAPTERS,settings,initial,snapshot,prepare,prepareTicket,connection,preconditions,plan,allowed,recoverProgress,trainingLinks};
})();
