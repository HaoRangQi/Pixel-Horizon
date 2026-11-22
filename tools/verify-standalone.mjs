import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], externalRequests = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
try {
  await page.goto(pathToFileURL(resolve('Pixel-Horizon.html')).href);
  await page.waitForFunction(() => window.__horizon && document.querySelector('#loading').hidden);
  await page.locator('#start-button').click();
  await page.keyboard.down('w'); await page.waitForTimeout(1300); await page.keyboard.up('w');
  const snapshot = await page.evaluate(() => window.__horizon.snapshot());
  assert.ok(snapshot.speed > 20, 'the offline game accepts real driving input');
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, [], 'all game assets must work without network access');
  await page.screenshot({ path: 'shots/horizon-standalone.png' });
  await writeFile('shots/standalone-results.json', JSON.stringify({ status: 'passed', snapshot, errors, externalRequests }, null, 2));
  console.log('PASS standalone HTML starts from file://, drives, and makes zero external requests');
} finally {
  await browser.close();
}
