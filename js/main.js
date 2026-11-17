// Désamorce! 3D — jeu principal (three.js 0.187 auto-hébergé, modules ES, aucun CDN).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getGPUTier } from '../vendor/detect-gpu-5.0.70.esm.js';
import qrcode from '../vendor/qrcode-generator-2.0.4.mjs';
import { Sfx } from './audio.js';
import * as F from './faces.js';
import { DIMS, buildProceduralBomb, buildWires, buildLid } from './bomb-model.js';
import { createFx } from './fx.js';

const VERSION = new URL(import.meta.url).searchParams.get('v') || 'dev';
const L = window.DesamorceLogic;
const { BW, BH, BD } = DIMS;
const HALF = Math.PI / 2;
const $ = id => document.getElementById(id);
const now = () => performance.now();
const qs = new URLSearchParams(location.search);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FACE_NAMES = ['Fils', 'Clavier', 'Panneau', 'Aiguille'];
const MOD_LABEL = { fils: 'Fils', clavier: 'Clavier', panneau: 'Panneau', aiguille: 'Aiguille', interrupteurs: 'Interrupteurs', sequence: 'Séquence' };

// ---------- Qualité (detect-gpu, palier forcé avec ?tier=) ----------
const tierParam = qs.get('tier');
const forcedTier = tierParam !== null && tierParam !== '' && Number.isFinite(+tierParam) ? +tierParam : null;
let gpu = { tier: forcedTier ?? 2, gpu: '?', type: forcedTier !== null ? 'forcé' : 'en cours', fps: 0 };
let low = forcedTier !== null && forcedTier <= 1;
let Q = (RM ? 0.3 : 1) * (low ? 0.5 : 1); // densité des particules
const RES = low ? 1.2 : 1.6;              // densité des textures des faces

// ---------- Rendu ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
let prCap = low ? 1 : 2;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, prCap));
renderer.toneMapping = THREE.NoToneMapping; // les faces sont des « écrans » : couleurs exactes
const scene = new THREE.Scene();
const BG = 0x0b0c0f; scene.background = new THREE.Color(BG); scene.fog = new THREE.Fog(BG, 10, 24);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60);
if (!low) {
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55; pm.dispose();
}
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x1a1410, 1.5); scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff1dc, 2.1); key.position.set(2, 5, 6); scene.add(key);
const rim = new THREE.DirectionalLight(0x6fa8ff, 0.9); rim.position.set(-4, 2, -5); scene.add(rim);
const redLight = new THREE.PointLight(0xff2020, 2, 6, 1); redLight.position.set(0, 2.2, 1.5); scene.add(redLight);
const goldLight = new THREE.PointLight(0xffc46b, 0, 12, 1); goldLight.position.set(0, 3.2, 2); scene.add(goldLight);
const blastLight = new THREE.PointLight(0xffa040, 0, 18, 1); blastLight.position.set(0, 0.5, 1.2); scene.add(blastLight);

