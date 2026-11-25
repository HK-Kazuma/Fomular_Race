// ─────────────────────────────────────────────
// 3Dフォーミュラマシン（プリミティブ＋ロフトで組み立て）
// ローカル座標：x=右, y=上, z=前。原点は車体中央の接地点。単位はメートル。
// ─────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { wingText, numberTex, tex, radial, blob } from './textures.js';

// 角の丸い断面をつないだ胴体（スーパー楕円ロフト）
function loft(sections, seg = 18, n = 3.2) {
  const pos = [], uv = [], idx = [];
  const ring = seg;
  const rev = sections[sections.length - 1].z < sections[0].z;
  sections.forEach((s, si) => {
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const px = (s.x || 0) + Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * s.w / 2;
      const py = s.y + Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n) * s.h / 2;
      pos.push(px, py, s.z);
      uv.push(k / ring, si / (sections.length - 1));
    }
  });
  for (let si = 0; si < sections.length - 1; si++) {
    for (let k = 0; k < ring; k++) {
      const a = si * ring + k, b = si * ring + ((k + 1) % ring);
      const c = a + ring, d = b + ring;
      if (rev) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  // キャップ
  const cap = (si, flip) => {
    const s = sections[si];
    const ci = pos.length / 3;
    pos.push(s.x || 0, s.y, s.z);
    uv.push(0.5, 0.5);
    for (let k = 0; k < ring; k++) {
      const a = si * ring + k, b = si * ring + ((k + 1) % ring);
      if (flip) idx.push(ci, a, b); else idx.push(ci, b, a);
    }
  };
  cap(0, sections[0].z > sections[sections.length - 1].z);
  cap(sections.length - 1, sections[0].z <= sections[sections.length - 1].z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const box = (w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
};
const cyl = (r1, r2, len, x, y, z, rx = 0, ry = 0, rz = 0, seg = 12) => {
  const g = new THREE.CylinderGeometry(r1, r2, len, seg);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  g.translate(x, y, z);
  return g;
};
// 2点間の細い棒（サスペンション）
const rod = (a, b, r = 0.018) => {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, 6);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
};

let shared = null;
function sharedAssets() {
  if (shared) return shared;
  shared = {
    carbon: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.5, metalness: 0.35 }),
    black: new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 0.7, metalness: 0.1 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0 }),
    rim: new THREE.MeshStandardMaterial({ color: 0x2e2f33, roughness: 0.3, metalness: 0.85 }),
    glowTex: tex(radial('rgba(255,200,120,1)', 'rgba(255,120,30,0)'), { wrap: false }),
    blobTex: tex(blob(), { wrap: false, srgb: false }),
  };
  return shared;
}

function paint(color, hi) {
  return hi
    ? new THREE.MeshPhysicalMaterial({ color, metalness: 0.3, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.16 })
    : new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.35 });
}

function makeWheel(r, width, side, tyreColor, S) {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const t = new THREE.Mesh(cyl(r, r, width, 0, 0, 0, 0, 0, Math.PI / 2, 26), S.tyre);
  t.castShadow = true;
  spin.add(t);
  const ox = side * (width / 2 + 0.002);
  const rimParts = [cyl(r * 0.66, r * 0.66, width + 0.01, 0, 0, 0, 0, 0, Math.PI / 2, 20)];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    rimParts.push(box(0.012, r * 0.62, 0.05, ox, Math.cos(a) * r * 0.31, Math.sin(a) * r * 0.31, a, 0, 0));
  }
  spin.add(new THREE.Mesh(mergeGeometries(rimParts), S.rim));
  // コンパウンドのライン
  const ring = new THREE.TorusGeometry(r * 0.8, 0.014, 6, 32);
  ring.rotateY(Math.PI / 2);
  ring.translate(ox, 0, 0);
  spin.add(new THREE.Mesh(ring, new THREE.MeshStandardMaterial({ color: tyreColor, roughness: 0.6 })));
  return { group: g, spin };
}

