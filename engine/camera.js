'use strict';
(() => {
  let x = 0, y = 0, zoom = 1, initialized = false, inset = 0;
  function limits() {
    const s = Patrol.runtime.scene;
    zoom = Math.min(1, Math.max(.72, document.getElementById('room').clientWidth / 850));
    const room=document.getElementById('room'),mobile=room.clientWidth<=600;
    inset=mobile?Math.min(room.clientHeight-240,document.querySelector('.quest-hud').getBoundingClientRect().bottom+12):0;inset=Math.max(0,inset);
    const height=mobile?Math.max(160,room.clientHeight-inset-110):room.clientHeight;
    return { w: room.clientWidth / zoom, h: height / zoom, s };
  }
  function paint() { document.getElementById('world').style.transform = `translate3d(${-x * zoom}px, ${inset-y * zoom}px, 0) scale(${zoom})`; }
  function snap() {
    const { w, h, s } = limits(); const p = Patrol.runtime.point;
    x = Math.max(0, Math.min(s.width - w, p.x - w * .48));
    y = Math.max(0, Math.min(s.height - h, p.y - h * .70));
    initialized = true; paint();
  }
  function update(dt) {
    if (!initialized) return snap();
    const { w, h, s } = limits(); const p = Patrol.runtime.point;
    let tx = x, ty = y;
    if (p.x < x + w * .35) tx = p.x - w * .35;
    if (p.x > x + w * .65) tx = p.x - w * .65;
    if (p.y < y + h * .47) ty = p.y - h * .47;
    if (p.y > y + h * .75) ty = p.y - h * .75;
    tx = Math.max(0, Math.min(Math.max(0, s.width - w), tx));
    ty = Math.max(0, Math.min(Math.max(0, s.height - h), ty));
    const amount = 1 - Math.exp(-6 * dt);
    x += (tx - x) * amount; y += (ty - y) * amount; paint();
  }
  Patrol.engines.camera = { update, snap, get state() { return { x, y, zoom }; } };
})();
