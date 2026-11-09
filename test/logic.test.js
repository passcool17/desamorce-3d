const assert = require('assert');
const L = require('../logic.js');
let n = 0; const lens = [];
for (let seed = 1; seed <= 5000; seed++) {
  const p = L.generate(seed);
  const s = L.solveFromClues(p);
  assert.deepStrictEqual(s.wiresToCut, p.solution.wiresToCut, 'fils ' + seed);
  assert.ok(s.wiresToCut.length >= 2, 'au moins 2 fils à couper');
  assert.ok(s.wiresToCut.length < p.wires.length, 'au moins un fil à ne pas couper');
  assert.deepStrictEqual(s.screwOrder, p.solution.screwOrder, 'vis ' + seed);
  assert.deepStrictEqual([...s.screwOrder].sort().join(''), '1234');
  assert.strictEqual(s.code, p.solution.code, 'code ' + seed);
  assert.match(s.code, /^\d{4}$/);
  assert.strictEqual(new Set(p.legend.map(l => l.symbol)).size, p.legend.length, 'légende sans doublon');
  assert.strictEqual(new Set(p.legend.map(l => l.digit)).size, p.legend.length, 'chiffres uniques');
  // Simule l'aiguille : chaque pas doit être légal et finir sur le drapeau.
  let [x, y] = p.maze.start;
  assert.ok(s.mazePath && s.mazePath.length > 0, 'chemin aiguille ' + seed);
  for (const d of s.mazePath) { assert.ok(L.canMove(p.maze, x, y, d)); x += L.STEP[d][0]; y += L.STEP[d][1]; }
  assert.deepStrictEqual([x, y], p.maze.goal);
  assert.strictEqual(p.maze.size, 8, 'labyrinthe 8x8');
  // labyrinthe parfait : 64 cases toutes reliées, 63 passages (aucune boucle) → un seul chemin
  let open = 0; const seen = new Set(['0,0']), q = [[0, 0]];
  while (q.length) { const [cx, cy] = q.pop(); for (const d of ['n', 'e', 's', 'w']) if (L.canMove(p.maze, cx, cy, d)) { open++; const k = (cx + L.STEP[d][0]) + ',' + (cy + L.STEP[d][1]); if (!seen.has(k)) { seen.add(k); q.push([cx + L.STEP[d][0], cy + L.STEP[d][1]]); } } }
  assert.strictEqual(seen.size, 64, 'toutes les cases accessibles'); assert.strictEqual(open / 2, 63, 'arbre couvrant');
  lens.push(s.mazePath.length);
  n++;
}
const a = L.generate(7), b = L.generate(8);
assert.notStrictEqual(JSON.stringify(a), JSON.stringify(b), 'parties différentes');
console.log('OK : ' + n + ' parties générées, toutes solubles à partir des indices.');
lens.sort((a, b) => a - b);
console.log('Aiguille 8x8 : chemin min ' + lens[0] + ', médian ' + lens[lens.length >> 1] + ', max ' + lens[lens.length - 1] + ' déplacements.');
assert.ok(lens[0] >= 14, 'coin à coin : au moins 14 déplacements');
