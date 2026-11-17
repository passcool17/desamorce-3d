// Désamorce! 3D — modèle de la bombe.
// La bombe procédurale porte déjà les noms de nœuds du futur GLB (choix de Pascal, 16 nov. 2026 :
// dynamite + écran DEL dans une mallette métallique à couvercle à loquet). Remplacer le procédural
// par le GLB = changer seulement le chargeur (voir loadBombGLB plus bas) :
//   Bomb_Case        boîtier (mallette métallique)
//   Bomb_Lid         couvercle du panneau, origine sur la charnière, détachable
//   Bomb_Dynamite    bâtons de dynamite
//   Bomb_LED         écran DEL, matériau « LED_Screen », UV 0-1 : le jeu y dessine le chrono (CanvasTexture)
//   Wire_<Color>     fils intacts (Red, Blue, Yellow, Green, White, Purple) ; Wire_<Color>_CutA / _CutB = moitiés qui pendent après la coupe
//   Mount_Front / Mount_Right / Mount_Back / Mount_Left / Mount_Top / Mount_Bottom
//                    repères vides où le jeu pose les 6 faces de modules (plan local XY, normale +Z)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DIMS = { BW: 2, BH: 2.6, BD: 2 };
export const MOUNTS = ['Mount_Front', 'Mount_Right', 'Mount_Back', 'Mount_Left', 'Mount_Top', 'Mount_Bottom'];
const HALF = Math.PI / 2;
const LID_STOP = 110 * Math.PI / 180; // butée de la charnière du couvercle (même valeur que le .blend)
// Modèle GLB (Modélisation, 2026-11-16) : boîtier 0,405 x 0,405 x 0,5225 m → x5 et -1,3 en Y pour coïncider avec la bombe procédurale.
export const GLB_FIT = { scale: 5, y: -1.3 };

// Noms de couleur anglais pour les nœuds du GLB (Wire_Red, Wire_Red_CutA…)
const EN = { rouge: 'Red', bleu: 'Blue', jaune: 'Yellow', vert: 'Green', blanc: 'White', mauve: 'Purple' };
const cap = s => EN[s] || (s.charAt(0).toUpperCase() + s.slice(1));

function paperTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#b3261e'; x.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,220,200'},${0.04 + Math.random() * 0.05})`; x.fillRect(0, Math.random() * 256, 64, 1 + Math.random() * 3); }
  x.fillStyle = 'rgba(20,10,5,.75)'; x.font = 'bold 15px Arial'; x.save(); x.translate(38, 128); x.rotate(-HALF); x.textAlign = 'center'; x.fillText('DYNAMITE', 0, 0); x.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function brushedTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#7d848e'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + Math.random() * 0.05})`; x.fillRect(0, Math.random() * 256, 256, 1); }
  for (let i = 0; i < 25; i++) { x.fillStyle = 'rgba(60,40,20,.12)'; x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 10, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// Écran DEL du chrono (nœud Bomb_LED, matériau LED_Screen). Canvas 384 x 192 (rapport 2:1, comme l'écran du modèle GLB : 0,1106 x 0,0554 m).
export function makeLedScreen() {
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 192;
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }); mat.name = 'LED_Screen';
  let last = '';
  function draw(text, sub, color) {
    const key = text + '|' + sub + '|' + color; if (key === last) return; last = key;
    const x = canvas.getContext('2d');
    x.fillStyle = '#060201'; x.fillRect(0, 0, 384, 192);
    x.font = 'bold 116px "Courier New", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,60,40,.08)'; x.fillText('8:88', 192, 84);          // segments éteints
    x.shadowColor = color; x.shadowBlur = 18; x.fillStyle = color; x.fillText(text, 192, 84); x.shadowBlur = 0;
    x.font = 'bold 26px "Courier New", monospace'; x.fillStyle = '#ffb300'; x.fillText(sub, 192, 164);
    tex.needsUpdate = true;
  }
  return { canvas, tex, mat, draw };
}

