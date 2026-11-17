// Désamorce! 3D — son 100 % synthétisé (WebAudio), aucun fichier.
export const Sfx = {
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
    const base = 1 - Math.max(0, st.remaining) / (st.startMs || 300000);
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

// Sons ajoutés en v2 : basculer la bombe, interrupteurs, boutons de séquence, couvercle qui tombe.
Object.assign(Sfx, {
  whoosh() {
    const c = this.ctx; if (!c) return; const t = c.currentTime;
    const n = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    n.buffer = this.noiseBuf; f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(1400, t + 0.22);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    n.connect(f).connect(g).connect(this.out); n.start(t, Math.random() * 0.4, 0.35);
  },
  clack() { const c = this.ctx; if (!c) return; const t = c.currentTime; this.beepAt(t, 1800, 0.012, 0.05); this.beepAt(t + 0.03, 900, 0.02, 0.05); },
  seqTone(i) { this.tone([330, 415, 494, 587][i] || 440, 0.22, 'triangle', 0.09); },
  clang() {
    const c = this.ctx; if (!c) return; const t = c.currentTime;
    [523, 787, 1210, 1690].forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f * (1 + Math.random() * 0.01);
      g.gain.setValueAtTime(0.06 / (i + 1), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9 - i * 0.15); o.connect(g).connect(this.out); o.start(t); o.stop(t + 1); });
  },
  snip() { const c = this.ctx; if (!c) return; const t = c.currentTime; this.beepAt(t, 2600, 0.03, 0.06); this.beepAt(t + 0.02, 1500, 0.04, 0.05); }
});
