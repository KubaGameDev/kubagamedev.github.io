
'use strict';
const c = document.getElementById('game');
const x = c.getContext('2d');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const statusText = document.getElementById('status');
const scoreText = document.getElementById('score');
const timeText = document.getElementById('time');
const gridSize = 20, cell = 20, stepSeconds = .16;
const directions = {up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0]};
const keyDirections = {ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right'};
let snake, dir, nextDir, food, turnQueued = false, running = false, paused = false;
let elapsed = 0, accumulator = 0, previous = null, frame = null, swipe = null, result = '';

function init() {
  snake = [[7, 10], [6, 10], [5, 10]];
  dir = [1, 0]; nextDir = [1, 0]; food = [13, 10];
  turnQueued = false; elapsed = 0; accumulator = 0; swipe = null; result = '';
  scoreText.textContent = '0'; timeText.textContent = '0';
}
function placeFood() {
  const occupied = new Set(snake.map(([sx, sy]) => sy * gridSize + sx));
  const free = [];
  for (let n = 0; n < gridSize * gridSize; n++) if (!occupied.has(n)) free.push(n);
  if (free.length === 0) { food = null; return false; }
  const square = free[Math.floor(Math.random() * free.length)];
  food = [square % gridSize, Math.floor(square / gridSize)];
  return true;
}
function draw() {
  const theme = getComputedStyle(document.documentElement);
  const foreground = theme.getPropertyValue('--text-color');
  const accent = theme.getPropertyValue('--accent-color');
  x.fillStyle = theme.getPropertyValue('--bg-color');
  x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = theme.getPropertyValue('--line-color');
  x.globalAlpha = .35; x.lineWidth = 1;
  x.beginPath();
  for (let i = 1; i < gridSize; i++) {
    x.moveTo(i * cell, 0); x.lineTo(i * cell, c.height);
    x.moveTo(0, i * cell); x.lineTo(c.width, i * cell);
  }
  x.stroke(); x.globalAlpha = 1;
  snake.forEach(([sx, sy], index) => {
    x.fillStyle = index === 0 ? foreground : accent;
    x.fillRect(sx * cell + 1, sy * cell + 1, cell - 2, cell - 2);
  });
  const headX = snake[0][0] * cell + cell / 2, headY = snake[0][1] * cell + cell / 2;
  x.fillStyle = theme.getPropertyValue('--bg-color');
  // Eyes keep the head and the current direction readable at phone size.
  for (const side of [-1, 1]) x.fillRect(headX + dir[0] * 4 + dir[1] * side * 4 - 1, headY + dir[1] * 4 + dir[0] * side * 4 - 1, 3, 3);
  if (food) {
    const fx = food[0] * cell + cell / 2, fy = food[1] * cell + cell / 2;
    x.fillStyle = '#ee795e';
    x.beginPath(); x.arc(fx, fy + 2, 7, 0, Math.PI * 2); x.fill();
    x.fillStyle = accent; x.fillRect(fx, fy - 9, 3, 5);
  }
  if (paused || result) {
    x.fillStyle = theme.getPropertyValue('--surface-color');
    x.fillRect(35, 164, 330, 72);
    x.fillStyle = foreground; x.textAlign = 'center'; x.font = 'bold 20px monospace';
    x.fillText(paused ? 'PAUSED' : result, c.width / 2, 207);
  }
}
function stopFrame() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null; previous = null;
}
function endGame(won = false) {
  running = false; paused = false; swipe = null;
  stopFrame();
  result = won ? 'BOARD COMPLETE!' : 'GAME OVER';
  statusText.textContent = (won ? 'You filled the whole board!' : 'Game over!') + ' Score: ' + (snake.length - 3) + ' · Time: ' + Math.floor(elapsed) + 's. Play again?';
  startBtn.textContent = 'Play again';
  pauseBtn.disabled = true; pauseBtn.textContent = 'Pause';
  draw();
}
function step() {
  if (!running || paused) return;
  dir = nextDir;
  turnQueued = false;
  const head = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
  const eating = food && head[0] === food[0] && head[1] === food[1];
  // The tail vacates its square on a normal move, so that square is safe.
  const body = eating ? snake : snake.slice(0, -1);
  if (head[0] < 0 || head[0] >= gridSize || head[1] < 0 || head[1] >= gridSize || body.some(([sx, sy]) => sx === head[0] && sy === head[1])) {
    endGame(); return;
  }
  snake.unshift(head);
  if (!eating) snake.pop();
  scoreText.textContent = String(snake.length - 3);
  if (eating && !placeFood()) { endGame(true); return; }
  draw();
}
function update(now) {
  frame = null;
  if (!running || paused) return;
  const dt = previous === null ? 0 : Math.min((now - previous) / 1000, .1);
  previous = now;
  elapsed += dt; accumulator += dt;
  timeText.textContent = String(Math.floor(elapsed));
  while (accumulator >= stepSeconds && running) { accumulator -= stepSeconds; step(); }
  if (running && !paused) frame = requestAnimationFrame(update);
}
function changeDirection(name) {
  if (!running || paused || turnQueued || !directions[name]) return;
  const next = directions[name];
  if ((next[0] === -dir[0] && next[1] === -dir[1]) || (next[0] === dir[0] && next[1] === dir[1])) return;
  nextDir = next;
  turnQueued = true;
}
function setPaused(value) {
  if (!running || paused === value) return;
  paused = value; swipe = null;
  stopFrame();
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  statusText.textContent = paused ? 'Paused. Select Resume when you are ready.' : 'Eat fruit. Avoid the walls and your tail.';
  draw();
  if (!paused) frame = requestAnimationFrame(update);
}
function startGame() {
  stopFrame(); init();
  running = true; paused = false;
  startBtn.textContent = 'Restart game';
  pauseBtn.disabled = false; pauseBtn.textContent = 'Pause';
  statusText.textContent = 'Eat fruit. Avoid the walls and your tail.';
  c.focus({preventScroll: true}); draw();
  frame = requestAnimationFrame(update);
}
document.addEventListener('keydown', event => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
  if (event.code === 'KeyP' && running && !event.repeat) { event.preventDefault(); setPaused(!paused); return; }
  if (!running || paused || !keyDirections[event.code]) return;
  event.preventDefault(); changeDirection(keyDirections[event.code]);
});
document.querySelectorAll('[data-direction]').forEach(button => {
  button.addEventListener('click', () => { changeDirection(button.dataset.direction); if (running) c.focus({preventScroll: true}); });
});
c.addEventListener('pointerdown', event => {
  if (!running || paused || swipe || event.button !== 0) return;
  event.preventDefault(); c.focus({preventScroll: true});
  swipe = {id: event.pointerId, x: event.clientX, y: event.clientY};
  c.setPointerCapture(event.pointerId);
});
c.addEventListener('pointermove', event => {
  if (!swipe || swipe.id !== event.pointerId || !running || paused) return;
  const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 14) return;
  event.preventDefault();
  changeDirection(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
  swipe.x = event.clientX; swipe.y = event.clientY;
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) c.addEventListener(name, event => { if (swipe && swipe.id === event.pointerId) swipe = null; });
window.addEventListener('blur', () => setPaused(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
startBtn.addEventListener('click', startGame);
pauseBtn.addEventListener('click', () => { setPaused(!paused); if (!paused) c.focus({preventScroll: true}); });
new MutationObserver(draw).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
init(); draw();