// Construit la bombe procédurale. faceMats : 6 matériaux (Front, Right, Back, Left, Top, Bottom).
export function buildProceduralBomb({ faceMats, envLow }) {
  const { BW, BH, BD } = DIMS;
  const root = new THREE.Group(); root.name = 'Bomb';
  // Bomb_Case : boîtier métallique arrondi
  const metalTex = brushedTexture();
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x9aa1ab, map: metalTex, roughness: 0.42, metalness: envLow ? 0.35 : 0.85 });
  const caseMesh = new THREE.Mesh(new RoundedBoxGeometry(BW + 0.06, BH + 0.06, BD + 0.06, 2, 0.07), caseMat);
  caseMesh.name = 'Bomb_Case'; root.add(caseMesh);

  // Repères des faces (Mount_*) : plan local XY, normale +Z vers l'extérieur
  const off = 0.035;
  const mountDefs = [
    ['Mount_Front', [0, 0, BD / 2 + off], [0, 0, 0], BW, BH],
    ['Mount_Right', [BW / 2 + off, 0, 0], [0, HALF, 0], BD, BH],
    ['Mount_Back', [0, 0, -BD / 2 - off], [0, Math.PI, 0], BW, BH],
    ['Mount_Left', [-BW / 2 - off, 0, 0], [0, -HALF, 0], BD, BH],
    ['Mount_Top', [0, BH / 2 + off, 0], [-HALF, 0, 0], BW, BD],
    ['Mount_Bottom', [0, -BH / 2 - off, 0], [HALF, 0, 0], BW, BD]
  ];
  const mounts = {}, facePlanes = [];
  mountDefs.forEach(([name, p, r, w, h], i) => {
    const m = new THREE.Group(); m.name = name; m.position.set(...p); m.rotation.set(...r); root.add(m); mounts[name] = m;
    // Les faces du dessus/dessous pivotent dans leur plan pour rester lisibles (voir setSpin)
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), faceMats[i]);
    plane.name = 'Face_' + name.slice(6); plane.userData.size = [w - 0.06, h - 0.06]; plane.userData.faceIndex = i;
    m.add(plane); facePlanes.push(plane);
  });

  // Bomb_Dynamite : un bâton par arête verticale + rubans adhésifs (2 InstancedMesh)
  const dyn = new THREE.Group(); dyn.name = 'Bomb_Dynamite'; root.add(dyn);
  const stickR = 0.11, stickH = BH - 0.28;
  const capMat = new THREE.MeshStandardMaterial({ color: 0xd9c49a, roughness: 0.9 });
  const sticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(stickR, stickR, stickH, 18), [new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 0.78 }), capMat, capMat], 4);
  sticks.name = 'Bomb_Dynamite_Sticks';
  const bands = new THREE.InstancedMesh(new THREE.CylinderGeometry(stickR + 0.012, stickR + 0.012, 0.1, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.55, metalness: 0.1 }), 8);
  bands.name = 'Bomb_Dynamite_Tape';
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]], mtx = new THREE.Matrix4();
  corners.forEach(([sx, sz], i) => {
    sticks.setMatrixAt(i, mtx.makeTranslation(sx * BW / 2, 0, sz * BD / 2));
    [-1, 1].forEach((k, j) => bands.setMatrixAt(i * 2 + j, mtx.makeTranslation(sx * BW / 2, k * (BH / 2 - 0.5), sz * BD / 2)));
  });
  dyn.add(sticks, bands);

  // Petites DEL d'état : 3 par bâton (1 InstancedMesh, couleur par instance)
  const leds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.042, 10, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), 12);
  leds.name = 'Bomb_StatusLEDs';
  corners.forEach(([sx, sz], i) => [0.55, 0, -0.55].forEach((y, k) => {
    const d = (stickR + 0.01) / Math.SQRT2;
    leds.setMatrixAt(i * 3 + k, mtx.makeTranslation(sx * (BW / 2 + d), y, sz * (BD / 2 + d)));
    leds.setColorAt(i * 3 + k, new THREE.Color(0xff2020));
  }));
  root.add(leds);

  // Bomb_LED : écran du chrono, en saillie sur le dessus (zone haute de la face du dessus)
  const led = makeLedScreen();
  const ledGroup = new THREE.Group(); ledGroup.name = 'Bomb_LED_Mount';
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.62, 0.08, 2, 0.03), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.6 }));
  bezel.name = 'Bomb_LED_Bezel';
  const ledMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.52), led.mat); ledMesh.name = 'Bomb_LED'; ledMesh.position.z = 0.041;
  ledGroup.add(bezel, ledMesh);
  // posé sur Mount_Top (son repère pivote avec la face, donc l'écran reste lisible avec elle)
  ledGroup.position.set(0, 0.62, 0.04);
  facePlanes[4].add(ledGroup);

  return { root, caseMesh, mounts, facePlanes, sticks, bands, leds, led, ledMesh, metalMat: caseMat, source: 'procedural' };
}