export function makeCar(L, quality = 'high') {
  const S = sharedAssets();
  const hi = quality === 'high';
  const body = paint(L.body, hi);
  const accent = paint(L.accent, hi);
  const wingM = paint(L.wing || L.body, hi);
  const helmet = paint(L.helmet, hi);

  const P = { body: [], accent: [], carbon: [], black: [], wing: [], helmet: [] };

  // 胴体
  P.body.push(loft([
    { z: -0.35, w: 0.78, h: 0.55, y: 0.5 },
    { z: 0.3, w: 0.82, h: 0.58, y: 0.5 },
    { z: 1.05, w: 0.62, h: 0.44, y: 0.47 },
    { z: 1.9, w: 0.42, h: 0.3, y: 0.38 },
    { z: 2.6, w: 0.24, h: 0.17, y: 0.27 },
  ]));
  P.accent.push(loft([
    { z: 2.6, w: 0.24, h: 0.17, y: 0.27 },
    { z: 2.95, w: 0.13, h: 0.09, y: 0.22 },
  ]));
  // エンジンカバー
  P.body.push(loft([
    { z: -0.3, w: 0.8, h: 0.72, y: 0.6 },
    { z: -0.9, w: 0.66, h: 0.6, y: 0.56 },
    { z: -1.6, w: 0.4, h: 0.42, y: 0.48 },
    { z: -2.2, w: 0.18, h: 0.24, y: 0.42 },
  ]));
  // エアボックス
  P.body.push(loft([
    { z: 0.06, w: 0.26, h: 0.24, y: 1.0 },
    { z: -0.3, w: 0.34, h: 0.4, y: 0.93 },
    { z: -0.9, w: 0.28, h: 0.3, y: 0.82 },
    { z: -1.5, w: 0.1, h: 0.12, y: 0.68 },
  ]));
  P.black.push(box(0.2, 0.16, 0.04, 0, 1.0, 0.07));
  // サイドポッド
  for (const sx of [-1, 1]) {
    P.body.push(loft([
      { z: 0.72, w: 0.4, h: 0.44, y: 0.4, x: sx * 0.62 },
      { z: 0.15, w: 0.5, h: 0.5, y: 0.42, x: sx * 0.68 },
      { z: -0.9, w: 0.36, h: 0.34, y: 0.36, x: sx * 0.56 },
      { z: -1.55, w: 0.16, h: 0.18, y: 0.3, x: sx * 0.38 },
    ]));
    P.black.push(box(0.34, 0.36, 0.04, sx * 0.62, 0.42, 0.74));
    P.accent.push(box(0.05, 0.02, 1.3, sx * 0.7, 0.68, -0.15, 0.05));
    // ミラー
    P.carbon.push(box(0.14, 0.06, 0.06, sx * 0.52, 0.8, 0.62));
    P.carbon.push(rod([sx * 0.34, 0.66, 0.6], [sx * 0.48, 0.79, 0.62], 0.012));
  }
  // フロア・ディフューザー
  P.carbon.push(box(1.55, 0.04, 4.0, 0, 0.07, 0.05));
  P.carbon.push(box(1.0, 0.22, 0.5, 0, 0.17, -2.1, 0.32));
  // フロントウイング
  P.carbon.push(box(1.95, 0.035, 0.5, 0, 0.1, 2.85));
  P.accent.push(box(1.75, 0.025, 0.22, 0, 0.16, 2.7, -0.28));
  P.carbon.push(box(1.7, 0.025, 0.18, 0, 0.215, 2.58, -0.4));
  for (const sx of [-1, 1]) P.accent.push(box(0.03, 0.26, 0.62, sx * 0.98, 0.18, 2.8));
  P.carbon.push(box(0.05, 0.14, 0.4, -0.1, 0.18, 2.7), box(0.05, 0.14, 0.4, 0.1, 0.18, 2.7));
  // リアウイング
  for (const sx of [-1, 1]) {
    P.wing.push(box(0.035, 0.62, 0.72, sx * 0.53, 0.78, -2.25));
    P.accent.push(box(0.04, 0.1, 0.72, sx * 0.53, 1.1, -2.25));
  }
  P.carbon.push(box(1.04, 0.045, 0.36, 0, 0.86, -2.25, -0.08));
  P.carbon.push(box(0.9, 0.03, 0.2, 0, 0.38, -2.32, -0.1));
  P.carbon.push(box(0.05, 0.42, 0.12, 0, 0.62, -2.12));
  // シャークフィン
  P.accent.push(box(0.02, 0.3, 1.0, 0, 0.92, -1.25));
  // Halo
  const halo = new THREE.TorusGeometry(0.36, 0.03, 8, 24, Math.PI);
  halo.rotateX(-Math.PI / 2);
  halo.translate(0, 0.88, 0.32);
  P.carbon.push(halo, rod([0, 0.88, 0.68], [0, 0.66, 0.95], 0.03));
  // ヘルメット
  const hm = new THREE.SphereGeometry(0.155, 18, 14);
  hm.translate(0, 0.86, 0.12);
  P.helmet.push(hm);
  P.black.push(box(0.22, 0.05, 0.1, 0, 0.87, 0.24));
  // ギアボックス周り
  P.black.push(cyl(0.06, 0.06, 0.14, 0, 0.55, -2.3, Math.PI / 2, 0, 0, 10));
  // サスペンション
  const wf = 1.95, wr = -1.55;
  for (const sx of [-1, 1]) {
    P.carbon.push(rod([sx * 0.33, 0.44, 1.65], [sx * 0.72, 0.4, wf]), rod([sx * 0.33, 0.28, 2.2], [sx * 0.72, 0.32, wf]));
    P.carbon.push(rod([sx * 0.3, 0.5, -1.2], [sx * 0.68, 0.42, wr]), rod([sx * 0.3, 0.28, -1.9], [sx * 0.68, 0.3, wr]));
  }

  const group = new THREE.Group();
  const mats = { body, accent, carbon: S.carbon, black: S.black, wing: wingM, helmet };
  for (const k in P) {
    if (!P[k].length) continue;
    const m = new THREE.Mesh(mergeGeometries(P[k]), mats[k]);
    m.castShadow = true;
    group.add(m);
  }

  // DRSフラップ（前縁を軸に回転）
  const flap = new THREE.Group();
  flap.position.set(0, 1.0, -2.08);
  const fm = new THREE.Mesh(box(1.04, 0.03, 0.26, 0, 0, -0.13), wingM);
  fm.castShadow = true;
  flap.add(fm);
  flap.rotation.x = 0.42;
  group.add(flap);

  // リアウイングの文字・ゼッケン
  const wt = tex(wingText(L.team, L.num, L.accent, '#0b0b0b'), { wrap: false });
  // ローカルx軸は左向き。後方から読める向きに板を置く
  const topFacing = (w, h, x, y, z, tilt = 0) => {
    const g = new THREE.PlaneGeometry(w, h);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt)), new THREE.Vector3(0, Math.cos(tilt), -Math.sin(tilt))));
    g.translate(x, y, z);
    return g;
  };
  const wtPlane = new THREE.Mesh(topFacing(1.0, 0.33, 0, 0.885, -2.25, 0.08), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.5 }));
  group.add(wtPlane);
  const nt = tex(numberTex(L.num, L.num === '7' ? '#f4efe2' : L.accent), { wrap: false });
  const nm = new THREE.MeshStandardMaterial({ map: nt, transparent: true, roughness: 0.4 });
  const nose = new THREE.Mesh(topFacing(0.26, 0.26, 0, 0.495, 1.55, -0.15), nm);
  group.add(nose);
  for (const sx of [-1, 1]) {
    const fg = new THREE.PlaneGeometry(0.3, 0.3);
    fg.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -sx), new THREE.Vector3(0, 1, 0), new THREE.Vector3(sx, 0, 0)));
    fg.translate(sx * 0.012, 0.93, -1.3);
    const fin = new THREE.Mesh(fg, nm);
    group.add(fin);
  }

  // レインライト
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a1a, emissiveIntensity: 0.2 });
  const rain = new THREE.Mesh(box(0.14, 0.06, 0.03, 0, 0.42, -2.45), lightMat);
  group.add(rain);

  // 排気グロー
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffc070 }));
  glow.position.set(0, 0.55, -2.45);
  glow.scale.set(0.01, 0.01, 1);
  group.add(glow);

  // 接地影
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 6.0), new THREE.MeshBasicMaterial({ map: S.blobTex, transparent: true, depthWrite: false, opacity: 0.9 }));
  sh.rotation.x = -Math.PI / 2;
  sh.position.set(0, 0.025, 0.2);
  sh.renderOrder = 1;
  group.add(sh);

  // ホイール
  const wheels = [];
  const add = (x, z, r, w, front) => {
    const wh = makeWheel(r, w, Math.sign(x), L.tyre || '#e0362c', S);
    wh.group.position.set(x, r, z);
    wh.front = front;
    group.add(wh.group);
    wheels.push(wh);
  };
  add(-0.79, wf, 0.36, 0.36, true);
  add(0.79, wf, 0.36, 0.36, true);
  add(-0.76, wr, 0.37, 0.44, false);
  add(0.76, wr, 0.37, 0.44, false);

  return { group, flap, wheels, lightMat, glow, spinA: 0 };
}
