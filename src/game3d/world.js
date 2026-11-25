// ─────────────────────────────────────────────
// 3Dワールド：中心線・路面・壁・景観・空・ライト
// ─────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SEG, ROAD_W, START_SEG, mulberry } from '../game/track.js';
import { PAL, LINE_Z } from '../game/engine.js';
import * as TX from './textures.js';

// シミュレーション単位 → メートル
export const SL = 0.0075;                 // 進行方向（1セグメント = 1.5m）
export const SW = 2 / (0.34 * ROAD_W);    // 横方向（車幅 = 2.0m）
export const SY = 0.004;                  // 高さ
export const HW = ROAD_W * SW;            // 路面の半幅（約5.9m）
export const WALL = 2.45;                 // 壁の位置（半幅単位）
const UP = new THREE.Vector3(0, 1, 0);
const mod = (a, n) => ((a % n) + n) % n;
const srgb = (c) => new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
const lerpArr = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

// ── 中心線（曲率の積分から3D形状を復元）
export class Centerline {
  constructor(track) {
    const segs = track.segments;
    const N = (this.N = segs.length);
    this.L = track.length;
    const step = (this.step = SEG * SL);
    const H = track.heading;
    const P = [];
    let x = 0, z = 0;
    for (let i = 0; i < N; i++) {
      P.push(new THREE.Vector3(x, segs[i].p1.world.y * SY, z));
      x += Math.cos(H[i]) * step;
      z += Math.sin(H[i]) * step;
    }
    for (let i = 0; i < N; i++) { P[i].x -= (x * i) / N; P[i].z -= (z * i) / N; }
    const box = new THREE.Box3().setFromPoints(P);
    const c = box.getCenter(new THREE.Vector3());
    for (const p of P) { p.x -= c.x; p.z -= c.z; }
    this.box = new THREE.Box3().setFromPoints(P);
    this.P = P;
    this.T = []; this.R = [];
    for (let i = 0; i < N; i++) {
      const t = P[(i + 1) % N].clone().sub(P[(i - 1 + N) % N]).normalize();
      this.T.push(t);
      this.R.push(new THREE.Vector3().crossVectors(t, UP).normalize());
    }
    this._a = new THREE.Vector3();
  }
  // dist（シミュ単位）と横位置x（半幅単位）から姿勢を求める
  pose(dist, xLat, o) {
    const f = mod(dist, this.L) / SEG;
    const i = Math.floor(f) % this.N, j = (i + 1) % this.N, t = f - Math.floor(f);
    o.fwd.copy(this.T[i]).lerp(this.T[j], t).normalize();
    o.right.crossVectors(o.fwd, UP).normalize();
    o.up.crossVectors(o.right, o.fwd).normalize();
    o.pos.copy(this.P[i]).lerp(this.P[j], t).addScaledVector(o.right, xLat * HW);
    return o;
  }
  // 構造物用の座標系（x=進行方向, z=コース外側）
  frame(i, side, lat, y = 0) {
    i = mod(i, this.N);
    const T = this.T[i].clone(); T.y = 0; T.normalize();
    const R = this.R[i];
    const X = side > 0 ? T : T.clone().negate();
    const Z = R.clone().multiplyScalar(side);
    const m = new THREE.Matrix4().makeBasis(X, UP, Z);
    const p = this.P[i].clone().addScaledVector(R, lat);
    p.y += y;
    m.setPosition(p);
    return m;
  }
}

