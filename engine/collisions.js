'use strict';
(() => {
  let areas = [];
  function set(value) { areas = value; }
  function resolve(previous, next) {
    const radius = 17; // Footprint only; tall sprites may overlap objects in depth.
    let x = next.x, y = previous.y;
    for (const a of areas) if (y > a.y - radius && y < a.y + a.h + radius) {
      if (previous.x <= a.x - radius && x > a.x - radius) x = a.x - radius;
      else if (previous.x >= a.x + a.w + radius && x < a.x + a.w + radius) x = a.x + a.w + radius;
    }
    y = next.y;
    for (const a of areas) if (x > a.x - radius && x < a.x + a.w + radius) {
      if (previous.y <= a.y - radius && y > a.y - radius) y = a.y - radius;
      else if (previous.y >= a.y + a.h + radius && y < a.y + a.h + radius) y = a.y + a.h + radius;
    }
    return { x, y };
  }
  Patrol.engines.collisions = { set, resolve, get areas() { return areas.map(a => ({ ...a })); } };
})();
