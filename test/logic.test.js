const assert = require('assert');
const L = require('../logic.js');
let n = 0;
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
  n++;
}
const a = L.generate(7), b = L.generate(8);
assert.notStrictEqual(JSON.stringify(a), JSON.stringify(b), 'parties différentes');
console.log('OK : ' + n + ' parties générées, toutes solubles à partir des indices.');
