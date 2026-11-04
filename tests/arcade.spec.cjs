'use strict';
// Real-browser regression checks. Only edge cases seed state; controls and time use the browser.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = (process.env.ARCADE_BASE_URL || 'http://127.0.0.1:8791').replace(/\/$/, '');
const launch = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) launch.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
let browser;
const results = [];

async function open(game, width = 1280, touch = false) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: touch, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  page.on('requestfailed', request => { if (request.url().startsWith(base)) errors.push(`Failed ${request.url()}: ${request.failure()?.errorText}`); });
  // External fonts/analytics are irrelevant to game function and may be unavailable offline.
  await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|plausible\.io)\//, route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.clock.install({ time: new Date('2026-11-04T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-04T12:00:01Z'));
  await page.goto(`${base}/games/${game ? `${game}.html` : ''}`, { waitUntil: 'domcontentloaded' });
  return { page, errors, async close() { assert.deepEqual(errors, [], `${game || 'gallery'} browser errors`); await context.close(); } };
}
async function test(name, run) {
  try { await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false }); console.error(`FAIL ${name}\n${error.stack}`); }
}
async function start(page) { await page.locator('#start-btn').click(); }
async function atCanvasPoint(page, x, y) {
  await page.locator('#game').scrollIntoViewIfNeeded();
  return page.locator('#game').evaluate((canvas, point) => {
    const box = canvas.getBoundingClientRect();
    const css = getComputedStyle(canvas);
    const left = parseFloat(css.borderLeftWidth), right = parseFloat(css.borderRightWidth);
    const top = parseFloat(css.borderTopWidth), bottom = parseFloat(css.borderBottomWidth);
    return { x: box.left + left + point.x / canvas.width * (box.width - left - right), y: box.top + top + point.y / canvas.height * (box.height - top - bottom) };
  }, { x, y });
}
async function tapCanvas(page, x, y) { const point = await atCanvasPoint(page, x, y); await page.touchscreen.tap(point.x, point.y); }
async function fit(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page should not scroll horizontally');
  const box = await page.locator('#game').boundingBox();
  assert(box.x >= 0 && box.x + box.width <= page.viewportSize().width + 1, 'canvas must fit viewport');
}

