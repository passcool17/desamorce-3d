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
  const MAZE_SIZE = 5;

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

  function generate(seed) {
    if (seed === undefined) seed = Math.floor(Math.random() * 2 ** 31);
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
    // 5 fils : les 2 à couper + 3 leurres (couleurs non allumées, répétitions permises).
    const decoyPool = palette.slice(2);
    const wireColors = shuffle(
      cutColors.map(c => c.id).concat([0, 1, 2].map(() => pick(decoyPool, rnd).id)),
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
    const maze = makeMaze(rnd, MAZE_SIZE);

    return {
      seed,
      serial,
      lights,
      wires: wireColors,
      panelSymbols,
      legend: shuffle(legend, rnd),
      maze,
      solution: { wiresToCut, screwOrder, code, mazePath: mazePath(maze) }
    };
  }

  // Résolution uniquement à partir des indices affichés (pour les tests).
  function solveFromClues(p) {
    const litColors = p.lights.filter(l => l.lit).map(l => l.color);
    const wiresToCut = p.wires.map((c, i) => (litColors.includes(c) ? i : -1)).filter(i => i >= 0);
    const screwOrder = p.serial.split('-')[1].split('').map(Number);
    const code = p.panelSymbols.map(s => p.legend.find(l => l.symbol === s).digit).join('');
    return { wiresToCut, screwOrder, code, mazePath: mazePath(p.maze) };
  }

  const api = { generate, solveFromClues, canMove, mazePath, STEP, COLORS, SYMBOLS, colorById: id => COLORS.find(c => c.id === id) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DesamorceLogic = api;
})(typeof window !== 'undefined' ? window : this);
