import { chromium } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// The garage now has two cockpits, so record one video per style:
//   node tools/record-instruments.mjs                    → AMG ONE
//   HORIZON_STYLE=coupe node tools/record-instruments.mjs → HORIZON M4
// Each run starts from the same road point and keyboard script so the two clips are comparable.
const style = process.env.HORIZON_STYLE === 'coupe' ? 'coupe' : 'one';
const suffix = style === 'coupe' ? '-coupe' : '';
const directory = resolve(`shots/rework/.instrument-frames${suffix}`);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [], samples = [];
let active = null;
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(process.env.HORIZON_URL || 'http://127.0.0.1:5174/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__horizon && document.querySelector('#loading').hidden, null, { timeout: 60000 });
  await page.locator('#start-button').click();
  if (style === 'coupe') {
    await page.keyboard.press('g');
    await page.waitForTimeout(600);
  }
  active = await page.evaluate(() => {
    const game = window.__horizon;
    return { style: game.vehicle.style, brand: game.vehicle.root.getObjectByName('liveInstrumentCluster').userData.readings.brand };
  });
  if (active.style !== style) throw new Error(`expected ${style} cockpit, got ${active.style}`);
  await page.locator('#map-button').click(); await page.locator('[data-destination="1"]').click();
  await page.waitForTimeout(4600);
  await page.keyboard.press('c'); await page.keyboard.press('c'); await page.keyboard.press('h');
  await page.waitForTimeout(500);
  const started = Date.now();
  for (let frame = 0; frame < 80; frame++) {
    if (frame === 5) { await page.keyboard.press('f'); await page.keyboard.down('w'); }
    if (frame === 24) await page.keyboard.press('e');
    if (frame === 59) { await page.keyboard.up('w'); await page.keyboard.press('t'); }
    if (frame % 10 === 0) samples.push(await page.evaluate(() => window.__horizon.snapshot()));
    await page.screenshot({ path: `${directory}/${String(frame).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 88 });
    const delay = started + (frame + 1) * 100 - Date.now();
    if (delay > 0) await page.waitForTimeout(delay);
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
const output = resolve(`shots/rework/instruments-drive${suffix}.mp4`);
const encoded = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '10', '-i', `${directory}/%04d.jpg`, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], { encoding: 'utf8' });
if (encoded.status !== 0) throw new Error(encoded.stderr || 'ffmpeg failed');
await writeFile(`shots/rework/instruments-video${suffix}.json`, JSON.stringify({ source: 'real keyboard driving in the game', style, brand: active.brand, frames: 80, fps: 10, samples, errors }, null, 2));
await rm(directory, { recursive: true });
console.log(output);
