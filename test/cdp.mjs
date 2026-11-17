// Petit client Chrome DevTools Protocol sans dépendance (Node 22+ : WebSocket intégré).
// Lance Chrome sans tête avec ANGLE/GL et émule un téléphone tactile.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ gl = 'angle-gl', chrome = process.env.CHROME || 'google-chrome' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'desamorce3d-cdp-'));
  const glArgs = gl === 'swiftshader' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-gl=angle', '--use-angle=gl'];
  const proc = spawn(chrome, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu-sandbox', '--ignore-gpu-blocklist', ...glArgs,
    '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 200 && !port; i++) { await sleep(50); const f = join(dir, 'DevToolsActivePort'); if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0]; }
  if (!port) throw new Error('Chrome ne démarre pas');
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = list.find(t => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map(); const handlers = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); }
    else if (d.method) handlers.forEach(h => h(d));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const errors = [], logs = [];
  handlers.push(d => {
    if (d.method === 'Runtime.consoleAPICalled') { const t = d.params.args.map(a => a.value ?? a.description).join(' '); (d.params.type === 'error' ? errors : logs).push(t); }
    if (d.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push(d.params.entry.text + ' ' + (d.params.entry.url || ''));
  });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + expr.slice(0, 80) + ' → ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
  const page = {
    send, ev, errors, logs,
    async size(w, h) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true, screenOrientation: w > h ? { type: 'landscapePrimary', angle: 90 } : { type: 'portraitPrimary', angle: 0 } });
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    },
    async goto(url, { wait = true } = {}) {
      await send('Page.navigate', { url });
      if (!wait) return;
      for (let i = 0; i < 300; i++) { await sleep(50); try { if (await ev('!!(window.D3 && window.__c204 && window.__c204.ready)')) return; } catch {} }
      throw new Error('page pas prête : ' + url);
    },
    async shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.data, 'base64')); },
    async touch(type, pts) { await send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i, radiusX: 4, radiusY: 4, force: 1 })) }); },
    async tap(x, y) { await page.touch('touchStart', [[x, y]]); await sleep(40); await page.touch('touchEnd', []); await sleep(120); },
    async swipe(x, y, dx, dy, steps = 10) {
      await page.touch('touchStart', [[x, y]]);
      for (let i = 1; i <= steps; i++) { await sleep(16); await page.touch('touchMove', [[x + dx * i / steps, y + dy * i / steps]]); }
      await sleep(16); await page.touch('touchEnd', []); await sleep(80);
    },
    close() { try { ws.close(); } catch {} proc.kill('SIGKILL'); setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} }, 300); }
  };
  return page;
}
