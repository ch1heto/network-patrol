'use strict';
(() => {
  function validModel(value) {
    const id = text => typeof text === 'string' && /^[a-zA-Z][\w-]{0,30}$/.test(text);
    if (![1,Patrol.network.NETWORK_STATE_VERSION].includes(value?.version) || !Number.isSafeInteger(value.nextId) || value.nextId <= 0 || !Array.isArray(value.devices) || value.devices.length > 30 || !Array.isArray(value.links) || value.links.length > 120) return false;
    if (!value.links.every(link => link && typeof link === 'object')) return false;
    if (!value.devices.every(d => d && Object.hasOwn(Patrol.network.types,d.type) && id(d.id) && typeof d.name === 'string' && ['ip','mask','gateway','dns','mac'].every(k => typeof d[k] === 'string') && Array.isArray(d.ports) && d.ports.length <= 8 && d.ports.every(p => p && id(p.id) && typeof p.up === 'boolean') && new Set(d.ports.map(p=>p.id)).size === d.ports.length && Array.isArray(d.interfaces) && d.interfaces.every(i => i && d.ports.some(p=>p.id===i.port) && typeof i.ip === 'string' && typeof i.mask === 'string') && Number.isFinite(d.x) && d.x >= 0 && d.x <= 875 && Number.isFinite(d.y) && d.y >= 0 && d.y <= 500 && (d.type !== 'server' || (d.services && typeof d.services.dns === 'boolean' && d.services.records && typeof d.services.records === 'object')))) return false;
    const ids = [...value.devices,...value.links].map(d=>d.id);
    if (new Set(ids).size !== ids.length || ids.some(v=>!id(v)) || value.nextId <= Math.max(0,...ids.map(v=>Number(v.match(/\d+$/)?.[0]) || 0))) return false;
    const used = new Set(),pairs=new Set();
    return value.links.every(l => { const pair=[l.fromDevice,l.toDevice].sort().join(':');if(pairs.has(pair))return false;pairs.add(pair);if (!['up','down'].includes(l.status) || l.type !== 'Ethernet' || l.fromDevice === l.toDevice) return false; for (const [device,port] of [[l.fromDevice,l.fromPort],[l.toDevice,l.toPort]]) { const key = `${device}:${port}`; if (used.has(key) || !value.devices.some(d=>d.id===device && d.ports.some(p=>p.id===port))) return false; used.add(key); } return true; });
  }
  Patrol.network.validModel = validModel;
})();
