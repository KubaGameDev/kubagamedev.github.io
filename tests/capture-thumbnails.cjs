// Capture the running games through real controls; no staged game-state writes.
// Run from the repo root with Playwright available (see tests/README.md).
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const base = process.env.ARCADE_BASE_URL || 'http://127.0.0.1:8791';
const out = path.resolve('images/games');

async function main() {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  try {
    for (const name of ['pong', 'snake', 'tower', 'juggle']) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
      await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
      await page.addInitScript(() => {
        let seed = 42;
        Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      });
      await page.goto(`${base}/games/${name}.html`);
      await page.locator('#start-btn').click();
      await page.clock.runFor(16);
      const canvas = page.locator('#game');
      await canvas.scrollIntoViewIfNeeded();
      const rect = await canvas.boundingBox();
      const point = (x, y, w, h) => ({ x: rect.x + 2 + x / w * (rect.width - 4), y: rect.y + 2 + y / h * (rect.height - 4) });

      if (name === 'pong') {
        // Rally for a few seconds, moving the real paddle with the mouse.
        const start = point(40, 200, 640, 400);
        await page.mouse.move(start.x, start.y); await page.mouse.down();
        for (let i = 0; i < 80; i++) {
          const ballY = await page.evaluate(() => ball.y);
          const target = point(40, ballY + 18, 640, 400);
          await page.mouse.move(target.x, target.y);
          await page.clock.runFor(50);
        }
        await page.mouse.up();
      } else if (name === 'tower') {
        // Build seven real blocks, then capture the eighth falling into place.
        for (let block = 0; block < 8; block++) {
          const targetX = 165 + [0, 5, -4, 2, 8, 3, -2, 4][block];
          for (let tries = 0; ; tries++) {
            const arm = await page.evaluate(() => armX);
            if (Math.abs(arm - targetX) < 2) break;
            if (tries > 500) throw new Error('Could not align the tower crane');
            await page.clock.runFor(16);
          }
          await page.keyboard.press('Space');
          if (block === 7) { await page.clock.runFor(350); break; }
          await page.clock.runFor(1100);
          if (await page.evaluate(() => phase !== 'running')) throw new Error('Tower capture lost');
        }
      } else if (name === 'juggle') {
        // Click the actual falling cat locations; staggered bounces show gameplay.
        for (let i = 0; i < 75; i++) {
          const falling = await page.evaluate(() => cats.map((cat, index) => ({ ...cat, index })).filter(cat => cat.vy >= 0 && cat.y > 145));
          for (const cat of falling) {
            const target = point(cat.x, cat.y, 400, 300);
            await page.mouse.click(target.x, target.y);
          }
          await page.clock.runFor(80);
        }
        if (await page.evaluate(() => phase !== 'running' || score < 3)) throw new Error('Juggle capture did not play');
      } else {
        // Find a path to each food, then send one real arrow-key turn per move.
        const moves = [[1, 0, 'ArrowRight'], [0, 1, 'ArrowDown'], [-1, 0, 'ArrowLeft'], [0, -1, 'ArrowUp']];
        for (let turn = 0; turn < 900; turn++) {
          const state = await page.evaluate(() => ({ snake, food, dir, running }));
          if (!state.running) throw new Error('Snake capture lost');
          if (state.snake.length >= 18) break;
          const occupied = new Set(state.snake.slice(0, -1).map(p => p.join(',')));
          const queue = [[...state.snake[0], []]], visited = new Set();
          let route;
          for (let q = 0; q < queue.length; q++) {
            const [x, y, steps] = queue[q];
            if (x === state.food[0] && y === state.food[1]) { route = steps; break; }
            for (const [dx, dy, key] of moves) {
              if (steps.length === 0 && dx === -state.dir[0] && dy === -state.dir[1]) continue;
              const nx = x + dx, ny = y + dy, id = `${nx},${ny}`;
              if (nx < 0 || ny < 0 || nx >= 20 || ny >= 20 || occupied.has(id) || visited.has(id)) continue;
              visited.add(id); queue.push([nx, ny, [...steps, key]]);
            }
          }
          if (!route?.length) throw new Error('No safe route for Snake capture');
          await page.keyboard.press(route[0]);
          const oldHead = state.snake[0].join(',');
          for (let frame = 0; frame < 12; frame++) {
            await page.clock.runFor(16);
            if (await page.evaluate(old => snake[0].join(',') !== old, oldHead)) break;
          }
        }
        if (await page.evaluate(() => snake.length < 18)) throw new Error('Snake capture did not grow');
      }
      if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
      await canvas.screenshot({ path: path.join(out, `${name}.png`) });
      console.log(`Captured ${name}: ${await page.locator('#score').textContent()}`);
      await page.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