// ── 帯状ジオメトリ（コースに沿ったストリップ）
function strip(cl, cols, { vLen = 12, uScale = 1, swap = false, flipU = false, mask } = {}) {
  const N = cl.N, rows = N + 1, nc = cols.length;
  const pos = new Float32Array(rows * nc * 3), uv = new Float32Array(rows * nc * 2);
  const v = new THREE.Vector3();
  for (let r = 0; r < rows; r++) {
    const i = r % N;
    const P = cl.P[i], R = cl.R[i];
    const d = (r * cl.step) / vLen;
    for (let c = 0; c < nc; c++) {
      const def = typeof cols[c] === 'function' ? cols[c](i) : cols[c];
      v.copy(P).addScaledVector(R, def[0]);
      v.y += def[1];
      const k = r * nc + c;
      pos.set([v.x, v.y, v.z], k * 3);
      const u = (c / (nc - 1)) * uScale;
      if (swap) uv.set([flipU ? -d : d, c / (nc - 1)], k * 2);
      else uv.set([u, d], k * 2);
    }
  }
  const idx = [];
  for (let r = 0; r < N; r++) {
    if (mask && !mask(r)) continue;
    for (let c = 0; c < nc - 1; c++) {
      const a = r * nc + c, b = a + 1, d = a + nc, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const skyVert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const skyFrag = /* glsl */`
uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunI;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.2, h));
  c = mix(c, top, smoothstep(0.16, 0.8, h));
  if (h < 0.0) c = hor * 0.92;
  float s = max(dot(d, sunDir), 0.0);
  c += sunCol * (pow(s, 5.0) * 0.32 + pow(s, 48.0) * 0.7) * sunI;
  c += vec3(1.0, 0.94, 0.82) * smoothstep(0.99935, 0.9997, s) * 9.0 * sunI;
  // 斜めの光の帯（ポスターのスラッシュ）
  float band = sin((atan(d.x, d.z) * 3.0 + h * 9.0)) * 0.5 + 0.5;
  c += sunCol * pow(band, 18.0) * 0.06 * sunI * smoothstep(0.02, 0.4, h);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function buildWorld(engine, scene, quality) {
  const hi = quality === 'high';
  const cl = new Centerline({ segments: engine.segs, length: engine.L, heading: engine.heading });
  const N = cl.N;
  const rnd = mulberry(77);
  const W = {};
  W.cl = cl;

  // ── 空
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 0.2, 1).normalize() }, sunCol: { value: new THREE.Color(1, 0.75, 0.45) }, sunI: { value: 1 },
    },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);
  W.sky = sky;

  scene.fog = new THREE.FogExp2(0xe2c89e, 0.00034);

  // ── ライト
  const hemi = new THREE.HemisphereLight(0xbfd0dc, 0x8a6a4a, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffdcae, 3.0);
  sun.castShadow = hi;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const fill = new THREE.AmbientLight(0xfff1dc, 0);
  scene.add(fill);
  W.hemi = hemi; W.sun = sun; W.fill = fill;
  W.sunDir = new THREE.Vector3();

  // ── 素材
  const aniso = hi ? 8 : 4;
  const mRoad = new THREE.MeshStandardMaterial({ map: TX.tex(TX.asphalt(true), { aniso }), roughness: 0.55, metalness: 0.08, color: 0xd8d8d8 });
  const mRun = new THREE.MeshStandardMaterial({ map: TX.tex(TX.asphalt(false), { aniso }), roughness: 0.8 });
  const sandTex = TX.tex(TX.sand(false), { aniso });
  const mSand = new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 });
  const mGravel = new THREE.MeshStandardMaterial({ map: TX.tex(TX.sand(true), { aniso }), roughness: 1 });
  const wallTex = TX.tex(TX.wall(['board0', 'board1', 'board2', 'board3'].map((k) => engine.sprites[k].img)), { aniso });
  const mWall = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.75, side: THREE.DoubleSide });
  const fenceTex = TX.tex(TX.fence(), { srgb: false, aniso });
  const mFence = new THREE.MeshStandardMaterial({ color: 0x8c939c, map: fenceTex, alphaTest: 0.45, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 });

  const add = (geo, mat, { shadow = true, cast = false } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = shadow && hi;
    m.castShadow = cast && hi;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    scene.add(m);
    return m;
  };

  // ── 路面
  const RE = 1.035 * HW;
  add(strip(cl, [[-RE, 0], [RE, 0]], { vLen: 14 }), mRoad);
  add(mergeGeometries([
    strip(cl, [[-1.9 * HW, -0.015], [-RE, -0.012]], { vLen: 14 }),
    strip(cl, [[RE, -0.012], [1.9 * HW, -0.015]], { vLen: 14 }),
  ]), mRun);
  add(mergeGeometries([
    strip(cl, [[-WALL * HW, -0.03], [-1.9 * HW, -0.02]], { vLen: 24 }),
    strip(cl, [[1.9 * HW, -0.02], [WALL * HW, -0.03]], { vLen: 24 }),
  ]), mGravel);
  const outer = (s) => (i) => [s * 16 * HW, -0.3 - cl.P[i].y];
  add(mergeGeometries([
    strip(cl, [outer(-1), [-WALL * HW, -0.03]], { vLen: 40, uScale: 3 }),
    strip(cl, [[WALL * HW, -0.03], outer(1)], { vLen: 40, uScale: 3 }),
  ]), mSand);
  const groundTex = sandTex.clone();
  groundTex.repeat.set(380, 380);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, color: 0xf0e2cc }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.36;
  ground.receiveShadow = false;
  scene.add(ground);

  // ── 壁とキャッチフェンス
  add(mergeGeometries([
    strip(cl, [[-WALL * HW, -0.05], [-WALL * HW, 1.1]], { vLen: 60, swap: true }),
    strip(cl, [[WALL * HW, -0.05], [WALL * HW, 1.1]], { vLen: 60, swap: true, flipU: true }),
  ]), mWall);
  add(mergeGeometries([
    strip(cl, [[-WALL * HW - 0.1, 1.1], [-WALL * HW - 0.5, 4.2]], { vLen: 2.6, swap: true }),
    strip(cl, [[WALL * HW + 0.1, 1.1], [WALL * HW + 0.5, 4.2]], { vLen: 2.6, swap: true }),
  ]), mFence, { shadow: false });

  // ── 縁石（赤白）
  {
    const pos = [], col = [];
    const red = new THREE.Color().setRGB(0.8, 0.12, 0.12, THREE.SRGBColorSpace), white = new THREE.Color(0.85, 0.85, 0.85);
    for (let i = 0; i < N; i++) {
      if (Math.abs(engine.segs[i].curve) <= 1) continue;
      const j = (i + 1) % N;
      const c = Math.floor(i / 1) % 2 ? red : white;
      for (const s of [-1, 1]) {
        const a0 = s * 0.985 * HW, a1 = s * 1.17 * HW;
        const q = [[i, a0, 0.03], [i, a1, 0.005], [j, a1, 0.005], [j, a0, 0.03]].map(([k, l, y]) => cl.P[k].clone().addScaledVector(cl.R[k], l).add(new THREE.Vector3(0, y, 0)));
        const tri = s < 0 ? [0, 3, 1, 1, 3, 2] : [0, 1, 3, 1, 2, 3];
        for (const t of tri) { pos.push(q[t].x, q[t].y, q[t].z); col.push(c.r, c.g, c.b); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    add(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
  }

  // ── 路面ペイント（チェッカー・グリッド枠・DRSライン）
  {
    const paint = [];
    const quad = (i, l0, l1, len, y = 0.012) => {
      const T = cl.T[i], R = cl.R[i], P = cl.P[i];
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Matrix4().makeBasis(R, UP, T.clone().negate());
      m.scale(new THREE.Vector3(l1 - l0, 1, len));
      m.setPosition(P.clone().addScaledVector(R, (l0 + l1) / 2).add(new THREE.Vector3(0, y, 0)));
      g.applyMatrix4(m);
      return g;
    };
    for (let i = 0; i < N; i++) if (engine.segs[i].drs && !engine.segs[(i - 1 + N) % N].drs) paint.push(quad(i, -HW, HW, 0.35));
    for (let k = 0; k < 10; k++) {
      const d = LINE_Z - 2 * SEG - k * 6 * SEG;
      const i = Math.floor(d / SEG) + 2;
      const x = (k % 2 ? 0.36 : -0.36) * HW;
      paint.push(quad(i, x - 1.2, x + 1.2, 0.18), quad(i - 1, x - 1.2, x - 1.08, 1.5), quad(i - 1, x + 1.08, x + 1.2, 1.5));
    }
    add(mergeGeometries(paint), new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));
    const chk = new THREE.Mesh(quad(START_SEG, -HW, HW, 2.2, 0.014), new THREE.MeshStandardMaterial({ map: TX.tex(TX.checker(), { wrap: false }), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3 }));
    chk.receiveShadow = hi;
    scene.add(chk);
  }

  // ── スタートガントリー（シグナル点灯つき）
  {
    const i = START_SEG - 3;
    const g = new THREE.Group();
    const m = new THREE.Matrix4().makeBasis(cl.R[i], UP, new THREE.Vector3().crossVectors(cl.R[i], UP));
    g.applyMatrix4(m);
    g.position.copy(cl.P[i]);
    const dark = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: 0.6, metalness: 0.4 });
    const span = WALL * HW - 0.3;
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.5, 0.8), dark);
      p.position.set(s * span, 4.25, 0);
      p.castShadow = hi;
      g.add(p);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 0.8, 1.6, 0.9), dark);
    beam.position.y = 8.2;
    g.add(beam);
    const label = TX.tex(engine.sprites.gantry.img, { wrap: false });
    const lp = new THREE.Mesh(new THREE.PlaneGeometry(span * 2, 1.4), new THREE.MeshBasicMaterial({ map: label, transparent: true }));
    label.repeat.set(1, 70 / 520);
    label.offset.set(0, 1 - 90 / 520);
    lp.position.set(0, 8.2, 0.46);
    g.add(lp);
    W.lamps = [];
    for (let k = 0; k < 5; k++) {
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.9, 0.5), new THREE.MeshStandardMaterial({ color: 0x050505 }));
      const x = (k - 2) * 1.05;
      pod.position.set(x, 6.7, 0.4);
      g.add(pod);
      const lm = new THREE.MeshStandardMaterial({ color: 0x220404, emissive: 0xff1a0a, emissiveIntensity: 0 });
      for (const y of [6.25, 7.1]) {
        const c = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), lm);
        c.position.set(x, y, 0.66);
        g.add(c);
      }
      W.lamps.push(lm);
    }
    scene.add(g);
  }

  // ── 沿道オブジェクト
  const stands = [], towers = [], palms = [], tyres = [], boards = { board0: [], board1: [], board2: [], board3: [] };
  for (let i = 0; i < N; i++) {
    for (const s of engine.segs[i].sprites) {
      const side = s.offset < 0 ? -1 : 1;
      if (s.type === 'grand') stands.push(cl.frame(i, side, side * (WALL * HW + 1.6)));
      else if (s.type === 'tower') towers.push({ m: cl.frame(i, side, side * (WALL * HW + 1.4)), i, side });
      else if (s.type === 'palm') palms.push(cl.frame(i, side, side * (WALL * HW + 4 + (Math.abs(s.offset) - 2) * 9)));
      else if (s.type === 'tires') for (let k = 0; k < 3; k++) tyres.push(cl.frame(i + k, side, side * (WALL * HW - 0.45)));
      else if (boards[s.type]) boards[s.type].push(cl.frame(i, side, side * (WALL * HW + 3.2)));
    }
  }
  const inst = (geo, mat, mats, { cast = false, colors } = {}) => {
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, k) => im.setMatrixAt(k, m));
    if (colors) colors.forEach((c, k) => im.setColorAt(k, c));
    im.castShadow = cast && hi;
    im.receiveShadow = hi;
    scene.add(im);
    return im;
  };

  // グランドスタンド＋観客
  {
    const concrete = [], roof = [], gold = [];
    for (let t = 0; t < 8; t++) {
      const h = 1.5 + t * 0.85;
      concrete.push(new THREE.BoxGeometry(26, h, 1.3).translate(0, h / 2, 0.65 + t * 1.3));
    }
    concrete.push(new THREE.BoxGeometry(26, 10, 0.4).translate(0, 5, 10.6));
    for (const x of [-12, -4, 4, 12]) concrete.push(new THREE.CylinderGeometry(0.18, 0.18, 11, 8).translate(x, 5.5, 10.4));
    roof.push(new THREE.BoxGeometry(27, 0.25, 12.5).rotateX(-0.09).translate(0, 11.2, 5.2));
    gold.push(new THREE.BoxGeometry(26, 0.35, 0.06).translate(0, 1.35, -0.02));
    inst(mergeGeometries(concrete), new THREE.MeshStandardMaterial({ color: 0x6c727c, roughness: 0.85 }), stands, { cast: true });
    inst(mergeGeometries(roof), new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.5 }), stands, { cast: true });
    inst(mergeGeometries(gold), new THREE.MeshStandardMaterial({ color: 0xd4ad55, metalness: 0.6, roughness: 0.35 }), stands);
    const crowdM = [], crowdC = [];
    const pal = ['#f2f0ea', '#c8262b', '#1e4fa8', '#d4ad55', '#2c2c2c', '#e86a2a', '#ffffff', '#3aa7e8', '#f2c400', '#6b35c9'];
    const stepX = hi ? 0.62 : 1.1;
    const tmp = new THREE.Matrix4();
    for (const sm of stands) {
      for (let t = 0; t < 8; t++) for (let x = -12.6; x <= 12.6; x += stepX) {
        if (rnd() < 0.12) continue;
        const l = new THREE.Matrix4().makeTranslation(x + (rnd() - 0.5) * 0.2, 1.5 + t * 0.85 + 0.42, 0.55 + t * 1.3);
        l.scale(new THREE.Vector3(1, 0.85 + rnd() * 0.3, 1));
        crowdM.push(tmp.copy(sm).multiply(l).clone());
        crowdC.push(new THREE.Color(pal[(rnd() * pal.length) | 0]));
      }
    }
    W.crowd = inst(new THREE.BoxGeometry(0.42, 0.85, 0.36), new THREE.MeshStandardMaterial({ roughness: 0.9 }), crowdM, { colors: crowdC });
  }

  // 照明塔
  {
    const pole = new THREE.CylinderGeometry(0.16, 0.28, 22, 8).translate(0, 11, 0);
    inst(pole, new THREE.MeshStandardMaterial({ color: 0x59606b, metalness: 0.6, roughness: 0.45 }), towers.map((t) => t.m), { cast: true });
    const head = new THREE.BoxGeometry(3.2, 1.8, 0.5).rotateX(-0.35).translate(0, 22.2, -0.3);
    W.lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff1d0, emissiveIntensity: 0.5 });
    inst(head, W.lampMat, towers.map((t) => t.m));
    const pts = towers.map((t) => new THREE.Vector3(0, 22.2, -0.6).applyMatrix4(t.m));
    const pg = new THREE.BufferGeometry().setFromPoints(pts);
    W.glowMat = new THREE.PointsMaterial({
      size: 26, map: TX.tex(TX.radial('rgba(255,236,200,1)', 'rgba(255,220,160,0)'), { wrap: false }),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3, sizeAttenuation: true, fog: false,
    });
    scene.add(new THREE.Points(pg, W.glowMat));
  }

  // ヤシ
  {
    const trunk = new THREE.CylinderGeometry(0.17, 0.3, 9, 7).translate(0, 4.5, 0);
    const leaves = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const lf = new THREE.ConeGeometry(0.45, 4.2, 4, 1);
      lf.scale(1, 1, 0.18);
      lf.translate(0, 2.1, 0);
      lf.rotateZ(-1.15 - (k % 3) * 0.12);
      lf.rotateY(a);
      lf.translate(0, 9, 0);
      leaves.push(lf);
    }
    const ms = palms.map((m) => m.clone().multiply(new THREE.Matrix4().makeRotationY(rnd() * 6).scale(new THREE.Vector3(1, 0.8 + rnd() * 0.5, 1))));
    inst(trunk, new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.9 }), ms, { cast: true });
    inst(mergeGeometries(leaves), new THREE.MeshStandardMaterial({ color: 0x3f6b43, roughness: 0.8, side: THREE.DoubleSide }), ms, { cast: true });
  }

  // タイヤバリア
  {
    const ms = [], cs = [];
    tyres.forEach((m, k) => {
      for (const dx of [-0.5, 0.5]) {
        ms.push(m.clone().multiply(new THREE.Matrix4().makeTranslation(dx, 0.45, 0)));
        cs.push(new THREE.Color(k % 2 ? '#c8262b' : '#eeeeee'));
      }
    });
    if (ms.length) inst(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 14), new THREE.MeshStandardMaterial({ roughness: 0.8 }), ms, { colors: cs, cast: true });
  }

  // 看板
  {
    const legs = new THREE.BoxGeometry(0.3, 4.6, 0.3);
    const allLegs = [];
    for (const k in boards) {
      if (!boards[k].length) continue;
      const t = TX.tex(engine.sprites[k].img, { wrap: false });
      t.repeat.set(1, 110 / 170);
      t.offset.set(0, 60 / 170);
      const pl = new THREE.PlaneGeometry(9, 9 * (110 / 380)).rotateY(Math.PI).translate(0, 5.2, 0);
      inst(pl, new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.15 }), boards[k], { cast: true });
      for (const m of boards[k]) for (const x of [-3.5, 3.5]) allLegs.push(m.clone().multiply(new THREE.Matrix4().makeTranslation(x, 2.3, 0.2)));
    }
    if (allLegs.length) inst(legs, new THREE.MeshStandardMaterial({ color: 0x2b3038 }), allLegs);
  }

  // 都市のシルエット（夕日側）
  {
    const sunAz = Math.atan2(0.35, 1);
    const ms = [];
    for (let k = 0; k < 260; k++) {
      const a = sunAz + (rnd() - 0.5) * 2.8;
      const r = 1500 + rnd() * 1300;
      const h = 30 + Math.pow(rnd(), 2.4) * 260;
      const w = 22 + rnd() * 45;
      const m = new THREE.Matrix4().makeRotationY(rnd() * 3).scale(new THREE.Vector3(w, h, 22 + rnd() * 45));
      m.setPosition(Math.sin(a) * r, h / 2 - 1, -Math.cos(a) * r);
      ms.push(m);
    }
    const wt = TX.tex(TX.windows(), { aniso: 2 });
    W.cityMat = new THREE.MeshStandardMaterial({ color: 0x252c38, roughness: 0.6, metalness: 0.3, emissive: 0xffffff, emissiveMap: wt, emissiveIntensity: 0.3 });
    const im = inst(new THREE.BoxGeometry(1, 1, 1), W.cityMat, ms);
    im.receiveShadow = false;
  }

  // 砂丘・山並み
  {
    const seg = 200, rings = 6;
    const pos = [], idx = [];
    for (let rI = 0; rI <= rings; rI++) {
      const r = 3000 + (rI / rings) * 2600;
      for (let a = 0; a <= seg; a++) {
        const t = (a / seg) * Math.PI * 2;
        const n = 0.55 * Math.sin(t * 3 + 1) + 0.3 * Math.sin(t * 7 + 2) + 0.15 * Math.sin(t * 17 + 5);
        const prof = Math.sin((rI / rings) * Math.PI);
        pos.push(Math.sin(t) * r, Math.max(0, (n + 0.7)) * 220 * prof - 2, Math.cos(t) * r);
      }
    }
    for (let rI = 0; rI < rings; rI++) for (let a = 0; a < seg; a++) {
      const p = rI * (seg + 1) + a, q = p + seg + 1;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x9c8670, roughness: 1, side: THREE.DoubleSide })));
  }

  // ── 時間帯の反映
  const C = {};
  W.update = (tod, camera) => {
    for (const k in PAL[0]) C[k] = lerpArr(PAL[0][k], PAL[1][k], tod);
    skyMat.uniforms.top.value.copy(srgb(C.skyTop));
    skyMat.uniforms.mid.value.copy(srgb(C.skyMid));
    skyMat.uniforms.hor.value.copy(srgb(C.horizon));
    const elev = THREE.MathUtils.degToRad(13 - tod * 11.5);
    W.sunDir.set(Math.sin(0.35) * Math.cos(elev), Math.sin(elev), -Math.cos(0.35) * Math.cos(elev)).normalize();
    skyMat.uniforms.sunDir.value.copy(W.sunDir);
    skyMat.uniforms.sunCol.value.copy(srgb(lerpArr([255, 214, 150], [255, 130, 70], tod)));
    skyMat.uniforms.sunI.value = 1 - tod * 0.35;
    sky.position.copy(camera.position);
    scene.fog.color.copy(srgb(C.haze));
    sun.color.copy(srgb(lerpArr([255, 222, 178], [255, 150, 95], tod)));
    sun.intensity = 3.1 - tod * 1.9;
    hemi.color.copy(srgb(lerpArr([190, 206, 220], [96, 104, 150], tod)));
    hemi.groundColor.copy(srgb(lerpArr([150, 116, 82], [70, 52, 48], tod)));
    hemi.intensity = 1.5 - tod * 0.5;
    fill.intensity = 0.25 + tod * 0.6;
    W.lampMat.emissiveIntensity = 0.4 + tod * 3.2;
    W.glowMat.opacity = 0.12 + tod * 0.6;
    W.cityMat.emissiveIntensity = 0.15 + tod * 1.4;
  };

  return W;
}
