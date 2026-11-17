// Désamorce! — génération des énigmes (solution d'abord, indices ensuite).
// Utilisable dans le navigateur (window.DesamorceLogic) et dans Node (require).
(function (root) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const COLORS = [
    { id: 'rouge', label: 'Rouge', hex: 0xe53935 },
    { id: 'bleu', label: 'Bleu', hex: 0x1e88e5 },
    { id: 'jaune', label: 'Jaune', hex: 0xfdd835 },
    { id: 'vert', label: 'Vert', hex: 0x43a047 },
    { id: 'blanc', label: 'Blanc', hex: 0xf5f5f5 },
    { id: 'mauve', label: 'Mauve', hex: 0x8e24aa }
  ];
  const SYMBOLS = ['★', '●', '▲', '◆', '■', '♥', '✚', '☾'];
  const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

  function shuffle(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

  // Labyrinthe parfait (DFS) : walls[y][x] = {n,e,s,w} true si mur.
  function makeMaze(rnd, n) {
    const walls = [];
    for (let y = 0; y < n; y++) {
      walls.push([]);
      for (let x = 0; x < n; x++) walls[y].push({ n: true, e: true, s: true, w: true });
    }
    const seen = new Set();
    const stack = [[0, 0]];
    seen.add('0,0');
    const dirs = [['n', 0, -1, 's'], ['e', 1, 0, 'w'], ['s', 0, 1, 'n'], ['w', -1, 0, 'e']];
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const opts = shuffle(dirs, rnd).filter(([, dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && ny >= 0 && nx < n && ny < n && !seen.has(nx + ',' + ny);
      });
      if (!opts.length) { stack.pop(); continue; }
      const [d, dx, dy, od] = opts[0];
      const nx = x + dx, ny = y + dy;
      walls[y][x][d] = false;
      walls[ny][nx][od] = false;
      seen.add(nx + ',' + ny);
      stack.push([nx, ny]);
    }
    const corners = shuffle([[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]], rnd);
    const start = corners[0];
    const goal = [n - 1 - start[0], n - 1 - start[1]]; // coin opposé
    return { size: n, walls, start, goal };
  }

  const STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  function canMove(maze, x, y, d) {
    if (maze.walls[y][x][d]) return false;
    const nx = x + STEP[d][0], ny = y + STEP[d][1];
    return nx >= 0 && ny >= 0 && nx < maze.size && ny < maze.size;
  }
  function mazePath(maze) { // BFS, liste de directions
    const key = (x, y) => x + ',' + y;
    const prev = new Map([[key(...maze.start), null]]);
    const q = [maze.start];
    while (q.length) {
      const [x, y] = q.shift();
      if (x === maze.goal[0] && y === maze.goal[1]) break;
      for (const d of ['n', 'e', 's', 'w']) {
        if (!canMove(maze, x, y, d)) continue;
        const nx = x + STEP[d][0], ny = y + STEP[d][1];
        if (prev.has(key(nx, ny))) continue;
        prev.set(key(nx, ny), [x, y, d]);
        q.push([nx, ny]);
      }
    }
    if (!prev.has(key(...maze.goal))) return null;
    const path = [];
    let cur = maze.goal;
    while (prev.get(key(...cur))) {
      const [px, py, d] = prev.get(key(...cur));
      path.unshift(d);
      cur = [px, py];
    }
    return path;
  }

  // ---------- Niveaux de difficulté ----------
  // maxStrikes = nombre de croix ; la dernière croix fait BOUM.
  const DIFFS = {
    facile:    { id: 'facile',    letter: 'F', label: 'Facile',    timeMs: 6 * 60000, maxStrikes: 4, penaltyMs: 20000, mazeSize: 6, wires: 5, seqLen: 0, lightR: 2.6,  blackout: 0,    modules: ['fils', 'clavier', 'panneau', 'aiguille'] },
    normal:    { id: 'normal',    letter: 'N', label: 'Normal',    timeMs: 6 * 60000, maxStrikes: 3, penaltyMs: 30000, mazeSize: 8, wires: 5, seqLen: 4, lightR: 1.7,  blackout: 5200, modules: ['fils', 'clavier', 'panneau', 'aiguille', 'interrupteurs', 'sequence'] },
    difficile: { id: 'difficile', letter: 'D', label: 'Difficile', timeMs: 5 * 60000, maxStrikes: 2, penaltyMs: 45000, mazeSize: 8, wires: 6, seqLen: 5, lightR: 1.45, blackout: 4200, modules: ['fils', 'clavier', 'panneau', 'aiguille', 'interrupteurs', 'sequence'] }
  };
  const DIFF_IDS = ['facile', 'normal', 'difficile'];
  // Face où se trouve chaque module (0..3 = côtés, top = dessus, bottom = dessous).
  const MODULE_FACE = { fils: 0, clavier: 1, panneau: 2, aiguille: 3, interrupteurs: 'top', sequence: 'bottom' };
  const SEQ_COLORS = [
    { id: 'rouge', label: 'Rouge', hex: 0xe53935 },
    { id: 'bleu', label: 'Bleu', hex: 0x1e88e5 },
    { id: 'vert', label: 'Vert', hex: 0x43a047 },
    { id: 'jaune', label: 'Jaune', hex: 0xfdd835 }
  ];
  const SWITCH_VALUES = [1, 2, 4, 8, 16];

  function generate(seed, diffId) {
    if (seed === undefined || seed === null) seed = Math.floor(Math.random() * SEED_MAX);
    const D = DIFFS[diffId] || DIFFS.normal;
    const rnd = mulberry32(seed);

    // --- Solutions d'abord ---
    // Fils : 2 couleurs à couper.
    const palette = shuffle(COLORS, rnd);
    const cutColors = palette.slice(0, 2);
    // Voyants : 4 couleurs dont les 2 à couper (allumées) + 2 éteintes.
    const unlitLights = palette.slice(2, 4);
    const lights = shuffle(
      cutColors.map(c => ({ color: c.id, lit: true })).concat(unlitLights.map(c => ({ color: c.id, lit: false }))),
      rnd
    );
    // N fils : les 2 à couper + leurres (couleurs non allumées, répétitions permises).
    const decoyPool = palette.slice(2);
    const wireColors = shuffle(
      cutColors.map(c => c.id).concat(Array.from({ length: D.wires - 2 }, () => pick(decoyPool, rnd).id)),
      rnd
    );
    const wiresToCut = wireColors.map((c, i) => (cutColors.some(k => k.id === c) ? i : -1)).filter(i => i >= 0);

    // Vis : ordre de dévissage = permutation de 1..4, cachée dans le n° de série.
    const screwOrder = shuffle([1, 2, 3, 4], rnd);
    const serial = pick(LETTERS, rnd) + pick(LETTERS, rnd) + '-' + screwOrder.join('') + '-' + pick(LETTERS, rnd);

    // Clavier : code de 4 chiffres -> symboles (sous le panneau) + légende (après l'aiguille).
    const syms = shuffle(SYMBOLS, rnd).slice(0, 6);
    const digits = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], rnd).slice(0, 6);
    const legend = syms.map((s, i) => ({ symbol: s, digit: digits[i] }));
    const panelSymbols = [0, 1, 2, 3].map(() => pick(syms, rnd));
    const code = panelSymbols.map(s => legend.find(l => l.symbol === s).digit).join('');

    // Aiguille : labyrinthe parfait, toujours un chemin.
    const maze = makeMaze(rnd, D.mazeSize);

    const p = {
      seed,
      diff: D.id,
      bombCode: encodeCode(seed, D.id),
      modules: D.modules.slice(),
      serial,
      lights,
      wires: wireColors,
      panelSymbols,
      legend: shuffle(legend, rnd),
      maze,
      solution: { wiresToCut, screwOrder, code, mazePath: mazePath(maze) }
    };

    // --- Modules du dessus et du dessous (Normal / Difficile), flux aléatoire séparé ---
    if (D.seqLen) {
      const r2 = mulberry32((seed * 2654435761 + 0x5bd1e995) >>> 0);
      // Dessus : 5 interrupteurs, valeurs 1/2/4/8/16 mélangées ; indice « TENSION » au dessous.
      const switchValues = shuffle(SWITCH_VALUES, r2);
      const k = 2 + Math.floor(r2() * 3); // 2 à 4 interrupteurs levés
      const upIdx = shuffle([0, 1, 2, 3, 4], r2).slice(0, k).sort((a, b) => a - b);
      const switchTarget = upIdx.reduce((s, i) => s + switchValues[i], 0);
      const switchesUp = [0, 1, 2, 3, 4].map(i => upIdx.includes(i));
      // Dessous : séquence de couleurs qui clignote ; table de correspondance au dessus.
      let perm;
      do { perm = shuffle([0, 1, 2, 3], r2); } while (perm.some((v, i) => v === i)); // dérangement : jamais la même couleur
      const seqMap = {}; SEQ_COLORS.forEach((c, i) => { seqMap[c.id] = SEQ_COLORS[perm[i]].id; });
      const seq = [];
      while (seq.length < D.seqLen) {
        const c = pick(SEQ_COLORS, r2).id;
        if (seq.length >= 2 && seq[seq.length - 1] === c && seq[seq.length - 2] === c) continue; // pas 3 fois de suite
        seq.push(c);
      }
      Object.assign(p, { switchValues, switchTarget, seq, seqMap });
      p.solution.switchesUp = switchesUp;
      p.solution.seqPress = seq.map(c => seqMap[c]);
    }
    return p;
  }

  // Résolution uniquement à partir des indices affichés (pour les tests).
  function solveFromClues(p) {
    const litColors = p.lights.filter(l => l.lit).map(l => l.color);
    const wiresToCut = p.wires.map((c, i) => (litColors.includes(c) ? i : -1)).filter(i => i >= 0);
    const screwOrder = p.serial.split('-')[1].split('').map(Number);
    const code = p.panelSymbols.map(s => p.legend.find(l => l.symbol === s).digit).join('');
    const out = { wiresToCut, screwOrder, code, mazePath: mazePath(p.maze) };
    if (p.modules.includes('interrupteurs')) {
      // décomposition binaire de la tension : chaque valeur est une puissance de 2 distincte
      out.switchesUp = p.switchValues.map(v => (p.switchTarget & v) !== 0);
    }
    if (p.modules.includes('sequence')) out.seqPress = p.seq.map(c => p.seqMap[c]);
    return out;
  }

  // ---------- Mode duo ----------
  // Indices retirés de la bombe en duo : ils sont dans le manuel (manuel.html?code=…).
  const DUO_HIDDEN = ['lights', 'legend', 'switchTarget', 'seqMap'];
  function bombView(p, duo) {
    const v = JSON.parse(JSON.stringify(p)); delete v.solution;
    if (duo) DUO_HIDDEN.forEach(k => delete v[k]);
    return v;
  }
  // Tout ce que le manuel affiche, recalculé à partir du seul code de la bombe.
  function manualFromCode(str) {
    const d = decodeCode(str);
    if (!d) return null;
    const p = generate(d.seed, d.diff);
    const m = { code: p.bombCode, diff: p.diff, modules: p.modules, lights: p.lights, legend: p.legend, maze: p.maze };
    if (p.modules.includes('interrupteurs')) Object.assign(m, { switchTarget: p.switchTarget, seqMap: p.seqMap });
    return m;
  }

  // ---------- Code de bombe : lettre de niveau + 4 caractères (graine 20 bits) + 1 caractère de contrôle ----------
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford : sans I, L, O, U
  const SEED_MAX = 1 << 20;
  function checkChar(letter, body) {
    // poids impairs (premiers avec 32) : toute faute sur un seul caractère change la somme
    let s = B32.indexOf(letter) * 11;
    for (let i = 0; i < body.length; i++) s += B32.indexOf(body[i]) * (2 * i + 1);
    return B32[s % 32];
  }
  function encodeCode(seed, diffId) {
    const D = DIFFS[diffId] || DIFFS.normal;
    let n = seed % SEED_MAX, body = '';
    for (let i = 0; i < 4; i++) { body = B32[n % 32] + body; n = Math.floor(n / 32); }
    return D.letter + '-' + body + checkChar(D.letter, body);
  }
  function normalizeCode(str) {
    return String(str || '').toUpperCase().replace(/[\s\-_.]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
  }
  function decodeCode(str) {
    const s = normalizeCode(str);
    if (!/^[FND][0-9A-Z]{5}$/.test(s)) return null;
    const letter = s[0], body = s.slice(1, 5), chk = s[5];
    if ([...body, chk].some(c => B32.indexOf(c) < 0)) return null;
    if (checkChar(letter, body) !== chk) return null;
    let seed = 0; for (const c of body) seed = seed * 32 + B32.indexOf(c);
    const diff = DIFF_IDS.find(id => DIFFS[id].letter === letter);
    return { seed, diff, code: letter + '-' + body + chk };
  }
  function randomSeed() { return Math.floor(Math.random() * SEED_MAX); }

  const api = {
    generate, solveFromClues, canMove, mazePath, STEP, COLORS, SYMBOLS, SEQ_COLORS, SWITCH_VALUES,
    DIFFS, DIFF_IDS, MODULE_FACE, DUO_HIDDEN, bombView, manualFromCode, encodeCode, decodeCode, normalizeCode, randomSeed, SEED_MAX,
    colorById: id => COLORS.find(c => c.id === id) || SEQ_COLORS.find(c => c.id === id)
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DesamorceLogic = api;
})(typeof window !== 'undefined' ? window : this);
