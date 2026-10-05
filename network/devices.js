'use strict';
Patrol.network.types = { pc: 'PC', laptop: 'Laptop', switch: 'Switch', router: 'Router', server: 'Server', printer: 'Printer', ap: 'Wi-Fi AP' };
Patrol.network.NETWORK_STATE_VERSION = 2;
Patrol.network.createDevice = (type, id, x = 160, y = 160) => {
  const number = Number(id.replace(/\D/g, '')) || 1;
  const count = type === 'switch' ? 8 : type === 'router' ? 4 : type === 'ap' ? 2 : 1;
  return { id, type, name: `${Patrol.network.types[type]}-${String(number).padStart(2, '0')}`, x, y,
    ip: ['switch','ap'].includes(type) ? '' : `192.168.10.${type === 'router' ? 1 : 10 + number}`,
    mask: '255.255.255.0', gateway: '', dns: '',
    mac: `02:00:00:00:${Math.floor(number / 256).toString(16).padStart(2, '0')}:${(number % 256).toString(16).padStart(2, '0')}`,
    linkState: 'down', ports: Array.from({ length: count }, (_, i) => ({ id: `eth${i}`, deviceId:id, portId:`eth${i}`, type:'Ethernet', up:true, occupied:false, connectionId:null, peerId:null, linkState:'down' })), connectedLinks: [],
    interfaces: type === 'router' ? [{ port: 'eth0', ip: '192.168.10.1', mask: '255.255.255.0' }, { port: 'eth1', ip: '192.168.20.1', mask: '255.255.255.0' }] : [],
    routes: [], services: type === 'server' ? { dns: false, records: { 'college.test': `192.168.10.${10 + number}` } } : {},
  };
};
Patrol.network.firstTask = () => ({ version: Patrol.network.NETWORK_STATE_VERSION, nextId: 4, devices: [
  { ...Patrol.network.createDevice('pc', 'd1', 170, 180), name: 'PC-01', ip: '192.168.10.11' },
  { ...Patrol.network.createDevice('switch', 'd2', 450, 300), name: 'SW-01' },
  { ...Patrol.network.createDevice('pc', 'd3', 730, 180), name: 'PC-02', ip: '192.168.10.12' },
], links: [] });
