
'use strict';
const c = document.getElementById('game');
const ctx = c.getContext('2d');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const status = document.getElementById('status');
const scoreLabel = document.getElementById('score');
const livesLabel = document.getElementById('lives');
const catButtons = [...document.querySelectorAll('.cat-btn')];
const floorY = 273, radius = 22, gravity = 380;
let cats = [], score = 0, lives = 3, phase = 'ready', frame = null, lastTime = null;
function resetCats() {
  cats = [90, 200, 310].map((x, i) => ({ x, y: 220 - i * 25, vy: -300 - i * 30, flash: 0 }));
}
function colors() {
  const css = getComputedStyle(document.documentElement);
  return { bg: css.getPropertyValue('--bg-color'), ink: css.getPropertyValue('--text-color'),
    accent: css.getPropertyValue('--accent-color'), line: css.getPropertyValue('--line-color') };
}
function drawCat(cat, index, palette) {
  ctx.save();
  ctx.translate(cat.x, cat.y);
  ctx.fillStyle = cat.flash > 0 ? palette.ink : palette.accent;
  // Ears and a round face make each target a cat rather than an anonymous ball.
  ctx.beginPath();
  ctx.moveTo(-21, -8); ctx.lineTo(-20, -29); ctx.lineTo(-5, -19);
  ctx.lineTo(5, -19); ctx.lineTo(20, -29); ctx.lineTo(21, -8);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 0, radius, 21, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = palette.bg;
  ctx.fillRect(-10, -5, 4, 5); ctx.fillRect(6, -5, 4, 5);
  ctx.beginPath(); ctx.moveTo(-3, 3); ctx.lineTo(3, 3); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = palette.bg; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-16, 5); ctx.lineTo(-7, 7); ctx.moveTo(-16, 10); ctx.lineTo(-7, 10);
  ctx.moveTo(16, 5); ctx.lineTo(7, 7); ctx.moveTo(16, 10); ctx.lineTo(7, 10);
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(index + 1, 0, 38);
  ctx.restore();
}
function draw() {
  const palette = colors();
  ctx.fillStyle = palette.bg; ctx.fillRect(0, 0, 400, 300);
  ctx.strokeStyle = palette.line;
  ctx.setLineDash([3, 6]);
  [145, 255].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x, floorY); ctx.stroke(); });
  ctx.setLineDash([]);
  ctx.fillStyle = palette.line; ctx.fillRect(0, floorY, 400, 27);
  cats.forEach((cat, i) => drawCat(cat, i, palette));
  if (phase === 'paused') {
    ctx.fillStyle = palette.bg; ctx.globalAlpha = 0.88; ctx.fillRect(90, 116, 220, 58); ctx.globalAlpha = 1;
    ctx.fillStyle = palette.ink; ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center'; ctx.fillText('PAUSED', 200, 153);
  }
}
function stopFrame() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null; lastTime = null;
}
function setControls(enabled) {
  catButtons.forEach(button => { button.disabled = !enabled; });
}
function finish() {
  phase = 'ended'; stopFrame();
  pauseBtn.disabled = true; setControls(false);
  startBtn.textContent = 'Play again';
  status.textContent = 'Game over! You made ' + score + ' bounces. Play again to beat your score.';
  draw();
}
function update(now) {
  frame = null;
  if (phase !== 'running') return;
  const dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  for (const cat of cats) {
    cat.y += cat.vy * dt + 0.5 * gravity * dt * dt;
    cat.vy += gravity * dt;
    cat.flash = Math.max(0, cat.flash - dt);
    if (cat.y < 31) { cat.y = 31; cat.vy = Math.max(35, -cat.vy * 0.4); }
    if (cat.y + radius >= floorY) {
      cat.y = floorY - radius;
      lives--;
      livesLabel.textContent = lives;
      if (lives <= 0) { finish(); return; }
      cat.vy = -350;
      status.textContent = 'A cat landed! ' + lives + (lives === 1 ? ' life' : ' lives') + ' left.';
    }
  }
  draw();
  frame = requestAnimationFrame(update);
}
function start() {
  stopFrame(); resetCats(); score = 0; lives = 3; phase = 'running';
  scoreLabel.textContent = '0'; livesLabel.textContent = '3';
  startBtn.textContent = 'Restart'; pauseBtn.disabled = false; pauseBtn.textContent = 'Pause';
  setControls(true);
  status.textContent = 'Catch the falling cats. Tap one to bounce it!';
  c.focus({ preventScroll: true });
  draw(); frame = requestAnimationFrame(update);
}
function bounce(index) {
  if (phase !== 'running') return;
  const cat = cats[index];
  // One point per catch: tapping a cat already rising cannot farm points.
  if (cat.vy < 0) return;
  cat.vy = -350; cat.flash = 0.13;
  score++;
  scoreLabel.textContent = score;
  draw();
}
function pause() {
  if (phase !== 'running') return;
  phase = 'paused'; stopFrame(); setControls(false);
  pauseBtn.textContent = 'Resume'; status.textContent = 'Paused. Resume when you are ready.';
  draw();
}
function togglePause() {
  if (phase === 'running') pause();
  else if (phase === 'paused') {
    phase = 'running'; lastTime = null; setControls(true);
    pauseBtn.textContent = 'Pause'; status.textContent = 'Catch the cats as they fall!';
    c.focus({ preventScroll: true });
    frame = requestAnimationFrame(update);
  }
}
startBtn.addEventListener('click', start);
pauseBtn.addEventListener('click', togglePause);
catButtons.forEach(button => button.addEventListener('click', () => { bounce(Number(button.dataset.cat)); c.focus({ preventScroll: true }); }));
c.addEventListener('pointerdown', e => {
  if (e.button !== 0 || phase !== 'running') return;
  e.preventDefault(); c.focus({ preventScroll: true });
  const rect = c.getBoundingClientRect();
  const css = getComputedStyle(c);
  const left = parseFloat(css.borderLeftWidth), top = parseFloat(css.borderTopWidth);
  const width = rect.width - left - parseFloat(css.borderRightWidth);
  const height = rect.height - top - parseFloat(css.borderBottomWidth);
  const x = (e.clientX - rect.left - left) * c.width / width;
  const y = (e.clientY - rect.top - top) * c.height / height;
  const hit = cats.findIndex(cat => Math.hypot(x - cat.x, y - cat.y) <= 32);
  if (hit !== -1) bounce(hit);
});
c.addEventListener('keydown', e => {
  if (['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].includes(e.code)) {
    e.preventDefault(); if (!e.repeat) bounce(Number(e.code.slice(-1)) - 1);
  }
  if (e.code === 'KeyP') { e.preventDefault(); if (!e.repeat) togglePause(); }
});
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
resetCats(); draw();
