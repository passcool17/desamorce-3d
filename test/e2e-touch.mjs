// Partie complète de Désamorce! 3D avec de VRAIS événements tactiles CDP (Input.dispatchTouchEvent),
// en portrait 412x915 puis en paysage 915x412. Vérifie : sens des glissers (tourner, basculer dessus/dessous),
// toucher des modules sur les 6 faces, fils qui pendent après la coupe, couvercle qui tombe, victoire,
// défaite (Difficile), mode duo + manuel, appels de dessin < 100 dans chaque vue, 0 erreur console.
// Usage : node test/e2e-touch.mjs [url] [dossier-captures]   (sans url : serveur local du dépôt)
import { launch, sleep } from './cdp.mjs';
import { serve } from './serve.mjs';
import { mkdirSync } from 'node:fs';
let url = process.argv[2], srv = null;
const out = process.argv[3] || '/tmp/desamorce-3d-e2e'; mkdirSync(out, { recursive: true });
if (!url) { const s = await serve(0); srv = s.srv; url = s.url; }
const q = (u, p) => u + (u.includes('?') ? '&' : '?') + p;
const results = []; let fail = 0;
const ok = (cond, msg) => { results.push((cond ? 'OK   ' : 'ÉCHEC ') + msg); if (!cond) fail++; };
const page = await launch();
const ev = page.ev;
async function settle() { for (let i = 0; i < 80 && !(await ev('D3.settled()')); i++) await sleep(40); await sleep(120); }
async function tapEl(sel) { const r = await ev(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2]})()`); await page.tap(r[0], r[1]); }
async function tapFace(fi, cx, cy) { const [x, y] = await ev(`D3.toScreen(${fi},${cx},${cy})`); await page.tap(x, y); }
const calls = {};
async function measure(tag) { await sleep(250); const p = await ev('D3.perf()'); calls[tag] = Math.max(calls[tag] || 0, p.calls); return p; }

for (const [W, H] of [[412, 915], [915, 412]]) {
  const tag = W + 'x' + H, land = W > H;
  await page.size(W, H);
  await page.goto(q(url, 'fps=1&nosw=1&tier=2'));
  await sleep(800);
  ok(await ev('D3.version') !== 'dev', `${tag} version chargée : ${await ev('D3.version')}`);
  await page.shot(`${out}/${tag}-01-menu.png`); await measure('menu');
  // --- Normal solo ---
  await tapEl('[data-diff="normal"]'); await tapEl('[data-mode="solo"]');
  ok(await ev(`document.querySelector('[data-diff="normal"]').getAttribute('aria-pressed')`) === 'true', `${tag} menu : Normal choisi au toucher`);
  await ev(`(()=>{const b=document.getElementById('start');b.onclick=()=>D3.start(4242);})()`); // graine fixe pour la reproductibilité
  await tapEl('#start'); await sleep(500); await settle();
  const p = await ev('D3.G.p');
  ok(p.modules.length === 6 && await ev('D3.G.running'), `${tag} partie Normal lancée (6 modules, bombe ${p.bombCode})`);
  const cx = W / 2, cy = land ? H / 2 : H * 0.5;
  // fils : un mauvais, puis les bons
  const wrong = p.wires.findIndex((_, i) => !p.solution.wiresToCut.includes(i)), nW = p.wires.length;
  const wy = i => (nW >= 6 ? 150 + i * 52 : 160 + i * 60);
  await tapFace(0, 200, wy(wrong));
  ok(await ev('D3.G.strikes') === 1, `${tag} mauvais fil → 1 erreur`);
  for (const i of p.solution.wiresToCut) await tapFace(0, 200, wy(i));
  ok(await ev('D3.G.solved.fils'), `${tag} fils désamorcés au toucher`);
  let hang = [];
  for (let i = 0; i < 40; i++) { await sleep(100); hang = await ev('D3.wires()'); if (i >= 12 && hang.every(w => w.a < -1.2 && w.b > 1.2)) break; } // ressort amorti : attendre qu'il se pose
  ok(hang.length === 3 && hang.every(w => w.a < -1.2 && w.b > 1.2), `${tag} fils coupés qui pendent : ${JSON.stringify(hang)}`);
  await page.shot(`${out}/${tag}-02-face-fils-coupes.png`); await measure('front');
  // glisser à gauche = la face de droite arrive (la bombe suit le doigt)
  await page.swipe(cx + 80, cy, -170, 0); await settle();
  ok(await ev('D3.view()') === 1, `${tag} glisser ← : face 2 Clavier (suit le doigt)`);
  await page.swipe(cx - 80, cy, 170, 0); await settle();
  ok(await ev('D3.view()') === 0, `${tag} glisser → : retour face 1`);
  // glisser vers le bas = le dessus vient vers soi
  await page.swipe(cx, cy - 90, 0, 190); await settle();
  ok(await ev('D3.view()') === 'top', `${tag} glisser ↓ : dessus`);
  await page.shot(`${out}/${tag}-03-dessus.png`); await measure('top');
  const SW = await ev('D3.SWITCH.toString()');
  for (let i = 0; i < 5; i++) if (p.solution.switchesUp[i]) { const [x, y, w, h] = await ev(`D3.SWITCH(${i})`); await tapFace(4, x + w / 2, y + h / 2); }
  const OKB = await ev('D3.SW_OK'); await tapFace(4, OKB[0] + OKB[2] / 2, OKB[1] + OKB[3] / 2);
  ok(await ev('D3.G.solved.interrupteurs'), `${tag} interrupteurs (dessus) désamorcés au toucher`);
  await sleep(300); await page.shot(`${out}/${tag}-04-dessus-resolu.png`);
  // glisser vers le haut deux fois = dessous
  await page.swipe(cx, cy + 90, 0, -190); await settle();
  ok(await ev('D3.view()') === 0, `${tag} glisser ↑ depuis le dessus : retour au côté`);
  await page.swipe(cx, cy + 90, 0, -190); await settle();
  ok(await ev('D3.view()') === 'bottom', `${tag} glisser ↑ : dessous`);
  await page.shot(`${out}/${tag}-05-dessous.png`); await measure('bottom');
  const SB = await ev('D3.SEQ_BTN');
  const wrongSeq = ['rouge', 'bleu', 'vert', 'jaune'].find(c => c !== p.solution.seqPress[0]);
  await tapFace(5, SB[wrongSeq][0] + 60, SB[wrongSeq][1] + 50);
  ok(await ev('D3.G.strikes') === 2 && await ev('D3.G.seqIn') === 0, `${tag} mauvaise couleur → erreur, séquence remise à zéro`);
  for (const c of p.solution.seqPress) await tapFace(5, SB[c][0] + 60, SB[c][1] + 50);
  ok(await ev('D3.G.solved.sequence'), `${tag} séquence (dessous) désamorcée au toucher`);
  // bouton ▲ (Dessus) depuis le dessous = retour au côté ; flèches ◀ du clavier d'ordinateur
  await tapEl('#bUp'); await settle();
  ok(await ev('D3.view()') === 0, `${tag} bouton ▲ depuis le dessous : retour au côté`);
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }); await settle();
  ok(await ev('D3.view()') === 1, `${tag} touche → : face suivante`);
  await tapEl('#right'); await settle();
  ok(await ev('D3.view()') === 2, `${tag} bouton ▶ : face 3 Panneau`);
  await page.shot(`${out}/${tag}-06-panneau.png`); await measure('back');
  const SC = await ev('D3.SCREWS');
  for (const n of p.solution.screwOrder) { await tapFace(2, ...SC[n - 1]); await sleep(150); }
  await sleep(700);
  const lidMid = await ev('D3.lid()');
  ok(['swing', 'fall', 'rest'].includes(lidMid.phase), `${tag} 4 vis → le couvercle se détache (${lidMid.phase})`);
  let lidEnd = {};
  for (let i = 0; i < 50; i++) { await sleep(100); lidEnd = await ev('D3.lid()'); if (lidEnd.phase === 'rest') break; } // l'animation ralentit si le rendu est lent
  ok(await ev('D3.G.solved.panneau') && lidEnd.phase === 'rest' && lidEnd.y < -1, `${tag} couvercle posé sur la table (y ${lidEnd.y}), panneau désamorcé`);
  await page.shot(`${out}/${tag}-07-panneau-ouvert.png`);
  await tapEl('#right'); await settle();
  ok(await ev('D3.view()') === 3, `${tag} face 4 Aiguille`);
  await page.shot(`${out}/${tag}-08-aiguille.png`); await measure('left');
  const PAD = await ev('D3.PAD'), path = p.solution.mazePath;
  // 1er pas : glisser sur le labyrinthe (déplace la bille, ne tourne pas la bombe)
  const M = await ev(`D3.mazeGeom(${p.maze.size})`), [sx, sy] = p.maze.start;
  const [ax, ay] = await ev(`D3.toScreen(3,${M.ox + sx * M.cell + M.cell / 2},${M.oy + sy * M.cell + M.cell / 2})`);
  const dir = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[path[0]];
  await page.swipe(ax, ay, dir[0] * 48, dir[1] * 48, 6); await sleep(200);
  ok(await ev('D3.view()') === 3 && (await ev('D3.G.pos')).join() === [sx + dir[0], sy + dir[1]].join(), `${tag} glisser sur le labyrinthe : la bille avance d’une case, la bombe ne tourne pas`);
  for (const d of path.slice(1)) { const [x, y, w, h] = PAD[d]; await tapFace(3, x + w / 2, y + h / 2); }
  ok(await ev('D3.G.solved.aiguille'), `${tag} aiguille au toucher (${path.length} pas)`);
  await sleep(300); await page.shot(`${out}/${tag}-09-legende.png`);
  await page.swipe(cx - 80, cy, 170, 0); await settle(); // ← face 3, puis face 2
  await page.swipe(cx - 80, cy, 170, 0); await settle();
  ok(await ev('D3.view()') === 1, `${tag} retour au clavier par glisser →`);
  for (const k of [...p.solution.code, 'OK']) { const i = (await ev('D3.KEYS')).indexOf(k); const [x, y, w, h] = await ev(`D3.keyRect(${i})`); await tapFace(1, x + w / 2, y + h / 2); }
  await sleep(1500); await page.shot(`${out}/${tag}-10-victoire-cine.png`); await measure('win');
  for (let i = 0; i < 60 && await ev(`document.getElementById('end').classList.contains('hidden')`); i++) await sleep(150);
  ok(await ev('D3.G.won') && !(await ev(`document.getElementById('end').classList.contains('hidden')`)), `${tag} victoire → écran de fin`);
  await page.shot(`${out}/${tag}-11-fin-victoire.png`);
  // --- Difficile : 2 erreurs = BOUM ---
  await tapEl('#home'); await sleep(300);
  await tapEl('[data-diff="difficile"]'); await tapEl('#start'); await sleep(500); await settle();
  const p2 = await ev('D3.G.p');
  ok(p2.wires.length === 6 && await ev('D3.G.D.maxStrikes') === 2 && await ev('D3.G.remaining') <= 300000, `${tag} Difficile : 6 fils, 2 erreurs, 5:00`);
  const bad = p2.wires.map((_, i) => i).filter(i => !p2.solution.wiresToCut.includes(i));
  await tapFace(0, 200, 150 + bad[0] * 52); await tapFace(0, 200, 150 + bad[1] * 52);
  await sleep(1600); await page.shot(`${out}/${tag}-12-boum.png`); await measure('boom');
  for (let i = 0; i < 60 && await ev(`document.getElementById('end').classList.contains('hidden')`); i++) await sleep(150);
  ok(!(await ev('D3.G.won')) && await ev('D3.G.over'), `${tag} 2e erreur en Difficile → BOUM`);
  // --- Facile + Duo ---
  await tapEl('#home'); await sleep(300);
  await tapEl('[data-diff="facile"]'); await tapEl('[data-mode="duo"]'); await tapEl('#start'); await sleep(600);
  const p3 = await ev('D3.G.p');
  ok(p3.modules.length === 4 && await ev(`!document.getElementById('brief').classList.contains('hidden')`) && !(await ev('D3.G.running')), `${tag} Duo : écran de départ avec code ${p3.bombCode}, chrono arrêté`);
  await page.shot(`${out}/${tag}-13-duo-depart.png`);
  const link = await ev(`document.getElementById('briefLink').href`);
  ok(link.includes('manuel.html?code=' + encodeURIComponent(p3.bombCode)), `${tag} lien du manuel : ${link}`);
  await tapEl('#go'); await sleep(400);
  ok(await ev('D3.G.running') && await ev('D3.G.duo'), `${tag} GO : le chrono démarre`);
  await tapEl('#left'); await settle(); await tapEl('#left'); await settle();
  ok(await ev('D3.view()') === 2, `${tag} Duo : face Panneau`);
  await page.shot(`${out}/${tag}-14-duo-panneau.png`);
  await tapEl('#bUp'); await settle(); await page.shot(`${out}/${tag}-15-facile-dessus.png`);
  ok(await ev('D3.view()') === 'top', `${tag} Facile : dessus (écran DEL + code)`);
  await tapEl('#bDown'); await settle(); await tapEl('#bDown'); await settle();
  ok(await ev('D3.view()') === 'bottom', `${tag} Facile : dessous (étiquette)`); await page.shot(`${out}/${tag}-16-facile-dessous.png`);
  // manuel : même code → mêmes indices
  await page.goto(new URL('manuel.html?code=' + encodeURIComponent(p3.bombCode) + '&nosw=1', url).href, { wait: false });
  for (let i = 0; i < 100 && !(await ev(`!!document.querySelector('.mod')`).catch(() => false)); i++) await sleep(100);
  const man = await ev(`({code: document.getElementById('code').value, n: document.querySelectorAll('.mod').length, maze: !!document.querySelector('svg.maze'), lit: [...document.querySelectorAll('.big .dot')].length})`);
  ok(man.code === p3.bombCode && man.n === 4 && man.maze && man.lit === 2, `${tag} manuel ${man.code} : ${man.n} modules, carte du labyrinthe, 2 voyants allumés`);
  await page.shot(`${out}/${tag}-17-manuel.png`);
  await ev(`document.getElementById('code').value='N-0000Z'; document.getElementById('f').requestSubmit()`); await sleep(200);
  ok((await ev(`document.getElementById('err').textContent`)).startsWith('Code invalide'), `${tag} manuel : code mal tapé détecté`);
}
ok(Object.values(calls).every(c => c > 0 && c < 100), 'appels de dessin < 100 dans chaque vue : ' + JSON.stringify(calls));
const errs = page.errors.filter(e => !/favicon/.test(e));
ok(errs.length === 0, 'erreurs console : ' + (errs.length ? JSON.stringify(errs) : 'aucune'));
console.log(results.join('\n'));
console.log(fail ? `\n${fail} ÉCHEC(S)` : `\nTOUT OK (${results.length} vérifications) — captures : ${out}`);
page.close(); if (srv) srv.close();
process.exit(fail ? 1 : 0);