// ---------- Fils 3D (face avant) ----------
// Wire_<Couleur> : de la borne gauche à la borne droite. Après la coupe : Wire_<Couleur>_CutA (gauche)
// et _CutB (droite) pivotent autour de leur borne et pendent, avec un ressort amorti.
export function buildWires(plane, colors, colorHex, toLocal) {
  const group = new THREE.Group(); group.name = 'Wires'; plane.add(group);
  const mats = {};
  const matFor = id => mats[id] || (mats[id] = new THREE.MeshStandardMaterial({ color: colorHex(id), roughness: 0.38, metalness: 0.05 }));
  const copper = new THREE.MeshStandardMaterial({ color: 0xd08a3a, roughness: 0.3, metalness: 0.9 });
  const tipGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.06, 6); tipGeo.rotateZ(HALF);
  const wires = colors.map((id, i) => {
    const [ax, ay] = toLocal(56, i), [bx] = toLocal(344, i), len = bx - ax;
    const pts = [];
    for (let k = 0; k <= 8; k++) { const u = k / 8; pts.push(new THREE.Vector3(ax + u * len, ay + Math.sin(u * Math.PI * 2 + i) * 0.03 - Math.sin(u * Math.PI) * 0.03, 0.03 + Math.sin(u * Math.PI) * 0.07)); }
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.034, 7), matFor(id));
    mesh.name = 'Wire_' + cap(id); mesh.userData.index = i; group.add(mesh);
    // moitiés coupées, cachées au départ ; géométrie dans le repère de la borne (pivot)
    const half = (dir) => {
      const g = new THREE.Group(); g.name = 'Wire_' + cap(id) + (dir > 0 ? '_CutA' : '_CutB');
      g.position.set(dir > 0 ? ax : bx, ay, 0.03); g.visible = false;
      const hp = []; const hl = len * 0.46;
      for (let k = 0; k <= 6; k++) { const u = k / 6; hp.push(new THREE.Vector3(dir * u * hl, -Math.sin(u * Math.PI) * 0.02, Math.sin(u * Math.PI * 0.5) * 0.05)); }
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp), 12, 0.034, 7), matFor(id));
      const tip = new THREE.Mesh(tipGeo, copper); tip.position.set(dir * (hl + 0.02), 0, 0.05);
      g.add(m, tip); group.add(g);
      return { g, dir, ang: 0, vel: 0 };
    };
    return { id, mesh, a: half(1), b: half(-1), cut: false };
  });
  function cut(i) {
    const w = wires[i]; if (!w || w.cut) return; w.cut = true; w.mesh.visible = false;
    [w.a, w.b].forEach(h => { h.g.visible = true; h.ang = 0; h.vel = h.dir * -(2 + Math.random()); });
  }
  // Ressort : la moitié A tombe vers -π/2 (pend vers le bas), la moitié B vers +π/2 (repère miroir)
  function update(s) {
    wires.forEach(w => { if (!w.cut) return; [w.a, w.b].forEach(h => {
      const target = -h.dir * (HALF - 0.12);
      h.vel += (-26 * (h.ang - target) - 2.6 * h.vel) * s; h.ang += h.vel * s; h.g.rotation.z = h.ang;
    }); });
  }
  function dispose() { plane.remove(group); group.traverse(o => { if (o.isMesh && o.geometry !== tipGeo) o.geometry.dispose(); }); tipGeo.dispose(); Object.values(mats).forEach(m => m.dispose()); copper.dispose(); }
  return { group, wires, cut, update, dispose, hanging: () => wires.filter(w => w.cut).map(w => ({ id: w.id, a: +w.a.ang.toFixed(2), b: +w.b.ang.toFixed(2) })) };
}

