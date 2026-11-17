// Tests de logique : 5000 bombes × 3 niveaux, toutes solubles à partir des indices affichés,
// en solo (indices sur la bombe) et en duo (bombe sans les indices cachés + manuel recalculé du code).
const assert = require('assert');
const L = require('../logic.js');
const N = +(process.env.N || 5000);
const stats = {};
const FACE_OK = ['fils', 'clavier', 'panneau', 'aiguille', 'interrupteurs', 'sequence'];

function checkMaze(p, s, seed) {
  const m = p.maze, size = m.size;
  let [x, y] = m.start;
  assert.ok(s.mazePath && s.mazePath.length > 0, 'chemin aiguille ' + seed);
  for (const d of s.mazePath) { assert.ok(L.canMove(m, x, y, d)); x += L.STEP[d][0]; y += L.STEP[d][1]; }
  assert.deepStrictEqual([x, y], m.goal);
  // labyrinthe parfait : toutes les cases reliées, size²−1 passages (aucune boucle) → un seul chemin
  let open = 0; const seen = new Set(['0,0']), q = [[0, 0]];
  while (q.length) { const [cx, cy] = q.pop(); for (const d of ['n', 'e', 's', 'w']) if (L.canMove(m, cx, cy, d)) { open++; const k = (cx + L.STEP[d][0]) + ',' + (cy + L.STEP[d][1]); if (!seen.has(k)) { seen.add(k); q.push([cx + L.STEP[d][0], cy + L.STEP[d][1]]); } } }
  assert.strictEqual(seen.size, size * size, 'toutes les cases accessibles');
  assert.strictEqual(open / 2, size * size - 1, 'arbre couvrant');
}

function checkSolution(p, s, seed, tag) {
  const sol = p.solution, D = L.DIFFS[p.diff];
  assert.deepStrictEqual(s.wiresToCut, sol.wiresToCut, tag + ' fils ' + seed);
  assert.ok(s.wiresToCut.length >= 2 && s.wiresToCut.length < p.wires.length, 'fils à couper et à garder');
  assert.strictEqual(p.wires.length, D.wires, 'nombre de fils');
  assert.deepStrictEqual(s.screwOrder, sol.screwOrder, tag + ' vis ' + seed);
  assert.deepStrictEqual([...s.screwOrder].sort().join(''), '1234');
  assert.strictEqual(s.code, sol.code, tag + ' code ' + seed);
  assert.match(s.code, /^\d{4}$/);
  checkMaze(p, s, seed);
  if (D.seqLen) {
    assert.deepStrictEqual(s.switchesUp, sol.switchesUp, tag + ' interrupteurs ' + seed);
    const up = sol.switchesUp.filter(Boolean).length;
    assert.ok(up >= 2 && up <= 4, 'de 2 à 4 interrupteurs levés');
    assert.deepStrictEqual([...p.switchValues].sort((a, b) => a - b), L.SWITCH_VALUES, 'valeurs 1..16');
    assert.ok(p.switchTarget >= 3 && p.switchTarget <= 30, 'tension');
    assert.deepStrictEqual(s.seqPress, sol.seqPress, tag + ' séquence ' + seed);
    assert.strictEqual(p.seq.length, D.seqLen, 'longueur séquence');
    for (const c of L.SEQ_COLORS) assert.notStrictEqual(p.seqMap[c.id], c.id, 'table : jamais la même couleur');
    assert.strictEqual(new Set(Object.values(p.seqMap)).size, 4, 'table bijective');
  } else {
    assert.strictEqual(s.switchesUp, undefined); assert.strictEqual(s.seqPress, undefined);
  }
}

for (const diff of L.DIFF_IDS) {
  const D = L.DIFFS[diff];
  const lens = [];
  for (let seed = 1; seed <= N; seed++) {
    const p = L.generate(seed, diff);
    assert.strictEqual(p.diff, diff);
    assert.deepStrictEqual(p.modules, D.modules);
    p.modules.forEach(m => assert.ok(FACE_OK.includes(m)));
    // Solo : tout est sur la bombe.
    checkSolution(p, L.solveFromClues(p), seed, diff + ' solo');
    assert.strictEqual(new Set(p.legend.map(l => l.symbol)).size, p.legend.length, 'légende sans doublon');
    assert.strictEqual(new Set(p.legend.map(l => l.digit)).size, p.legend.length, 'chiffres uniques');
    assert.strictEqual(p.maze.size, D.mazeSize, 'taille labyrinthe');
    // Code de bombe : aller-retour, et le manuel ne dépend que du code.
    const dec = L.decodeCode(p.bombCode);
    assert.ok(dec, 'code lisible ' + p.bombCode);
    assert.strictEqual(dec.diff, diff); assert.strictEqual(dec.seed, seed);
    assert.deepStrictEqual(L.decodeCode(p.bombCode.toLowerCase().replace('-', ' ')), dec, 'saisie tolérante');
    // Duo : la bombe n'a pas les indices cachés ; le manuel (recalculé du code) les complète.
    const view = L.bombView(p, true);
    for (const k of L.DUO_HIDDEN) assert.strictEqual(view[k], undefined, 'indice ' + k + ' absent de la bombe en duo');
    assert.strictEqual(view.solution, undefined);
    const man = L.manualFromCode(p.bombCode);
    assert.deepStrictEqual(man.maze, p.maze, 'manuel : même labyrinthe');
    const merged = Object.assign({}, view, man);
    checkSolution(p, L.solveFromClues(merged), seed, diff + ' duo');
    // Sans le manuel, la bombe duo n'est pas soluble seule (coopération nécessaire).
    assert.throws(() => L.solveFromClues(view));
    lens.push(p.solution.mazePath.length);
  }
  lens.sort((a, b) => a - b);
  stats[diff] = { bombes: N, modules: D.modules.length, labyrinthe: D.mazeSize + 'x' + D.mazeSize, cheminMin: lens[0], cheminMedian: lens[lens.length >> 1], cheminMax: lens[lens.length - 1] };
  assert.ok(lens[0] >= 2 * (D.mazeSize - 1), 'coin à coin : au moins ' + 2 * (D.mazeSize - 1) + ' déplacements');
}

// Codes : contrôle d'erreur (une faute de frappe est détectée) et toutes les graines encodables.
let caught = 0, tries = 0;
for (let seed = 0; seed < 3000; seed++) {
  const c = L.encodeCode(seed * 349, 'normal').replace('-', '');
  for (let i = 1; i < 6; i++) for (const ch of '0123456789ABCDEFGHJKMNPQRSTVWXYZ') {
    if (ch === c[i]) continue;
    const alt = c.slice(0, i) + ch + c.slice(i + 1);
    tries++; const d = L.decodeCode(alt); if (!d || d.seed !== seed * 349) caught++;
  }
}
assert.strictEqual(caught, tries, 'chaque faute d’un caractère est détectée');
assert.strictEqual(L.decodeCode('N-0000'), null);
assert.strictEqual(L.decodeCode('X-00000'), null);
assert.strictEqual(L.decodeCode(L.encodeCode(L.SEED_MAX - 1, 'difficile')).seed, L.SEED_MAX - 1);
const a = L.generate(7), b = L.generate(8);
assert.notStrictEqual(JSON.stringify(a), JSON.stringify(b), 'parties différentes');
assert.strictEqual(a.diff, 'normal', 'normal par défaut');
console.log('OK : ' + N + ' bombes × 3 niveaux, toutes solubles en solo et en duo (bombe + manuel du code).');
console.table(stats);
console.log('Codes : ' + tries + ' fautes de frappe simulées, toutes détectées.');