// ---------- Décor : établi en bois, flaque de lumière de la lampe, ombre, poussière ----------
const floorY = -BH / 2 - 0.08;
function woodTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  x.fillStyle = '#3a2618'; x.fillRect(0, 0, 512, 512);
  for (let p = 0; p < 6; p++) { const y0 = p * 86; x.fillStyle = p % 2 ? '#3f2a1b' : '#352215'; x.fillRect(0, y0, 512, 84); x.fillStyle = '#1a0f08'; x.fillRect(0, y0 + 84, 512, 2); }
  for (let i = 0; i < 900; i++) { const y = Math.random() * 512; x.strokeStyle = `rgba(${Math.random() < 0.5 ? '20,10,4' : '120,80,50'},${0.05 + Math.random() * 0.08})`; x.lineWidth = 0.5 + Math.random(); x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(170, y + Math.random() * 6 - 3, 340, y + Math.random() * 6 - 3, 512, y + Math.random() * 4 - 2); x.stroke(); }
  for (let i = 0; i < 14; i++) { x.fillStyle = 'rgba(15,8,3,.35)'; x.beginPath(); x.ellipse(Math.random() * 512, Math.random() * 512, 4 + Math.random() * 10, 2 + Math.random() * 3, 0, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.anisotropy = 4; return t;
}
function radial(stops) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); stops.forEach(([k, s]) => g.addColorStop(k, s)); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const table = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.75, metalness: 0 }));
table.rotation.x = -HALF; table.position.y = floorY; table.name = 'Table'; scene.add(table);
const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(255,214,150,.28)'], [0.5, 'rgba(255,190,120,.10)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
pool.rotation.x = -HALF; pool.position.y = floorY + 0.004; scene.add(pool);
const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ map: radial([[0, 'rgba(0,0,0,.75)'], [0.55, 'rgba(0,0,0,.35)'], [1, 'rgba(0,0,0,0)']]), transparent: true, depthWrite: false }));
shadow.rotation.x = -HALF; shadow.position.y = floorY + 0.008; scene.add(shadow);
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 3.2, 7, 24, 1, true), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
  fragmentShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(1.0-abs(dot(vN,vV)), 1.5); float a = 0.075*smoothstep(0.0,0.9,vY)*(1.0-edge*0.85); gl_FragColor = vec4(1.0,0.86,0.62,a); }'
}));
beam.position.set(0, floorY + 3.5, -0.4); scene.add(beam);
const dust = (() => {
  const n = low ? 40 : 110, g = new THREE.BufferGeometry(), a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const r = Math.random() * 2.6, t = Math.random() * 7; a.set([Math.cos(t) * r, floorY + Math.random() * 5.5, Math.sin(t) * r - 0.4], i * 3); }
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.035, color: 0xffe2b8, map: radial([[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
  scene.add(m); return m;
})();

// ---------- Faces (6 canvas) ----------
const faces = [
  F.createFace(F.CW, F.CH, RES, F.drawWires), F.createFace(F.CW, F.CH, RES, F.drawKeypad),
  F.createFace(F.CW, F.CH, RES, F.drawPanel), F.createFace(F.CW, F.CH, RES, F.drawMaze),
  F.createFace(F.CT, F.CT, RES, F.drawTop), F.createFace(F.CT, F.CT, RES, F.drawBottom)
];
const faceMats = faces.map(f => new THREE.MeshStandardMaterial({ map: f.tex, emissive: 0xffffff, emissiveMap: f.tex, emissiveIntensity: 0.42, roughness: 0.62, metalness: 0.15 }));
const B = buildProceduralBomb({ faceMats, envLow: low });
const planes = B.facePlanes;
// hiérarchie : rig (secousses, oscillation) → pitchG (bascule dessus/dessous) → B.root (rotation autour de Y)
const rig = new THREE.Group(), pitchG = new THREE.Group(); rig.add(pitchG); pitchG.add(B.root); scene.add(rig);
const planeSize = i => planes[i].userData.size;
function toLocalXY(fi, cx, cy) { const f = faces[fi], [w, h] = planeSize(fi); return [(cx / f.W - 0.5) * w, (0.5 - cy / f.H) * h]; }
const lid = buildLid(planes[2], F.LID, F.SCREWS, (cx, cy) => toLocalXY(2, cx, cy), F.drawLidTexture(RES));
let wires = null;
const fx = createFx(scene, floorY);

// ---------- État ----------
const G = { p: null, running: false, over: true, duo: false, diff: 'normal', D: L.DIFFS.normal, act: {} };
let rotY = 0, targetY = 0, pitch = 0, targetP = 0, pitchIdx = 0;
let shakeUntil = 0, flashUntil = 0, cine = null, ft = 0;
const view = () => pitchIdx === 1 ? 'top' : pitchIdx === -1 ? 'bottom' : G.face;
const planeOf = v => v === 'top' ? 4 : v === 'bottom' ? 5 : v;
const settled = () => Math.abs(rotY - targetY) < 0.02 && Math.abs(pitch - targetP) < 0.02;

function newGame(seed) {
  const D = L.DIFFS[G.diff];
  G.p = L.generate(seed ?? L.randomSeed(), G.diff);
  const solved = {}; G.p.modules.forEach(m => solved[m] = false);
  Object.assign(G, {
    D, startMs: D.timeMs, remaining: D.timeMs, strikes: 0, over: false, running: false, face: 0, won: false, solved,
    cut: new Set(), screwStep: 0, screwGone: {}, entry: '', keyFlash: {},
    pos: G.p.maze.start.slice(), needle: G.p.maze.start.slice(), nv: [0, 0], mazeFlash: 0, padFlash: {}, lastSec: -1,
    sw: [false, false, false, false, false], swAnim: {}, seqIn: 0, seqFlash: {}, seqLastPress: -1e9, seqT0: now(), displayMs: null
  });
  rotY = targetY = pitch = targetP = 0; pitchIdx = 0; setSpin();
  resetFx(); lid.reset();
  if (wires) wires.dispose();
  wires = buildWires(planes[0], G.p.wires, id => L.colorById(id).hex, (cx, i) => toLocalXY(0, cx, F.wireY(i, G.p.wires.length)));
  faces.forEach(f => f.dirty = true);
  buildHudLeds(); updateHud();
}

// ---------- Actions des modules ----------
G.act.cutWire = i => {
  if (G.solved.fils || G.cut.has(i)) return;
  G.cut.add(i); wires.cut(i); faces[0].dirty = true; Sfx.snip();
  if (!G.p.solution.wiresToCut.includes(i)) return strike();
  if (G.p.solution.wiresToCut.every(k => G.cut.has(k))) solve('fils');
};
G.act.pressKey = k => {
  if (G.solved.clavier) return;
  G.keyFlash[k] = now() + 120; faces[1].animUntil = now() + 150; faces[1].dirty = true;
  if (k === 'EFF') { G.entry = ''; Sfx.click(); return; }
  if (k === 'OK') {
    if (G.entry.length < 4) { Sfx.tone(300, 0.08); return; }
    if (G.entry === G.p.solution.code) return solve('clavier');
    G.entry = ''; return strike();
  }
  if (G.entry.length < 4) { G.entry += k; Sfx.click(); }
};
G.act.unscrew = n => {
  if (G.solved.panneau || G.screwGone[n]) return;
  if (G.p.solution.screwOrder[G.screwStep] !== n) return strike();
  G.screwStep++; G.screwGone[n] = true; lid.unscrew(n); faces[2].dirty = true;
  Sfx.tone(500, 0.12, 'sawtooth', 0.05, 400);
  if (G.screwStep === 4) setTimeout(() => { if (G.over) return; lid.open(); Sfx.clang(); setTimeout(() => !G.over && solve('panneau'), 450); }, 500);
};
G.act.moveNeedle = d => {
  if (G.solved.aiguille || G.over) return;
  const [x, y] = G.pos, [dx, dy] = L.STEP[d]; G.padFlash[d] = now() + 110;
  if (!L.canMove(G.p.maze, x, y, d)) {
    G.nv[0] += dx * 7; G.nv[1] += dy * 7; G.mazeFlash = now() + 450;
    kickTilt(dx * 3.2 + (Math.random() - 0.5) * 2, dy * 3.2 + (Math.random() - 0.5) * 2, 3);
    Sfx.tone(90, 0.25, 'square', 0.12, -40);
    return strike();
  }
  G.pos = [x + dx, y + dy]; G.nv[0] += dx * 3; G.nv[1] += dy * 3;
  kickTilt(dx * 0.9, dy * 0.9, 0);
  Sfx.tone(520 + Math.random() * 120, 0.05, 'triangle', 0.06, 200);
  if (G.pos[0] === G.p.maze.goal[0] && G.pos[1] === G.p.maze.goal[1]) solve('aiguille');
};
G.act.toggleSwitch = i => {
  if (G.solved.interrupteurs) return;
  G.sw[i] = !G.sw[i]; G.swAnim[i] = now(); faces[4].animUntil = now() + 180; faces[4].dirty = true; Sfx.clack();
};
G.act.submitSwitches = () => {
  if (G.solved.interrupteurs) return;
  G.keyFlash.swok = now() + 150; faces[4].animUntil = now() + 180; faces[4].dirty = true;
  if (G.sw.every((u, i) => u === G.p.solution.switchesUp[i])) solve('interrupteurs'); else strike();
};
G.act.pressSeq = id => {
  if (G.solved.sequence) return;
  G.seqFlash[id] = now() + 220; G.seqLastPress = now(); faces[5].animUntil = now() + 240; faces[5].dirty = true;
  Sfx.seqTone(L.SEQ_COLORS.findIndex(c => c.id === id));
  if (id === G.p.solution.seqPress[G.seqIn]) { G.seqIn++; if (G.seqIn === G.p.seq.length) solve('sequence'); }
  else { G.seqIn = 0; G.seqT0 = now() + 2600; strike(); }
};

function strike() {
  if (G.over) return;
  G.strikes++; G.remaining -= G.D.penaltyMs; Sfx.bad();
  shakeUntil = now() + 300; flashUntil = now() + 180;
  if (navigator.vibrate) navigator.vibrate(150);
  const pen = $('penalty'); pen.textContent = '−' + G.D.penaltyMs / 1000 + ' s'; pen.classList.add('show'); requestAnimationFrame(() => requestAnimationFrame(() => pen.classList.remove('show')));
  updateHud();
  if (G.strikes >= G.D.maxStrikes || G.remaining <= 0) lose();
}
function solve(k) {
  if (G.over || G.solved[k]) return;
  G.solved[k] = true; faces.forEach(f => f.dirty = true); Sfx.good(); updateHud();
  if (Object.values(G.solved).every(Boolean)) startCine('win');
}
function lose() { G.remaining = Math.max(0, G.remaining); updateHud(); startCine('lose'); }

// ---------- Rotation / bascule ----------
function setSpin() { planes[4].rotation.z = -targetY; planes[5].rotation.z = targetY; }
function rotate(dir) {
  if (G.over || !G.running) return;
  if (pitchIdx !== 0) { pitchIdx = 0; targetP = 0; }
  G.face = (G.face + dir + 4) % 4; targetY -= dir * HALF;
  Sfx.tone(300, 0.06, 'triangle', 0.05); updateHud();
}
function flip(dir) { // +1 : vers le dessus, −1 : vers le dessous
  if (G.over || !G.running) return;
  const n = Math.max(-1, Math.min(1, pitchIdx + dir)); if (n === pitchIdx) return;
  if (pitchIdx === 0) setSpin();
  pitchIdx = n; targetP = n * HALF; Sfx.whoosh(); updateHud();
}

// ---------- Oscillation (bombe instable sur la face Aiguille) ----------
const tilt = { x: 0, z: 0, vx: 0, vz: 0, jx: 0, jy: 0, jvx: 0, jvy: 0 };
function kickTilt(dx, dy, jolt) { tilt.vz -= dx * 0.9; tilt.vx += dy * 0.9; if (jolt) { tilt.jvx += (Math.random() - 0.5) * jolt; tilt.jvy += (Math.random() - 0.5) * jolt * 0.6; } }
function stepPhysics(t, sRaw) {
  const s = Math.min(sRaw, 0.05);
  if (G.p) for (let k = 0; k < 2; k++) { const a = 140 * (G.pos[k] - G.needle[k]) - 13 * G.nv[k]; G.nv[k] += a * s; G.needle[k] += G.nv[k] * s; }
  const unstable = G.p && !G.over && G.running && view() === 3 && !G.solved.aiguille && Math.abs(rotY - targetY) < 0.3;
  const sec = t / 1000, amp = unstable ? (G.diff === 'facile' ? 0.5 : 1) : 0;
  const txg = amp * (0.05 * Math.sin(sec * 1.7) + 0.025 * Math.sin(sec * 4.3 + 1)), tzg = amp * (0.06 * Math.sin(sec * 1.1 + 2) + 0.03 * Math.sin(sec * 3.7));
  tilt.vx += (-55 * (tilt.x - txg) - 5 * tilt.vx) * s; tilt.x += tilt.vx * s;
  tilt.vz += (-55 * (tilt.z - tzg) - 5 * tilt.vz) * s; tilt.z += tilt.vz * s;
  tilt.jvx += (-160 * (tilt.jx - amp * 0.04 * Math.sin(sec * 2.3)) - 9 * tilt.jvx) * s; tilt.jx += tilt.jvx * s;
  tilt.jvy += (-160 * tilt.jy - 9 * tilt.jvy) * s; tilt.jy += tilt.jvy * s;
  rig.rotation.x = THREE.MathUtils.clamp(tilt.x, -0.35, 0.35); rig.rotation.z = THREE.MathUtils.clamp(tilt.z, -0.35, 0.35);
  rig.position.x = tilt.jx * 0.25; rig.position.y = tilt.jy * 0.15 + Math.sin(t / 900) * 0.02;
}

// ---------- HUD et écrans ----------
function buildHudLeds() {
  $('leds').innerHTML = G.p.modules.map(m => `<i data-k="${m}" title="${MOD_LABEL[m]}"></i>`).join('') + '<span>modules</span>';
  $('strikes').innerHTML = '<b>✖</b>'.repeat(G.D.maxStrikes);
  $('codeChip').classList.toggle('hidden', !G.duo); $('codeChip').textContent = '📖 ' + G.p.bombCode;
}
function updateHud() {
  if (!G.p) return;
  $('timer').textContent = F.fmt(G.remaining);
  $('timer').classList.toggle('urgent', G.remaining <= 30000 && !G.over && G.running);
  [...$('strikes').children].forEach((b, i) => b.classList.toggle('on', i < G.strikes));
  document.querySelectorAll('#leds i').forEach(i => i.classList.toggle('on', !!G.solved[i.dataset.k]));
  const v = view();
  document.querySelectorAll('#dots i').forEach((d, i) => d.classList.toggle('on', pitchIdx === 0 && i === G.face));
  $('bUp').classList.toggle('on', pitchIdx === 1); $('bDown').classList.toggle('on', pitchIdx === -1);
  const has = m => G.p.modules.includes(m);
  $('faceName').textContent = v === 'top' ? 'Dessus — ' + (has('interrupteurs') ? 'Interrupteurs' : 'Écran') : v === 'bottom' ? 'Dessous — ' + (has('sequence') ? 'Séquence' : 'Étiquette') : 'Face ' + (v + 1) + ' — ' + FACE_NAMES[v];
  $('hint').textContent = v === 3 && !G.solved.aiguille ? 'glisse hors du labyrinthe ou ◀ ▶ ▲ ▼' : 'glisse : ◀ ▶ tourner · ▲ ▼ basculer';
}
function show(screen) {
  ['title', 'end', 'brief', 'credits', 'how'].forEach(s => $(s).classList.toggle('hidden', screen !== s));
  $('hud').classList.toggle('hidden', screen !== 'game');
  $('nav').classList.toggle('hidden', screen !== 'game');
  document.body.dataset.screen = screen;
  if (screen === 'game') requestAnimationFrame(resize);
  const first = $(screen) && $(screen).querySelector('button.big, button'); if (first && screen !== 'game') first.focus({ preventScroll: true });
}
function stars() {
  const k = G.remaining / G.startMs;
  if (G.strikes === 0 && k >= 0.5) return 3;
  if (G.strikes <= 1 && k >= 0.2) return 2;
  return 1;
}
function showEnd(win) {
  const e = $('end'); e.className = 'screen ' + (win ? 'win' : 'lose');
  $('endTitle').innerHTML = win ? 'BOMBE<br>DÉSAMORCÉE!' : 'BOUM!';
  $('endSub').textContent = win ? 'Temps restant' : (G.strikes >= G.D.maxStrikes ? 'Une erreur de trop…' : 'Le chrono est tombé à zéro.');
  $('endTime').textContent = win ? F.fmt(G.remaining) : '';
  const n = Object.values(G.solved).filter(Boolean).length, tot = G.p.modules.length;
  const tag = `${G.D.label} · ${G.duo ? 'Duo' : 'Solo'} · bombe ${G.p.bombCode}`;
  if (win) {
    const k = stars();
    $('stars').innerHTML = [0, 1, 2].map(i => `<span class="${i < k ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.22}s">★</span>`).join('');
    let best = 0, rec = false; const keyB = 'desamorce3d.meilleur.' + G.diff + (G.duo ? '.duo' : '');
    try { best = +localStorage.getItem(keyB) || 0; if (G.remaining > best) { best = G.remaining; rec = true; localStorage.setItem(keyB, String(Math.round(best))); } } catch (err) { best = G.remaining; }
    $('best').innerHTML = (rec ? '<b>🏆 Nouveau record!</b><br>' : '') + 'Meilleur temps restant (' + G.D.label + ') : ' + F.fmt(best);
    $('endInfo').innerHTML = 'Erreurs : ' + G.strikes + ' / ' + G.D.maxStrikes + (k === 3 ? ' — sans faute, chapeau! 🎩' : k === 2 ? ' — beau travail!' : ' — ç’a passé proche!') + '<br><small>' + tag + '</small>';
  } else {
    $('stars').innerHTML = ''; $('best').innerHTML = '';
    $('endInfo').innerHTML = 'Modules désamorcés : ' + n + ' / ' + tot + '<br>Erreurs : ' + G.strikes + ' / ' + G.D.maxStrikes + '<br><small>' + tag + '</small>';
  }
  show('end');
}
const manualUrl = code => new URL('manuel.html?code=' + encodeURIComponent(code), location.href).href;
function drawQR(cv, text) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), m = 4, px = Math.floor(cv.width / (n + m * 2)), off = Math.floor((cv.width - px * n) / 2), c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.fillStyle = '#000';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) c.fillRect(off + x * px, off + y * px, px, px);
}
function brief() { // mode duo : code, QR, lien du manuel, puis GO
  const url = manualUrl(G.p.bombCode);
  $('briefCode').textContent = G.p.bombCode; $('briefDiff').textContent = G.D.label + ' · ' + G.p.modules.length + ' modules · ' + F.fmt(G.startMs);
  drawQR($('qr'), url); $('briefLink').href = url; $('briefLink').textContent = url.replace(/^https?:\/\//, '');
  show('brief');
}
function startClock() {
  G.running = true; G.seqT0 = now(); show('game'); updateHud();
  Sfx.bedStart(() => G.p && { remaining: G.remaining, startMs: G.startMs, strikes: G.strikes, running: G.running && !G.over, final: cine && cine.type === 'lose' && !cine.exploded });
}
function start(seed) {
  Sfx.init(); newGame(seed);
  if (G.duo) brief(); else startClock();
}
// menu : niveau et mode
function pick(group, val) { document.querySelectorAll(`[data-${group}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[group] === val))); }
document.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => { G.diff = b.dataset.diff; pick('diff', G.diff); diffInfo(); try { localStorage.setItem('desamorce3d.niveau', G.diff); } catch (e) {} Sfx.init(); Sfx.click(); });
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { G.duo = b.dataset.mode === 'duo'; pick('mode', b.dataset.mode); diffInfo(); try { localStorage.setItem('desamorce3d.mode', b.dataset.mode); } catch (e) {} Sfx.init(); Sfx.click(); });
function diffInfo() {
  const D = L.DIFFS[G.diff];
  $('diffInfo').textContent = `${D.modules.length} modules · ${F.fmt(D.timeMs)} · ${D.maxStrikes} erreurs permises avant BOUM · −${D.penaltyMs / 1000} s par erreur`;
  $('modeInfo').textContent = G.duo ? 'Un joueur désamorce, l’autre lit le manuel sur SON téléphone (lien ou code QR au départ).' : 'Tous les indices sont sur la bombe.';
}
try { G.diff = L.DIFFS[localStorage.getItem('desamorce3d.niveau')] ? localStorage.getItem('desamorce3d.niveau') : 'normal'; G.duo = localStorage.getItem('desamorce3d.mode') === 'duo'; } catch (e) {}
if (L.DIFFS[qs.get('diff')]) G.diff = qs.get('diff');
pick('diff', G.diff); pick('mode', G.duo ? 'duo' : 'solo'); diffInfo();

function muteUi() { $('mute').textContent = Sfx.muted ? '🔇' : '🔊'; $('mute').setAttribute('aria-label', Sfx.muted ? 'Activer le son' : 'Couper le son'); }
$('mute').onclick = e => { e.stopPropagation(); Sfx.init(); Sfx.setMuted(!Sfx.muted); muteUi(); };
muteUi();
$('start').onclick = () => start(); $('again').onclick = () => start();
$('go').onclick = () => startClock();
$('briefBack').onclick = () => { G.over = true; show('title'); };
$('home').onclick = () => { G.over = true; G.running = false; Sfx.bedStop(); resetFx(); show('title'); };
$('bHow').onclick = () => show('how'); $('bCredits').onclick = () => show('credits');
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => show('title'));
$('codeChip').onclick = () => { const url = manualUrl(G.p.bombCode); drawQR($('qr2'), url); $('qrCode').textContent = G.p.bombCode; $('qrPop').classList.remove('hidden'); };
$('qrPop').onclick = () => $('qrPop').classList.add('hidden');
$('left').onclick = () => { Sfx.init(); rotate(-1); };
$('right').onclick = () => { Sfx.init(); rotate(1); };
$('bUp').onclick = () => { Sfx.init(); flip(1); };
$('bDown').onclick = () => { Sfx.init(); flip(-1); };
addEventListener('keydown', e => {
  if (e.key === 'm' || e.key === 'M') { Sfx.init(); Sfx.setMuted(!Sfx.muted); muteUi(); return; }
  if (G.over || !G.running) return;
  const dir = { ArrowLeft: 'w', ArrowRight: 'e', ArrowUp: 'n', ArrowDown: 's' }[e.key]; if (!dir) return;
  e.preventDefault();
  if (view() === 3 && !G.solved.aiguille && !e.shiftKey) return G.act.moveNeedle(dir);
  if (dir === 'w') rotate(-1); else if (dir === 'e') rotate(1); else if (dir === 'n') flip(1); else flip(-1);
});

// ---------- Toucher / glisser ----------
const drag = { down: false, axis: null };
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const canAct = () => !G.over && G.running && Math.abs(rotY - targetY) < 0.06 && Math.abs(pitch - targetP) < 0.06 && !drag.axis;
function hitFace(x, y) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(planes, false)[0];
  if (!hit) return null;
  const fi = hit.object.userData.faceIndex, f = faces[fi];
  return { fi, cx: hit.uv.x * f.W, cy: (1 - hit.uv.y) * f.H };
}
canvas.addEventListener('pointerdown', e => {
  Sfx.init(); if (G.over || !G.running) return;
  const h = canAct() ? hitFace(e.clientX, e.clientY) : null;
  const maze = !!(h && h.fi === 3 && view() === 3 && !G.solved.aiguille && F.inMaze(G, h.cx, h.cy));
  Object.assign(drag, { down: true, axis: null, maze, ax: e.clientX, ay: e.clientY, moved: false, x: e.clientX, y: e.clientY, baseY: targetY, baseP: targetP, id: e.pointerId });
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
});
canvas.addEventListener('pointermove', e => {
  if (!drag.down || e.pointerId !== drag.id) return;
  if (drag.maze) { // glisser sur le labyrinthe = déplacer la bille, jamais tourner la bombe
    const dx = e.clientX - drag.ax, dy = e.clientY - drag.ay;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= 34) {
      G.act.moveNeedle(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n'));
      drag.ax = e.clientX; drag.ay = e.clientY; drag.moved = true;
      if (G.over || G.solved.aiguille) drag.maze = false, drag.down = false;
    }
    return;
  }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) { drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'; if (drag.axis === 'y' && pitchIdx === 0) setSpin(); }
  // la bombe suit le doigt : glisser à gauche fait venir la face de droite ; glisser vers le bas fait venir le dessus
  if (drag.axis === 'x' && pitchIdx === 0) rotY = drag.baseY + THREE.MathUtils.clamp(dx * 0.007, -HALF * 0.95, HALF * 0.95);
  if (drag.axis === 'y') pitch = THREE.MathUtils.clamp(drag.baseP + dy * 0.007, -HALF, HALF);
});
function endDrag(e, cancel) {
  if (!drag.down || (e && e.pointerId !== drag.id)) return;
  drag.down = false;
  const dx = e ? e.clientX - drag.x : 0, dy = e ? e.clientY - drag.y : 0, axis = drag.axis; drag.axis = null;
  if (cancel) return;
  if (drag.maze) {
    drag.maze = false;
    if (!drag.moved && Math.max(Math.abs(dx), Math.abs(dy)) >= 18) G.act.moveNeedle(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n'));
    else if (!drag.moved) tapAt(e.clientX, e.clientY);
    return;
  }
  if (axis === 'x') { if (Math.abs(dx) > 45) rotate(dx < 0 ? 1 : -1); return; }
  if (axis === 'y') { if (Math.abs(dy) > 45) flip(dy > 0 ? 1 : -1); return; }
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) tapAt(e.clientX, e.clientY);
}
canvas.addEventListener('pointerup', e => endDrag(e, false));
canvas.addEventListener('pointercancel', e => endDrag(e, true));
function tapAt(x, y) {
  if (!canAct()) return;
  const h = hitFace(x, y); if (!h || h.fi !== planeOf(view())) return;
  const reg = faces[h.fi].regions.find(q => h.cx >= q.x && h.cx <= q.x + q.w && h.cy >= q.y && h.cy <= q.y + q.h);
  if (reg) reg.fn();
}
// point d'une face (coordonnées canvas) → écran ; sert aux tests automatisés
function toScreen(fi, cx, cy) {
  const [x, y] = toLocalXY(fi, cx, cy); scene.updateMatrixWorld();
  const pt = planes[fi].localToWorld(new THREE.Vector3(x, y, 0)).project(camera), r = canvas.getBoundingClientRect();
  return [r.left + (pt.x + 1) / 2 * r.width, r.top + (1 - pt.y) / 2 * r.height];
}

// ---------- Cadrage : la bombe tient entre le HUD et la barre de navigation ----------
const camBase = new THREE.Vector3(); let view0 = { x: 0, y: 0 };
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, prCap));
  camera.aspect = w / h;
  const hud = $('hud').getBoundingClientRect(), nav = $('nav').getBoundingClientRect(), land = w > h;
  const top = land ? 8 : Math.max(96, hud.bottom || 0) + 4, bottom = land ? h - 8 : Math.min(h - 96, nav.top || h) - 4;
  const left = land ? 146 : 4, right = land ? w - 146 : w - 4;
  const fw = (right - left) / w, fh = Math.max(0.3, (bottom - top) / h), t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const d = Math.max((BW + 0.4) / (2 * t * camera.aspect * fw), (BH + 0.45) / (2 * t * fh));
  camBase.set(0, 1.35, BD / 2 + d);
  view0 = { x: w / 2 - (left + right) / 2, y: h / 2 - (top + bottom) / 2 };
  camera.setViewOffset(w, h, view0.x, view0.y, w, h);
  camera.updateProjectionMatrix();
  fx.setScale(h, camera.fov, renderer.getPixelRatio());
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 120));

// ---------- Cinématiques ----------
function flash(op, ms) { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = String(op); requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = 'opacity ' + ms + 'ms ease-out'; f.style.opacity = '0'; })); }
const rnd = (a, b) => a + Math.random() * (b - a);
function cracks() {
  const svg = $('cracks'), w = innerWidth, h = innerHeight; let d = '';
  const cx = w * rnd(0.35, 0.65), cy = h * rnd(0.35, 0.6);
  for (let i = 0; i < 11; i++) { let a = (i / 11) * Math.PI * 2 + rnd(-0.2, 0.2), x = cx, y = cy; d += `M${cx},${cy}`;
    for (let k = 0; k < 6; k++) { a += rnd(-0.45, 0.45); const l = rnd(30, 90); x += Math.cos(a) * l; y += Math.sin(a) * l; d += `L${x.toFixed(0)},${y.toFixed(0)}`; } }
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.innerHTML = `<path d="${d}" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="5"/><path d="${d}" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="1.6"/>`;
  svg.style.opacity = '1';
}
const ledColor = new THREE.Color();
function setLeds(fn) { for (let i = 0; i < 12; i++) B.leds.setColorAt(i, ledColor.setHex(fn(i))); B.leds.instanceColor.needsUpdate = true; }
function doExplosion() {
  if (cine.exploded) return; cine.exploded = true; cine.tx = ft;
  rig.visible = false; if (lid.lid.parent === scene) lid.lid.visible = false;
  Sfx.bedStop(true); Sfx.bigBoom();
  if (navigator.vibrate) navigator.vibrate(RM ? 300 : [500, 80, 250, 80, 700, 120, 300]);
  flash(RM ? 0.5 : 1, RM ? 500 : 900); $('vignette').style.opacity = '1'; if (!RM) cracks();
  blastLight.intensity = 30; fx.explode(Q, camera);
}
function startCine(type) {
  G.over = true; G.won = type === 'win';
  cine = type === 'win' ? { type, t0: ft, dur: RM ? 2500 : 4600 } : { type, t0: ft, dur: RM ? 2300 : 4400, pre: RM ? 400 : 1300, from: G.remaining };
  $('skip').classList.remove('hidden'); $('nav').classList.add('hidden');
  if (type === 'win') {
    $('timer').classList.remove('urgent'); $('timer').classList.add('frozen');
    Sfx.bedStop(true); Sfx.powerDown(); setTimeout(() => cine && cine.type === 'win' && Sfx.jingle(), RM ? 500 : 1000);
    if (navigator.vibrate) navigator.vibrate([60, 60, 60, 60, 200]);
    fx.winConfetti(Q);
  } else {
    $('timer').classList.add('urgent'); Sfx.heartRush(cine.pre / 1000);
    if (RM) $('vignette').style.opacity = '.6';
  }
}
let loopCine = null; // mesure : rejoue la cinématique en boucle
function endCine() {
  if (!cine || cine.ended) return;
  if (cine.type === 'lose') doExplosion();
  cine.ended = true; $('skip').classList.add('hidden');
  if (loopCine) { const t = loopCine; setTimeout(() => { if (loopCine !== t) return; newGame(1); G.running = true; startCine(t); }, 400); return; }
  showEnd(cine.type === 'win');
}
$('skip').addEventListener('pointerdown', () => { if (cine && ft - cine.t0 > 350) endCine(); });
function resetFx() {
  fx.clear(); cine = null; rig.visible = true; lid.lid.visible = true;
  ['flash', 'vignette', 'cracks'].forEach(id => { $(id).style.transition = 'none'; $(id).style.opacity = '0'; });
  $('skip').classList.add('hidden'); $('timer').classList.remove('frozen');
  goldLight.intensity = 0; blastLight.intensity = 0;
  setLeds(() => 0xff2020);
}
const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const tmpC = new THREE.Color(), look = new THREE.Vector3(), shakeV = new THREE.Vector3();
function cineUpdate(dt) {
  const t = ft; camera.position.copy(camBase); look.set(0, -0.05, 0); let shake = 0;
  if (now() < shakeUntil && !RM) shake = 0.07;
  if (cine) {
    const e = Math.min(1, (t - cine.t0) / cine.dur);
    if (cine.type === 'win') {
      const k = ease(Math.min(1, (t - cine.t0) / (cine.dur * 1.15)));
      const ang = RM ? 0 : -2.1 * k, dist = camBase.z * (1 + (RM ? 0.15 : 0.55) * k), hgt = camBase.y + (RM ? 0.3 : 1.9) * k;
      camera.position.set(Math.sin(ang) * dist, hgt, Math.cos(ang) * dist); look.set(0, 0.25 * k, 0);
      setLeds(i => t - cine.t0 > 120 + i * 110 ? 0x00ff77 : 0xff2020);
      goldLight.intensity = Math.min(8, (t - cine.t0) / 200);
      scene.background.setHex(BG).lerp(tmpC.setHex(0x2a1c05), Math.min(1, (t - cine.t0) / 1500));
      if (t - cine.t0 < cine.dur * 0.75 && Math.random() < (RM ? 0.15 : 0.6)) fx.goldSpark(BH);
    } else {
      const te = t - cine.t0;
      if (!cine.exploded) {
        const k = te / cine.pre;
        G.displayMs = cine.from * (1 - k * k); $('timer').textContent = F.fmt(G.displayMs);
        $('vignette').style.opacity = String(RM ? 0.6 : k * 0.7);
        if (!RM) { shake = 0.01 + 0.05 * k; camera.position.multiplyScalar(1 - 0.12 * ease(k)); }
        setLeds(() => Math.sin(te / (90 - 60 * k)) > 0 ? 0xff0000 : 0x330000);
        redLight.intensity = 3 + 9 * k;
        if (te >= cine.pre) { G.displayMs = 0; $('timer').textContent = '0:00'; doExplosion(); }
      } else {
        const tx = (t - cine.tx) / 1000;
        if (!RM) { shake = Math.max(shake, 0.45 * Math.exp(-tx * 2.2)); camera.position.multiplyScalar(1 + 0.12 * Math.exp(-tx * 3) * Math.min(1, tx * 8)); }
        blastLight.intensity = 30 * Math.exp(-tx * 2.5); redLight.intensity = 0;
        scene.background.setHex(BG).lerp(tmpC.setHex(0x5a1a00), Math.exp(-tx * 1.5));
      }
    }
    if (e >= 1 && !cine.ended) endCine();
  }
  if (shake) camera.position.add(shakeV.set(rnd(-1, 1) * shake, rnd(-1, 1) * shake, rnd(-1, 1) * shake * 0.3));
  camera.lookAt(look);
}

// ---------- Boucle ----------
let last = now(), lightsT = 0, mazeT = 0, blinkPhase = -1;
const perf = { frames: 0, t0: now(), fps: 0, calls: 0, tris: 0 };
const fpsBox = qs.get('fps') === '1' ? $('perf') : null; if (fpsBox) fpsBox.classList.remove('hidden');
const hook = { ready: false, version: VERSION, mode: 'menu', hasTransmission: false, source: B.source, render: { calls: 0, triangles: 0, geometries: 0, textures: 0, heapMB: 0 }, renderer, scene, camera, car: null, unit: null, sizes: () => ({ mount: null }) };
function frame() {
  const t = now(), dt = Math.min(100, t - last); last = t; const s = dt / 1000;
  if (G.running && !G.over) {
    G.remaining -= dt;
    if (G.remaining <= 0) { G.remaining = 0; lose(); }
    const sec = Math.ceil(G.remaining / 1000);
    if (sec !== G.lastSec) { G.lastSec = sec; updateHud(); }
  }
  if (drag.axis !== 'x') rotY += (targetY - rotY) * Math.min(1, dt * 0.012);
  if (drag.axis !== 'y') pitch += (targetP - pitch) * Math.min(1, dt * 0.012);
  B.root.rotation.y = rotY + (G.over && G.won ? t * 0.0006 : 0);
  pitchG.rotation.x = pitch;
  stepPhysics(t, s);
  if (G.p) {
    const v = view();
    if (v === 2 && !G.duo && t - lightsT > 90) { faces[2].dirty = true; lightsT = t; }
    if ((v === 3 || !settled()) && !G.solved.aiguille && t - mazeT > (low ? 66 : 33)) { faces[3].dirty = true; mazeT = t; }
    if (G.p.seq) { const k = String(F.seqLit(G, t)); if (k !== faces[5].key) { faces[5].key = k; faces[5].dirty = true; } }
    faces.forEach(f => { if (f.dirty || f.animUntil > t) f.redraw(G); });
    const won = G.won && G.over, blinkOff = won && Math.floor(t / 300) % 2;
    B.led.draw(F.fmt(G.displayMs != null ? G.displayMs : G.remaining), G.p.bombCode, won ? (blinkOff ? '#0a3a1a' : '#00e676') : '#ff3b30');
    if (!cine) { const ph = G.over ? 0 : Math.floor(t / 320) % 2; if (ph !== blinkPhase) { blinkPhase = ph; setLeds(i => (G.over || ph === (i % 2)) ? 0xff2020 : 0x441010); redLight.intensity = G.over ? 0.6 : ph ? 3 : 1.2; } }
    wires.update(s); lid.update(s, scene, floorY);
  }
  ft += dt; fx.update(s, ft); cineUpdate(dt);
  dust.rotation.y += s * 0.02;
  if (!cine) { if (t < flashUntil) scene.background.setHex(0x3a0000); else scene.background.setHex(BG); }
  renderer.render(scene, camera);
  const ri = renderer.info.render; perf.calls = ri.calls; perf.tris = ri.triangles; perf.frames++;
  Object.assign(hook.render, { calls: ri.calls, triangles: ri.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : 0 });
  if (t - perf.t0 >= 500) {
    perf.fps = Math.round(perf.frames * 1000 / (t - perf.t0)); perf.frames = 0; perf.t0 = t;
    if (fpsBox) fpsBox.textContent = `${perf.fps} fps · ${perf.calls} appels · ${(perf.tris / 1000).toFixed(1)} k tri · palier ${gpu.tier}${low ? ' (bas)' : ''} · pr ${renderer.getPixelRatio()} · ${gpu.gpu}`;
  }
}

// ---------- Palier GPU (detect-gpu 5.0.70, bancs d'essai auto-hébergés) ----------
async function detectTier() {
  try {
    const benchmarksURL = new URL('../detect-gpu-benchmarks', import.meta.url).href;
    const r = await getGPUTier({ benchmarksURL });
    gpu = { tier: r.tier ?? 2, gpu: r.gpu || '?', type: r.type, fps: r.fps || 0 };
  } catch (e) { gpu = { tier: 2, gpu: '?', type: 'erreur', fps: 0 }; }
  if (forcedTier !== null) gpu.tier = forcedTier;
  if (gpu.tier <= 1 && !low) { // palier bas : pixelRatio 1, moins de particules, poussière réduite, labyrinthe à 15 i/s
    low = true; prCap = 1; Q *= 0.5; dust.visible = false; beam.visible = false; resize();
  }
}

// ---------- API de test et de mesure ----------
function setMode(m) {
  loopCine = null; resetFx(); hook.mode = m;
  if (m === 'menu') { G.over = true; G.running = false; Sfx.bedStop(); show('title'); return; }
  G.diff = G.diff || 'normal'; if (!G.p || G.over) newGame(1); G.running = true; G.over = false; show('game');
  const sides = { front: 0, right: 1, back: 2, left: 3 };
  if (m in sides) { pitchIdx = 0; targetP = 0; G.face = sides[m]; targetY = -sides[m] * HALF; }
  if (m === 'top' || m === 'bottom') { G.face = 0; targetY = 0; setSpin(); pitchIdx = m === 'top' ? 1 : -1; targetP = pitchIdx * HALF; }
  rotY = targetY; pitch = targetP; updateHud();
  if (m === 'boom' || m === 'win') { loopCine = m === 'boom' ? 'lose' : 'win'; startCine(loopCine); }
}
hook.setMode = setMode;
window.__c204 = hook; // nom attendu par /home/box/opt/perf3d/measure.mjs
window.D3 = {
  G, L, version: VERSION, toScreen, keyRect: F.keyRect, SCREWS: F.SCREWS, PAD: F.PAD, SWITCH: F.SWITCH, SW_OK: F.SW_OK, SEQ_BTN: F.SEQ_BTN, KEYS: F.KEYS,
  wireY: F.wireY, mazeGeom: F.mazeGeom, CW: F.CW, CH: F.CH, CT: F.CT, tilt, settled: () => settled() && !drag.axis,
  view: () => view(), pitchIdx: () => pitchIdx, start, startClock, setMode, perf: () => ({ ...perf, tier: gpu.tier, low, pr: renderer.getPixelRatio(), gpu: gpu.gpu }),
  cine: () => cine && { type: cine.type, ended: !!cine.ended, exploded: !!cine.exploded, t: ft - cine.t0 },
  wires: () => wires.hanging(), lid: () => ({ phase: lid.state.phase, y: +lid.lid.getWorldPosition(new THREE.Vector3()).y.toFixed(2) }),
  nodes: () => { const n = []; B.root.traverse(o => o.name && n.push(o.name)); return n; },
  audio: () => Sfx.ctx ? { state: Sfx.ctx.state, bed: !!Sfx.bed, muted: Sfx.muted } : null, fx: () => fx.counts()
};

resize();
show('title');
renderer.compile(scene, camera);
renderer.setAnimationLoop(frame);
detectTier().then(() => { hook.ready = true; document.body.classList.add('ready'); });
setTimeout(() => { hook.ready = true; document.body.classList.add('ready'); }, 4000); // detect-gpu ne doit jamais bloquer
$('loading').classList.add('hidden');
if (qs.get('autostart') === '1') start(qs.get('seed') ? +qs.get('seed') : undefined);

// ---------- Service worker (hors ligne, network-first pour le code) ----------
if ('serviceWorker' in navigator && qs.get('nosw') !== '1' && isSecureContext) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js?v=' + VERSION).catch(() => {}));
}
