// Désamorce! 3D — dessin des 6 faces sur des CanvasTexture et zones touchables (coordonnées canvas).
import * as THREE from 'three';
const L = window.DesamorceLogic;
export const CW = 400, CH = 520, CT = 400; // côtés 400x520, dessus/dessous 400x400 (unités logiques)
const hex = n => '#' + n.toString(16).padStart(6, '0');
const now = () => performance.now();
export const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// ---------- primitives ----------
export function rr(c, x, y, w, h, r, fill, stroke, lw = 2) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
export function tx(c, s, x, y, size, color = '#e8e8e8', bold = false, align = 'center', font = 'Arial, Helvetica, sans-serif') {
  c.font = (bold ? 'bold ' : '') + size + 'px ' + font; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle';
  c.fillText(s, x, y);
}
function wrap(c, s, x, y, size, maxW, color, bold) {
  c.font = (bold ? 'bold ' : '') + size + 'px Arial'; const words = s.split(' '); const lines = []; let line = '';
  words.forEach(w => { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
  lines.push(line);
  lines.forEach((l, i) => tx(c, l, x, y + (i - (lines.length - 1) / 2) * (size + 3), size, color, bold));
}
// plaque de module : métal sombre brossé, rivets, titre
function base(c, title, W, H) {
  const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2e333b'); g.addColorStop(1, '#1a1d22');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.globalAlpha = 0.06; for (let y = 0; y < H; y += 3) { c.fillStyle = (y / 3) % 2 ? '#fff' : '#000'; c.fillRect(0, y, W, 1); } c.globalAlpha = 1;
  c.strokeStyle = '#4a515c'; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6);
  [[40, 20], [W - 40, 20], [40, H - 14], [W - 40, H - 14]].forEach(([x, y]) => {
    const r = c.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 6); r.addColorStop(0, '#c8ced6'); r.addColorStop(1, '#4d535c');
    c.fillStyle = r; c.beginPath(); c.arc(x, y, 5.5, 0, 7); c.fill();
  });
  if (title) tx(c, title, W / 2, 22, 18, '#ffd54f', true);
}
function plate(c, s, W = CW, y = 455, h = 50) { rr(c, 32, y, W - 64, h, 6, '#c9b37a', '#7d6a3a'); wrap(c, s, W / 2, y + h / 2, 15, W - 84, '#2b230f', true); }
function led(c, on, x = CW - 46, y = 22) {
  c.beginPath(); c.arc(x, y, 9, 0, 7); c.fillStyle = on ? '#00e676' : '#550000'; c.fill();
  if (on) { c.globalAlpha = 0.35; c.beginPath(); c.arc(x, y, 15, 0, 7); c.fill(); c.globalAlpha = 1; }
  c.lineWidth = 2; c.strokeStyle = '#111'; c.beginPath(); c.arc(x, y, 9, 0, 7); c.stroke();
}
function manualTag(c, x, y, w, h, label) { // indice déplacé dans le manuel (mode duo)
  rr(c, x, y, w, h, 8, '#101318', '#ffb300', 2);
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.globalAlpha = 0.08; c.fillStyle = '#ffb300';
  for (let k = -h; k < w; k += 18) { c.beginPath(); c.moveTo(x + k, y + h); c.lineTo(x + k + h, y); c.lineTo(x + k + h + 8, y); c.lineTo(x + k + 8, y + h); c.fill(); }
  c.restore();
  tx(c, '📖 ' + label, x + w / 2, y + h / 2 - 9, 15, '#ffd54f', true);
  tx(c, 'demande au lecteur du manuel', x + w / 2, y + h / 2 + 11, 12, '#c9c0a0');
}

// ---------- géométrie des modules (partagée avec le jeu et les tests) ----------
export const wireY = (i, n) => n >= 6 ? 150 + i * 52 : 160 + i * 60;
export const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'EFF', '0', 'OK'];
export const keyRect = i => [40 + (i % 3) * 112, 132 + Math.floor(i / 3) * 78, 96, 66];
export const LID = { x: 60, y: 145, w: 280, h: 295 };
export const SCREWS = [[95, 180], [305, 180], [95, 405], [305, 405]];
export const PAD = { n: [155, 304, 90, 50, '▲'], w: [50, 358, 90, 50, '◀'], s: [155, 358, 90, 50, '▼'], e: [260, 358, 90, 50, '▶'] };
export const mazeGeom = size => { const cell = 256 / size; return { cell, ox: CW / 2 - 128, oy: 40, size }; };
export const SWITCH = i => [44 + i * 66, 170, 48, 96];          // levier i : x, y, w, h
export const SW_OK = [130, 300, 140, 36];
export const SEQ_BTN = { rouge: [62, 52, 128, 112], bleu: [210, 52, 128, 112], vert: [62, 180, 128, 112], jaune: [210, 180, 128, 112] };

