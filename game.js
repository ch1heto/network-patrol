'use strict';

const room = document.getElementById('room');
const character = document.getElementById('character');
const sprite = document.getElementById('sprite');
const context = sprite.getContext('2d');
const statusLabel = document.getElementById('state');
const loading = document.getElementById('loading');
const buttons = [...document.querySelectorAll('[data-direction]')];
const FRAME_WIDTH = 250;
const FRAME_HEIGHT = 333;
const COLUMNS = 12;
const FPS = 12;
const SPEED = 210; // World pixels per second, independent of the screen refresh rate.
const DEBUG = false; // Foot point, walkable trapezoid and live coordinates.
const FAR_SCALE = 0.75;
const NEAR_SCALE = 1.0;
const animations = {
  idle: { image: new Image(), frames: 120, src: 'assets/idle.webp' },
  run: { image: new Image(), frames: 108, src: 'assets/run.webp' },
};
const inputs = new Map();
let sequence = 0;
let ready = false;
let playerX = 0; // Logical anchor: centre of the feet, in scene CSS pixels.
let playerY = 0;
let scene = null;
let visualScale = NEAR_SCALE;
let movementX = 0;
let movementY = 0;
let facing = 1;
let moving = false;
let state = 'IDLE';
let animationTime = 0;
let previousTimestamp = null;
let lastDrawn = '';
let blocked = false;

function draw() {
  if (!ready) return;
  const name = moving ? 'run' : 'idle';
  const animation = animations[name];
  const frame = Math.floor(animationTime * FPS) % animation.frames;
  const id = `${name}:${frame}`;
  if (id === lastDrawn) return;
  // One canvas and two predecoded atlases: no empty frames on state changes.
  context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  context.drawImage(animation.image, (frame % COLUMNS) * FRAME_WIDTH,
    Math.floor(frame / COLUMNS) * FRAME_HEIGHT, FRAME_WIDTH, FRAME_HEIGHT,
    0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  lastDrawn = id;
}

function updateAnimation(nextMoving, redraw = true) {
  // Animate actual displacement; held input still drives physics and wall interactions.
  if (moving !== nextMoving) animationTime = 0;
  moving = nextMoving;
  state = !moving ? 'IDLE' : facing > 0 ? 'RUN RIGHT' : 'RUN LEFT';
  sprite.classList.toggle('facing-left', facing < 0);
  if (ready) statusLabel.textContent = state;
  character.setAttribute('aria-label', !moving ? 'Персонаж стоит' : movementY < 0 ? 'Персонаж бежит в глубину' : movementY > 0 ? 'Персонаж бежит к переднему плану' : facing > 0 ? 'Персонаж бежит вправо' : 'Персонаж бежит влево');
  if (redraw) draw();
}

function updateInput() {
  let horizontal = null;
  let vertical = null;
  for (const input of inputs.values()) {
    if (input.x && (!horizontal || input.order > horizontal.order)) horizontal = input;
    if (input.y && (!vertical || input.order > vertical.order)) vertical = input;
  }
  const rawX = horizontal ? horizontal.x : 0;
  const rawY = vertical ? vertical.y : 0;
  const length = Math.hypot(rawX, rawY);
  movementX = length ? rawX / length : 0;
  movementY = length ? rawY / length : 0;
  if (rawX) facing = Math.sign(rawX);
  updateAnimation(moving && length > 0);
  buttons.forEach(button => {
    const held = [...inputs.keys()].some(key => key.startsWith(`pointer:${button.dataset.direction}:`));
    button.classList.toggle('pressed', held);
  });
}

function press(key, value) {
  if (!ready || blocked) return;
  Patrol.engines.ui.dismissOnboarding();
  if (!inputs.has(key)) inputs.set(key, { ...value, order: ++sequence });
  updateInput();
}
function release(key) { inputs.delete(key); updateInput(); }
function clearInput() { inputs.clear(); previousTimestamp = null; updateInput(); }

const directions = {
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
};
const keys = {
  KeyA: directions.left, ArrowLeft: directions.left,
  KeyD: directions.right, ArrowRight: directions.right,
  KeyW: directions.up, ArrowUp: directions.up,
  KeyS: directions.down, ArrowDown: directions.down,
};
window.addEventListener('keydown', event => {
  if (event.code === 'KeyE' && !event.repeat) {
    if (ready && !blocked) { event.preventDefault(); Patrol.engines.npcs.interact(); }
    return;
  }
  if (!(event.code in keys)) return;
  if (!ready || blocked || event.repeat && !inputs.has(`key:${event.code}`)) return;
  event.preventDefault();
  press(`key:${event.code}`, keys[event.code]);
});
window.addEventListener('keyup', event => {
  if (!(event.code in keys)) return;
  event.preventDefault();
  release(`key:${event.code}`);
});
window.addEventListener('blur', clearInput);
window.addEventListener('contextmenu', clearInput, true);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearInput(); });

