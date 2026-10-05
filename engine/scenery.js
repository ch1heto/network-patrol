'use strict';
(() => {
  let interactions=[];
  function art(type) {
    const pieces = {
      desk: '<div class="prop-desk bare-desk"><div class="desk-notebook"></div></div>',
      workstation: '<div class="prop-desk"><div class="prop-screen">_</div><i></i><span></span></div>',
      bench: '<div class="prop-bench"><svg viewBox="0 0 250 130" aria-hidden="true"><path d="M30 48V122M218 48V122M30 106H218" stroke="#526c61" stroke-width="9"/><path d="M12 22H238M12 43H238" stroke="#b39c77" stroke-width="16"/><path d="M8 81L32 62H218L243 81Z" fill="#b59b70" stroke="#887757" stroke-width="3"/><path d="M21 73H230" stroke="#d7c7a2" stroke-width="3"/><circle cx="30" cy="22" r="2" fill="#53685d"/><circle cx="218" cy="22" r="2" fill="#53685d"/></svg></div>',
      window: '<div class="prop-window"><i></i></div>',
      rack: '<div class="prop-rack"><i></i><i></i><i></i><i></i><i></i><i></i></div>',
      storage: '<div class="prop-rack storage-rack"><i></i><i></i><i></i></div>',
      ups: '<div class="prop-rack ups-rack"><span>UPS</span><i></i></div>',
      board: '<div class="prop-board"><span>PC → SWITCH → PC</span><i></i><i></i></div>',
      noticeboard: '<div class="prop-notice"><b>КОЛЛЕДЖ / СОБЫТИЯ</b><i></i><i></i><i></i></div>',
      tools: '<div class="prop-tools"><svg viewBox="0 0 210 85" aria-hidden="true"><path d="M30 15L53 43L43 75M47 15L30 43L20 75" fill="none" stroke="#516b60" stroke-width="9"/><path d="M22 53L17 76M46 53L43 76" stroke="#d7a363" stroke-width="10"/><path d="M85 16V60L101 75M104 16V60L88 75" fill="none" stroke="#688b78" stroke-width="8"/><rect x="139" y="20" width="23" height="25" rx="3" fill="#e4eadb" stroke="#668579"/><path d="M143 25H158M143 30H158M151 46V61Q150 80 181 70Q206 62 184 45" stroke="#7793a4" stroke-width="4" fill="none"/></svg><small>ОБЖИМ · ЗАЧИСТКА · КАБЕЛЬ</small></div>',
      books: '<div class="prop-books"><i></i><i></i><i></i><i></i><i></i></div>',
      boxes: '<div class="prop-boxes"><i></i><i></i></div>',
      plant: '<div class="prop-plant"><i></i><i></i><i></i><span></span></div>',
      light: '<div class="prop-light"></div>',
      ap: '<div class="prop-ap">Wi-Fi<i></i></div>',
      extinguisher: '<div class="prop-fire"><i></i><b>ОП</b></div>',
      clock: '<div class="prop-clock"><i></i><span></span></div>',
      cable: '<div class="prop-cable"></div>',
      sign: '<div class="prop-sign">← IT-СЛУЖБА　 /　 ЛАБОРАТОРИИ →</div>',
      projector: '<div class="prop-projector"><i></i></div>',
      printer: '<div class="prop-printer"><i></i><span></span></div>',
      router: '<div class="prop-router">ROUTER<i></i><i></i></div>',
      socket: '<div class="prop-socket"><span></span><span></span></div>',
    };
    return pieces[type] || '';
  }
  function render(location) {
    const root = document.getElementById('scene-details'); root.replaceChildren();
    const collisions = []; interactions=[];
    for (const [type, x, y] of location.props) {
      const node = document.createElement('div'); node.className = `scene-prop scene-item--${type}`; node.dataset.prop = type; node.innerHTML = art(type);
      node.style.left = `${x}px`; node.style.top = `${y}px`;
      const wall = ['window', 'board', 'noticeboard', 'tools', 'light', 'ap', 'clock', 'cable', 'sign', 'projector'].includes(type);
      node.classList.toggle('wall-prop', wall);
      const scale = wall ? 1 : Patrol.runtime.scaleAt(y);
      node.style.transform = `translate(-50%,-100%) scale(${scale})`;
      node.style.transformOrigin = '50% 100%';
      node.style.zIndex = wall ? '2' : String(100 + y);
      root.append(node);
      const card=Patrol.data.worldCards[type];
      if(card){
        const id=`${location.id}-${type}-${interactions.length}`;node.dataset.interaction=id;node.setAttribute('role','img');node.setAttribute('aria-label',card.title);
        interactions.push({id,kind:'scenery',type,node,data:{name:card.title},point:{x,y:wall?Math.max(location.farY+(type==='projector'?145:55),y+45):y},width:['desk','workstation','bench','board','noticeboard','tools'].includes(type)?220:100,scale});
      }
      if (['desk', 'workstation', 'bench', 'rack', 'storage', 'ups', 'books', 'boxes', 'printer', 'router'].includes(type)) {
        const w = (['desk','workstation','bench'].includes(type) ? 250 : type === 'books' ? 150 : 120) * scale;
        collisions.push({ x: x - w / 2, y: y - 35 * scale, w, h: 35 * scale, type });
      }
    }
    Patrol.engines.collisions.set(collisions);
  }
  Patrol.engines.scenery = { render, get interactions(){return interactions;} };
})();
