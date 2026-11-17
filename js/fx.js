// Désamorce! 3D — effets des cinématiques, tout instancié : nombre d'appels de dessin fixe (~7)
// quel que soit le nombre de particules.
import * as THREE from 'three';

const VS = `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale;
varying float vA; varying vec3 vC;
void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = min(aSize * uScale / -mv.z, 600.0); gl_Position = projectionMatrix * mv; }`;
const FS = `uniform sampler2D uMap; varying float vA; varying vec3 vC;
void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); if (gl_FragColor.a < 0.004) discard; }`;

function sprite(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  if (kind === 'glow') {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  } else for (let i = 0; i < 6; i++) {
    const px = 20 + Math.random() * 24, py = 20 + Math.random() * 24, r = 14 + Math.random() * 12;
    const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

class PointPool {
  constructor(max, map, additive) {
    this.max = max; this.n = 0; this.p = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.uniforms = { uMap: { value: map }, uScale: { value: 400 } };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: this.uniforms, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.obj = new THREE.Points(g, this.mat); this.obj.frustumCulled = false; this.geo = g;
  }
  add(o) { if (this.p.length < this.max) this.p.push(Object.assign({ age: 0, delay: 0, a: 1, s: 0.5, c: new THREE.Color(1, 1, 1) }, o)); }
  clear() { this.p.length = 0; this.geo.setDrawRange(0, 0); }
  update(s, fn) {
    for (let i = this.p.length - 1; i >= 0; i--) { const q = this.p[i]; if (q.delay > 0) { q.delay -= s; continue; } q.age += s; if (q.age >= q.life) { this.p.splice(i, 1); continue; } fn(q, q.age / q.life); }
    let n = 0; for (const q of this.p) { if (q.delay > 0) continue; q.pos.toArray(this.pos, n * 3); q.c.toArray(this.col, n * 3); this.size[n] = q.s; this.alpha[n] = q.a; n++; }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) this.geo.attributes[k].needsUpdate = true;
  }
}

class InstPool { // InstancedMesh à nombre d'instances variable
  constructor(geo, mat, max) { this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.count = 0; this.mesh.frustumCulled = false; this.p = []; this.max = max; this.o = new THREE.Object3D(); this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.setColorAt(0, new THREE.Color(1, 1, 1)); }
  add(q) { if (this.p.length < this.max) { this.p.push(q); this.mesh.setColorAt(this.p.length - 1, q.color); if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; } }
  clear() { this.p.length = 0; this.mesh.count = 0; }
  write() {
    this.p.forEach((q, i) => { this.o.position.copy(q.pos); this.o.rotation.copy(q.rot); this.o.scale.copy(q.scale); this.o.updateMatrix(); this.mesh.setMatrixAt(i, this.o.matrix); });
    this.mesh.count = this.p.length; this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const rnd = (a, b) => a + Math.random() * (b - a);
const FIRE = [0xfff4b0, 0xffa020, 0xd02800, 0x200800].map(c => new THREE.Color(c));
function fireColor(k, out) { const f = Math.min(2.999, k * 3), i = Math.floor(f); return out.copy(FIRE[i]).lerp(FIRE[i + 1], f - i); }
const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;

export function createFx(scene, floorY) {
  const glow = sprite('glow'), smoke = sprite('smoke');
  const fire = new PointPool(160, glow, true), smokeP = new PointPool(40, smoke, false);
  const debris = new InstPool(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.6 }), 60);
  const sticks = new InstPool(new THREE.CylinderGeometry(0.11, 0.11, 1, 12), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 8);
  const confetti = new InstPool(new THREE.PlaneGeometry(0.09, 0.15), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 180);
  const ringMat = () => new THREE.MeshBasicMaterial({ color: 0xffd090, blending: THREE.AdditiveBlending, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0 });
  const rings = [new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), ringMat()), new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), ringMat())];
  rings[0].rotation.x = -Math.PI / 2; rings[0].position.y = floorY + 0.02;
  rings.forEach(r => { r.visible = false; r.userData.t = -1; });
  // toujours dans la scène (compte nul au repos) : programmes compilés dès le départ, pas d'à-coup au BOUM
  scene.add(fire.obj, smokeP.obj, debris.mesh, sticks.mesh, confetti.mesh, ...rings);
  const COLS = [0x9aa1ab, 0x2e333b, 0x5c636c, 0x1a1d22, 0xc9b37a].map(c => new THREE.Color(c));
  const CONF = [0xffd54f, 0xff5252, 0x69f0ae, 0x40c4ff, 0xe040fb, 0xffffff].map(c => new THREE.Color(c));

  const fx = {
    setScale(h, fovDeg, pr) { const v = h * pr / (2 * Math.tan(fovDeg * Math.PI / 360)); fire.uniforms.uScale.value = smokeP.uniforms.uScale.value = v; },
    explode(Q, camera) {
      for (let i = 0; i < 80 * Q; i++) fire.add({ kind: 'fire', pos: new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.3, 0.6), rnd(-0.3, 0.3)), v: new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(1.5, 7)), life: rnd(0.9, 2.1), size: rnd(1.6, 3.8) });
      for (let i = 0; i < 60 * Q; i++) fire.add({ kind: 'spark', pos: new THREE.Vector3(), v: new THREE.Vector3(rnd(-1, 1), rnd(0, 1.2), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 11)), life: rnd(1, 2.2), s: 0.12, c: new THREE.Color(0xffb040) });
      for (let i = 0; i < 24 * Q; i++) smokeP.add({ pos: new THREE.Vector3(rnd(-0.8, 0.8), rnd(-0.6, 0.8), rnd(-0.8, 0.8)), v: new THREE.Vector3(rnd(-0.4, 0.4), rnd(0.3, 0.9), rnd(-0.4, 0.4)), life: rnd(3, 5), delay: rnd(0.1, 0.7), size: rnd(1.5, 3.5), c: new THREE.Color(0x3a3634), a: 0 });
      for (let i = 0; i < 46 * Q; i++) {
        const pos = new THREE.Vector3(rnd(-0.8, 0.8), rnd(-1, 1), rnd(-0.8, 0.8)), v = pos.clone().normalize().multiplyScalar(rnd(3, 9)); v.y += rnd(2, 7);
        debris.add({ pos, v, rot: new THREE.Euler(), spin: new THREE.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)), scale: new THREE.Vector3(rnd(0.2, 0.7), rnd(0.2, 0.7), rnd(0.04, 0.1)), color: COLS[i % COLS.length] });
      }
      for (let i = 0; i < 4; i++) {
        const pos = new THREE.Vector3((i % 2 ? 1 : -1), 0, (i < 2 ? 1 : -1)), v = pos.clone().normalize().multiplyScalar(rnd(3, 6)); v.y += rnd(3, 6);
        sticks.add({ pos, v, rot: new THREE.Euler(), spin: new THREE.Vector3(rnd(-10, 10), rnd(-10, 10), rnd(-10, 10)), scale: new THREE.Vector3(1, rnd(0.8, 1.6), 1), color: new THREE.Color(0xb3261e) });
      }
      rings.forEach((r, i) => { r.visible = true; r.userData.t = 0; r.userData.life = i ? 0.7 : 1.1; r.userData.size = i ? 7 : 10; if (i) { r.position.set(0, 0.3, 0); r.lookAt(camera.position); } });
    },
    winConfetti(Q) {
      for (let i = 0; i < 170 * Q; i++) confetti.add({ pos: new THREE.Vector3(rnd(-3.5, 3.5), rnd(3, 9), rnd(-3, 3.5)), v: new THREE.Vector3(0, -rnd(0.9, 1.8), 0), rot: new THREE.Euler(rnd(0, 6), rnd(0, 6), 0), spin: new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)), scale: new THREE.Vector3(1, 1, 1), color: CONF[i % CONF.length], phase: rnd(0, 6) });
    },
    goldSpark(BH) { fire.add({ kind: 'spark', pos: new THREE.Vector3(rnd(-0.9, 0.9), BH / 2 + 0.1, rnd(-0.9, 0.9)), v: new THREE.Vector3(rnd(-1.5, 1.5), rnd(4, 7.5), rnd(-1.5, 1.5)), life: rnd(1.2, 2), s: 0.16, c: new THREE.Color(0xffd27a) }); },
    clear() { fire.clear(); smokeP.clear(); debris.clear(); sticks.clear(); confetti.clear(); rings.forEach(r => { r.visible = false; r.userData.t = -1; }); },
    update(s, ft) {
      fire.update(s, (q, k) => {
        if (q.kind === 'fire') { q.v.multiplyScalar(Math.pow(0.12, s)); q.pos.addScaledVector(q.v, s); q.pos.y += s * 0.6; q.s = 0.4 + q.size * Math.sqrt(k); fireColor(k * 0.85, q.c); q.a = 0.9 * (1 - k * k); }
        else { q.v.y -= 9.8 * s; q.pos.addScaledVector(q.v, s); q.a = 1 - k; }
      });
      smokeP.update(s, (q, k) => { q.pos.addScaledVector(q.v, s); q.s = q.size * (0.4 + k); q.a = 0.75 * Math.sin(Math.PI * k); });
      [debris, sticks].forEach(pool => { if (!pool.p.length) return; pool.p.forEach(q => {
        q.v.y -= 9.8 * s; q.pos.addScaledVector(q.v, s); q.rot.x += q.spin.x * s; q.rot.y += q.spin.y * s; q.rot.z += q.spin.z * s;
        if (q.pos.y < floorY + 0.05 && q.v.y < 0) { q.pos.y = floorY + 0.05; q.v.y *= -0.35; q.v.x *= 0.6; q.v.z *= 0.6; q.spin.multiplyScalar(0.5); }
      }); pool.write(); });
      if (confetti.p.length) { confetti.p.forEach(q => { q.pos.addScaledVector(q.v, s); q.pos.x += Math.sin(ft / 400 + q.phase) * s * 0.6; q.rot.x += q.spin.x * s; q.rot.y += q.spin.y * s; if (q.pos.y < floorY) q.pos.y = rnd(5, 8); }); confetti.write(); }
      rings.forEach(r => { if (r.userData.t < 0) return; r.userData.t += s; const k = r.userData.t / r.userData.life; if (k >= 1) { r.visible = false; r.userData.t = -1; return; } const sc = 0.1 + r.userData.size * ease(k); r.scale.setScalar(sc); r.material.opacity = 1 - k; });
    },
    counts: () => ({ fire: fire.p.length, smoke: smokeP.p.length, debris: debris.p.length, confetti: confetti.p.length })
  };
  return fx;
}
