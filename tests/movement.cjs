const {fixture}=require('./fixture.cjs');
// Deterministic regression for the existing movement loop and storage fallback.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
(async () => {
  const f=await fixture(), browser=await f.browser();
  try {
    const page = await f.page(browser,{}, { viewport: { width: 1280, height: 800 } });
    await page.addInitScript(() => {
      window.clock = 0;
      window.requestAnimationFrame = cb => { window.frame = cb; return 1; };
      window.advance = (n, fps) => { for (let i = 0; i < n; i++) { clock += 1000 / fps; frame(clock); } };
    });
    await page.goto(f.base+'/index.html');
    await page.waitForFunction(() => typeof ready !== 'undefined' && ready, null, { polling: 20 });
    for (const fps of [30, 60, 120]) {
      await page.evaluate(() => { Patrol.runtime.spawnAt(650, 1100); advance(1, 60); });
      const before = await page.evaluate(() => Patrol.runtime.point);
      await page.keyboard.down('KeyD'); await page.keyboard.down('KeyW');
      await page.evaluate(fps => advance(fps / 2, fps), fps);
      const after = await page.evaluate(() => Patrol.runtime.point);
      assert.ok(Math.abs(Math.hypot(after.x - before.x, after.y - before.y) - 105) < .001);
      await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW');
      assert.equal(await page.evaluate(() => moving), false);
    }
    await page.evaluate(() => { Patrol.runtime.spawn(0, .5); advance(1, 60); });
    assert.equal(await page.evaluate(() => visualScale), .75);
    await page.keyboard.down('KeyA'); await page.keyboard.up('KeyA'); await page.keyboard.down('KeyW');
    assert.equal(await page.locator('#sprite').evaluate(el => getComputedStyle(el).transform), 'matrix(-1, 0, 0, 1, 0, 0)');
    await page.keyboard.up('KeyW');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => visualScale), .75);
    await page.evaluate(() => { Patrol.runtime.spawn(1, .5); advance(1, 60); });
    assert.equal(await page.evaluate(() => visualScale), 1);
    await page.evaluate(() => { Patrol.runtime.spawnAt(1280,1050); advance(1,60); });
    await page.keyboard.down('KeyW'); await page.evaluate(() => advance(60,60)); await page.keyboard.up('KeyW');
    assert.equal(await page.evaluate(() => Patrol.runtime.point.y),957);
    await page.evaluate(() => { Patrol.runtime.spawnAt(650,1100); advance(1,60); });
    for (let i=0;i<10;i++) { await page.keyboard.down('KeyA'); await page.keyboard.down('KeyD'); await page.keyboard.up('KeyA'); await page.keyboard.up('KeyD'); }
    assert.equal(await page.evaluate(() => state),'IDLE');
    assert.ok(await page.evaluate(() => context.getImageData(0,0,250,333).data.some((v,i)=>i%4===3 && v>0)));
    const fallback = await f.page(browser);
    await fallback.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('Storage blocked'); };
      Storage.prototype.setItem = () => { throw new Error('Storage blocked'); };
    });
    await fallback.goto(f.base+'/index.html'); await fallback.waitForFunction(() => typeof ready !== 'undefined' && ready);
    await fallback.evaluate(()=>Patrol.engines.ui.showHelp());
    assert.ok((await fallback.locator('#overlay-content').textContent()).includes('на сервере'));
    await fallback.keyboard.press('Escape');
    await fallback.evaluate(() => Patrol.engines.quests.event('introComplete'));
    assert.ok(await fallback.evaluate(() => Patrol.progress.introComplete));
    const anonymous = await browser.newPage();
    await anonymous.goto(f.base+'/index.html');
    assert.equal(new URL(anonymous.url()).pathname,'/');
    console.log('PASS: normalized diagonals at 30/60/120 Hz, immediate idle, scale/anchor/mirror/resize, server progress with unavailable storage, anonymous game redirect.');
  } finally { await browser.close(); await f.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