export function createFace(W, H, res, draw) {
  const canvas = document.createElement('canvas'); canvas.width = Math.round(W * res); canvas.height = Math.round(H * res);
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const f = { W, H, canvas, ctx, tex, regions: [], dirty: true, animUntil: 0, key: '' };
  f.redraw = (G) => {
    ctx.setTransform(res, 0, 0, res, 0, 0); f.regions = [];
    draw(ctx, (x, y, w, h, fn, id) => f.regions.push({ x, y, w, h, fn, id }), G, now());
    tex.needsUpdate = true; f.dirty = false;
  };
  return f;
}

// ---------- Face 1 : Fils (les fils eux-mêmes sont en 3D) ----------
export function drawWires(c, reg, G, t) {
  const p = G.p, n = p.wires.length; base(c, 'FILS', CW, CH); led(c, G.solved.fils);
  rr(c, 70, 44, 260, 56, 4, '#f2efe6', '#999');
  tx(c, 'N° DE SÉRIE', CW / 2, 57, 11, '#555', true);
  tx(c, p.serial, CW / 2, 83, 27, '#111', true, 'center', '"Courier New", monospace');
  rr(c, 26, 115, CW - 52, 320, 10, '#121519');
  p.wires.forEach((id, i) => {
    const y = wireY(i, n), col = L.colorById(id);
    [[34, 22], [CW - 56, 22]].forEach(([x, w]) => { const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#9aa1ab'); g.addColorStop(1, '#5c626b'); c.fillStyle = g; c.fillRect(x, y - 12, w, 24); });
    c.fillStyle = hex(col.hex); c.fillRect(CW / 2 - 40, y - 33, 8, 8);
    tx(c, col.label + (G.cut.has(i) ? ' — coupé' : ''), CW / 2 + 4, y - 29, 12, G.cut.has(i) ? '#777' : '#cfcfcf', false, 'left');
    reg(30, y - 26, CW - 60, 50, () => G.act.cutWire(i), 'wire' + i);
  });
  plate(c, 'Coupe tous les fils dont la couleur correspond à un voyant ALLUMÉ.');
}

// ---------- Face 2 : Clavier ----------
export function drawKeypad(c, reg, G, t) {
  base(c, 'CLAVIER', CW, CH); led(c, G.solved.clavier);
  rr(c, 80, 46, 240, 66, 8, '#0b1a0b', '#2e7d32', 3);
  tx(c, (G.entry + '____').slice(0, 4).split('').join(' '), CW / 2, 80, 40, G.solved.clavier ? '#ffffff' : '#69f0ae', true, 'center', '"Courier New", monospace');
  KEYS.forEach((k, i) => {
    const [x, y, w, h] = keyRect(i), pressed = (G.keyFlash[k] || 0) > t;
    rr(c, x + 2, y + 5, w, h, 10, '#0c0e11');
    const fill = pressed ? '#6b717c' : k === 'OK' ? '#1b5e20' : k === 'EFF' ? '#5d4037' : '#3a3f48';
    rr(c, x, y + (pressed ? 3 : 0), w, h, 10, fill, '#7a828f');
    tx(c, k, x + w / 2, y + h / 2 + (pressed ? 3 : 0), k.length > 1 ? 20 : 30, '#fff', true);
    reg(x, y, w, h, () => G.act.pressKey(k), 'key' + k);
  });
  plate(c, G.duo ? 'Code : les 4 symboles sous le couvercle, traduits avec la légende du manuel.' : 'Code : les 4 symboles cachés, traduits avec la légende.');
}

// ---------- Face 3 : Panneau (voyants + symboles ; couvercle et vis en 3D) ----------
export function drawPanel(c, reg, G, t) {
  const p = G.p; base(c, 'PANNEAU', CW, CH); led(c, G.solved.panneau);
  if (G.duo) manualTag(c, 26, 38, CW - 52, 92, 'VOYANTS : dans le manuel');
  else {
    rr(c, 26, 38, CW - 52, 92, 10, '#121519');
    tx(c, 'VOYANTS', CW / 2, 50, 11, '#888', true);
    p.lights.forEach((l, i) => {
      const col = hex(L.colorById(l.color).hex), x = 72 + i * 85, y = 82;
      if (l.lit) { const a = 0.25 + 0.2 * Math.sin(t / (300 + i * 50)); c.globalAlpha = a; c.fillStyle = col; c.beginPath(); c.arc(x, y, 22, 0, 7); c.fill(); c.globalAlpha = 1; }
      c.globalAlpha = l.lit ? 1 : 0.2; c.fillStyle = col; c.beginPath(); c.arc(x, y, 13, 0, 7); c.fill();
      c.globalAlpha = l.lit ? 1 : 0.6; c.lineWidth = 3; c.strokeStyle = col; c.stroke(); c.globalAlpha = 1;
      tx(c, L.colorById(l.color).label + (l.lit ? '' : ' (éteint)'), x, y + 32, 11, l.lit ? '#fff' : '#777');
    });
  }
  const { x: px, y: py, w: pw, h: ph } = LID;
  rr(c, px, py, pw, ph, 8, '#0b0d10', '#2a2e35', 3);
  tx(c, 'SYMBOLES', CW / 2, py + 50, 13, '#888', true);
  tx(c, p.panelSymbols.join('  '), CW / 2, py + 140, 54, '#ffd54f');
  tx(c, '(dans l’ordre, de gauche à droite)', CW / 2, py + 230, 13, '#aaa');
  SCREWS.forEach(([x, y], i) => { if (!G.screwGone[i + 1]) reg(x - 38, y - 38, 76, 76, () => G.act.unscrew(i + 1), 'screw' + (i + 1)); });
  plate(c, 'Dévisse dans l’ordre des chiffres du numéro de série.');
}
// texture du couvercle (dessinée une fois)
export function drawLidTexture(res) {
  const { w, h } = LID, cv = document.createElement('canvas'); cv.width = w * res; cv.height = h * res;
  const c = cv.getContext('2d'); c.setTransform(res, 0, 0, res, 0, 0);
  const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#8a919b'); g.addColorStop(1, '#5d636c'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(30,32,36,.35)'; c.lineWidth = 1; for (let k = 1; k < 10; k++) { c.beginPath(); c.moveTo(10, k * 29); c.lineTo(w - 10, k * 29); c.stroke(); }
  c.save(); c.beginPath(); c.rect(0, h / 2 - 22, w, 44); c.clip(); c.fillStyle = '#f2c230'; c.fillRect(0, h / 2 - 22, w, 44);
  c.fillStyle = '#1b1b1b'; for (let k = -44; k < w; k += 28) { c.beginPath(); c.moveTo(k, h / 2 + 22); c.lineTo(k + 44, h / 2 - 22); c.lineTo(k + 58, h / 2 - 22); c.lineTo(k + 14, h / 2 + 22); c.fill(); } c.restore();
  rr(c, w / 2 - 92, h / 2 - 15, 184, 30, 4, '#f2c230', '#1b1b1b');
  tx(c, 'NE PAS OUVRIR', w / 2, h / 2, 17, '#1b1b1b', true);
  SCREWS.forEach(([x, y], i) => tx(c, String(i + 1), x - LID.x + (i % 2 ? -40 : 40), y - LID.y + (i < 2 ? 28 : -28), 18, '#1b1e23', true));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- Face 4 : Aiguille (labyrinthe dans le noir) ----------
export function wallsHidden(G, t) { return G.D.blackout > 0 && !G.solved.aiguille && (t % G.D.blackout) > G.D.blackout - 750; }
export function inMaze(G, cx, cy) { const M = mazeGeom(G.p.maze.size), n = 256; return cx >= M.ox - 8 && cx <= M.ox + n + 8 && cy >= M.oy - 8 && cy <= M.oy + n + 8; }
export function drawMaze(c, reg, G, t) {
  const m = G.p.maze, M = mazeGeom(m.size), cell = M.cell, n = 256, ox = M.ox, oy = M.oy;
  base(c, 'AIGUILLE', CW, CH); led(c, G.solved.aiguille);
  c.fillStyle = '#0d1b2a'; c.fillRect(ox - 6, oy - 6, n + 12, n + 12);
  const cx = x => ox + x * cell + cell / 2, cy = y => oy + y * cell + cell / 2;
  const nx = cx(G.needle[0]), ny = cy(G.needle[1]);
  const hidden = wallsHidden(G, t), hit = G.mazeFlash > t;
  if (!hidden) {
    c.strokeStyle = hit ? '#ff5252' : '#90caf9'; c.lineWidth = 4; c.lineCap = 'round';
    const line = (a, b, d, e) => { c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke(); };
    for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) {
      const w = m.walls[y][x], X = ox + x * cell, Y = oy + y * cell;
      if (w.n) line(X, Y, X + cell, Y); if (w.w) line(X, Y, X, Y + cell);
      if (y === m.size - 1 && w.s) line(X, Y + cell, X + cell, Y + cell);
      if (x === m.size - 1 && w.e) line(X + cell, Y, X + cell, Y + cell);
    }
  }
  if (!G.solved.aiguille) {
    const blink = G.D.blackout && (t % G.D.blackout) > G.D.blackout - 1000 && !hidden ? (Math.random() < 0.5 ? 0.75 : 1) : 1;
    const R = G.D.lightR * cell * blink;
    c.save(); c.beginPath(); c.rect(ox - 6, oy - 6, n + 12, n + 12); c.clip();
    const g = c.createRadialGradient(nx, ny, R * 0.35, nx, ny, R);
    g.addColorStop(0, 'rgba(3,6,10,0)'); g.addColorStop(1, 'rgba(3,6,10,0.97)');
    c.fillStyle = g; c.fillRect(ox - 6, oy - 6, n + 12, n + 12); c.restore();
    c.strokeStyle = 'rgba(144,202,249,.35)'; c.lineWidth = 2; c.strokeRect(ox - 1, oy - 1, n + 2, n + 2);
  }
  if (hit) { c.fillStyle = 'rgba(255,0,0,' + (0.4 * (G.mazeFlash - t) / 450).toFixed(2) + ')'; c.fillRect(ox - 6, oy - 6, n + 12, n + 12); }
  const pulse = 1 + 0.12 * Math.sin(t / 180);
  c.globalAlpha = 0.35; c.fillStyle = G.solved.aiguille ? '#00e676' : '#ff5252';
  c.beginPath(); c.arc(cx(m.goal[0]), cy(m.goal[1]), 14 * pulse, 0, 7); c.fill(); c.globalAlpha = 1;
  tx(c, '⚑', cx(m.goal[0]), cy(m.goal[1]), 24, G.solved.aiguille ? '#00e676' : '#ff5252');
  const sp = Math.hypot(G.nv[0], G.nv[1]);
  c.save(); c.translate(nx, ny); c.rotate(Math.atan2(G.nv[1], G.nv[0])); c.scale(1 + Math.min(0.25, sp * 0.03), 1 - Math.min(0.15, sp * 0.02));
  c.beginPath(); c.arc(0, 0, 10, 0, 7); c.fillStyle = '#ffd54f'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#ff6f00'; c.stroke();
  c.restore();
  c.beginPath(); c.arc(nx - 3, ny - 3, 3, 0, 7); c.fillStyle = 'rgba(255,255,255,.8)'; c.fill();
  if (hidden) tx(c, '⚡ panne de lumière ⚡', CW / 2, oy + n + 1, 11, '#ffd54f', true);
  if (G.solved.aiguille) {
    if (G.duo) { tx(c, 'AIGUILLE DÉSAMORCÉE', CW / 2, 340, 18, '#69f0ae', true); tx(c, 'La légende est dans le manuel.', CW / 2, 372, 14, '#ccc'); }
    else {
      tx(c, 'LÉGENDE', CW / 2, 318, 14, '#fff', true);
      const items = G.p.legend.map(l => l.symbol + ' = ' + l.digit);
      tx(c, items.slice(0, 3).join('     '), CW / 2, 348, 21, '#fff', true);
      tx(c, items.slice(3).join('     '), CW / 2, 380, 21, '#fff', true);
    }
  } else Object.entries(PAD).forEach(([d, [x, y, w, h, s]]) => {
    const pressed = (G.padFlash[d] || 0) > t;
    rr(c, x + 2, y + 4, w, h, 10, '#0c0e11');
    rr(c, x, y + (pressed ? 2 : 0), w, h, 10, pressed ? '#455a64' : '#263238', '#7a828f'); tx(c, s, x + w / 2, y + h / 2 + (pressed ? 2 : 0), 26, '#fff', true);
    reg(x, y, w, h, () => G.act.moveNeedle(d), 'pad' + d);
  });
  plate(c, G.solved.aiguille ? (G.duo ? 'Bravo. Le clavier attend le code.' : 'Légende débloquée : sers-t’en au clavier.') : G.duo ? 'Dans le noir : le lecteur a la carte du labyrinthe. Un mur = erreur.' : 'Dans le noir : glisse sur le labyrinthe ou utilise la croix. Un mur = erreur.');
}

// ---------- Dessus : écran DEL (nœud 3D Bomb_LED posé dessus) + Interrupteurs + table de séquence ----------
export function drawTop(c, reg, G, t) {
  base(c, '', CT, CT);
  rr(c, 30, 14, CT - 60, 118, 12, '#0b0c0e', '#3b4048', 3); // logement de l'écran DEL
  const hasSw = G.p.modules.includes('interrupteurs');
  if (hasSw) { tx(c, 'Lève : somme = TENSION', 34, 146, 13, '#cfd3d8', true, 'left'); tx(c, G.p.bombCode, CT - 34, 146, 14, '#ffb300', true, 'right', '"Courier New", monospace'); }
  else tx(c, 'BOMBE ' + G.p.bombCode, CT / 2, 146, 15, '#ffb300', true, 'center', '"Courier New", monospace');
  if (!hasSw) {
    rr(c, 50, 178, CT - 100, 150, 10, '#c9b37a', '#7d6a3a');
    tx(c, 'MODÈLE ACME-4', CT / 2, 214, 22, '#2b230f', true);
    tx(c, 'Niveau facile : pas de module', CT / 2, 252, 15, '#3b3220', true);
    tx(c, 'sur le dessus ni le dessous.', CT / 2, 274, 15, '#3b3220', true);
    tx(c, 'Jeu fictif · aucune vraie bombe', CT / 2, 306, 12, '#5b5240');
    return;
  }
  led(c, G.solved.interrupteurs, CT - 44, 164);
  tx(c, 'INTERRUPTEURS', 44, 164, 14, '#ffd54f', true, 'left');
  for (let i = 0; i < 5; i++) {
    const [x, y, w, h] = SWITCH(i), up = G.sw[i];
    rr(c, x + 6, y + 10, w - 12, h - 30, 8, '#08090b', '#555c66', 2);
    const k = G.swAnim[i] ? Math.min(1, (t - G.swAnim[i]) / 140) : 1, pos = up ? k : 1 - k; // 1 = levé
    const ly = y + 18 + (1 - pos) * (h - 52);
    const g = c.createLinearGradient(x, ly, x + w, ly + 22); g.addColorStop(0, '#e6e9ee'); g.addColorStop(1, '#8b939e');
    rr(c, x + 10, ly, w - 20, 22, 5, null); c.fillStyle = g; c.fill(); c.strokeStyle = '#2b2f36'; c.lineWidth = 2; c.stroke();
    tx(c, up ? 'HAUT' : 'BAS', x + w / 2, y + h - 12, 10, up ? '#69f0ae' : '#8a9099', true);
    tx(c, String(G.p.switchValues[i]), x + w / 2, y + h + 12, 18, '#fff', true);
    reg(x, y, w, h, () => G.act.toggleSwitch(i), 'sw' + i);
  }
  const [bx, by, bw, bh] = SW_OK, pressed = (G.keyFlash.swok || 0) > t;
  rr(c, bx, by + (pressed ? 2 : 0), bw, bh, 8, G.solved.interrupteurs ? '#1b5e20' : '#5d1a1a', '#cfa', 2);
  tx(c, G.solved.interrupteurs ? '✓ VALIDÉ' : 'VALIDER', bx + bw / 2, by + bh / 2 + (pressed ? 2 : 0), 16, '#fff', true);
  if (!G.solved.interrupteurs) reg(bx, by, bw, bh, () => G.act.submitSwitches(), 'swok');
  // table de correspondance pour la séquence (dessous)
  if (G.duo) { manualTag(c, 26, 342, CT - 52, 50, 'TABLE DE SÉQUENCE : manuel'); return; }
  rr(c, 26, 342, CT - 52, 50, 8, '#121519');
  tx(c, 'SÉQUENCE : clignote → appuie', CT / 2, 352, 10, '#999', true);
  L.SEQ_COLORS.forEach((col, i) => {
    const x = 66 + i * 84, y = 375, to = L.colorById(G.p.seqMap[col.id]);
    c.fillStyle = hex(col.hex); c.beginPath(); c.arc(x - 18, y, 10, 0, 7); c.fill();
    tx(c, '→', x, y, 16, '#ddd', true);
    c.fillStyle = hex(to.hex); c.fillRect(x + 10, y - 10, 20, 20);
  });
}

// ---------- Dessous : module Séquence + étiquette (tension, code) ----------
export function seqLit(G, t) { // couleur allumée par la lecture en boucle (null entre deux)
  if (G.solved.sequence || !G.p.seq) return null;
  if (t - G.seqLastPress < 2600) return null; // pause pendant que le joueur entre la réponse
  const L0 = G.p.seq.length, step = 600, cycle = L0 * step + 1500, k = (t - G.seqT0) % cycle;
  const i = Math.floor(k / step);
  return i < L0 && (k % step) < 420 ? G.p.seq[i] : null;
}
export function drawBottom(c, reg, G, t) {
  base(c, '', CT, CT);
  const has = G.p.modules.includes('sequence');
  if (!has) {
    rr(c, 50, 70, CT - 100, 240, 12, '#e9e4d6', '#8a826c', 3);
    tx(c, 'ÉTIQUETTE', CT / 2, 104, 14, '#555', true);
    tx(c, G.p.bombCode, CT / 2, 160, 44, '#111', true, 'center', '"Courier New", monospace');
    tx(c, 'code de la bombe', CT / 2, 200, 14, '#444');
    tx(c, G.duo ? 'Lecteur : manuel.html → ce code' : 'Mode duo : un lit le manuel,', CT / 2, 246, 14, '#333', true);
    tx(c, G.duo ? '' : 'l’autre désamorce.', CT / 2, 268, 14, '#333', true);
    return;
  }
  tx(c, 'SÉQUENCE', 44, 22, 16, '#ffd54f', true, 'left'); led(c, G.solved.sequence, CT - 44, 24);
  tx(c, 'Appuie la couleur que donne la table du dessus', CT / 2, 41, 11, '#cfd3d8');
  const lit = seqLit(G, t);
  Object.entries(SEQ_BTN).forEach(([id, [x, y, w, h]]) => {
    const col = L.colorById(id), on = lit === id || (G.seqFlash[id] || 0) > t;
    rr(c, x + 3, y + 6, w, h, 14, '#0a0b0d');
    if (on) { c.save(); c.shadowColor = hex(col.hex); c.shadowBlur = 30; rr(c, x, y, w, h, 14, hex(col.hex)); c.restore(); }
    else { rr(c, x, y, w, h, 14, hex(col.hex)); c.fillStyle = 'rgba(0,0,0,.55)'; rr(c, x, y, w, h, 14, 'rgba(0,0,0,.55)'); }
    c.strokeStyle = on ? '#fff' : '#3a3f48'; c.lineWidth = 3; rr(c, x, y, w, h, 14, null, on ? '#fff' : '#3a3f48', 3);
    tx(c, col.label.toUpperCase(), x + w / 2, y + h / 2, 15, on ? '#111' : 'rgba(255,255,255,.75)', true);
    if (!G.solved.sequence) reg(x, y, w, h, () => G.act.pressSeq(id), 'seq' + id);
  });
  const L0 = G.p.seq.length;
  for (let i = 0; i < L0; i++) { c.beginPath(); c.arc(CT / 2 - (L0 - 1) * 13 + i * 26, 312, 7, 0, 7); c.fillStyle = G.solved.sequence || i < G.seqIn ? '#00e676' : '#2a2f36'; c.fill(); }
  if (G.duo) manualTag(c, 26, 330, CT - 52, 58, 'TENSION : dans le manuel');
  else {
    rr(c, 26, 330, CT - 52, 58, 8, '#e9e4d6', '#8a826c', 2);
    tx(c, 'TENSION : ' + G.p.switchTarget + ' V', CT / 2, 350, 20, '#111', true, 'center', '"Courier New", monospace');
    tx(c, 'BOMBE ' + G.p.bombCode, CT / 2, 374, 13, '#444', true, 'center', '"Courier New", monospace');
  }
}
