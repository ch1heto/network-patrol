'use strict';
(() => {
  let token = 0;
  function stop() { token++; }
  function play(model, result, svg, complete = () => {}) {
    const run = ++token;
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); marker.setAttribute('r', '9'); marker.setAttribute('class', `lab-packet ${result.ok ? '' : 'failed'}`); svg.append(marker);
    const points = result.path.map(id => model.devices.find(d => d.id === id)).filter(Boolean);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = Math.max(800, (points.length - 1) * 650); let start = null;
    function tick(now) {
      if (run !== token || !svg.isConnected) { marker.remove(); return; }
      start ??= now; const t = Math.min(1, (now - start) / duration);
      const position = t * Math.max(0, points.length - 1); const index = Math.min(points.length - 1, Math.floor(position));
      const a = points[index], b = points[Math.min(index + 1, points.length - 1)];
      if (a) { const fraction = reduced ? 0 : position - index; marker.setAttribute('cx', a.x + 55 + (b.x - a.x) * fraction); marker.setAttribute('cy', a.y + 35 + (b.y - a.y) * fraction); }
      if (t < 1) requestAnimationFrame(tick); else { if (result.ok) marker.remove(); complete(); }
    }
    requestAnimationFrame(tick);
  }
  Patrol.network.packetAnimation = { play, stop };
})();