// ---------- Couvercle du panneau (Bomb_Lid) + 4 vis ----------
// Origine du couvercle sur sa charnière (bord haut). Quand les 4 vis sont parties, il pivote sur
// la charnière, se détache et tombe sur la table (physique simple), puis y reste.
export function buildLid(plane, rect, screws, toLocalXY, lidTex) {
  const [x0, y0] = toLocalXY(rect.x, rect.y), [x1, y1] = toLocalXY(rect.x + rect.w, rect.y + rect.h);
  const w = x1 - x0, h = y0 - y1;
  const lid = new THREE.Group(); lid.name = 'Bomb_Lid';
  lid.position.set((x0 + x1) / 2, y0, 0.02); // charnière = bord haut
  const plateMat = [new THREE.MeshStandardMaterial({ color: 0x6c737d, roughness: 0.4, metalness: 0.8 })];
  const front = new THREE.MeshStandardMaterial({ map: lidTex, roughness: 0.45, metalness: 0.55 });
  const plateGeo = new RoundedBoxGeometry(w, h, 0.035, 2, 0.012);
  const plate = new THREE.Mesh(plateGeo, [plateMat[0], plateMat[0], plateMat[0], plateMat[0], front, plateMat[0]]);
  plate.position.y = -h / 2; plate.name = 'Bomb_Lid_Plate'; lid.add(plate);
  // charnière (cylindre)
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, w * 0.9, 10), plateMat[0]); hinge.rotation.z = HALF; hinge.position.z = 0.0; lid.add(hinge);
  plane.add(lid);
  // vis : tête + fente fusionnées, couleurs par sommet, 1 InstancedMesh
  const head = new THREE.CylinderGeometry(0.105, 0.105, 0.04, 20); head.rotateX(HALF);
  const slot = new THREE.BoxGeometry(0.15, 0.03, 0.012); slot.translate(0, 0, 0.022);
  const colorize = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const screwGeo = mergeGeometries([colorize(head.toNonIndexed(), 0xb8bec7), colorize(slot.toNonIndexed(), 0x3a3f46)]);
  const screwMesh = new THREE.InstancedMesh(screwGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.9 }), 4);
  screwMesh.name = 'Bomb_Lid_Screws'; plane.add(screwMesh);
  const S = screws.map(([cx, cy], i) => { const [sx, sy] = toLocalXY(cx, cy); return { x: sx, y: sy, z: 0.06, rot: i * 0.8, t: -1, gone: false, vz: 0, vy: 0, scale: 1 }; });
  const o = new THREE.Object3D();
  function writeScrews() {
    S.forEach((s, i) => { o.position.set(s.x, s.y, s.z); o.rotation.set(0, 0, s.rot); o.scale.setScalar(s.scale); o.updateMatrix(); screwMesh.setMatrixAt(i, o.matrix); });
    screwMesh.instanceMatrix.needsUpdate = true;
  }
  writeScrews();
  const state = { phase: 'closed', t: 0, v: new THREE.Vector3(), spin: new THREE.Vector3(), home: { pos: lid.position.clone(), parent: plane } };
  function unscrew(n) { const s = S[n - 1]; if (s.t < 0) s.t = 0; }
  function open() { if (state.phase === 'closed') { state.phase = 'swing'; state.t = 0; } }
  function update(s, scene, floorY) {
    let dirty = false;
    S.forEach(sc => { if (sc.t < 0 || sc.gone) return; sc.t += s; dirty = true;
      if (sc.t < 0.45) { sc.rot += s * 22; sc.z = 0.06 + sc.t * 0.35; }
      else { sc.vy -= 9.8 * s * 0.5; sc.y += sc.vy * s; sc.z += 0.4 * s; sc.scale = Math.max(0, 1 - (sc.t - 0.45) * 1.6); if (sc.scale <= 0) sc.gone = true; }
    });
    if (dirty) writeScrews();
    if (state.phase === 'swing') { // pivote sur la charnière, vers le haut et l'extérieur
      state.t += s; lid.rotation.x = -Math.min(LID_STOP, state.t * state.t * 9);
      if (state.t > 0.5) { // butée à 110°, puis se détache : passe dans le repère du monde
        scene.attach(lid); state.phase = 'fall';
        const n = new THREE.Vector3(0, 0, 1).transformDirection(plane.matrixWorld);
        state.v.copy(n).multiplyScalar(2.2); state.v.y += 2.4;
        state.spin.set(4 + Math.random() * 3, Math.random() * 2 - 1, Math.random() * 3 - 1.5);
      }
    } else if (state.phase === 'fall') {
      state.v.y -= 9.8 * s; lid.position.addScaledVector(state.v, s);
      lid.rotation.x += state.spin.x * s; lid.rotation.y += state.spin.y * s; lid.rotation.z += state.spin.z * s;
      if (lid.position.y < floorY + 0.05 && state.v.y < 0) {
        lid.position.y = floorY + 0.05; state.v.y *= -0.3; state.v.x *= 0.5; state.v.z *= 0.5; state.spin.multiplyScalar(0.4);
        if (Math.abs(state.v.y) < 0.4) { state.phase = 'rest'; lid.rotation.set(-HALF, lid.rotation.y, 0); lid.position.y = floorY + 0.03; }
      }
    }
  }
  function reset() {
    if (lid.parent !== plane) plane.attach(lid);
    lid.position.copy(state.home.pos); lid.rotation.set(0, 0, 0); state.phase = 'closed';
    S.forEach((s, i) => { const [sx, sy] = toLocalXY(...screws[i]); Object.assign(s, { x: sx, y: sy, z: 0.06, rot: i * 0.8, t: -1, gone: false, vy: 0, scale: 1 }); });
    writeScrews();
  }
  return { lid, screwMesh, unscrew, open, update, reset, state, screws: S };
}

