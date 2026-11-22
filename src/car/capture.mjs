import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir(new URL('./qa/', import.meta.url), { recursive: true });
await page.goto(`${process.env.CAR_PREVIEW_URL ?? 'http://127.0.0.1:5173'}/src/car/preview.html`);
await page.waitForFunction(() => window.vehiclePreview);
await page.evaluate(() => window.vehiclePreview.renderer.setAnimationLoop(null));
const idle = { speed: 0, steer: 0, throttle: 0, brake: 0, rpm: 1350, gear: 'N', fuel: 0.94, coolant: 78, odometer: 0, turnSignal: 0, time: 0.1 };
const running = { speed: 48.5, steer: 0.15, throttle: 0.7, brake: 0, rpm: 8600, gear: 4, fuel: 0.71, coolant: 94, odometer: 12480, turnSignal: 1, time: 0.1 };

async function capture(view, filename, state = idle) {
  const metadata = await page.evaluate(({ view, state }) => {
    const p = window.vehiclePreview;
    p.setView(view);
    p.car.update(0, state);
    document.querySelector('#readings').textContent = `${Math.round(Math.abs(state.speed) * 3.6)} km/h · ${state.rpm} rpm · ${state.gear} · ${Math.round(state.fuel * 100)}% · ${state.coolant}°C · ${(state.odometer / 1000).toFixed(2)} km`;
    p.renderer.render(p.scene, p.camera);
    return {
      state: p.car.body.getObjectByName('liveInstrumentCluster').userData.readings,
      needle: p.car.body.getObjectByName('rpmNeedle').rotation.z,
      drawCallsIncludingShadows: p.renderer.info.render.calls,
      trianglesIncludingShadows: p.renderer.info.render.triangles,
    };
  }, { view, state });
  await page.screenshot({ path: new URL(`./qa/${filename}.png`, import.meta.url).pathname });
  return metadata;
}

const result = {};
for (const view of ['front', 'side', 'rear']) result[view] = await capture(view, `final-${view}`);
result.idle = await capture('cockpit', 'final-cockpit-idle');
result.running = await capture('cockpit', 'final-cockpit-speed', running);
await page.locator('#mood').click();
result.sunset = await capture('cockpit', 'final-cockpit-sunset', running);
result.sunsetFront = await capture('front', 'final-front-sunset');
result.errors = errors;
await writeFile(new URL('./qa/render-results.json', import.meta.url), JSON.stringify(result, null, 2));
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
if (result.idle.needle === result.running.needle) throw new Error('RPM needle did not respond to state');
if (result.idle.state.gear === result.running.state.gear || result.idle.state.speed === result.running.state.speed) throw new Error('Instrument state did not change');
console.log(JSON.stringify(result, null, 2));
