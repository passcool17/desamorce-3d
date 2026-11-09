// Partie complète de Désamorce! 3D dans Chrome headless (WebGL SwiftShader) via CDP, sans dépendance.
// Les touches sont de vrais clics souris projetés depuis la face 3D (raycast réel).
// Usage : node test/e2e-cdp.mjs <url> [dossier-captures]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
const url = process.argv[2], shots = process.argv[3] || '/tmp';
const VW = 390, VH = 844;
const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=9334', '--user-data-dir=' + mkdtempSync('/tmp/chr-'), 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pend = new Map(); const errors = [];
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(e + ' → ' + r.result.exceptionDetails.exception?.description); return r.result?.result?.value; };
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
async function click(x, y) { await mouse('mouseMoved', x, y); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await sleep(140); }
async function tapFace(f, cx, cy) { const [x, y] = await ev(`D3.toScreen(${f},${cx},${cy})`); await click(x, y); }
async function settle() { for (let i = 0; i < 40 && !(await ev('D3.settled()')); i++) await sleep(50); await sleep(80); }
async function swipe(dx) { const y = 420, x0 = VW / 2; await mouse('mouseMoved', x0, y); await mouse('mousePressed', x0, y); for (let k = 1; k <= 8; k++) { await mouse('mouseMoved', x0 + dx * k / 8, y); await sleep(16); } await mouse('mouseReleased', x0 + dx, y); await settle(); }
async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shots}/${n}.png`, Buffer.from(r.result.data, 'base64')); }
async function waitCine(f) { for (let i = 0; i < 400; i++) { const c = await ev('D3.cine()'); if (!c || f(c)) return c; await sleep(15); } }
const nextBtn = async () => { await click(VW - 56, VH - 50); await settle(); };
const st = () => ev(`({face:D3.G.face,strikes:D3.G.strikes,solved:D3.G.solved,rem:Math.round(D3.G.remaining/1000),over:D3.G.over,won:!!D3.G.won,end:!document.getElementById('end').classList.contains('hidden')})`);
try {
  for (let i = 0; i < 50; i++) { try { const l = await (await fetch('http://127.0.0.1:9334/json')).json(); const t = l.find(x => x.type === 'page'); if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); break; } } catch {} await sleep(200); }
  await new Promise(r => ws.onopen = r);
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push(d.params.entry.text + ' ' + (d.params.entry.url || '')); };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 60 && !(await ev('!!window.D3')); i++) await sleep(200);
  console.log('WebGL :', await ev(`(()=>{const g=document.createElement('canvas').getContext('webgl2')||document.createElement('canvas').getContext('webgl');return !!g})()`));
  await sleep(400); await shot('01-titre');
  await ev(`document.getElementById('start').click()`); await sleep(500);
  const p = await ev('D3.G.p');
  console.log('série', p.serial, '| code', p.solution.code, '| vis', p.solution.screwOrder.join(''), '| fils à couper', p.solution.wiresToCut.join(','));
  await shot('02-fils');
  const wrong = p.wires.findIndex((_, i) => !p.solution.wiresToCut.includes(i));
  await tapFace(0, 200, 160 + wrong * 60);
  let s = await st(); console.log('mauvais fil → erreurs', s.strikes, '| temps', s.rem, 's');
  if (s.strikes !== 1) throw new Error('pénalité non appliquée');
  for (const i of p.solution.wiresToCut) await tapFace(0, 200, 160 + i * 60);
  // tourner par glissement (gauche = face suivante)
  await swipe(-160); s = await st(); console.log('glissement gauche → face', s.face + 1);
  if (s.face !== 1) throw new Error('glissement inopérant');
  await sleep(200); await shot('03-clavier');
  await nextBtn(); await shot('04-panneau');
  const SC = await ev('D3.SCREWS');
  for (const n of p.solution.screwOrder) { await tapFace(2, ...SC[n - 1]); await sleep(120); }
  await sleep(1400); await shot('05-panneau-ouvert');
  await nextBtn();
  const PAD = await ev('D3.PAD'), MZ = await ev('D3.MZ');
  const pad = async d => { const [x, y, w, h] = PAD[d]; await tapFace(3, x + w / 2, y + h / 2); };
  const path = p.solution.mazePath; console.log('aiguille 8x8 : chemin de', path.length, 'déplacements');
  // 1) glisser sur le labyrinthe : la bille bouge, la bombe ne tourne pas
  const [sx, sy] = p.maze.start, cellC = (x, y) => [MZ.ox + x * MZ.cell + MZ.cell / 2, MZ.oy + y * MZ.cell + MZ.cell / 2];
  const [ax, ay] = await ev(`D3.toScreen(3,${cellC(sx, sy).join(',')})`);
  const dir = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[path[0]];
  await mouse('mouseMoved', ax, ay); await mouse('mousePressed', ax, ay);
  for (let k = 1; k <= 6; k++) { await mouse('mouseMoved', ax + dir[0] * 8 * k, ay + dir[1] * 8 * k); await sleep(16); }
  await mouse('mouseReleased', ax + dir[0] * 48, ay + dir[1] * 48); await sleep(250);
  s = await st(); const pos1 = await ev('D3.G.pos');
  console.log('glisser sur le labyrinthe → face', s.face + 1, '| bille', JSON.stringify(p.maze.start), '→', JSON.stringify(pos1));
  if (s.face !== 3 || (pos1[0] === sx && pos1[1] === sy)) throw new Error('glisser sur le labyrinthe inopérant ou a tourné la bombe');
  // 2) mur touché volontairement : pénalité + secousse
  const blocked = ['n', 'e', 's', 'w'].find(d => { const st2 = { n: 'n', e: 'e', s: 's', w: 'w' }[d]; const [x, y] = pos1; const w = p.maze.walls[y][x][st2]; return w; });
  const before = (await st()).strikes; await pad(blocked); await sleep(60); await shot('06a-aiguille-mur');
  s = await st(); console.log('mur touché → erreurs', before, '→', s.strikes, '| bascule', JSON.stringify(await ev('({x:+D3.tilt.x.toFixed(3),z:+D3.tilt.z.toFixed(3),jx:+D3.tilt.jx.toFixed(3)})')));
  if (s.strikes !== before + 1) throw new Error('mur sans pénalité');
  await sleep(700);
  // 3) le reste à la croix directionnelle
  for (let i = 1; i < path.length; i++) { await pad(path[i]); if (i === 6) { await sleep(40); await shot('aiguille-v2'); console.log('bascule en mouvement', JSON.stringify(await ev('({x:+D3.tilt.x.toFixed(3),z:+D3.tilt.z.toFixed(3)})'))); } }
  await sleep(600); await shot('06-aiguille');
  console.log('audio en jeu :', JSON.stringify(await ev('D3.audio()')));
  s = await st(); console.log('résolus avant le code', JSON.stringify(s.solved));
  await nextBtn(); await nextBtn();
  const KR = await ev('[...Array(12).keys()].map(D3.keyRect)');
  const keyAt = async i => { const [x, y, w, h] = KR[i]; await tapFace(1, x + w / 2, y + h / 2); };
  for (const ch of p.solution.code) await keyAt(+ch === 0 ? 10 : +ch - 1);
  await sleep(200); await shot('07-code');
  await keyAt(11);
  console.log('cinématique victoire :', JSON.stringify(await ev('D3.cine()')));
  await waitCine(c => c.t > 1000); await shot('08a-win-1s'); await waitCine(c => c.t > 2300); await shot('epic-win'); await waitCine(c => c.t > 3400); await shot('08b-win-3s');
  for (let i = 0; i < 40 && !(await st()).end; i++) await sleep(150);
  await sleep(1300);
  s = await st(); await shot('08-victoire');
  console.log('étoiles :', await ev(`document.querySelectorAll('#stars span.on').length`), '| record :', await ev(`document.getElementById('best').textContent`));
  console.log('victoire :', s.won, '| écran fin :', s.end, '| temps restant', s.rem, 's');
  if (!s.won || !s.end) throw new Error('victoire non atteinte');
  await ev(`document.getElementById('again').click()`); await sleep(500);
  const p2 = await ev('D3.G.p');
  const bad = p2.wires.map((_, i) => i).filter(i => !p2.solution.wiresToCut.includes(i));
  for (const i of bad.slice(0, 3)) await tapFace(0, 200, 160 + i * 60);
  const tLose = Date.now();
  await waitCine(c => c.t > 800); await shot('09a-avant-boum'); await waitCine(c => c.tx > 280); await shot('epic-boum'); await waitCine(c => c.tx > 1100); await shot('09b-apres-boum');
  for (let i = 0; i < 50 && !(await st()).end; i++) await sleep(150);
  console.log('BOUM → écran de résultat après', ((Date.now() - tLose) / 1000).toFixed(1), 's');
  await sleep(900); await shot('10-boum');
  s = await st(); console.log('défaite après 3 erreurs :', s.over && !s.won && s.end, '| nouvelle bombe :', p2.serial !== p.serial || p2.wires.join() !== p.wires.join());
  if (!(s.over && !s.won && s.end)) throw new Error('défaite non déclenchée');
  // passer la cinématique d'un toucher
  await ev(`document.getElementById('again').click()`); await sleep(500);
  const p3 = await ev('D3.G.p'); const bad3 = p3.wires.map((_, i) => i).filter(i => !p3.solution.wiresToCut.includes(i));
  for (const i of bad3.slice(0, 3)) await tapFace(0, 200, 160 + i * 60);
  await waitCine(c => c.t > 450); await click(VW / 2, VH / 2); await sleep(150);
  s = await st(); console.log('toucher pour passer → écran de résultat immédiat :', s.end);
  if (!s.end) throw new Error('passer inopérant');
  // mouvement réduit
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await send('Page.reload'); for (let i = 0; i < 60 && !(await ev('!!window.D3')); i++) await sleep(200); await sleep(400);
  await ev(`document.getElementById('start').click()`); await sleep(500);
  const p4 = await ev('D3.G.p'); const bad4 = p4.wires.map((_, i) => i).filter(i => !p4.solution.wiresToCut.includes(i));
  const t4 = Date.now(); for (const i of bad4.slice(0, 3)) await tapFace(0, 200, 160 + i * 60);
  await sleep(900); await shot('11-reduit-boum');
  for (let i = 0; i < 50 && !(await st()).end; i++) await sleep(150);
  console.log('mouvement réduit : BOUM → résultat après', ((Date.now() - t4) / 1000).toFixed(1), 's');
  console.log('audio :', JSON.stringify(await ev('D3.audio()')));
  console.log('erreurs JS :', errors.length ? errors : 'aucune');
  if (errors.length) process.exitCode = 1;
} catch (e) { console.error('ÉCHEC', e.message, errors); process.exitCode = 1; }
finally { chrome.kill(); }
