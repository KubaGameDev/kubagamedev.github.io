
'use strict';
const c = document.getElementById('game');
const ctx = c.getContext('2d');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const dropBtn = document.getElementById('drop-btn');
const status = document.getElementById('status');
const scoreLabel = document.getElementById('score');
const timeLabel = document.getElementById('time');
const blockWidth = 56, blockHeight = 24, floorY = 376;
let armX = 36, dir = 1, blocks = [], current = null, vy = 0;
let phase = 'ready', elapsed = 0, lastTime = null, frame = null;

function colors() {
  const css = getComputedStyle(document.documentElement);
  return { bg: css.getPropertyValue('--bg-color'), ink: css.getPropertyValue('--text-color'),
    accent: css.getPropertyValue('--accent-color'), line: css.getPropertyValue('--line-color') };
}
function drawBlock(block, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(block.x, block.y, blockWidth, blockHeight);
  ctx.strokeStyle = colors().bg;
  ctx.lineWidth = 2;
  ctx.strokeRect(block.x + 1, block.y + 1, blockWidth - 2, blockHeight - 2);
}
function draw() {
  const palette = colors();
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, 400, 400);
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 18); ctx.lineTo(400, 18);
  ctx.stroke();
  ctx.fillStyle = palette.line;
  ctx.fillRect(0, floorY, 400, 24);
  blocks.forEach((block, i) => drawBlock(block, i % 2 ? palette.ink : palette.accent));
  if (current) drawBlock(current, palette.accent);
  // The hanger stays visible while a block falls; a new block arrives after landing.
  ctx.fillStyle = palette.ink;
  ctx.fillRect(armX + blockWidth / 2 - 2, 18, 4, 12);
  if (!current && phase !== 'won' && phase !== 'lost') drawBlock({ x: armX, y: 30 }, palette.accent);
  if (phase === 'paused') {
    ctx.fillStyle = palette.bg;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(90, 170, 220, 58);
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.ink;
    ctx.font = 'bold 22px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', 200, 207);
  }
}
function stopFrame() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  lastTime = null;
}
function finish(won) {
  phase = won ? 'won' : 'lost';
  stopFrame();
  pauseBtn.disabled = true;
  dropBtn.disabled = true;
  status.textContent = won ? 'Tower complete! 10 blocks in ' + Math.floor(elapsed) + 's. Play again?' : 'That block missed the tower. You stacked ' + blocks.length + ' blocks. Try again!';
  startBtn.textContent = 'Play again';
  draw();
}
function update(now) {
  frame = null;
  if (phase !== 'running') return;
  const dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  elapsed += dt;
  timeLabel.textContent = Math.floor(elapsed);
  armX += dir * 120 * dt;
  if (armX > 400 - blockWidth) { armX = 2 * (400 - blockWidth) - armX; dir = -1; }
  if (armX < 0) { armX = -armX; dir = 1; }
  if (current) {
    const previousBottom = current.y + blockHeight;
    current.y += vy * dt + 0.5 * 720 * dt * dt;
    vy += 720 * dt;
    const support = blocks[blocks.length - 1];
    const landingY = support ? support.y : floorY;
    const overlap = support ? Math.min(current.x + blockWidth, support.x + blockWidth) - Math.max(current.x, support.x) : blockWidth;
    // Test the crossed surface and snap to it, so falling blocks never overlap a stack.
    if (previousBottom <= landingY && current.y + blockHeight >= landingY && overlap > 0) {
      current.y = landingY - blockHeight;
      blocks.push({ x: current.x, y: current.y });
      current = null;
      vy = 0;
      scoreLabel.textContent = blocks.length;
      dropBtn.disabled = false;
      if (blocks.length === 10) { finish(true); return; }
      status.textContent = blocks.length + ' of 10 stacked. Line up the next block.';
    } else if (current.y + blockHeight >= floorY) {
      current.y = floorY - blockHeight;
      finish(false);
      return;
    }
  }
  draw();
  frame = requestAnimationFrame(update);
}
function start() {
  stopFrame();
  armX = 36; dir = 1; blocks = []; current = null; vy = 0; elapsed = 0;
  phase = 'running';
  scoreLabel.textContent = '0'; timeLabel.textContent = '0';
  startBtn.textContent = 'Restart';
  pauseBtn.disabled = false; pauseBtn.textContent = 'Pause';
  dropBtn.disabled = false;
  status.textContent = 'Drop your first block to build a foundation.';
  c.focus({ preventScroll: true });
  draw();
  frame = requestAnimationFrame(update);
}
function drop() {
  if (phase !== 'running' || current) return;
  current = { x: armX, y: 30 };
  vy = 0;
  dropBtn.disabled = true;
  draw();
}
function pause() {
  if (phase !== 'running') return;
  phase = 'paused'; stopFrame();
  pauseBtn.textContent = 'Resume'; dropBtn.disabled = true;
  status.textContent = 'Paused. Resume when you are ready.';
  draw();
}
function togglePause() {
  if (phase === 'running') pause();
  else if (phase === 'paused') {
    phase = 'running'; lastTime = null;
    pauseBtn.textContent = 'Pause'; dropBtn.disabled = !!current;
    status.textContent = 'Keep stacking. ' + blocks.length + ' of 10 blocks placed.';
    c.focus({ preventScroll: true });
    frame = requestAnimationFrame(update);
  }
}
startBtn.addEventListener('click', start);
pauseBtn.addEventListener('click', togglePause);
dropBtn.addEventListener('click', () => { drop(); c.focus({ preventScroll: true }); });
c.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); c.focus({ preventScroll: true }); drop(); });
c.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) drop(); }
  if (e.code === 'KeyP') { e.preventDefault(); if (!e.repeat) togglePause(); }
});
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
draw();
