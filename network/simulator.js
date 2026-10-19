'use strict';
(() => {
  function ip(value) {
    if (typeof value !== 'string' || !/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(value)) return null;
    const parts = value.split('.').map(Number); if (parts.some(n => n > 255)) return null;
    return parts.reduce((a, n) => (a * 256 + n) >>> 0, 0);
  }
  function mask(value) {
    const number = ip(value); if (number === null) return null;
    const inverted = (~number) >>> 0;
    return ((inverted & (inverted + 1)) >>> 0) === 0 ? number : null;
  }
  function host(address, netmask) {
    const a = ip(address), m = mask(netmask); if (a === null || m === null) return false;
    const size = (~m) >>> 0; const part = (a & ~m) >>> 0;
    const first = a >>> 24;
    return first > 0 && first !== 127 && first < 224 && (size <= 1 || (part !== 0 && part !== size));
  }
  function same(a, b, m) { return ip(a) !== null && ip(b) !== null && mask(m) !== null && ((ip(a) & mask(m)) >>> 0) === ((ip(b) & mask(m)) >>> 0); }
  function check(model, sourceId, target, internal = false) {
    const src = model.devices.find(d => d.id === sourceId);
    const fail = (message, path = [sourceId], failedAt = path.at(-1), code='TASK_STATE_INVALID') => ({ ok: false, code, message, path, failedAt });
    if (!src || ['switch','ap'].includes(src.type)) return fail('Выберите компьютер или другое конечное устройство отправителем.',[sourceId],sourceId,'DEVICE_NOT_FOUND');
    let dst = model.devices.find(d => d.id === target || d.ip === target || d.name === target && !target.includes('.') || d.type === 'router' && d.interfaces.some(i => i.ip === target));
    let dnsPath = null;
    if (!dst && ip(target) === null && !internal) {
      if (!src.dns) return fail('DNS-сервер не настроен. Для обращения по имени нужен адрес DNS-сервера. По IP-адресу можно проверить связь без DNS.');
      const dns = model.devices.find(d => d.type === 'server' && d.ip === src.dns && d.services?.dns);
      if (!dns) return fail('Указанный DNS-сервер отсутствует или его служба DNS выключена.');
      const resolution = check(model, sourceId, dns.id, true);
      if (!resolution.ok) return fail(`До DNS-сервера нельзя добраться: ${resolution.message}`, resolution.path, resolution.failedAt);
      const address = dns.services.records?.[target];
      if (!address) return fail('DNS-сервер доступен, но записи для такого имени нет.', resolution.path);
      dnsPath = resolution.path; dst = model.devices.find(d => d.ip === address);
    }
    if (!dst) return fail('Устройство назначения не найдено. Укажите существующее устройство, его IP или имя из учебного DNS.');
    const T = Patrol.network.topology;
    let destinationInterface = dst.type === 'router' ? dst.interfaces.find(i => (ip(target) === null || i.ip === target) && T.path(model,src.id,dst.id,{throughRouters:false,targetPort:i.port})) : null;
    const dstAddress = destinationInterface || dst;
    const lanRoute = T.path(model,src.id,dst.id,{throughRouters:false,targetPort:destinationInterface?.port});
    let route = lanRoute || T.path(model, src.id, dst.id);
    // A valid gateway may use a different physical path from the shortest one.
    if (!lanRoute && dst.type !== 'router') {
      for (const router of model.devices.filter(d=>d.type==='router')) {
        const incoming=router.interfaces.find(i=>i.ip===src.gateway),outgoing=router.interfaces.find(i=>i.ip===dst.gateway);
        if(!incoming||!outgoing||incoming.port===outgoing.port)continue;
        const left=T.path(model,src.id,router.id,{throughRouters:false,targetPort:incoming.port});
        const right=T.path(model,router.id,dst.id,{throughRouters:false,sourcePort:outgoing.port});
        if(left&&right){route=[...left,...right.slice(1)];break;}
      }
    }
    if (!route) {
      // Find the reached part for a useful failed packet visualization.
      let reached = [src.id];
      for (const d of model.devices) { const p = Patrol.network.topology.path(model, src.id, d.id); if (p && p.length > reached.length) reached = p; }
      return fail(`${src.name} и ${dst.name}: физического пути нет. Проверьте кабели, состояние links и Ethernet-портов.`, reached);
    }
    if (!host(src.ip, src.mask)) return fail(`${src.name}: некорректный IP-адрес или маска. Адрес должен обозначать устройство, а не сеть или широковещательную рассылку.`, [src.id],src.id,'INVALID_IPV4');
    if (!host(dstAddress.ip, dstAddress.mask)) return fail(`${dst.name}: некорректный IP-адрес или маска интерфейса.`, route, dst.id,'INVALID_IPV4');
    if (src.id !== dst.id && src.ip === dst.ip) return fail('Два устройства имеют одинаковый IP-адрес. Назначьте каждому свой адрес.', route, dst.id,'IP_CONFLICT');
    // Routers separate broadcast domains; their LAN interfaces participate in ARP.
    for (const endpoint of dst.type === 'router' ? [src] : [src,dst]) {
      const peers = model.devices.flatMap(d => d.type === 'router' ? d.interfaces.filter(i=>T.path(model,endpoint.id,d.id,{throughRouters:false,targetPort:i.port})).map(i=>({...i,id:d.id})) : !['switch','ap'].includes(d.type)&&T.path(model,endpoint.id,d.id,{throughRouters:false}) ? [d] : []);
      const duplicate = peers.find((d,i)=>host(d.ip,d.mask)&&peers.slice(i+1).some(p=>p.ip===d.ip));
      if (duplicate) return fail(`Конфликт IP: адрес ${duplicate.ip} повторяется в одной LAN. Назначьте ПК и интерфейсам Router разные адреса.`, route.slice(0,1),endpoint.id,'IP_CONFLICT');
    }
    const routers = route.map(id => model.devices.find(d => d.id === id)).filter(d => d.type === 'router');
    const shared = same(src.ip, dstAddress.ip, src.mask) && same(dstAddress.ip, src.ip, dstAddress.mask);
    if (shared && routers.length && dst.type !== 'router') return fail('Устройства одной подсети разделены маршрутизатором. Для простой LAN подключите их к одному коммутатору; для маршрутизации задайте разные подсети.', route, routers[0].id);
    if (!shared) {
      if (!routers.length) return fail(`${src.name} и ${dst.name} физически соединены, но находятся в разных подсетях. Коммутатор не заменяет маршрутизатор.`, route.slice(0, Math.max(1, route.length - 1)),src.id,'WRONG_SUBNET');
      if (routers.length !== 1) return fail('Эта версия проверяет маршрут через один Router. Цепочки маршрутизаторов появятся позже.', route, routers[0].id);
      const router = routers[0], index = route.indexOf(router.id);
      const interfaceAt = neighbor => {
        const l = model.links.find(l => [l.fromDevice, l.toDevice].includes(router.id) && [l.fromDevice, l.toDevice].includes(neighbor));
        return router.interfaces.find(i => i.port === (l?.fromDevice === router.id ? l.fromPort : l?.toPort));
      };
      const incoming = interfaceAt(route[index - 1]), outgoing = interfaceAt(route[index + 1]);
      if (!src.gateway || !same(src.ip, src.gateway, src.mask)) return fail(`${src.name}: шлюз не задан или находится вне его подсети. Шлюз – адрес ближайшего маршрутизатора.`, [src.id], src.id,'INVALID_GATEWAY');
      if (!incoming || src.gateway !== incoming.ip || !host(incoming.ip, incoming.mask) || !same(src.ip, incoming.ip, incoming.mask)) return fail('Путь до Router есть, но адрес входного интерфейса не соответствует шлюзу компьютера.', route.slice(0, index + 1), router.id,'INVALID_GATEWAY');
      if (!outgoing || !host(outgoing.ip, outgoing.mask) || !same(dst.ip, outgoing.ip, outgoing.mask) || !same(dst.ip, outgoing.ip, dst.mask)) return fail('Router не имеет корректного выходного интерфейса в подсети получателя.', route.slice(0, index + 1), router.id);
      if (dst.gateway !== outgoing.ip) return fail(`${dst.name}: не задан правильный шлюз для обратного ответа.`, route, dst.id,'INVALID_GATEWAY');
    }
    return { ok: true, message: `${src.name} → ${dst.name}: связь есть. ${shared ? 'Устройства в одной подсети, физический путь готов.' : 'Путь через маршрутизатор и обратный шлюз проверены.'}${dnsPath ? ' Имя разрешено учебным DNS.' : ''}`, path: route, failedAt: null, dnsPath };
  }
  function firstTask(model) {
    const a = model.devices.find(d => d.name === 'PC-01' && d.type === 'pc'), b = model.devices.find(d => d.name === 'PC-02' && d.type === 'pc'), sw = model.devices.find(d => d.name === 'SW-01' && d.type === 'switch');
    if (!a || !b || !sw) return { ok: false, message: 'Для задания нужны PC-01, PC-02 и SW-01. Восстановите исходную схему.', path: [a?.id].filter(Boolean), failedAt: a?.id };
    const connected = pc => model.links.some(l => l.status === 'up' && [l.fromDevice,l.toDevice].includes(pc.id) && [l.fromDevice,l.toDevice].includes(sw.id));
    const result = check(model, a.id, b.id);
    if (!connected(a) || !connected(b)) {
      const reached = Patrol.network.topology.path(model,a.id,sw.id) || [a.id];
      return { ok:false, message:'Нужны два отдельных кабеля: PC-01 → SW-01 и PC-02 → SW-01. Прямое соединение ПК не выполняет это задание.', path:reached, failedAt:reached.at(-1) };
    }
    return result;
  }
  Patrol.network.simulator = { ip, mask, host, same, check, firstTask };
})();
