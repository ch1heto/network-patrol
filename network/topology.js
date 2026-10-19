'use strict';
(() => {
  const error = (code, message, details = {}) => Object.assign(new Error(message), {code, details});
  function portState(model, deviceId, portId) {
    const d=model.devices.find(d=>d.id===deviceId);
    if(!d)throw error('DEVICE_NOT_FOUND','Устройство отсутствует. Восстановите задание.',{deviceId});
    const p=d.ports.find(p=>p.id===portId);
    if(!p)throw error('PORT_NOT_FOUND',`У ${d.name} нет порта ${portId}. Восстановите задание.`,{deviceId,portId});
    const link=model.links.find(l=>l.fromDevice===deviceId&&l.fromPort===portId||l.toDevice===deviceId&&l.toPort===portId);
    const peer=link&&model.devices.find(n=>n.id===(link.fromDevice===deviceId?link.toDevice:link.fromDevice));
    const other=link&&peer?.ports.find(n=>n.id===(link.fromDevice===deviceId?link.toPort:link.fromPort));
    return {deviceId,portId,type:p.type||'Ethernet',occupied:!!link,connectionId:link?.id||null,peerId:peer?.id||null,linkState:link?.status==='up'&&p.up&&other?.up?'up':'down'};
  }
  function endpoint(model, deviceId, portId, side) {
    const d=model.devices.find(d=>d.id===deviceId);
    if(!d)throw error('DEVICE_NOT_FOUND','Устройство отсутствует. Восстановите задание.',{deviceId});
    portId ||= d.ports.find(p=>!portState(model,d.id,p.id).occupied)?.id;
    if(!portId){const occupied=d.ports.map(p=>portState(model,d.id,p.id)).find(p=>p.occupied);throw occupiedError(model,d,occupied,side);}
    const state=portState(model,d.id,portId);
    if(state.occupied)throw occupiedError(model,d,state,side);
    if(state.type!=='Ethernet')throw error('INVALID_TARGET','Соединение требует два Ethernet-интерфейса.',{deviceId,portId});
    return {d,portId};
  }
  function occupiedError(model,d,state,side){const peer=model.devices.find(n=>n.id===state?.peerId);return error(side==='source'?'SOURCE_PORT_OCCUPIED':'DESTINATION_PORT_OCCUPIED',`Ethernet-порт ${d.name} ${state?.portId||''} уже используется соединением ${d.name} ↔ ${peer?.name||'другое устройство'}. Чтобы подключить ${d.name} к нужному устройству, сначала удалите текущее соединение или восстановите задание.`,{deviceId:d.id,portId:state?.portId,connectionId:state?.connectionId});}
  function add(model, type) {
    if (!Patrol.network.types[type] || model.devices.length >= 30) throw new Error('На стенде можно разместить до 30 устройств.');
    const id = `d${model.nextId++}`;
    const device = Patrol.network.createDevice(type, id, 100 + (model.devices.length % 5) * 155, 25 + Math.floor(model.devices.length / 5) * 95);
    model.devices.push(device); return device;
  }
  function refresh(model) {
    for (const d of model.devices) {
      for(const p of d.ports)Object.assign(p,portState(model,d.id,p.id));
      d.connectedLinks = model.links.filter(l => l.fromDevice === d.id || l.toDevice === d.id).map(l => l.id);
      d.linkState = d.connectedLinks.some(id => { const l = model.links.find(l => l.id === id); return l?.status === 'up' && model.devices.find(p => p.id === l.fromDevice)?.ports.find(p => p.id === l.fromPort)?.up && model.devices.find(p => p.id === l.toDevice)?.ports.find(p => p.id === l.toPort)?.up; }) ? 'up' : 'down';
    }
  }
  function connect(model, from, to, fromPort = null, toPort = null) {
    if (from === to) throw error('INVALID_TARGET','Соедините два разных устройства.');
    if (model.links.some(l => [l.fromDevice, l.toDevice].includes(from) && [l.fromDevice, l.toDevice].includes(to))) throw error('CONNECTION_ALREADY_EXISTS','Эти устройства уже соединены. Повторный кабель не создан.');
    // Resolve and validate BOTH endpoints before allocating an id or changing either end.
    const a=endpoint(model,from,fromPort,'source'),b=endpoint(model,to,toPort,'destination');
    fromPort=a.portId;toPort=b.portId;
    const link = { id: `l${model.nextId++}`, fromDevice: from, fromPort, toDevice: to, toPort, type: 'Ethernet', status: 'up' };
    model.links.push(link); refresh(model); return link;
  }
  function remove(model, id) { model.devices = model.devices.filter(d => d.id !== id); model.links = model.links.filter(l => l.id !== id && l.fromDevice !== id && l.toDevice !== id); refresh(model); }
  function path(model, from, to, options = {}) {
    const queue = [[from]]; const visited = new Set([from]);
    while (queue.length) {
      const route = queue.shift(), id = route.at(-1);
      if (id === to) return route;
      const d = model.devices.find(d => d.id === id);
      if (id !== from && !['switch', 'router', 'ap'].includes(d?.type)) continue;
      if (id !== from && d?.type === 'router' && options.throughRouters === false) continue;
      for (const link of model.links.filter(l => l.status === 'up' && (l.fromDevice === id || l.toDevice === id))) {
        const portAt = device => link.fromDevice === device ? link.fromPort : link.toPort;
        if (id === from && options.sourcePort && portAt(from) !== options.sourcePort) continue;
        if ([link.fromDevice,link.toDevice].includes(to) && options.targetPort && portAt(to) !== options.targetPort) continue;
        const next = link.fromDevice === id ? link.toDevice : link.fromDevice;
        const a = model.devices.find(d => d.id === link.fromDevice), b = model.devices.find(d => d.id === link.toDevice);
        if (!a?.ports.find(p => p.id === link.fromPort)?.up || !b?.ports.find(p => p.id === link.toPort)?.up) continue;
        if (!visited.has(next)) { visited.add(next); queue.push([...route, next]); }
      }
    }
    return null;
  }
  function assertInvariants(model){
    const ids=new Set(),used=new Set(),pairs=new Set();
    for(const d of model.devices){if(ids.has(d.id))throw error('TASK_STATE_INVALID','Повтор идентификатора устройства.');ids.add(d.id);}
    for(const l of model.links){if(ids.has(l.id))throw error('TASK_STATE_INVALID','Повтор идентификатора кабеля.');ids.add(l.id);const pair=[l.fromDevice,l.toDevice].sort().join(':');if(pairs.has(pair)||l.fromDevice===l.toDevice)throw error('TASK_STATE_INVALID','Повтор соединения.');pairs.add(pair);for(const [d,p]of [[l.fromDevice,l.fromPort],[l.toDevice,l.toPort]]){portState(model,d,p);const key=d+':'+p;if(used.has(key))throw error('TASK_STATE_INVALID','Один порт занят двумя кабелями.');used.add(key);}}
    for(const d of model.devices)for(const p of d.ports){const actual=portState(model,d.id,p.id);for(const k of ['occupied','connectionId','linkState','peerId'])if(p[k]!==actual[k])throw error('TASK_STATE_INVALID','Статус порта не соответствует соединению.',{deviceId:d.id,portId:p.id});}
    return true;
  }
  Patrol.network.topology = { add, connect, remove, path, refresh, portState, endpoint, error, assertInvariants };
})();