(async () => {
  browser = await chromium.launch(launch);
  await test('Pong: keyboard controls, pause/resume, collision, win and restart', async () => {
    const check = await open('pong'); const { page } = check;
    await page.keyboard.press('ArrowUp'); // Safe before Start.
    await start(page);
    assert.equal(await page.evaluate(() => mode), 'solo');
    const initial = await page.evaluate(() => p1);
    await page.keyboard.down('w'); await page.clock.runFor(200); await page.keyboard.up('w');
    assert(await page.evaluate(() => p1) < initial, 'W moves the player up');
    await page.clock.runFor(1000);
    assert.notEqual(await page.evaluate(() => ball.x), 320, 'ball moves after serve');
    await page.locator('#pause-btn').click();
    const pausedBall = await page.evaluate(() => ({ ...ball }));
    await page.clock.runFor(1000);
    assert.deepEqual(await page.evaluate(() => ({ ...ball })), pausedBall);
    await page.locator('#pause-btn').click();
    assert.equal(await page.evaluate(() => paused), false);
    await page.evaluate(() => { p1 = 160; serveDelay = 0; ball = { x: 45, y: 196, vx: -500, vy: 0 }; advance(.03); });
    assert(await page.evaluate(() => ball.vx) > 0, 'crossing paddle plane returns ball');
    await page.evaluate(() => { score = [9, 0]; serveDelay = 0; ball = { x: 648, y: 30, vx: 260, vy: 0 }; advance(.01); });
    assert.equal(await page.evaluate(() => running), false);
    assert.match(await page.locator('#status').innerText(), /win/i);
    assert.deepEqual(await page.evaluate(() => score), [10, 0]);
    await start(page);
    assert.deepEqual(await page.evaluate(() => score), [0, 0]);
    assert.equal(await page.evaluate(() => running && !paused), true);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await page.evaluate(() => paused), true);
    await check.close();
  });
  await test('Pong: two players have independent keyboard controls', async () => {
    const check = await open('pong'); const { page } = check;
    await page.locator('#mode').selectOption('two'); await start(page);
    await page.keyboard.down('w'); await page.keyboard.down('ArrowDown'); await page.clock.runFor(150);
    await page.keyboard.up('w'); await page.keyboard.up('ArrowDown');
    assert(await page.evaluate(() => p1 < 164 && p2 > 164));
    await page.locator('#mode').selectOption('solo');
    assert.equal(await page.evaluate(() => running), false, 'changing mode returns to the ready state');
    await start(page);
    assert.equal(await page.evaluate(() => mode), 'solo');
    await check.close();
  });
  await test('Tower: drop, snapped landings, pause, loss, restart and 10-block win', async () => {
    const check = await open('tower'); const { page } = check;
    await start(page); await page.keyboard.press('Space'); await page.clock.runFor(1100);
    assert.equal(await page.evaluate(() => blocks.length), 1);
    assert.equal(await page.evaluate(() => blocks[0].y), 352);
    await page.locator('#pause-btn').click();
    const state = await page.evaluate(() => ({ armX, elapsed })); await page.clock.runFor(1000);
    assert.deepEqual(await page.evaluate(() => ({ armX, elapsed })), state);
    await page.locator('#pause-btn').click();
    // Place a falling block immediately above the top: collision must snap, never overlap.
    await page.evaluate(() => { current = { x: blocks[0].x + 10, y: 327 }; vy = 200; });
    await page.clock.runFor(40);
    assert.equal(await page.evaluate(() => blocks.length), 2);
    assert.equal(await page.evaluate(() => blocks[1].y), 328);
    await page.evaluate(() => { current = { x: 330, y: 351 }; vy = 300; }); await page.clock.runFor(40);
    assert.equal(await page.evaluate(() => phase), 'lost');
    assert.match(await page.locator('#status').innerText(), /missed/);
    await start(page);
    assert.deepEqual(await page.evaluate(() => ({ blocks: blocks.length, elapsed, current })), { blocks: 0, elapsed: 0, current: null });
    await page.evaluate(() => { blocks = Array.from({ length: 9 }, (_, i) => ({ x: 170, y: floorY - blockHeight * (i + 1) })); current = { x: 175, y: blocks[8].y - blockHeight - 1 }; vy = 200; });
    await page.clock.runFor(50);
    assert.equal(await page.evaluate(() => phase), 'won');
    assert.equal(await page.evaluate(() => blocks.length), 10);
    assert.match(await page.locator('#status').innerText(), /Tower complete/);
    await start(page); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await page.evaluate(() => phase), 'paused');
    await check.close();
  });
  await test('Juggle Cats: bounce, pause, life loss, game over and restart', async () => {
    const check = await open('juggle'); const { page } = check;
    await start(page);
    await page.evaluate(() => { cats[0].y = 160; cats[0].vy = 100; }); await page.keyboard.press('1');
    assert.equal(await page.evaluate(() => score), 1);
    assert(await page.evaluate(() => cats[0].vy < 0));
    await page.keyboard.press('1');
    assert.equal(await page.evaluate(() => score), 1, 'repeated inputs on a rising cat do not farm points');
    await page.locator('#pause-btn').click();
    const state = await page.evaluate(() => JSON.stringify(cats)); await page.clock.runFor(1500);
    assert.equal(await page.evaluate(() => JSON.stringify(cats)), state);
    await page.locator('#pause-btn').click();
    await page.evaluate(() => { cats[0].y = floorY - radius - 1; cats[0].vy = 200; }); await page.clock.runFor(50);
    assert.equal(await page.evaluate(() => lives), 2);
    await page.evaluate(() => { lives = 1; cats[1].y = floorY - radius - 1; cats[1].vy = 200; }); await page.clock.runFor(40);
    assert.equal(await page.evaluate(() => phase), 'ended');
    assert.equal(await page.evaluate(() => lives), 0);
    assert.match(await page.locator('#status').innerText(), /Game over/);
    await start(page);
    assert.deepEqual(await page.evaluate(() => ({ score, lives, phase })), { score: 0, lives: 3, phase: 'running' });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await page.evaluate(() => phase), 'paused');
    await check.close();
  });
  // Snake cases follow the same public controls; fixtures cover the original food/tail bugs.
  await test('Snake: keyboard movement, pause, food, collision and restart', async () => {
    const check = await open('snake'); const { page } = check;
    await page.keyboard.press('ArrowUp'); await start(page);
    await page.keyboard.press('ArrowUp'); await page.clock.runFor(220);
    assert(await page.evaluate(() => snake[0][1] < 10), 'arrow key changes direction');
    await page.locator('#pause-btn').click();
    const state = await page.evaluate(() => JSON.stringify(snake)); await page.clock.runFor(1000);
    assert.equal(await page.evaluate(() => JSON.stringify(snake)), state);
    await page.locator('#pause-btn').click();
    await page.evaluate(() => { snake = [[10,10],[9,10],[8,10]]; dir = [1,0]; nextDir = [1,0]; food = [11,10]; step(); });
    assert.equal(await page.evaluate(() => snake.length), 4);
    assert(await page.evaluate(() => !snake.some(part => part[0] === food[0] && part[1] === food[1])), 'food never spawns inside snake');
    await page.evaluate(() => { snake = [[19,10],[18,10]]; dir = [1,0]; nextDir = [1,0]; step(); });
    assert.equal(await page.evaluate(() => running), false);
    await start(page);
    assert.equal(await page.evaluate(() => running), true);
    assert.equal(await page.evaluate(() => snake.length), 3);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await page.evaluate(() => paused), true);
    await check.close();
  });
  await test('Snake: legal vacated-tail move, no reversal, last food wins', async () => {
    const check = await open('snake'); const { page } = check;
    await start(page);
    await page.evaluate(() => { snake = [[1,1],[1,2],[2,2],[2,1]]; dir = [1,0]; nextDir = [1,0]; food = [10,10]; step(); });
    assert.equal(await page.evaluate(() => running), true, 'moving into vacated tail remains legal');
    await page.evaluate(() => { snake = [[10,10],[9,10],[8,10]]; dir = [1,0]; nextDir = [1,0]; });
    await page.keyboard.press('ArrowLeft');
    assert.deepEqual(await page.evaluate(() => nextDir), [1,0]);
    await page.evaluate(() => { snake = []; for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) if (x !== 1 || y !== 0) snake.push([x,y]); dir = [1,0]; nextDir = [1,0]; food = [1,0]; step(); });
    assert.equal(await page.evaluate(() => running), false);
    assert.equal(await page.evaluate(() => snake.length), 400);
    assert.match(await page.locator('#status').innerText(), /win|filled|complete/i);
    await check.close();
  });
  for (const width of [320, 390]) {
    await test(`Mobile ${width}px: games fit and scaled touch controls work`, async () => {
      let check = await open('pong', width, true); let page = check.page;
      await fit(page); await start(page); await tapCanvas(page, 90, 80);
      assert(Math.abs(await page.evaluate(() => p1) - 44) < 2, 'Pong maps touch into native coordinates');
      await check.close();
      check = await open('juggle', width, true); page = check.page;
      await fit(page); await start(page);
      await page.evaluate(() => { cats[1].y = 155; cats[1].vy = 100; });
      await tapCanvas(page, 200, 155);
      assert.equal(await page.evaluate(() => score), 1, 'scaled touch hits the middle cat');
      await check.close();
      check = await open('tower', width, true); page = check.page;
      await fit(page); await start(page); await tapCanvas(page, 180, 150); await page.clock.runFor(1100);
      assert.equal(await page.evaluate(() => blocks.length), 1, 'touch drops a block');
      await check.close();
      check = await open('snake', width, true); page = check.page;
      await fit(page); await start(page);
      await page.getByRole('button', { name: /up/i }).click(); await page.clock.runFor(220);
      assert(await page.evaluate(() => snake[0][1] < 10), 'touch direction button moves snake');
      await check.close();
    });
  }
  await test('Gallery: four unique real screenshot assets, usable links, responsive cards', async () => {
    const check = await open(''); const { page } = check;
    const cards = page.locator('.arcade-card'); assert.equal(await cards.count(), 4);
    const sources = await cards.locator('img').evaluateAll(images => images.map(image => image.getAttribute('src')));
    assert.equal(new Set(sources).size, 4);
    for (const image of await cards.locator('img').all()) { await image.scrollIntoViewIfNeeded(); await image.evaluate(image => image.decode()); assert(await image.evaluate(image => image.naturalWidth >= 300)); }
    assert.deepEqual((await cards.evaluateAll(cards => cards.map(card => card.getAttribute('href')))).sort(), ['juggle.html','pong.html','snake.html','tower.html']);
    await page.setViewportSize({ width: 320, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await check.close();
  });
  await browser.close();
  const failed = results.filter(result => !result.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) process.exitCode = 1;
})().catch(async error => { console.error(error); if (browser) await browser.close(); process.exitCode = 1; });
