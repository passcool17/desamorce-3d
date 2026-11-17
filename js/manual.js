// Manuel du mode duo : tout est recalculé à partir du code de la bombe (aucun serveur).
const L = window.DesamorceLogic;
const $ = id => document.getElementById(id);
const hex = n => '#' + n.toString(16).padStart(6, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dot = (id, extra = '') => `<span class="dot ${extra}" style="--c:${hex(L.colorById(id).hex)}"></span>`;
const fmt = ms => Math.floor(ms / 60000) + ':' + String(Math.round(ms / 1000) % 60).padStart(2, '0');

function mazeSvg(m) {
  const c = 30, n = m.size, W = n * c + 8, line = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const w = m.walls[y][x], X = 4 + x * c, Y = 4 + y * c;
    if (w.n) line.push(`M${X} ${Y}h${c}`); if (w.w) line.push(`M${X} ${Y}v${c}`);
    if (y === n - 1 && w.s) line.push(`M${X} ${Y + c}h${c}`); if (x === n - 1 && w.e) line.push(`M${X + c} ${Y}v${c}`);
  }
  const cx = v => 4 + v * c + c / 2;
  return `<svg viewBox="0 0 ${W} ${W}" class="maze" role="img" aria-label="Carte du labyrinthe ${n} par ${n}">
    <rect x="0" y="0" width="${W}" height="${W}" fill="#0d1b2a"/>
    ${Array.from({ length: n * n }, (_, i) => `<circle cx="${cx(i % n)}" cy="${cx(Math.floor(i / n))}" r="1.5" fill="#2c4a68"/>`).join('')}
    <path d="${line.join('')}" stroke="#90caf9" stroke-width="3" stroke-linecap="round" fill="none"/>
    <circle cx="${cx(m.start[0])}" cy="${cx(m.start[1])}" r="9" fill="#ffd54f" stroke="#ff6f00" stroke-width="3"/>
    <text x="${cx(m.goal[0])}" y="${cx(m.goal[1]) + 7}" text-anchor="middle" font-size="20" fill="#ff5252">⚑</text></svg>`;
}

