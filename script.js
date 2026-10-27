"use strict";
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll('.theme-toggle').forEach(button => {
    const light = theme === 'light';
    button.textContent = light ? 'Dark mode' : 'Light mode';
    button.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    button.setAttribute('aria-pressed', String(light));
  });
}
function toggleTheme() {
  const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(theme);
  try { localStorage.setItem('theme', theme); } catch { /* The theme still works without storage. */ }
}
function loadTheme() {
  let saved;
  try { saved = localStorage.getItem('theme'); } catch { /* Use the default dark theme. */ }
  applyTheme(saved === 'light' ? 'light' : 'dark');
}
function particles() {
  const canvas = document.getElementById('particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let width, height, dots = [], frame = null, previous = 0;
  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  function update(now) {
    frame = null;
    if (motion.matches || document.hidden) return;
    const step = previous ? Math.min((now - previous) / 16.67, 3) : 1;
    previous = now;
    ctx.clearRect(0, 0, width, height);
    if (dots.length < 45) dots.push({ x: Math.random() * width, y: -10, s: 2 + Math.random() * 3, v: .5 + Math.random(), life: 200 });
    // Read the theme once per frame rather than once per particle.
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-color');
    dots.forEach(dot => {
      dot.y += dot.v * step;
      dot.life -= step;
      ctx.globalAlpha = Math.max(dot.life / 1200, 0);
      ctx.fillRect(dot.x, dot.y, dot.s, dot.s);
    });
    dots = dots.filter(dot => dot.life > 0 && dot.y < height);
    frame = requestAnimationFrame(update);
  }
  function sync() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    previous = 0;
    if (!motion.matches && !document.hidden) frame = requestAnimationFrame(update);
    else ctx.clearRect(0, 0, width, height);
  }
  window.addEventListener('resize', resize);
  motion.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  resize();
  sync();
}
function startAnalytics() {
  // Private statistics API credentials must never be placed in browser JavaScript.
  // Keep the existing public tracker on the real site only, so previews do not count.
  if (!['jumpkat.com', 'www.jumpkat.com'].includes(location.hostname)) return;
  window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
  const tracker = document.createElement('script');
  tracker.defer = true;
  tracker.dataset.domain = 'jumpkat.com';
  tracker.src = 'https://plausible.io/js/plausible.js';
  document.head.append(tracker);
  document.querySelectorAll('[data-event]').forEach(element => {
    element.addEventListener('click', () => window.plausible(element.dataset.event));
  });
}
function albumReveal() {
  const album = document.getElementById('album');
  const marker = document.querySelector('footer > p');
  if (!album || !marker) return;
  if (!('IntersectionObserver' in window)) { album.style.display = 'block'; return; }
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      album.style.display = 'block';
      observer.disconnect();
    }
  });
  observer.observe(marker);
}
document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  particles();
  startAnalytics();
  albumReveal();
});
