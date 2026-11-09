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
    muted: (() => { try { return localStorage.getItem('desamorce3d.muet') === '1'; } catch (e) { return false; } })(),
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; return; }
      const c = this.ctx;
      // chaîne maître : volume → passe-bas 4 kHz (rien de perçant) → compresseur/limiteur
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4000; lp.Q.value = 0.5;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.25;
      this.master.connect(lp).connect(comp).connect(c.destination);
      this.out = this.master;
      this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    },
    setMuted(m) {
      this.muted = m; try { localStorage.setItem('desamorce3d.muet', m ? '1' : '0'); } catch (e) {}
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
    },

    // ----- Nappe de tension adaptative -----
    bed: null,
    bedStart(state) {
      const c = this.ctx; if (!c) return; this.state = state;
      if (this.bed) { this.bed.gain.gain.cancelScheduledValues(c.currentTime); this.bed.gain.gain.setTargetAtTime(0.5, c.currentTime, 0.4); this.resetClock(); return; }
      const gain = c.createGain(); gain.gain.value = 0; gain.connect(this.out);
      const duck = c.createGain(); duck.gain.value = 1; duck.connect(gain);
      const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 220; filt.Q.value = 3; filt.connect(duck);
      const oscs = [[55, 'sawtooth', 0.2, -7], [55, 'sawtooth', 0.2, 7], [82.4, 'sine', 0.12, 0], [27.5, 'sine', 0.35, 0]].map(([f, type, v, det]) => {
        const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f; o.detune.value = det; g.gain.value = v;
        o.connect(g).connect(filt); o.start(); return o;
      });
      // lent battement de volume (respiration)
      const lfo = c.createOscillator(), lfoG = c.createGain(); lfo.frequency.value = 0.13; lfoG.gain.value = 0.08; lfo.connect(lfoG).connect(gain.gain); lfo.start();
      this.bed = { gain, duck, filt, oscs, lfo };
      gain.gain.setTargetAtTime(0.5, c.currentTime, 0.8);
      this.resetClock();
      this.sched = setInterval(() => this.schedule(), 25);
    },
    resetClock() { const t = this.ctx.currentTime + 0.1; this.nextKick = t; this.nextTick = t; this.riser = null; this.calm = 0; this.boost = 0; },
    bedStop(fast) {
      const c = this.ctx; if (!c || !this.bed) return;
      this.bed.gain.gain.cancelScheduledValues(c.currentTime);
      this.bed.gain.gain.setTargetAtTime(0, c.currentTime, fast ? 0.03 : 0.3);
      if (this.riser) { this.riser.g.gain.cancelScheduledValues(c.currentTime); this.riser.g.gain.setTargetAtTime(0, c.currentTime, 0.05); this.riser = null; }
      this.state = null;
    },
    tension() { // 0 calme … 1 panique
      const st = this.state && this.state(); if (!st) return 0;
      const base = 1 - Math.max(0, st.remaining) / START_MS;
      const t = this.ctx.currentTime;
      const boost = Math.max(0, this.boost - t) / 4 * 0.3;   // après une erreur
      const calm = Math.max(0, this.calm - t) / 3 * 0.2;     // après un module
      return Math.min(1, Math.max(0, Math.pow(base, 1.3) * 0.85 + st.strikes * 0.08 + boost - calm + (st.final ? 1 : 0)));
    },
    schedule() {
      const c = this.ctx, st = this.state && this.state(); if (!c || !this.bed || !st) return;
      const T = this.tension(), now = c.currentTime, ahead = now + 0.12;
      this.bed.filt.frequency.setTargetAtTime(220 + 900 * T * T, now, 0.3);
      this.bed.oscs[0].detune.setTargetAtTime(-7 - 18 * T, now, 0.5); this.bed.oscs[1].detune.setTargetAtTime(7 + 18 * T, now, 0.5);
      // pulsation sourde (genre battement de cœur)
      const bpm = 52 + 78 * T;
      while (this.nextKick < ahead) { this.kick(this.nextKick, 0.25 + 0.3 * T); this.kick(this.nextKick + 0.17, 0.12 + 0.18 * T); this.nextKick += 60 / bpm; }
      // tic-tac boisé : 1/s, 2/s sous 1:00, 3/s sous 0:30
      if (st.running) {
        const r = st.remaining, step = r < 30000 ? 1 / 3 : r < 60000 ? 0.5 : 1;
        while (this.nextTick < ahead) { this.woodTick(this.nextTick, r < 30000 ? 0.05 : 0.06); this.nextTick += step; }
        // montée subtile dans les 15 dernières secondes
        if (r < 15000 && r > 0 && !this.riser) this.startRiser(r / 1000);
      } else this.nextTick = ahead;
    },
    kick(t, v) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 180;
      o.type = 'sine'; o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.16);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(f).connect(g).connect(this.bed.duck); o.start(t); o.stop(t + 0.25);
    },
    woodTick(t, v) {
      const c = this.ctx, n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      n.buffer = this.noiseBuf; f.type = 'bandpass'; f.frequency.value = 1100 + Math.random() * 120; f.Q.value = 9;
      g.gain.setValueAtTime(v * 3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
      n.connect(f).connect(g).connect(this.out); n.start(t, Math.random() * 0.5, 0.05);
    },
    startRiser(sec) {
      const c = this.ctx, t = c.currentTime, o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(330, t + sec);
      o2.frequency.setValueAtTime(111.5, t); o2.frequency.exponentialRampToValueAtTime(336, t + sec);
      f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1600, t + sec); f.Q.value = 2;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + sec);
      o.connect(f); o2.connect(f); f.connect(g).connect(this.bed.duck); o.start(t); o2.start(t); o.stop(t + sec + 0.5); o2.stop(t + sec + 0.5);
      this.riser = { g };
    },
    duckBed(depth, sec) {
      if (!this.bed) return; const c = this.ctx, d = this.bed.duck.gain, t = c.currentTime;
      d.cancelScheduledValues(t); d.setValueAtTime(d.value, t); d.linearRampToValueAtTime(depth, t + 0.04); d.setTargetAtTime(1, t + 0.15, sec / 3);
    },
    tone(freq, dur, type = 'square', vol = 0.06, slide = 0) {
      const c = this.ctx; if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), c.currentTime + dur);
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g).connect(this.out); o.start(); o.stop(c.currentTime + dur + 0.02);
    },

    click() { this.tone(600, 0.04, 'triangle', 0.08); },
    good() { // carillon de soulagement + nappe qui se calme
      const c = this.ctx; if (!c) return; const t = c.currentTime;
      [[659, 0], [988, 0.09], [1319, 0.18]].forEach(([f, d]) => {
        const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.08, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.9);
        o.connect(g).connect(this.out); o.start(t + d); o.stop(t + d + 1);
      });
      this.calm = t + 3; this.duckBed(0.55, 1.5);
    },
    bad() { // piqûre dissonante courte + la nappe plonge puis repart plus tendue
      const c = this.ctx; if (!c) return; const t = c.currentTime;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(400, t + 0.45); f.connect(this.out);
      [233, 247, 349.2].forEach(fr => {
        const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = fr;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        o.connect(g).connect(f); o.start(t); o.stop(t + 0.55);
      });
      this.kickHit = 1; this.boost = t + 4; this.duckBed(0.15, 1.2);
    },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'sine', 0.12), i * 120)); },
    thump(t, v = 0.5) {
      const c = this.ctx; if (!c) return;
      [[62, 0], [48, 0.16]].forEach(([f, d]) => {
        const o = c.createOscillator(), g = c.createGain(); o.type = 'sine';
        o.frequency.setValueAtTime(f, t + d); o.frequency.exponentialRampToValueAtTime(30, t + d + 0.18);
        g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(v, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
        o.connect(g).connect(this.out); o.start(t + d); o.stop(t + d + 0.25);
      });
    },
    beepAt(t, f, d = 0.05, v = 0.07) {
      const c = this.ctx; if (!c) return;
      const o = c.createOscillator(), g = c.createGain(); o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(this.out); o.start(t); o.stop(t + d + 0.02);
    },
    heartRush(sec) { // battements + bips qui s'accélèrent
      const c = this.ctx; if (!c) return; let t = c.currentTime, gap = 0.34, k = 0;
      while (t < c.currentTime + sec) { this.beepAt(t, 700 + k * 30, 0.05, 0.05); if (k % 2 === 0) this.thump(t, 0.6); t += gap; gap = Math.max(0.05, gap * 0.8); k++; }
    },
    bigBoom() {
      const c = this.ctx; if (!c) return; const t = c.currentTime;
      const comp = c.createDynamicsCompressor(); comp.connect(this.out);
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
      o.connect(g).connect(this.out); o.start(t); o.stop(t + 1);
    },
    jingle() {
      const c = this.ctx; if (!c) return; const t = c.currentTime;
      const note = (f, at, d, v = 0.09, type = 'triangle') => {
        const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(v, t + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + at + d);
        o.connect(g).connect(this.out); o.start(t + at); o.stop(t + at + d + 0.05);
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
      s.buffer = buf; s.connect(f).connect(g).connect(this.out); s.start();
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
      pos: G.p.maze.start.slice(), needle: G.p.maze.start.slice(), nv: [0, 0], mazeFlash: 0, padFlash: {}, lastSec: 300
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

  const PAD = { n: [155, 304, 90, 50, '▲'], w: [50, 358, 90, 50, '◀'], s: [155, 358, 90, 50, '▼'], e: [260, 358, 90, 50, '▶'] };
  const MZ = { cell: 32, ox: 0, oy: 40 }; MZ.ox = CW / 2 - (8 * MZ.cell) / 2; // zone du labyrinthe (coord. canvas)
  const inMaze = (cx, cy) => { const n = G.p.maze.size * MZ.cell; return cx >= MZ.ox - 8 && cx <= MZ.ox + n + 8 && cy >= MZ.oy - 8 && cy <= MZ.oy + n + 8; };
  const LIGHT_R = 1.7;          // rayon de lumière, en cases
  const FLICKER = 5200, FLICKER_OFF = 750; // les murs disparaissent ~0,75 s toutes les 5,2 s
  function wallsHidden(t) { return !G.solved.aiguille && (t % FLICKER) > FLICKER - FLICKER_OFF; }
  function drawMaze(c, reg) {
    const m = G.p.maze, cell = MZ.cell, n = m.size * cell, ox = MZ.ox, oy = MZ.oy, t = now();
    base(c, 'AIGUILLE'); led(c, G.solved.aiguille);
    c.fillStyle = '#0d1b2a'; c.fillRect(ox - 6, oy - 6, n + 12, n + 12);
    const cx = x => ox + x * cell + cell / 2, cy = y => oy + y * cell + cell / 2;
    const nx = cx(G.needle[0]), ny = cy(G.needle[1]);
    const hidden = wallsHidden(t);
    const hit = G.mazeFlash > t;
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
    // obscurité : seul un halo autour de l'aiguille montre les murs (tout s'allume une fois résolu)
    if (!G.solved.aiguille) {
      const flick = (t % FLICKER) > FLICKER - FLICKER_OFF - 250 && !hidden ? (Math.random() < 0.5 ? 0.75 : 1) : 1;
      const R = LIGHT_R * cell * flick;
      c.save(); c.beginPath(); c.rect(ox - 6, oy - 6, n + 12, n + 12); c.clip();
      const g = c.createRadialGradient(nx, ny, R * 0.35, nx, ny, R);
      g.addColorStop(0, 'rgba(3,6,10,0)'); g.addColorStop(1, 'rgba(3,6,10,0.97)');
      c.fillStyle = g; c.fillRect(ox - 6, oy - 6, n + 12, n + 12);
      c.restore();
      // cadre extérieur toujours visible
      c.strokeStyle = 'rgba(144,202,249,.35)'; c.lineWidth = 2; c.strokeRect(ox - 1, oy - 1, n + 2, n + 2);
    }
    if (hit) { c.fillStyle = 'rgba(255,0,0,' + (0.4 * (G.mazeFlash - t) / 450).toFixed(2) + ')'; c.fillRect(ox - 6, oy - 6, n + 12, n + 12); }
    // drapeau (toujours visible, pulse)
    const pulse = 1 + 0.12 * Math.sin(t / 180);
    c.globalAlpha = 0.35; c.fillStyle = G.solved.aiguille ? '#00e676' : '#ff5252';
    c.beginPath(); c.arc(cx(m.goal[0]), cy(m.goal[1]), 14 * pulse, 0, 7); c.fill(); c.globalAlpha = 1;
    tx(c, '⚑', cx(m.goal[0]), cy(m.goal[1]), 24, G.solved.aiguille ? '#00e676' : '#ff5252');
    // aiguille (bille physique)
    const sp = Math.hypot(G.nv[0], G.nv[1]);
    c.save(); c.translate(nx, ny); c.rotate(Math.atan2(G.nv[1], G.nv[0])); c.scale(1 + Math.min(0.25, sp * 0.03), 1 - Math.min(0.15, sp * 0.02));
    c.beginPath(); c.arc(0, 0, 10, 0, 7); c.fillStyle = '#ffd54f'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#ff6f00'; c.stroke();
    c.restore();
    c.beginPath(); c.arc(nx - 3, ny - 3, 3, 0, 7); c.fillStyle = 'rgba(255,255,255,.8)'; c.fill();
    if (hidden) tx(c, '⚡ panne de lumière ⚡', CW / 2, oy + n + 1, 11, '#ffd54f', true);
    if (G.solved.aiguille) {
      tx(c, 'LÉGENDE', CW / 2, 318, 14, '#fff', true);
      const items = G.p.legend.map(l => l.symbol + ' = ' + l.digit);
      tx(c, items.slice(0, 3).join('     '), CW / 2, 348, 21, '#fff', true);
      tx(c, items.slice(3).join('     '), CW / 2, 380, 21, '#fff', true);
    } else Object.entries(PAD).forEach(([d, [x, y, w, h, s]]) => {
      const pressed = (G.padFlash[d] || 0) > t;
      rr(c, x, y + (pressed ? 2 : 0), w, h, 10, pressed ? '#455a64' : '#263238', '#7a828f'); tx(c, s, x + w / 2, y + h / 2 + (pressed ? 2 : 0), 26, '#fff', true);
      reg(x, y, w, h, () => moveNeedle(d));
    });
    plate(c, G.solved.aiguille ? 'Légende débloquée : sers-t’en au clavier.' : 'Dans le noir : glisse sur le labyrinthe ou utilise la croix. Un mur = −30 s.');
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
    if (G.solved.aiguille || G.over) return;
    const [x, y] = G.pos, [dx, dy] = L.STEP[d]; G.padFlash[d] = now() + 110;
    if (!L.canMove(G.p.maze, x, y, d)) {
      // la bille cogne le mur et rebondit, la bombe sursaute
      G.nv[0] += dx * 7; G.nv[1] += dy * 7; G.mazeFlash = now() + 450;
      kickTilt(dx * 3.2 + (Math.random() - 0.5) * 2, dy * 3.2 + (Math.random() - 0.5) * 2, 3);
      Sfx.tone(90, 0.25, 'square', 0.12, -40);
      return strike();
    }
    G.pos = [x + dx, y + dy]; G.nv[0] += dx * 3; G.nv[1] += dy * 3; // élan
    kickTilt(dx * 0.9, dy * 0.9, 0);
    Sfx.tone(520 + Math.random() * 120, 0.05, 'triangle', 0.06, 200);
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
    $('dots').querySelector('span').textContent = G.face === 3 && !G.solved.aiguille ? 'glisse hors du labyrinthe ou ◀ ▶ pour tourner' : 'glisse pour tourner';
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
  function start() {
    Sfx.init(); newGame(); show('game');
    Sfx.bedStart(() => G.p && { remaining: G.remaining, strikes: G.strikes, running: G.running && !G.over, final: cine && cine.type === 'lose' && !cine.exploded });
  }
  function muteUi() { $('mute').textContent = Sfx.muted ? '🔇' : '🔊'; $('mute').setAttribute('aria-label', Sfx.muted ? 'Activer le son' : 'Couper le son'); }
  $('mute').onclick = e => { e.stopPropagation(); Sfx.init(); Sfx.setMuted(!Sfx.muted); muteUi(); };
  muteUi();
  $('start').onclick = start; $('again').onclick = start;
  $('home').onclick = () => { G.over = true; Sfx.bedStop(); resetFx(); show('title'); };
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
  const bomb = new THREE.Group(); bomb.add(box);
  const rig = new THREE.Group(); rig.add(bomb); scene.add(rig); // bascule dans le repère caméra
  const tilt = { x: 0, z: 0, vx: 0, vz: 0, jx: 0, jy: 0, jvx: 0, jvy: 0 };
  // impulsion : dx>0 penche vers la droite, dy>0 penche le haut vers le joueur ; jolt = secousse latérale
  function kickTilt(dx, dy, jolt) {
    tilt.vz -= dx * 0.9; tilt.vx += dy * 0.9;
    if (jolt) { tilt.jvx += (Math.random() - 0.5) * jolt; tilt.jvy += (Math.random() - 0.5) * jolt * 0.6; }
  }
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
    bomb.visible = false; Sfx.bedStop(true); Sfx.bigBoom();
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
      Sfx.bedStop(true); Sfx.powerDown(); setTimeout(() => cine && cine.type === 'win' && Sfx.jingle(), RM ? 500 : 1000);
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
  canvas.addEventListener('pointerdown', e => {
    Sfx.init(); if (G.over) return;
    const h = canAct() ? hitFace(e.clientX, e.clientY) : null;
    const maze = !!(h && h.fi === 3 && G.face === 3 && !G.solved.aiguille && inMaze(h.cx, h.cy));
    Object.assign(drag, { down: true, active: false, maze, ax: e.clientX, ay: e.clientY, moved: false, x: e.clientX, y: e.clientY, base: targetY });
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag.down) return;
    if (drag.maze) { // glisser sur le labyrinthe = déplacer la bille, jamais tourner la bombe
      const dx = e.clientX - drag.ax, dy = e.clientY - drag.ay, STEPPX = 34;
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= STEPPX) {
        moveNeedle(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n'));
        drag.ax = e.clientX; drag.ay = e.clientY; drag.moved = true;
        if (G.over || G.solved.aiguille) drag.maze = false, drag.down = false;
      }
      return;
    }
    const dx = e.clientX - drag.x;
    if (!drag.active && Math.abs(dx) > 10) drag.active = true;
    if (drag.active) rotY = drag.base + THREE.MathUtils.clamp(dx * 0.007, -HALF * 0.95, HALF * 0.95);
  });
  canvas.addEventListener('pointerup', e => {
    if (!drag.down) return;
    drag.down = false;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.maze) {
      drag.maze = false;
      if (!drag.moved && Math.max(Math.abs(dx), Math.abs(dy)) >= 18) moveNeedle(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n'));
      return;
    }
    if (drag.active) { drag.active = false; if (Math.abs(dx) > 45) rotate(dx < 0 ? 1 : -1); return; }
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) tapAt(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointercancel', () => { drag.down = drag.active = false; });
  function hitFace(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(box)[0];
    if (!hit) return null;
    return { fi: MAT_TO_FACE[hit.face.materialIndex], cx: hit.uv.x * CW, cy: (1 - hit.uv.y) * CH };
  }
  function tapAt(x, y) {
    if (!canAct()) return;
    const h = hitFace(x, y); if (!h || h.fi !== G.face) return;
    const fi = h.fi, cx = h.cx, cy = h.cy;
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
  window.D3 = { G, cine: () => cine && { type: cine.type, ended: !!cine.ended, exploded: !!cine.exploded, t: ft - cine.t0, tx: cine.exploded ? ft - cine.tx : -1 }, audio: () => Sfx.ctx ? { state: Sfx.ctx.state, bed: !!Sfx.bed, muted: Sfx.muted, tension: +Sfx.tension().toFixed(2) } : null, toScreen, keyRect, SCREWS, PAD, MZ, tilt, CW, CH, settled: () => Math.abs(rotY - targetY) < 0.01 };

  // ---------- Boucle ----------
  let last = now(), lightsT = 0;
  drawTop(topCanvas.getContext("2d")); topTex.needsUpdate = true;
  let lastMaze = 0;
  function stepPhysics(t, sRaw) {
    const s = Math.min(sRaw, 0.05);
    // bille : ressort amorti (glisse avec élan et se pose dans la case)
    if (G.p) for (let k = 0; k < 2; k++) {
      const a = 140 * (G.pos[k] - G.needle[k]) - 13 * G.nv[k];
      G.nv[k] += a * s; G.needle[k] += G.nv[k] * s;
    }
    // bombe instable sur la face Aiguille
    const unstable = G.p && !G.over && G.face === 3 && !G.solved.aiguille && Math.abs(rotY - targetY) < 0.3;
    const sec = t / 1000, amp = unstable ? 1 : 0;
    const txg = amp * (0.05 * Math.sin(sec * 1.7) + 0.025 * Math.sin(sec * 4.3 + 1));
    const tzg = amp * (0.06 * Math.sin(sec * 1.1 + 2) + 0.03 * Math.sin(sec * 3.7));
    tilt.vx += (-55 * (tilt.x - txg) - 5 * tilt.vx) * s; tilt.x += tilt.vx * s;
    tilt.vz += (-55 * (tilt.z - tzg) - 5 * tilt.vz) * s; tilt.z += tilt.vz * s;
    const jxg = amp * 0.04 * Math.sin(sec * 2.3), jyg = 0;
    tilt.jvx += (-160 * (tilt.jx - jxg) - 9 * tilt.jvx) * s; tilt.jx += tilt.jvx * s;
    tilt.jvy += (-160 * (tilt.jy - jyg) - 9 * tilt.jvy) * s; tilt.jy += tilt.jvy * s;
    const lim = 0.35;
    rig.rotation.x = THREE.MathUtils.clamp(tilt.x, -lim, lim); rig.rotation.z = THREE.MathUtils.clamp(tilt.z, -lim, lim);
    rig.position.x = tilt.jx * 0.25; rig.position.y = tilt.jy * 0.15;
    if (G.p && G.face === 3 && t - lastMaze > 33) { faces[3].dirty = true; lastMaze = t; }
  }
  function loop() {
    const t = now(), dt = Math.min(100, t - last); last = t;
    if (G.running && !G.over) {
      G.remaining -= dt;
      if (G.remaining <= 0) { G.remaining = 0; lose(); }
      const sec = Math.ceil(G.remaining / 1000);
      if (sec !== G.lastSec) { G.lastSec = sec; updateHud(); }
    }
    if (!drag.active) rotY += (targetY - rotY) * Math.min(1, dt * 0.012);
    const idle = G.over && G.won ? t * 0.0006 : 0;
    bomb.rotation.y = rotY + idle;
    bomb.position.y = Math.sin(t / 900) * 0.02;
    stepPhysics(t, dt / 1000);
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