function render(code) {
  const d = L.decodeCode(code), out = $('out');
  if (!d) { $('err').textContent = code ? 'Code invalide. Vérifie chaque caractère (ex. N-7K4QZ : lettre du niveau, tiret, 5 caractères).' : ''; out.innerHTML = code ? '' : general(); return; }
  $('err').textContent = ''; $('code').value = d.code;
  const m = L.manualFromCode(d.code), D = L.DIFFS[m.diff];
  history.replaceState(null, '', '?code=' + encodeURIComponent(d.code));
  document.title = 'Manuel ' + d.code + ' — Désamorce! 3D';
  const lit = m.lights.filter(l => l.lit), unlit = m.lights.filter(l => !l.lit);
  const has = k => m.modules.includes(k);
  const sec = (n, title, face, body) => `<section class="mod"><h2><span class="n">${n}</span>${title}<small>${face}</small></h2>${body}</section>`;
  let i = 0, html = `<section class="bomb"><div><span class="lbl">Bombe</span><b class="code">${esc(d.code)}</b></div>
    <div><span class="lbl">Niveau</span><b>${D.label}</b></div><div><span class="lbl">Chrono</span><b>${fmt(D.timeMs)}</b></div>
    <div><span class="lbl">Erreurs</span><b>${D.maxStrikes} = BOUM</b></div><div><span class="lbl">Modules</span><b>${m.modules.length}</b></div></section>
    <p class="tip">Chaque erreur coûte ${D.penaltyMs / 1000} s. Demande à ton partenaire de tourner la bombe (glisser gauche/droite) et de la basculer (glisser bas = dessus, haut = dessous).</p>`;
  html += sec(++i, 'Fils', 'face 1', `<p>Coupe <b>tous</b> les fils dont la couleur est celle d’un voyant <b>allumé</b>. Ne coupe aucun autre fil.</p>
    <p class="big">Voyants allumés : ${lit.map(l => dot(l.color) + '<b>' + L.colorById(l.color).label + '</b>').join(' &nbsp; ')}</p>
    <p class="muted">Éteints (ne pas couper) : ${unlit.map(l => dot(l.color, 'off') + L.colorById(l.color).label).join(' &nbsp; ')}</p>`);
  html += sec(++i, 'Panneau', 'face 3', `<p>Le partenaire lit le <b>n° de série</b> (en haut de la face Fils), par exemple <code>AB-3142-K</code>. Il dévisse les 4 vis dans l’ordre des <b>4 chiffres du milieu</b> : 3, puis 1, puis 4, puis 2. Les numéros sont gravés près des vis.</p><p>Le couvercle tombe : dessous, 4 <b>symboles</b> pour le clavier.</p>`);
  html += sec(++i, 'Clavier', 'face 2', `<p>Fais-toi lire les 4 symboles <b>de gauche à droite</b> et traduis-les :</p>
    <table class="legend"><tr>${m.legend.map(l => `<th>${l.symbol}</th>`).join('')}</tr><tr>${m.legend.map(l => `<td>${l.digit}</td>`).join('')}</tr></table>
    <p>Le partenaire tape les 4 chiffres puis <b>OK</b> (EFF efface).</p>`);
  html += sec(++i, 'Aiguille', 'face 4', `<p>Ton partenaire est <b>dans le noir</b> : il voit seulement autour de la bille ●. Guide-le du départ ● au drapeau ⚑ (haut = haut de la face). Chaque mur touché = une erreur.</p>${mazeSvg(m.maze)}`);
  if (has('interrupteurs')) html += sec(++i, 'Interrupteurs', 'dessus', `<p class="big">Tension de cette bombe : <b>${m.switchTarget} V</b></p>
    <p>Chaque interrupteur porte une valeur (1, 2, 4, 8 ou 16). Fais lever ceux dont la <b>somme</b> fait ${m.switchTarget}, baisser les autres, puis <b>VALIDER</b>.</p>
    <p class="muted">Astuce : ${m.switchTarget} = ${L.SWITCH_VALUES.slice().reverse().filter(v => m.switchTarget & v).join(' + ')}.</p>`);
  if (has('sequence')) html += sec(++i, 'Séquence', 'dessous', `<p>Des couleurs clignotent en boucle. Pour <b>chaque</b> couleur qui clignote, dans l’ordre, le partenaire appuie la couleur de la table :</p>
    <table class="seq">${L.SEQ_COLORS.map(c => `<tr><td>${dot(c.id)} ${c.label} clignote</td><td>→</td><td>${dot(m.seqMap[c.id])} appuie <b>${L.colorById(m.seqMap[c.id]).label}</b></td></tr>`).join('')}</table>
    <p class="muted">Une erreur remet la séquence à zéro.</p>`);
  out.innerHTML = html;
}
function general() {
  return `<section class="mod"><h2>Pas encore de code</h2><p>Lance une partie en <b>mode Duo</b> sur le téléphone du désamorceur : le code (ex. <code>N-7K4QZ</code>) et un code QR s’affichent au départ. Le code est aussi sur le dessus de la bombe.</p>
  <p>Niveaux : ${L.DIFF_IDS.map(id => { const D = L.DIFFS[id]; return `<b>${D.label}</b> (${D.modules.length} modules, ${fmt(D.timeMs)}, ${D.maxStrikes} erreurs)`; }).join(' · ')}.</p></section>`;
}
$('f').addEventListener('submit', e => { e.preventDefault(); render($('code').value.trim()); });
render(new URLSearchParams(location.search).get('code') || '');
if ('serviceWorker' in navigator && isSecureContext && !location.search.includes('nosw=1')) navigator.serviceWorker.register('./sw.js?v=' + (new URL(import.meta.url).searchParams.get('v') || 'dev')).catch(() => {});
