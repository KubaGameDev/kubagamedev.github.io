
'use strict';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const modeSelect = document.getElementById('mode');
const statusText = document.getElementById('status');
const scoreText = document.getElementById('score');
const width = canvas.width, height = canvas.height, paddleHeight = 72, radius = 7;
const keys = new Set(), pointers = new Map();
let p1 = 164, p2 = 164, ball = {x: 320, y: 200, vx: 260, vy: 100};
let score = [0, 0], running = false, paused = false, mode = 'solo';
let frame = null, previous = null, serveDelay = 0, result = '';
const clampPaddle = value => Math.max(0, Math.min(height - paddleHeight, value));

function updateScore() {
  scoreText.textContent = (mode === 'solo' ? 'You ' : 'Left ') + score[0] + ' : ' + score[1] + (mode === 'solo' ? ' Computer' : ' Right');
}
function resetBall(direction) {
  ball = {x: width / 2, y: height / 2, vx: 260 * direction, vy: (Math.random() < .5 ? -1 : 1) * 100};
  serveDelay = .7;
}
function draw() {
  const theme = getComputedStyle(document.documentElement);
  const background = theme.getPropertyValue('--bg-color');
  const foreground = theme.getPropertyValue('--text-color');
  const accent = theme.getPropertyValue('--accent-color');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = theme.getPropertyValue('--line-color');
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 10]);
  ctx.beginPath(); ctx.moveTo(width / 2, 20); ctx.lineTo(width / 2, height - 20); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = foreground;
  ctx.textAlign = 'center';
  ctx.font = 'bold 68px monospace';
  ctx.globalAlpha = .24;
  ctx.fillText(score[0], width / 2 - 78, 98);
  ctx.fillText(score[1], width / 2 + 78, 98);
  ctx.globalAlpha = 1;
  ctx.font = '12px monospace';
  ctx.fillText(mode === 'solo' ? 'YOU' : 'LEFT', width / 2 - 78, 120);
  ctx.fillText(mode === 'solo' ? 'COMPUTER' : 'RIGHT', width / 2 + 78, 120);
  ctx.fillStyle = accent;
  ctx.fillRect(18, p1, 12, paddleHeight);
  ctx.fillStyle = foreground;
  ctx.fillRect(width - 30, p2, 12, paddleHeight);
  ctx.beginPath(); ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2); ctx.fill();
  if (paused || !running) {
    ctx.fillStyle = theme.getPropertyValue('--surface-color');
    ctx.fillRect(90, 166, width - 180, 68);
    ctx.fillStyle = foreground;
    ctx.font = 'bold 20px monospace';
    ctx.fillText(paused ? 'PAUSED' : result || 'FIRST TO 10', width / 2, 207);
  }
}
function stopFrame() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  previous = null;
}
function finish(winner) {
  running = false;
  stopFrame();
  keys.clear(); pointers.clear();
  result = winner === 0 ? (mode === 'solo' ? 'YOU WIN!' : 'LEFT WINS!') : (mode === 'solo' ? 'COMPUTER WINS' : 'RIGHT WINS!');
  statusText.textContent = result + ' Final score: ' + score[0] + '–' + score[1] + '. Play again?';
  startBtn.textContent = 'Play again';
  pauseBtn.disabled = true;
  draw();
}
function bounceFromPaddle(side, hitY) {
  const paddleY = side === 0 ? p1 : p2;
  const offset = Math.max(-1, Math.min(1, (hitY - paddleY - paddleHeight / 2) / (paddleHeight / 2)));
  const speed = Math.min(520, Math.hypot(ball.vx, ball.vy) * 1.045);
  const angle = offset * Math.PI / 3;
  ball.vx = (side === 0 ? 1 : -1) * speed * Math.cos(angle);
  ball.vy = speed * Math.sin(angle);
  ball.x = side === 0 ? 30 + radius : width - 30 - radius;
}
function advance(dt) {
  const leftUp = keys.has('KeyW') || (mode === 'solo' && keys.has('ArrowUp'));
  const leftDown = keys.has('KeyS') || (mode === 'solo' && keys.has('ArrowDown'));
  p1 = clampPaddle(p1 + (Number(leftDown) - Number(leftUp)) * 340 * dt);
  if (mode === 'two') {
    p2 = clampPaddle(p2 + (Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'))) * 340 * dt);
  } else {
    // Limited speed and a small dead zone give the human player a fair opponent.
    const target = ball.vx > 0 ? ball.y - paddleHeight / 2 : height / 2 - paddleHeight / 2;
    const difference = target - p2;
    if (Math.abs(difference) > 9) p2 = clampPaddle(p2 + Math.sign(difference) * Math.min(Math.abs(difference), 210 * dt));
  }
  if (serveDelay > 0) { serveDelay = Math.max(0, serveDelay - dt); return; }
  const oldX = ball.x, oldY = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  if (ball.y < radius) { ball.y = radius * 2 - ball.y; ball.vy = Math.abs(ball.vy); }
  if (ball.y > height - radius) { ball.y = 2 * (height - radius) - ball.y; ball.vy = -Math.abs(ball.vy); }
  const leftPlane = 30 + radius, rightPlane = width - 30 - radius;
  if (ball.vx < 0 && oldX >= leftPlane && ball.x <= leftPlane) {
    const hitY = oldY + (ball.y - oldY) * (leftPlane - oldX) / (ball.x - oldX);
    if (hitY + radius >= p1 && hitY - radius <= p1 + paddleHeight) bounceFromPaddle(0, hitY);
  } else if (ball.vx > 0 && oldX <= rightPlane && ball.x >= rightPlane) {
    const hitY = oldY + (ball.y - oldY) * (rightPlane - oldX) / (ball.x - oldX);
    if (hitY + radius >= p2 && hitY - radius <= p2 + paddleHeight) bounceFromPaddle(1, hitY);
  }
  if (ball.x < -radius || ball.x > width + radius) {
    const winner = ball.x < 0 ? 1 : 0;
    score[winner]++;
    updateScore();
    if (score[winner] >= 10) { finish(winner); return; }
    resetBall(winner === 0 ? 1 : -1);
  }
}
function update(now) {
  frame = null;
  if (!running || paused) return;
  const dt = previous === null ? 0 : Math.min((now - previous) / 1000, .033);
  previous = now;
  advance(dt);
  draw();
  if (running && !paused) frame = requestAnimationFrame(update);
}
function setPaused(value) {
  if (!running || paused === value) return;
  paused = value;
  keys.clear(); pointers.clear();
  stopFrame();
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  statusText.textContent = paused ? 'Paused. Select Resume when you are ready.' : 'First to 10 points wins.';
  draw();
  if (!paused) frame = requestAnimationFrame(update);
}
function startGame() {
  stopFrame();
  mode = modeSelect.value;
  score = [0, 0]; p1 = p2 = (height - paddleHeight) / 2;
  keys.clear(); pointers.clear();
  running = true; paused = false; result = '';
  resetBall(Math.random() < .5 ? -1 : 1);
  updateScore();
  startBtn.textContent = 'Restart game';
  pauseBtn.disabled = false; pauseBtn.textContent = 'Pause';
  statusText.textContent = 'First to 10 points wins.';
  canvas.focus({preventScroll: true});
  draw();
  frame = requestAnimationFrame(update);
}
document.addEventListener('keydown', event => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) return;
  if (event.code === 'KeyP' && running && !event.repeat) { event.preventDefault(); setPaused(!paused); return; }
  if (!running || paused || !['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'].includes(event.code)) return;
  event.preventDefault(); keys.add(event.code);
});
document.addEventListener('keyup', event => keys.delete(event.code));
function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {x: (event.clientX - rect.left - canvas.clientLeft) * width / (rect.width - 2 * canvas.clientLeft),
          y: (event.clientY - rect.top - canvas.clientTop) * height / (rect.height - 2 * canvas.clientTop)};
}
function movePointer(event) {
  if (!running || paused || !pointers.has(event.pointerId)) return;
  event.preventDefault();
  const y = clampPaddle(pointerPosition(event).y - paddleHeight / 2);
  if (pointers.get(event.pointerId) === 0) p1 = y; else p2 = y;
}
canvas.addEventListener('pointerdown', event => {
  if (!running || paused || event.button !== 0) return;
  event.preventDefault();
  canvas.focus({preventScroll: true});
  pointers.set(event.pointerId, mode === 'solo' || pointerPosition(event).x < width / 2 ? 0 : 1);
  canvas.setPointerCapture(event.pointerId);
  movePointer(event);
});
canvas.addEventListener('pointermove', movePointer);
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(name, event => pointers.delete(event.pointerId));
window.addEventListener('blur', () => { keys.clear(); setPaused(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
startBtn.addEventListener('click', startGame);
pauseBtn.addEventListener('click', () => { setPaused(!paused); if (!paused) canvas.focus({preventScroll: true}); });
modeSelect.addEventListener('change', () => {
  stopFrame();
  mode = modeSelect.value; running = false; paused = false;
  score = [0, 0]; result = ''; p1 = p2 = (height - paddleHeight) / 2;
  keys.clear(); pointers.clear(); resetBall(1);
  startBtn.textContent = 'Start game';
  pauseBtn.disabled = true; pauseBtn.textContent = 'Pause';
  statusText.textContent = (mode === 'solo' ? 'Solo mode' : 'Two-player mode') + ' selected. Start a new game.';
  updateScore(); draw();
});
new MutationObserver(draw).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
draw();