// ---------- Futur modèle GLB ----------
// Charge un GLB qui respecte les noms ci-dessus. Les parties absentes restent procédurales.
// Utilisé seulement avec ?bomb=<url.glb> (pas encore de GLB livré).
export async function loadBombGLB(url, renderer) {
  const [{ GLTFLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/KTX2Loader.js'), import('three/addons/libs/meshopt_decoder.module.js')
  ]);
  const base = new URL('../vendor/three-0.187.0/addons/libs/basis/', import.meta.url).href;
  const ktx2 = new KTX2Loader().setTranscoderPath(base).detectSupport(renderer);
  const gltf = await new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder).loadAsync(url);
  const scene = gltf.scene, find = n => scene.getObjectByName(n) || null;
  scene.scale.setScalar(GLB_FIT.scale); scene.position.y = GLB_FIT.y; // Mount_* : +Z local vers l'extérieur, comme les faces procédurales
  return {
    root: scene, caseMesh: find('Bomb_Case'), lid: find('Bomb_Lid'), dynamite: find('Bomb_Dynamite'),
    ledMesh: find('Bomb_LED'), mounts: Object.fromEntries(MOUNTS.map(n => [n, find(n)])),
    wires: (color) => ({ intact: find('Wire_' + cap(color)), cutA: find('Wire_' + cap(color) + '_CutA'), cutB: find('Wire_' + cap(color) + '_CutB') }),
    source: 'glb:' + url
  };
}
