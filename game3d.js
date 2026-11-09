/* Désamorce! 3D — Three.js, modules dessinés sur des CanvasTexture, touches par raycast. Tout est fictif. */
(function () {
  'use strict';
  const L = window.DesamorceLogic;
  const START_MS = 5 * 60 * 1000, PENALTY_MS = 30 * 1000, MAX_STRIKES = 3;
  const FACES = ['Fils', 'Clavier', 'Panneau', 'Aiguille'];
  const CW = 400, CH = 520, RES = 1.6; // taille logique d'une face, densité de la texture
  const BW = 2, BH = 2.6, BD = 2;     // dimensions de la bombe
  const HALF = Math.PI / 2;
  const $ = id => document.getElementById(id);
  const hex = n => '#' + n.toString(16).padStart(6, '0');
  const now = () => performance.now();

  // ---------- Son ----------
  const Sfx = {
    ctx: null,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
    },
    tone(freq, dur, type = 'square', vol = 0.06, slide = 0) {
      const c = this.ctx; if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur + 0.02);
    },
    tick(fast) { this.tone(fast ? 1400 : 1000, 0.03, 'square', 0.035); },
    click() { this.tone(600, 0.04, 'triangle', 0.08); },
    good() { this.tone(880, 0.09, 'sine', 0.1); setTimeout(() => this.tone(1320, 0.12, 'sine', 0.1), 90); },
    bad() { this.tone(160, 0.35, 'sawtooth', 0.12, -80); },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'sine', 0.12), i * 120)); },
    thump(t, v = 0.5) {
      const c = this.ctx; if (!c) return;
      [[62, 0], [48, 0.16]].forEach(([f, d]) => {
        const o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
        o.frequency.setValueAtTime(f, t + d); o.frequency.exponentialRampToValueAtTime(30, t + d + 0.18);
        g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(v, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
        o.connect(g).connect(c.destination); o.start(t + d); o.stop(t + d + 0.25);
      });
    },
    beepAt(t, f, d = 0.05, v = 0.07) {
      const c = this.ctx; if (!c) return;
      const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.02);
    },
    heartRush(sec) { // battements + bips qui s'accélèrent
      const c = this.ctx; if (!c) return; let t = c.currentTime, gap = 0.34, k = 0;
      while (t < c.currentTime + sec) { this.beepAt(t, 1500 + k * 60); if (k % 2 === 0) this.thump(t, 0.6); t += gap; gap = Math.max(0.05, gap * 0.8); k++; }
    },
    bigBoom() {
      const c = this.ctx; if (!c) return; const t = c.currentTime;
      const comp = c.createDynamicsCompressor(); comp.connect(c.destination);
      const len = c.sampleRate * 3, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(150, t + 2.5);
      g.gain.value = 1.1; n.buffer = buf; n.connect(f).connect(g).connect(comp); n.start(t);
      const o = c.createOscillator(), og = c.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(22, t + 2);
      og.gain.setValueAtTime(1, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      o.connect(og).connect(comp); o.start(t); o.stop(t + 2.5);
      // crépitements
      for (let i = 0; i < 14; i++) this.beepAt(t + 0.2 + Math.random() * 1.6, 80 + Math.random() * 200, 0.03, 0.05);
    },
    powerDown() {
      const c = this.ctx; if (!c) return; const t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.9);
      g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + 1);
    },
    jingle() {
      const c = this.ctx; if (!c) return; const t = c.currentTime;
      const note = (f, at, d, v = 0.09, type = 'triangle') => {
        const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(v, t + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + at + d);
        o.connect(g).connect(c.destination); o.start(t + at); o.stop(t + at + d + 0.05);
      };
      [[392, 0], [523, 0.14], [659, 0.28], [784, 0.42], [659, 0.6], [784, 0.72]].forEach(([f, a]) => { note(f, a, 0.2); note(f * 2, a, 0.12, 0.03, 'sine'); });
      [523, 659, 784, 1047].forEach(f => { note(f, 0.92, 1.4, 0.07); note(f / 2, 0.92, 1.4, 0.04, 'sine'); });
    },
    boom() {
      const c = this.ctx; if (!c) return;
      const len = c.sampleRate * 1.6, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'lowpass'; f.frequency.value = 700; g.gain.value = 0.6;
      s.buffer = buf; s.connect(f).connect(g).connect(c.destination); s.start();
    }
  };
  const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // ---------- Dessin 2D ----------
  function rr(c, x, y, w, h, r, fill, stroke, lw = 2) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
  }
  function tx(c, s, x, y, size, color = '#e8e8e8', bold = false, align = 'center', font = 'Arial, Helvetica, sans-serif') {
    c.font = (bold ? 'bold ' : '') + size + 'px ' + font; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle';
    c.fillText(s, x, y);
  }
  function wrap(c, s, x, y, size, maxW, color, bold) {
    c.font = (bold ? 'bold ' : '') + size + 'px Arial'; const words = s.split(' '); const lines = []; let line = '';
    words.forEach(w => { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    lines.push(line);
    lines.forEach((l, i) => tx(c, l, x, y + (i - (lines.length - 1) / 2) * (size + 3), size, color, bold));
  }
  function base(c, title) {
    const g = c.createLinearGradient(0, 0, CW, CH); g.addColorStop(0, '#2c3139'); g.addColorStop(1, '#1c2026');
    c.fillStyle = g; c.fillRect(0, 0, CW, CH);
    c.strokeStyle = '#4a515c'; c.lineWidth = 6; c.strokeRect(3, 3, CW - 6, CH - 6);
    c.fillStyle = '#5c6470';
    [[40, 20], [CW - 40, 20], [40, CH - 14], [CW - 40, CH - 14]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); });
    tx(c, title, CW / 2, 22, 18, '#ffd54f', true);
  }
  function plate(c, s) { rr(c, 32, 455, CW - 64, 50, 6, '#c9b37a', '#7d6a3a'); wrap(c, s, CW / 2, 480, 15, CW - 84, '#2b230f', true); }
  function led(c, on, x = CW - 46, y = 22) {
    c.beginPath(); c.arc(x, y, 9, 0, 7); c.fillStyle = on ? '#00e676' : '#550000'; c.fill();
    c.lineWidth = 2; c.strokeStyle = '#111'; c.stroke();
  }

  // ---------- État ----------
  const G = { p: null, running: false, over: true };
  function newGame() {
    G.p = L.generate();
    Object.assign(G, {
      remaining: START_MS, strikes: 0, over: false, running: true, face: 0,
      solved: { fils: false, clavier: false, panneau: false, aiguille: false },
      cut: new Set(), screwStep: 0, screwAnim: {}, lidStart: 0, entry: '', keyFlash: {},
      pos: G.p.maze.start.slice(), needle: G.p.maze.start.slice(), bump: null, lastSec: 300
    });
    rotY = 0; targetY = 0;
    G.displayMs = null; resetFx(); bomb.position.set(0, 0, 0);
    faces.forEach(f => f.dirty = true);
    updateHud();
  }

  // ---------- Faces ----------
  function makeFace(draw) {
    const canvas = document.createElement('canvas'); canvas.width = CW * RES; canvas.height = CH * RES;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
    const f = { canvas, ctx, tex, regions: [], dirty: true, animUntil: 0 };
    f.redraw = () => {
      ctx.setTransform(RES, 0, 0, RES, 0, 0); f.regions = [];
      draw(ctx, (x, y, w, h, fn) => f.regions.push({ x, y, w, h, fn }));
      tex.needsUpdate = true; f.dirty = false;
    };
    return f;
  }

  function drawWires(c, reg) {
    const p = G.p; base(c, 'FILS'); led(c, G.solved.fils);
    rr(c, 70, 44, 260, 56, 4, '#f5f5f5', '#999');
    tx(c, 'N° DE SÉRIE', CW / 2, 57, 11, '#555', true);
    tx(c, p.serial, CW / 2, 83, 27, '#111', true, 'center', '"Courier New", monospace');
    rr(c, 26, 115, CW - 52, 320, 10, '#15181d');
    p.wires.forEach((id, i) => {
      const col = L.colorById(id), y = 160 + i * 60, cut = G.cut.has(i);
      c.fillStyle = '#8d939c'; c.fillRect(34, y - 12, 22, 24); c.fillRect(CW - 56, y - 12, 22, 24);
      c.lineCap = 'round'; c.lineWidth = 12; c.strokeStyle = hex(col.hex);
      if (!cut) {
        c.beginPath(); c.moveTo(56, y);
        for (let k = 1; k <= 24; k++) c.lineTo(56 + k * 12, y + Math.sin(k * 0.7 + i) * 6);
        c.stroke();
      } else {
        c.beginPath(); c.moveTo(56, y); c.lineTo(180, y + 10); c.stroke();
        c.beginPath(); c.moveTo(220, y + 10); c.lineTo(CW - 56, y); c.stroke();
        c.fillStyle = '#d4a017'; c.beginPath(); c.arc(180, y + 10, 4, 0, 7); c.arc(220, y + 10, 4, 0, 7); c.fill();
      }
      tx(c, col.label, CW / 2, y - 22, 13, '#cfcfcf');
      reg(30, y - 28, CW - 60, 54, () => cutWire(i));
    });
    plate(c, 'Coupe tous les fils dont la couleur correspond à un voyant ALLUMÉ.');
  }

  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'EFF', '0', 'OK'];
  const keyRect = i => [40 + (i % 3) * 112, 132 + Math.floor(i / 3) * 78, 96, 66];
  function drawKeypad(c, reg) {
    base(c, 'CLAVIER'); led(c, G.solved.clavier);
    rr(c, 80, 46, 240, 66, 8, '#0b1a0b', '#2e7d32', 3);
    tx(c, (G.entry + '____').slice(0, 4).split('').join(' '), CW / 2, 80, 40, G.solved.clavier ? '#ffffff' : '#69f0ae', true, 'center', '"Courier New", monospace');
    KEYS.forEach((k, i) => {
      const [x, y, w, h] = keyRect(i);
      const pressed = (G.keyFlash[k] || 0) > now();
      const fill = pressed ? '#6b717c' : k === 'OK' ? '#1b5e20' : k === 'EFF' ? '#5d4037' : '#3a3f48';
      rr(c, x, y + (pressed ? 3 : 0), w, h, 10, fill, '#7a828f');
      tx(c, k, x + w / 2, y + h / 2 + (pressed ? 3 : 0), k.length > 1 ? 20 : 30, '#fff', true);
      reg(x, y, w, h, () => pressKey(k));
    });
    plate(c, 'Code : les 4 symboles cachés, traduits avec la légende.');
  }

  const SCREWS = [[95, 180], [305, 180], [95, 405], [305, 405]];
  function drawPanel(c, reg) {
    const p = G.p, t = now(); base(c, 'PANNEAU'); led(c, G.solved.panneau);
    rr(c, 26, 38, CW - 52, 92, 10, '#15181d');
    tx(c, 'VOYANTS', CW / 2, 50, 11, '#888', true);
    p.lights.forEach((l, i) => {
      const col = hex(L.colorById(l.color).hex), x = 72 + i * 85, y = 82;
      if (l.lit) {
        const a = 0.25 + 0.2 * Math.sin(t / (300 + i * 50));
        c.globalAlpha = a; c.fillStyle = col; c.beginPath(); c.arc(x, y, 22, 0, 7); c.fill(); c.globalAlpha = 1;
      }
      c.globalAlpha = l.lit ? 1 : 0.2; c.fillStyle = col; c.beginPath(); c.arc(x, y, 13, 0, 7); c.fill();
      c.globalAlpha = l.lit ? 1 : 0.6; c.lineWidth = 3; c.strokeStyle = col; c.stroke(); c.globalAlpha = 1;
      tx(c, L.colorById(l.color).label + (l.lit ? '' : ' (éteint)'), x, y + 32, 11, l.lit ? '#fff' : '#777');
    });
    const px = 60, py = 145, pw = 280, ph = 295;
    rr(c, px, py, pw, ph, 8, '#0d0f12');
    tx(c, 'SYMBOLES', CW / 2, py + 50, 13, '#888', true);
    tx(c, p.panelSymbols.join('  '), CW / 2, py + 140, 54, '#ffd54f');
    tx(c, '(dans l’ordre, de gauche à droite)', CW / 2, py + 230, 13, '#aaa');
    const lidT = G.lidStart ? Math.min(1, (t - G.lidStart) / 700) : 0;
    if (lidT < 1) {
      c.save(); c.globalAlpha = 1 - lidT; c.translate(0, lidT * lidT * 260);
      rr(c, px, py, pw, ph, 8, '#7b828c', '#50565f', 3);
      c.strokeStyle = 'rgba(154,161,171,.5)'; c.lineWidth = 1;
      for (let k = 1; k < 10; k++) { c.beginPath(); c.moveTo(px + 10, py + k * 29); c.lineTo(px + pw - 10, py + k * 29); c.stroke(); }
      tx(c, '⚠ NE PAS OUVRIR ⚠', CW / 2, py + ph / 2, 18, '#2b2f36', true);
      SCREWS.forEach(([x, y], i) => {
        const n = i + 1, st = G.screwAnim[n];
        tx(c, String(n), x + (i % 2 ? -40 : 40), y + (i < 2 ? 28 : -28), 17, '#1b1e23', true);
        const a = st ? Math.min(1, (t - st) / 450) : 0;
        if (a >= 1) return;
        c.save(); c.translate(x, y); c.rotate(a * 9.4 + (n % 2) * 0.8); c.scale(1 - a * 0.6, 1 - a * 0.6); c.globalAlpha *= 1 - a;
        c.beginPath(); c.arc(0, 0, 23, 0, 7); c.fillStyle = '#b0b6bf'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#50565f'; c.stroke();
        c.fillStyle = '#50565f'; c.fillRect(-14, -3, 28, 6);
        c.restore();
        if (!st) reg(x - 38, y - 38, 76, 76, () => unscrew(n));
      });
      c.restore();
    }
    plate(c, 'Dévisse dans l’ordre des chiffres du numéro de série.');
  }

  const PAD = { n: [160, 349, 80, 46, '▲'], w: [64, 401, 80, 46, '◀'], s: [160, 401, 80, 46, '▼'], e: [256, 401, 80, 46, '▶'] };
  function drawMaze(c, reg) {
    const m = G.p.maze, cell = 44, ox = CW / 2 - (m.size * cell) / 2, oy = 46;
    base(c, 'AIGUILLE'); led(c, G.solved.aiguille);
    c.fillStyle = '#0d1b2a'; c.fillRect(ox - 6, oy - 6, m.size * cell + 12, m.size * cell + 12);
    c.strokeStyle = '#90caf9'; c.lineWidth = 4; c.lineCap = 'round';
    const line = (a, b, d, e) => { c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); c.stroke(); };
    for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) {
      const w = m.walls[y][x], X = ox + x * cell, Y = oy + y * cell;
      if (w.n) line(X, Y, X + cell, Y); if (w.w) line(X, Y, X, Y + cell);
      if (y === m.size - 1 && w.s) line(X, Y + cell, X + cell, Y + cell);
      if (x === m.size - 1 && w.e) line(X + cell, Y, X + cell, Y + cell);
    }
    const cx = x => ox + x * cell + cell / 2, cy = y => oy + y * cell + cell / 2;
    tx(c, '⚑', cx(m.goal[0]), cy(m.goal[1]), 30, G.solved.aiguille ? '#00e676' : '#ff5252');
    // aiguille animée
    G.needle[0] += (G.pos[0] - G.needle[0]) * 0.35; G.needle[1] += (G.pos[1] - G.needle[1]) * 0.35;
    let bx = 0, by = 0;
    if (G.bump && now() < G.bump.until) { const k = Math.sin((G.bump.until - now()) / 120 * Math.PI) * 8; bx = G.bump.d[0] * k; by = G.bump.d[1] * k; }
    c.beginPath(); c.arc(cx(G.needle[0]) + bx, cy(G.needle[1]) + by, 13, 0, 7); c.fillStyle = '#ffd54f'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#ff6f00'; c.stroke();
    if (G.solved.aiguille) {
      tx(c, 'LÉGENDE', CW / 2, 288, 14, '#fff', true);
      const items = G.p.legend.map(l => l.symbol + ' = ' + l.digit);
      tx(c, items.slice(0, 3).join('     '), CW / 2, 310, 19, '#fff', true);
      tx(c, items.slice(3).join('     '), CW / 2, 333, 19, '#fff', true);
    } else {
      tx(c, 'LÉGENDE VERROUILLÉE', CW / 2, 290, 15, '#90a4ae', true);
      tx(c, 'Amène l’aiguille au drapeau ⚑', CW / 2, 312, 14, '#90a4ae');
    }
    if (!G.solved.aiguille) Object.entries(PAD).forEach(([d, [x, y, w, h, s]]) => {
      rr(c, x, y, w, h, 10, '#263238', '#7a828f'); tx(c, s, x + w / 2, y + h / 2, 24, '#fff', true);
      reg(x, y, w, h, () => moveNeedle(d));
    });
    plate(c, 'Guide l’aiguille sans toucher les murs. Récompense : la légende.');
  }

  function drawTop(c) {
    c.setTransform(RES, 0, 0, RES, 0, 0);
    c.fillStyle = '#23272e'; c.fillRect(0, 0, CW, CW);
    c.strokeStyle = '#4a515c'; c.lineWidth = 6; c.strokeRect(3, 3, CW - 6, CW - 6);
    rr(c, 70, 140, 260, 120, 12, '#000', '#444a55', 4);
    const won = G.won && G.over, blinkOff = won && Math.floor(now() / 300) % 2;
    tx(c, G.p ? fmt(G.displayMs != null ? G.displayMs : G.remaining) : '5:00', CW / 2, 202, 78, won ? (blinkOff ? '#0a3a1a' : '#00e676') : '#ff3b30', true, 'center', '"Courier New", monospace');
  }

  // ---------- Actions ----------
  const canAct = () => !G.over && Math.abs(rotY - targetY) < 0.06 && !drag.active;
  function cutWire(i) {
    if (G.solved.fils || G.cut.has(i)) return;
    G.cut.add(i); faces[0].dirty = true; Sfx.tone(2200, 0.05, 'square', 0.07);
    if (!G.p.solution.wiresToCut.includes(i)) return strike();
    if (G.p.solution.wiresToCut.every(k => G.cut.has(k))) solve('fils');
  }
  function pressKey(k) {
    if (G.solved.clavier) return;
    G.keyFlash[k] = now() + 120; faces[1].animUntil = now() + 150; faces[1].dirty = true;
    if (k === 'EFF') { G.entry = ''; Sfx.click(); return; }
    if (k === 'OK') {
      if (G.entry.length < 4) { Sfx.tone(300, 0.08); return; }
      if (G.entry === G.p.solution.code) return solve('clavier');
      G.entry = ''; return strike();
    }
    if (G.entry.length < 4) { G.entry += k; Sfx.click(); }
  }
  function unscrew(n) {
    if (G.solved.panneau || G.screwAnim[n]) return;
    if (G.p.solution.screwOrder[G.screwStep] !== n) return strike();
    G.screwStep++; G.screwAnim[n] = now(); faces[2].animUntil = now() + 500;
    Sfx.tone(500, 0.12, 'sawtooth', 0.05, 400);
    if (G.screwStep === 4) {
      G.lidStart = now() + 400; faces[2].animUntil = now() + 1200;
      setTimeout(() => solve('panneau'), 600);
    }
  }
  function moveNeedle(d) {
    if (G.solved.aiguille) return;
    const [x, y] = G.pos; faces[3].animUntil = now() + 400;
    if (!L.canMove(G.p.maze, x, y, d)) { G.bump = { d: L.STEP[d], until: now() + 120 }; return strike(); }
    G.pos = [x + L.STEP[d][0], y + L.STEP[d][1]]; Sfx.tone(700, 0.03, 'sine', 0.06);
    if (G.pos[0] === G.p.maze.goal[0] && G.pos[1] === G.p.maze.goal[1]) solve('aiguille');
  }

  function strike() {
    if (G.over) return;
    G.strikes++; G.remaining -= PENALTY_MS; Sfx.bad();
    shakeUntil = now() + 300; flashUntil = now() + 180;
    if (navigator.vibrate) navigator.vibrate(150);
    const pen = $('penalty'); pen.classList.add('show'); requestAnimationFrame(() => requestAnimationFrame(() => pen.classList.remove('show')));
    updateHud();
    if (G.strikes >= MAX_STRIKES || G.remaining <= 0) lose();
  }
  function solve(k) {
    if (G.over) return;
    G.solved[k] = true; faces.forEach(f => f.dirty = true); Sfx.good(); updateHud();
    if (Object.values(G.solved).every(Boolean)) {
      startCine('win');
    }
  }
  function lose() {
    G.remaining = Math.max(0, G.remaining); updateHud();
    startCine('lose');
  }

  function rotate(dir) {
    if (G.over || drag.active) return;
    G.face = (G.face + dir + 4) % 4; targetY -= dir * HALF;
    Sfx.tone(300, 0.06, 'triangle', 0.05); updateHud();
  }

  // ---------- HUD / écrans ----------
  function updateHud() {
    if (!G.p) return;
    $('timer').textContent = fmt(G.remaining);
    $('timer').classList.toggle('urgent', G.remaining <= 30000 && !G.over);
    [...$('strikes').children].forEach((b, i) => b.classList.toggle('on', i < G.strikes));
    document.querySelectorAll('#leds i').forEach(i => i.classList.toggle('on', G.solved[i.dataset.k]));
    document.querySelectorAll('#dots i').forEach((d, i) => d.classList.toggle('on', i === G.face));
    $('faceName').textContent = 'Face ' + (G.face + 1) + ' — ' + FACES[G.face];
    topDirty = true;
  }
  function show(screen) {
    $('title').classList.toggle('hidden', screen !== 'title');
    $('end').classList.toggle('hidden', screen !== 'end');
    $('hud').classList.toggle('hidden', screen !== 'game');
    $('nav').classList.toggle('hidden', screen !== 'game');
  }
  function stars() {
    const sec = G.remaining / 1000;
    if (G.strikes === 0 && sec >= 150) return 3;
    if (G.strikes <= 1 && sec >= 60) return 2;
    return 1;
  }
  function showEnd(win) {
    const e = $('end'); e.className = 'screen ' + (win ? 'win' : 'lose');
    $('endTitle').innerHTML = win ? 'BOMBE<br>DÉSAMORCÉE!' : 'BOUM!';
    $('endSub').textContent = win ? 'Temps restant' : (G.strikes >= MAX_STRIKES ? 'Trois erreurs de trop…' : 'Le chrono est tombé à zéro.');
    $('endTime').textContent = win ? fmt(G.remaining) : '';
    const n = Object.values(G.solved).filter(Boolean).length;
    if (win) {
      const k = stars();
      $('stars').innerHTML = [0, 1, 2].map(i => `<span class="${i < k ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.22}s">★</span>`).join('');
      let best = 0, rec = false;
      try { best = +localStorage.getItem('desamorce3d.meilleur') || 0; if (G.remaining > best) { best = G.remaining; rec = true; localStorage.setItem('desamorce3d.meilleur', String(Math.round(best))); } } catch (err) { best = G.remaining; }
      $('best').innerHTML = (rec ? '<b>🏆 Nouveau record!</b><br>' : '') + 'Meilleur temps restant : ' + fmt(best);
      $('endInfo').textContent = 'Erreurs : ' + G.strikes + ' / ' + MAX_STRIKES + (k === 3 ? ' — sans faute, chapeau! 🎩' : k === 2 ? ' — beau travail!' : ' — ç’a passé proche!');
    } else {
      $('stars').innerHTML = ''; $('best').innerHTML = '';
      $('endInfo').innerHTML = 'Modules désamorcés : ' + n + ' / 4<br>Erreurs : ' + G.strikes + ' / ' + MAX_STRIKES;
    }
    show('end');
  }
  function start() { Sfx.init(); newGame(); show('game'); }
  $('start').onclick = start; $('again').onclick = start;
  $('home').onclick = () => { G.over = true; resetFx(); show('title'); };
  $('left').onclick = () => { Sfx.init(); rotate(-1); };
  $('right').onclick = () => { Sfx.init(); rotate(1); };
  addEventListener('keydown', e => {
    if (G.over) return;
    if (e.key === 'ArrowLeft') rotate(-1);
    if (e.key === 'ArrowRight') rotate(1);
    if (G.face === 3 && e.key === 'ArrowUp') moveNeedle('n');
    if (G.face === 3 && e.key === 'ArrowDown') moveNeedle('s');
  });

  // ---------- Scène 3D ----------
  const canvas = $('scene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d0f13);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x202020, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.75); key.position.set(2, 4, 6); scene.add(key);
  const redLight = new THREE.PointLight(0xff2020, 0.8, 6); redLight.position.set(0, 2.2, 1.5); scene.add(redLight);

  const faces = [makeFace(drawWires), makeFace(drawKeypad), makeFace(drawPanel), makeFace(drawMaze)];
  const topCanvas = document.createElement('canvas'); topCanvas.width = topCanvas.height = CW * RES;
  const topTex = new THREE.CanvasTexture(topCanvas); topTex.encoding = THREE.sRGBEncoding;
  let topDirty = true;
  const mat = t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.25 });
  const plain = new THREE.MeshStandardMaterial({ color: 0x1c2026, roughness: 0.6, metalness: 0.4 });
  // ordre BoxGeometry : +x, -x, +y, -y, +z, -z  → faces 1, 3, dessus, dessous, 0, 2
  const box = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, BD), [mat(faces[1].tex), mat(faces[3].tex), mat(topTex), plain, mat(faces[0].tex), mat(faces[2].tex)]);
  const MAT_TO_FACE = { 4: 0, 0: 1, 5: 2, 1: 3 };
  const bomb = new THREE.Group(); bomb.add(box); scene.add(bomb);
  const metal = new THREE.MeshStandardMaterial({ color: 0x8d939c, roughness: 0.35, metalness: 0.8 });
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([x, z]) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, BH + 0.12, 16), metal); c.position.set(x * BW / 2, 0, z * BD / 2); bomb.add(c);
  });
  [[0xe53935, -0.6], [0x1e88e5, 0.6]].forEach(([col, s]) => {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 1.4, BH / 2, -0.7), new THREE.Vector3(s * 1.0, BH / 2 + 0.45, -0.2), new THREE.Vector3(s * 0.3, BH / 2 + 0.25, -0.5), new THREE.Vector3(0, BH / 2, -0.75)]);
    bomb.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.045, 8), new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 })));
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 1 }));
  floor.rotation.x = -HALF; floor.position.y = -BH / 2 - 0.06; scene.add(floor);

  let camBase = new THREE.Vector3();
  function resize() {
    const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const avail = Math.max(0.45, (h - 230) / h);
    const d = Math.max((BW + 0.45) / (2 * t * camera.aspect), (BH + 0.5) / (2 * t * avail));
    camBase.set(0, 1.35, BD / 2 + d); camera.position.copy(camBase); camera.lookAt(0, -0.05, 0);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  // ---------- Cinématiques (victoire / BOUM) ----------
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const Q = RM ? 0.3 : 1; // densité des particules
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  const smokeTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    for (let i = 0; i < 6; i++) {
      const px = 20 + Math.random() * 24, py = 20 + Math.random() * 24, r = 14 + Math.random() * 12;
      const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(c);
  })();
  // 12 DEL autour du dessus de la bombe
  const ledMeshes = [];
  const ledGeo = new THREE.SphereGeometry(0.055, 12, 8);
  for (let s = 0; s < 4; s++) for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    const a = (k - 1) * 0.55, e = BW / 2 - 0.14, pos = [[a, e], [e, -a], [-a, -e], [-e, a]][s];
    m.position.set(pos[0], BH / 2 + 0.03, pos[1]); bomb.add(m); ledMeshes.push(m);
  }
  const goldLight = new THREE.PointLight(0xffc46b, 0, 12); goldLight.position.set(0, 3.2, 2); scene.add(goldLight);
  const blastLight = new THREE.PointLight(0xffa040, 0, 18); blastLight.position.set(0, 0.5, 1.2); scene.add(blastLight);

  let ft = 0;        // horloge des effets (somme des dt plafonnés : reste fluide même si une image traîne)
  let parts = [];   // {obj, v, life, age, kind, ...}
  let cine = null;  // {type, t0, dur, pre, exploded, ended}
  const add = (obj, o) => { scene.add(obj); parts.push(Object.assign({ obj, age: 0, v: new THREE.Vector3(), spin: new THREE.Vector3(), geo: false, mat: true }, o)); };
  const dispose = p => { scene.remove(p.obj); if (p.geo) p.obj.geometry.dispose(); if (p.mat) p.obj.material.dispose(); };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const FIRE = [new THREE.Color(0xfff4b0), new THREE.Color(0xffa020), new THREE.Color(0xd02800), new THREE.Color(0x200800)];
  function fireColor(k, out) { const f = Math.min(2.999, k * 3), i = Math.floor(f); return out.copy(FIRE[i]).lerp(FIRE[i + 1], f - i); }

  function doExplosion() {
    if (cine.exploded) return; cine.exploded = true; cine.tx = ft;
    bomb.visible = false; Sfx.bigBoom();
    if (navigator.vibrate) navigator.vibrate(RM ? 300 : [500, 80, 250, 80, 700, 120, 300]);
    flash(RM ? 0.5 : 1, RM ? 500 : 900);
    $('vignette').style.opacity = '1';
    if (!RM) cracks();
    blastLight.intensity = 9;
    // boule de feu (additive)
    for (let i = 0; i < 80 * Q; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, color: 0xffffff }));
      const v = new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(1.5, 7));
      s.position.set(rnd(-0.3, 0.3), rnd(-0.3, 0.6), rnd(-0.3, 0.3)); s.scale.setScalar(0.6);
      add(s, { kind: 'fire', v, life: rnd(0.9, 2.1), size: rnd(1.6, 3.8) });
    }
    // onde de choc : anneau au sol + anneau face caméra
    [true, false].forEach(flat => {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffd090, blending: THREE.AdditiveBlending, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      if (flat) { r.rotation.x = -HALF; r.position.y = -BH / 2; } else { r.position.set(0, 0.3, 0); r.lookAt(camera.position); }
      add(r, { kind: 'ring', life: flat ? 1.1 : 0.7, size: flat ? 10 : 7, geo: true });
    });
    // éclats du boîtier (avec les textures des faces), montants, câbles
    const mats = [box.material[0], box.material[1], box.material[4], box.material[5], plain, metal];
    for (let i = 0; i < 46 * Q; i++) {
      const pillar = i < 4;
      const g = pillar ? new THREE.CylinderGeometry(0.075, 0.075, rnd(0.8, 1.6), 10) : new THREE.BoxGeometry(rnd(0.2, 0.7), rnd(0.2, 0.7), rnd(0.04, 0.1));
      const m = new THREE.Mesh(g, pillar ? metal : mats[i % mats.length]);
      m.position.set(rnd(-0.8, 0.8), rnd(-1, 1), rnd(-0.8, 0.8));
      const v = m.position.clone().normalize().multiplyScalar(rnd(3, 9)); v.y += rnd(2, 7);
      add(m, { kind: 'debris', v, spin: new THREE.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)), life: 99, geo: true, mat: false });
    }
    // fumée
    for (let i = 0; i < 24 * Q; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, color: 0x3a3634, opacity: 0 }));
      s.position.set(rnd(-0.8, 0.8), rnd(-0.6, 0.8), rnd(-0.8, 0.8));
      add(s, { kind: 'smoke', v: new THREE.Vector3(rnd(-0.4, 0.4), rnd(0.3, 0.9), rnd(-0.4, 0.4)), life: rnd(3, 5), delay: rnd(0.1, 0.7), size: rnd(1.5, 3.5) });
    }
    // braises
    for (let i = 0; i < 60 * Q; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, color: 0xffb040 }));
      s.scale.setScalar(0.12);
      add(s, { kind: 'spark', v: new THREE.Vector3(rnd(-1, 1), rnd(0, 1.2), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 11)), life: rnd(1, 2.2) });
    }
  }

  const confGeo = new THREE.PlaneGeometry(0.09, 0.15);
  const confMats = [0xffd54f, 0xff5252, 0x69f0ae, 0x40c4ff, 0xe040fb, 0xffffff].map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  function winFx() {
    goldLight.intensity = 0;
    for (let i = 0; i < 170 * Q; i++) {
      const m = new THREE.Mesh(confGeo, confMats[i % confMats.length]);
      m.position.set(rnd(-3.5, 3.5), rnd(3, 9), rnd(-3, 3.5));
      add(m, { kind: 'confetti', v: new THREE.Vector3(0, -rnd(0.9, 1.8), 0), spin: new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)), life: 99, mat: false, phase: rnd(0, 6) });
    }
  }
  function goldSpark() {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, color: 0xffd27a }));
    s.position.set(rnd(-0.9, 0.9), BH / 2 + 0.1, rnd(-0.9, 0.9)); s.scale.setScalar(0.16);
    add(s, { kind: 'spark', v: new THREE.Vector3(rnd(-1.5, 1.5), rnd(4, 7.5), rnd(-1.5, 1.5)), life: rnd(1.2, 2) });
  }

  function flash(op, ms) {
    const f = $('flash'); f.style.transition = 'none'; f.style.opacity = String(op);
    requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = 'opacity ' + ms + 'ms ease-out'; f.style.opacity = '0'; }));
  }
  function cracks() {
    const svg = $('cracks'), w = innerWidth, h = innerHeight; let d = '';
    const cx = w * rnd(0.35, 0.65), cy = h * rnd(0.35, 0.6);
    for (let i = 0; i < 11; i++) {
      let a = (i / 11) * Math.PI * 2 + rnd(-0.2, 0.2), x = cx, y = cy; d += `M${cx},${cy}`;
      for (let k = 0; k < 6; k++) { a += rnd(-0.45, 0.45); const l = rnd(30, 90); x += Math.cos(a) * l; y += Math.sin(a) * l; d += `L${x.toFixed(0)},${y.toFixed(0)}`;
        if (Math.random() < 0.3) { const b = a + rnd(0.6, 1.2) * (Math.random() < 0.5 ? -1 : 1); d += `M${x.toFixed(0)},${y.toFixed(0)}l${(Math.cos(b) * 40).toFixed(0)},${(Math.sin(b) * 40).toFixed(0)}M${x.toFixed(0)},${y.toFixed(0)}`; } }
    }
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `<path d="${d}" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="5"/><path d="${d}" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="1.6"/><circle cx="${cx}" cy="${cy}" r="10" fill="rgba(255,255,255,.5)"/>`;
    svg.style.opacity = '1';
  }

  function startCine(type) {
    G.over = true; G.won = type === 'win';
    cine = type === 'win' ? { type, t0: ft, dur: RM ? 2500 : 4600 } : { type, t0: ft, dur: RM ? 2300 : 4400, pre: RM ? 400 : 1300, from: G.remaining };
    $('skip').classList.remove('hidden');
    $('nav').classList.add('hidden');
    if (type === 'win') {
      $('timer').classList.remove('urgent'); $('timer').classList.add('frozen');
      Sfx.powerDown(); setTimeout(() => cine && cine.type === 'win' && Sfx.jingle(), RM ? 500 : 1000);
      if (navigator.vibrate) navigator.vibrate([60, 60, 60, 60, 200]);
      winFx();
    } else {
      $('timer').classList.add('urgent');
      Sfx.heartRush(cine.pre / 1000);
      if (RM) $('vignette').style.opacity = '.6';
    }
  }
  function endCine() {
    if (!cine || cine.ended) return;
    if (cine.type === 'lose') doExplosion();
    cine.ended = true; $('skip').classList.add('hidden');
    showEnd(cine.type === 'win');
  }
  $('skip').addEventListener('pointerdown', () => { if (cine && ft - cine.t0 > 350) endCine(); });

  function resetFx() {
    parts.forEach(dispose);
    parts = []; cine = null;
    ['flash', 'vignette', 'cracks'].forEach(id => { $(id).style.transition = 'none'; $(id).style.opacity = '0'; });
    $('skip').classList.add('hidden'); $('timer').classList.remove('frozen');
    goldLight.intensity = 0; blastLight.intensity = 0; camera.fov = 40; camera.updateProjectionMatrix();
    ledMeshes.forEach(m => m.material.color.set(0xff2020));
    bomb.visible = true;
  }

  const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const tmpC = new THREE.Color();
  function fxUpdate(t, dtRaw) {
    const dt = Math.min(dtRaw, 100), s = dt / 1000; ft += dt; t = ft;
    // caméra
    camera.position.copy(camBase); let look = new THREE.Vector3(0, -0.05, 0), shake = 0;
    if (now() < shakeUntil && !RM) shake = 0.07;
    if (cine) {
      const e = Math.min(1, (t - cine.t0) / cine.dur);
      if (cine.type === 'win') {
        const k = ease(Math.min(1, (t - cine.t0) / (cine.dur * 1.15)));
        const ang = RM ? 0 : -2.1 * k, dist = (camBase.z) * (1 + (RM ? 0.15 : 0.55) * k), hgt = camBase.y + (RM ? 0.3 : 1.9) * k;
        camera.position.set(Math.sin(ang) * dist, hgt, Math.cos(ang) * dist); look.set(0, 0.25 * k, 0);
        // DEL en cascade
        ledMeshes.forEach((m, i) => { if (t - cine.t0 > 120 + i * 110) m.material.color.set(0x00ff77); });
        goldLight.intensity = Math.min(2.6, (t - cine.t0) / 600);
        scene.background.setHex(0x0d0f13).lerp(tmpC.setHex(0x2a1c05), Math.min(1, (t - cine.t0) / 1500));
        if (t - cine.t0 < cine.dur * 0.75 && Math.random() < (RM ? 0.15 : 0.6)) goldSpark();
        topDirty = true;
      } else {
        const te = t - cine.t0;
        if (!cine.exploded) {
          const k = te / cine.pre;
          G.displayMs = cine.from * (1 - k * k); topDirty = true; $('timer').textContent = fmt(G.displayMs);
          $('vignette').style.opacity = String(RM ? 0.6 : k * 0.7);
          if (!RM) { shake = 0.01 + 0.05 * k; camera.position.multiplyScalar(1 - 0.12 * ease(k)); }
          ledMeshes.forEach(m => m.material.color.setHex(Math.sin(te / (90 - 60 * k)) > 0 ? 0xff0000 : 0x330000));
          redLight.intensity = 1 + 3 * k;
          if (te >= cine.pre) { G.displayMs = 0; $('timer').textContent = '0:00'; doExplosion(); }
        } else {
          const tx = (t - cine.tx) / 1000;
          if (!RM) { shake = Math.max(shake, 0.45 * Math.exp(-tx * 2.2)); camera.position.multiplyScalar(1 + 0.12 * Math.exp(-tx * 3) * Math.min(1, tx * 8)); }
          blastLight.intensity = 9 * Math.exp(-tx * 2.5);
          redLight.intensity = 0;
          scene.background.setHex(0x0d0f13).lerp(tmpC.setHex(0x5a1a00), Math.exp(-tx * 1.5));
        }
      }
      if (e >= 1 && !cine.ended) endCine();
    }
    if (shake) camera.position.add(new THREE.Vector3(rnd(-1, 1) * shake, rnd(-1, 1) * shake, rnd(-1, 1) * shake * 0.3));
    camera.lookAt(look);
    // particules
    const floorY = -BH / 2;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i], o = p.obj;
      if (p.delay > 0) { p.delay -= s; continue; }
      p.age += s; const k = p.age / p.life;
      if (k >= 1) { dispose(p); parts.splice(i, 1); continue; }
      if (p.kind === 'fire') {
        p.v.multiplyScalar(Math.pow(0.12, s)); o.position.addScaledVector(p.v, s); o.position.y += s * 0.6;
        o.scale.setScalar(0.4 + p.size * Math.sqrt(k)); fireColor(k * 0.85, o.material.color); o.material.opacity = 0.9 * (1 - k * k);
      } else if (p.kind === 'ring') {
        const r = 0.1 + p.size * ease(k); o.scale.set(r, r, r); o.material.opacity = 1 - k;
      } else if (p.kind === 'smoke') {
        o.position.addScaledVector(p.v, s); o.scale.setScalar(p.size * (0.4 + k)); o.material.opacity = 0.75 * Math.sin(Math.PI * k);
      } else if (p.kind === 'spark') {
        p.v.y -= 9.8 * s; o.position.addScaledVector(p.v, s); o.material.opacity = 1 - k;
      } else if (p.kind === 'debris') {
        p.v.y -= 9.8 * s; o.position.addScaledVector(p.v, s);
        o.rotation.x += p.spin.x * s; o.rotation.y += p.spin.y * s; o.rotation.z += p.spin.z * s;
        if (o.position.y < floorY + 0.05 && p.v.y < 0) { o.position.y = floorY + 0.05; p.v.y *= -0.35; p.v.x *= 0.6; p.v.z *= 0.6; p.spin.multiplyScalar(0.5); }
      } else if (p.kind === 'confetti') {
        o.position.addScaledVector(p.v, s); o.position.x += Math.sin(t / 400 + p.phase) * s * 0.6;
        o.rotation.x += p.spin.x * s; o.rotation.y += p.spin.y * s;
        if (o.position.y < floorY) o.position.y = rnd(5, 8);
      }
    }
  }

  // ---------- Toucher / glisser ----------
  let rotY = 0, targetY = 0, shakeUntil = 0, flashUntil = 0;
  const drag = { active: false, down: false, x: 0, y: 0, base: 0 };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  canvas.addEventListener('pointerdown', e => { Sfx.init(); if (G.over) return; Object.assign(drag, { down: true, active: false, x: e.clientX, y: e.clientY, base: targetY }); canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drag.down) return;
    const dx = e.clientX - drag.x;
    if (!drag.active && Math.abs(dx) > 10) drag.active = true;
    if (drag.active) rotY = drag.base + THREE.MathUtils.clamp(dx * 0.007, -HALF * 0.95, HALF * 0.95);
  });
  canvas.addEventListener('pointerup', e => {
    if (!drag.down) return;
    drag.down = false;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.active) { drag.active = false; if (Math.abs(dx) > 45) rotate(dx < 0 ? 1 : -1); return; }
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) tapAt(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointercancel', () => { drag.down = drag.active = false; });
  function tapAt(x, y) {
    if (!canAct()) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(box)[0];
    if (!hit) return;
    const fi = MAT_TO_FACE[hit.face.materialIndex];
    if (fi !== G.face) return;
    const cx = hit.uv.x * CW, cy = (1 - hit.uv.y) * CH;
    const reg = faces[fi].regions.find(q => cx >= q.x && cx <= q.x + q.w && cy >= q.y && cy <= q.y + q.h);
    if (reg) reg.fn();
  }
  // Point d'une face (coordonnées canvas) → écran ; sert aux tests automatisés.
  function toScreen(fi, cx, cy) {
    const u = cx / CW, v = 1 - cy / CH, y = -BH / 2 + BH * v;
    const local = [new THREE.Vector3(-1 + 2 * u, y, 1), new THREE.Vector3(1, y, 1 - 2 * u), new THREE.Vector3(1 - 2 * u, y, -1), new THREE.Vector3(-1, y, -1 + 2 * u)][fi];
    const pt = box.localToWorld(local).project(camera), r = canvas.getBoundingClientRect();
    return [r.left + (pt.x + 1) / 2 * r.width, r.top + (1 - pt.y) / 2 * r.height];
  }
  window.D3 = { G, cine: () => cine && { type: cine.type, ended: !!cine.ended, exploded: !!cine.exploded, t: ft - cine.t0, tx: cine.exploded ? ft - cine.tx : -1 }, toScreen, keyRect, SCREWS, PAD, CW, CH, settled: () => Math.abs(rotY - targetY) < 0.01 };

  // ---------- Boucle ----------
  let last = now(), lightsT = 0;
  drawTop(topCanvas.getContext("2d")); topTex.needsUpdate = true;
  function loop() {
    const t = now(), dt = Math.min(100, t - last); last = t;
    if (G.running && !G.over) {
      G.remaining -= dt;
      if (G.remaining <= 0) { G.remaining = 0; lose(); }
      const sec = Math.ceil(G.remaining / 1000);
      if (sec !== G.lastSec) { G.lastSec = sec; Sfx.tick(sec <= 30); if (sec <= 10 && Sfx.ctx) Sfx.thump(Sfx.ctx.currentTime, 0.35); updateHud(); }
    }
    if (!drag.active) rotY += (targetY - rotY) * Math.min(1, dt * 0.012);
    const idle = G.over && G.won ? t * 0.0006 : 0;
    bomb.rotation.y = rotY + idle;
    bomb.position.y = Math.sin(t / 900) * 0.02;
    // faces à redessiner
    if (G.p) faces.forEach((f, i) => {
      const lights = i === 2 && t - lightsT > 90;
      if (f.dirty || f.animUntil > t || lights) { f.redraw(); if (lights) lightsT = t; }
    });
    if (topDirty && G.p) { drawTop(topCanvas.getContext('2d')); topTex.needsUpdate = true; topDirty = false; }
    if (!cine) redLight.intensity = G.over ? 0.2 : 0.5 + 0.5 * (Math.sin(t / 160) > 0 ? 1 : 0);
    if (!cine && !G.over) ledMeshes.forEach((m, i) => m.material.color.setHex(Math.sin(t / 160 + i * 0.5) > 0 ? 0xff2020 : 0x441010));
    fxUpdate(t, dt);
    if (t >= flashUntil && !cine) scene.background.setHex(0x0d0f13); else if (t < flashUntil && !cine) scene.background.setHex(0x3a0000);
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  show('title');
  requestAnimationFrame(loop);
})();
