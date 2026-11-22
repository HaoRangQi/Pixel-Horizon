import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let html = await readFile('dist/index.html', 'utf8');
const scriptTag = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/);
const styleTag = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/);
if (!scriptTag || !styleTag) throw new Error('Expected a single bundled script and stylesheet in dist/index.html');
const [javascript, stylesheet, fontLicense, threeLicense] = await Promise.all([
  readFile(resolve('dist', scriptTag[1].replace(/^\//, '')), 'utf8'),
  readFile(resolve('dist', styleTag[1].replace(/^\//, '')), 'utf8'),
  readFile('public/fonts/OFL.txt', 'utf8'),
  readFile('node_modules/three/LICENSE', 'utf8'),
]);
let css = stylesheet;
const fonts = [...css.matchAll(/url\((['"]?)\/fonts\/([^'"\)]+)\1\)/g)];
const embedded = await Promise.all(fonts.map(async (match) => {
  const bytes = await readFile(resolve('public/fonts', match[2]));
  return [match[0], `url(data:font/ttf;base64,${bytes.toString('base64')})`];
}));
for (const [url, data] of embedded) css = css.replaceAll(url, data);
// Bundle text contains dollar sequences that String.replace interprets in a replacement string.
html = html.replace(scriptTag[0], () => `<script type="module">${javascript.replaceAll('</script', '<\\/script')}</script>`);
html = html.replace(styleTag[0], () => `<style>${css}</style>`);
html = html.replace('</head>', () => `<script type="text/plain" id="bundled-licenses">${fontLicense}\n\n${threeLicense}</script></head>`);
await writeFile('Pixel-Horizon.html', html);
console.log(`Standalone game: Pixel-Horizon.html (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB)`);