buttons.forEach(button => {
  const name = button.dataset.direction;
  const value = directions[name];
  const pointerKey = event => `pointer:${name}:${event.pointerId}`;
  button.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    press(pointerKey(event), value);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(name, event => release(pointerKey(event)));
  }
  button.addEventListener('contextmenu', event => event.preventDefault());
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (from, to, amount) => from + (to - from) * amount;
function depthAt(y) { return clamp((y - scene.farY) / (scene.nearY - scene.farY), 0, 1); }
function scaleAt(y) { return lerp(FAR_SCALE, NEAR_SCALE, depthAt(y)); }
function boundsAt(y) {
  const depth = depthAt(y);
  // Reserve room for the visible sprite width, including the running stride.
  const radius = scene.playerWidth * 0.38 * scaleAt(y);
  const edge = lerp(scene.farLeft, scene.nearLeft, depth);
  return { minX: edge + radius, maxX: scene.width - edge - radius };
}
function constrainPlayer() {
  playerY = clamp(playerY, scene.farY, scene.nearY);
  const bounds = boundsAt(playerY);
  playerX = clamp(playerX, bounds.minX, bounds.maxX);
}
function position() {
  visualScale = scaleAt(playerY);
  // The scale origin stays at (playerX, playerY); mirroring is canvas-only.
  character.style.transform = `translate3d(${playerX - scene.playerWidth / 2}px, ${playerY - scene.playerHeight}px, 0) scale(${visualScale})`;
  character.style.zIndex = String(100 + Math.round(playerY));
  if (DEBUG) {
    document.getElementById('debug-foot').style.transform = `translate3d(${playerX - 5}px, ${playerY - 5}px, 0)`;
    document.getElementById('debug-values').textContent = `x: ${playerX.toFixed(1)}  y: ${playerY.toFixed(1)}  scale: ${visualScale.toFixed(3)}`;
  }
}
function layoutCorridor() {
  const { width, height, farY, nearY, farLeft, nearLeft, playerHeight } = scene;
  // The visible character is about 92% of its transparent frame height.
  // At the door it is 74% of the opening height, on every viewport size.
  const doorHeight = playerHeight * FAR_SCALE * 0.92 / 0.74;
  const properties = {
    '--far-y': `${farY}px`, '--near-y': `${nearY}px`,
    '--player-height': `${playerHeight}px`, '--door-height': `${doorHeight}px`,
    '--door-width': `${doorHeight * 0.43}px`, '--door-top': `${farY - doorHeight}px`,
  };
  for (const [name, value] of Object.entries(properties)) room.style.setProperty(name, value);
  const floorShape = `M ${farLeft} ${farY} L ${width - farLeft} ${farY} L ${width - nearLeft} ${nearY} L ${width} ${height} L 0 ${height} L ${nearLeft} ${nearY} Z`;
  document.getElementById('floor-shape').setAttribute('d', floorShape);
  document.getElementById('floor-edges').setAttribute('d', `M 0 ${height} L ${nearLeft} ${nearY} L ${farLeft} ${farY} M ${width} ${height} L ${width - nearLeft} ${nearY} L ${width - farLeft} ${farY}`);
  const lines = [];
  for (const t of [0.2, 0.43, 0.7, 1]) {
    const y = lerp(farY, nearY, t);
    const edge = lerp(farLeft, nearLeft, t);
    lines.push(`M ${edge} ${y} L ${width - edge} ${y}`);
  }
  for (const t of [0.25, 0.5, 0.75]) {
    lines.push(`M ${lerp(farLeft, width - farLeft, t)} ${farY} L ${lerp(nearLeft, width - nearLeft, t)} ${nearY} L ${width * t} ${height}`);
  }
  document.getElementById('floor-lines').setAttribute('d', lines.join(' '));
  document.getElementById('debug-path').setAttribute('d', `M ${farLeft} ${farY} L ${width - farLeft} ${farY} L ${width - nearLeft} ${nearY} L ${nearLeft} ${nearY} Z`);
  for (const id of ['debug-area', 'debug-foot', 'debug-values']) document.getElementById(id).toggleAttribute('hidden', !DEBUG);
}
function resize() {
  if (!Patrol.runtime || !Patrol.engines.locations) return;
  // Preserve depth and lateral position when rotating a phone or resizing.
  const oldDepth = scene ? depthAt(playerY) : 0.65;
  const oldBounds = scene ? boundsAt(playerY) : null;
  const lateral = oldBounds ? clamp((playerX - oldBounds.minX) / (oldBounds.maxX - oldBounds.minX), 0, 1) : 0.5;
  const location = Patrol.engines.locations.current;
  const width = location.width, height = location.height, playerHeight = 250;
  const world = document.getElementById('world');
  world.style.width = `${width}px`; world.style.height = `${height}px`;
  scene = {
    width, height, playerHeight, playerWidth: playerHeight * FRAME_WIDTH / FRAME_HEIGHT,
    farY: location.farY, nearY: location.nearY,
    farLeft: width * (1 - location.farWidth) / 2, nearLeft: width * (1 - location.nearWidth) / 2,
  };
  layoutCorridor();
  playerY = lerp(scene.farY, scene.nearY, oldDepth);
  const bounds = boundsAt(playerY);
  playerX = lerp(bounds.minX, bounds.maxX, lateral);
  constrainPlayer();
  position();
  room.style.setProperty('--far-left', `${scene.farLeft / width * 100}%`);
  room.style.setProperty('--far-right', `${100 - scene.farLeft / width * 100}%`);
  room.style.setProperty('--near-left', `${scene.nearLeft / width * 100}%`);
  room.style.setProperty('--near-right', `${100 - scene.nearLeft / width * 100}%`);
  if (ready) Patrol.engines.locations.layout();
  Patrol.engines.ui.layoutHUD();
}
window.addEventListener('resize', resize);

function tick(timestamp) {
  const deltaTime = previousTimestamp === null ? 0 : Math.min((timestamp - previousTimestamp) / 1000, 0.1);
  previousTimestamp = timestamp;
  if (ready) {
    const previousPoint = { x: playerX, y: playerY };
    const attempted = { x: playerX + movementX * SPEED * deltaTime, y: playerY + movementY * SPEED * deltaTime };
    const resolved = Patrol.engines.collisions.resolve({ x: playerX, y: playerY }, attempted);
    playerX = resolved.x;
    playerY = resolved.y;
    constrainPlayer();
    updateAnimation(!blocked && Math.hypot(playerX - previousPoint.x, playerY - previousPoint.y) > 1e-6, false);
    Patrol.engines.locations.update(deltaTime, attempted);
    Patrol.engines.npcs.update(deltaTime);
    animationTime += deltaTime;
    position();
    Patrol.engines.camera.update(deltaTime);
    draw();
  }
  requestAnimationFrame(tick);
}

async function start() {
  try {
    if (!window.PATROL_INITIAL) { location.replace("/"); return; }
    await Promise.all(Object.values(animations).map(async animation => {
      animation.image.src = animation.src;
      await animation.image.decode();
    }));
    resize();
    Patrol.engines.locations.render();
    Patrol.runtime.spawnAt(Patrol.engines.locations.current.spawn.x, Patrol.engines.locations.current.spawn.y);
    ready = true;
    clearInput();
    Patrol.engines.npcs.update(0);
    character.style.visibility = 'visible';
    loading.hidden = true;
    Patrol.engines.ui.showOnboarding();
    requestAnimationFrame(tick);
  } catch (error) {
    ready = false;
    clearInput();
    loading.textContent = 'Не удалось загрузить персонажа. Проверьте папку assets и обновите страницу.';
    statusLabel.textContent = 'ОШИБКА ЗАГРУЗКИ';
    console.error('Failed to load character atlases:', error);
  }
}
// Small adapter around the existing movement/animation engine. Content engines
// never replace the canvas, RAF loop or atlases; they only use these scene hooks.
Patrol.runtime = {
  get scene() { return scene; }, get point() { return { x: playerX, y: playerY }; },
  get ready() { return ready; },
  get blocked() { return blocked; }, boundsAt, scaleAt,
  setBlocked(value) { blocked = !!value; clearInput(); if (ready && scene) Patrol.engines.npcs.update(0); },
  refreshScene: resize,
  spawnAt(x, y) { if (!scene) return; playerX = x; playerY = y; constrainPlayer(); position(); clearInput(); Patrol.engines.camera.snap(); if (ready) Patrol.engines.npcs.update(0); },
  spawn(depth, lateral) {
    if (!scene) return;
    playerY = lerp(scene.farY, scene.nearY, depth);
    const bounds = boundsAt(playerY);
    playerX = lerp(bounds.minX, bounds.maxX, lateral);
    constrainPlayer(); position(); clearInput();
  },
};
start();
