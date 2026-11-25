// ─────────────────────────────────────────────
// Three.js版レンダラー：シミュレーションは2D版Engineを共有し、描画だけを3Dに差し替える
// ─────────────────────────────────────────────
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Engine, MAX_SPEED } from '../game/engine.js';
import { SEG } from '../game/track.js';
import { PLAYER_LIVERY, RIVALS } from '../game/art.js';
import { buildWorld, SL, HW, WALL } from './world.js';
import { makeCar } from './car3d.js';
import * as TX from './textures.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const CAMS = [
  { id: 'chase', label: 'CHASE CAM' },
  { id: 'tcam', label: 'T-CAM' },
  { id: 'far', label: 'FAR CHASE' },
];

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}

export class Engine3D extends Engine {
  initRenderer() {
    this.is3D = true;
    this.carLen = SEG * 3.7; // 3Dモデルの全長（5.4m）に合わせた接触判定
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    this.quality = this.opts.quality || (coarse ? 'low' : 'high');
    const hi = this.quality === 'high';

    const R = (this.renderer = new THREE.WebGLRenderer({ canvas: this.opts.glCanvas, antialias: !hi, powerPreference: 'high-performance' }));
    R.toneMapping = THREE.ACESFilmicToneMapping;
    R.toneMappingExposure = 1.0;
    R.shadowMap.enabled = hi;
    R.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 9000);
    this.world = buildWorld(this, this.scene, this.quality);
    this.cl = this.world.cl;

    this.playerModel = makeCar(PLAYER_LIVERY, this.quality);
    this.scene.add(this.playerModel.group);
    this.rivalModels = RIVALS.map((L) => {
      const m = makeCar(L, this.quality);
      this.scene.add(m.group);
      return m;
    });

    if (hi) {
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(R, rt);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.38, 0.55, 1.15);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    this.initParticles();
    this.camIdx = 0;
    this.camFwd = new THREE.Vector3(0, 0, 1);
    this.tv = null;
    const V = () => new THREE.Vector3();
    this._po = { pos: V(), fwd: V(), right: V(), up: V() };
    this._ro = { pos: V(), fwd: V(), right: V(), up: V() };
    this._to = { pos: V(), fwd: V(), right: V(), up: V() };
    this._m = new THREE.Matrix4();
    this._v = V();
    this._v2 = V();
    this._left = V();
    this._kc = (e) => { if (e.code === 'KeyC' && this.mode === 'race') this.cycleCam(); };
    window.addEventListener('keydown', this._kc);
  }

  get camLabel() { return CAMS[this.camIdx].label; }

  cycleCam() {
    this.camIdx = (this.camIdx + 1) % CAMS.length;
    const label = CAMS[this.camIdx].label;
    this.pop(label, 'cam');
    this.cb.onEvent?.({ type: 'cam', label });
    return label;
  }

  resize() {
    super.resize();
    if (!this.renderer) return;
    const hi = this.quality === 'high';
    const pr = Math.min(window.devicePixelRatio || 1, hi ? 1.75 : 1.35);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    // タッチ操作時は下部HUDの分だけ映像を上へずらす
    const d = Math.round((this.bottomInset || 0) * 0.55);
    if (d > 0) this.camera.setViewOffset(this.w, this.h + 2 * d, 0, 2 * d, this.w, this.h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(this.w, this.h);
      this.bloom.resolution.set(this.w * 0.5, this.h * 0.5);
    }
  }

  destroy() {
    super.destroy();
    window.removeEventListener('keydown', this._kc);
    this.composer?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
  }

  // ───────── パーティクル（火花・砂煙・破片）
  initParticles() {
    const mk = (cap, per, item) => new THREE.BufferAttribute(new Float32Array(cap * per * item), item).setUsage(THREE.DynamicDrawUsage);
    // 火花：線分
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', mk(400, 2, 3));
    sg.setAttribute('color', mk(400, 2, 3));
    this.sparkMesh = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sparkMesh.frustumCulled = false;
    this.scene.add(this.sparkMesh);
    // 砂煙
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', mk(220, 1, 3));
    dg.setAttribute('color', mk(220, 1, 4));
    this.dustMesh = new THREE.Points(dg, new THREE.PointsMaterial({
      size: 2.6, vertexColors: true, transparent: true, depthWrite: false,
      map: TX.tex(TX.radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), { wrap: false }),
    }));
    this.dustMesh.frustumCulled = false;
    this.scene.add(this.dustMesh);
    // 破片
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', mk(120, 1, 3));
    this.debrisMesh = new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.12, color: 0x111111 }));
    this.debrisMesh.frustumCulled = false;
    this.scene.add(this.debrisMesh);
    this.P3 = { spark: [], dust: [], debris: [] };
  }

  _carFrame() {
    const g = this.playerModel.group;
    const p = this.p;
    const o = this.cl.pose(p.dist, p.x, this._to);
    return { g, o, v: p.speed * SL };
  }
  spawnSpark(burst) {
    if (!this.cl || this.P3.spark.length > 380) return;
    const { g, o, v } = this._carFrame();
    const pos = new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.05, -0.8 + Math.random() * 1.8).applyMatrix4(g.matrixWorld);
    const vel = o.fwd.clone().multiplyScalar(v * (0.7 + Math.random() * 0.15))
      .addScaledVector(o.right, (Math.random() - 0.5) * (burst ? 7 : 4))
      .addScaledVector(o.up, Math.random() * (burst ? 4 : 2.2));
    this.P3.spark.push({ pos, vel, life: 0, max: 0.2 + Math.random() * 0.3 });
  }
  spawnDust() {
    if (!this.cl || this.P3.dust.length > 210) return;
    const { g, o, v } = this._carFrame();
    const side = Math.random() < 0.5 ? -1 : 1;
    const pos = new THREE.Vector3(side * 0.8, 0.25, -1.6).applyMatrix4(g.matrixWorld);
    const vel = o.fwd.clone().multiplyScalar(v * 0.45).addScaledVector(o.up, 1 + Math.random() * 2.5).addScaledVector(o.right, side * Math.random() * 2.5);
    this.P3.dust.push({ pos, vel, life: 0, max: 0.9 + Math.random() * 0.7 });
  }
  spawnDebris() {
    if (!this.cl) return;
    const { g, o, v } = this._carFrame();
    for (let k = 0; k < 18 && this.P3.debris.length < 118; k++) {
      const pos = new THREE.Vector3((Math.random() - 0.5) * 2, 0.4, 1.6 + Math.random()).applyMatrix4(g.matrixWorld);
      const vel = o.fwd.clone().multiplyScalar(v * 0.85).add(new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8));
      this.P3.debris.push({ pos, vel, life: 0, max: 0.8 + Math.random() * 0.5 });
    }
  }
  updateParticles3D(dt) {
    const step = (arr, grav, drag) => {
      for (const q of arr) {
        q.life += dt;
        q.vel.y += grav * dt;
        if (drag) q.vel.multiplyScalar(Math.pow(drag, dt));
        q.pos.addScaledVector(q.vel, dt);
      }
      return arr.filter((q) => q.life < q.max);
    };
    if (!this.paused) {
      this.P3.spark = step(this.P3.spark, -14, 0);
      this.P3.dust = step(this.P3.dust, 0.6, 0.3);
      this.P3.debris = step(this.P3.debris, -9.8, 0);
    }
    const sp = this.sparkMesh.geometry, spP = sp.attributes.position.array, spC = sp.attributes.color.array;
    this.P3.spark.forEach((q, k) => {
      const a = 1 - q.life / q.max;
      spP.set([q.pos.x, q.pos.y, q.pos.z, q.pos.x - q.vel.x * 0.02, q.pos.y - q.vel.y * 0.02, q.pos.z - q.vel.z * 0.02], k * 6);
      spC.set([1.6 * a, 1.0 * a, 0.35 * a, 1.0 * a, 0.45 * a, 0.1 * a], k * 6);
    });
    sp.setDrawRange(0, this.P3.spark.length * 2);
    sp.attributes.position.needsUpdate = sp.attributes.color.needsUpdate = true;
    const dg = this.dustMesh.geometry, dP = dg.attributes.position.array, dC = dg.attributes.color.array;
    this.P3.dust.forEach((q, k) => {
      dP.set([q.pos.x, q.pos.y, q.pos.z], k * 3);
      dC.set([0.85, 0.74, 0.58, 0.5 * (1 - q.life / q.max)], k * 4);
    });
    dg.setDrawRange(0, this.P3.dust.length);
    dg.attributes.position.needsUpdate = dg.attributes.color.needsUpdate = true;
    const bg = this.debrisMesh.geometry, bP = bg.attributes.position.array;
    this.P3.debris.forEach((q, k) => bP.set([q.pos.x, q.pos.y, q.pos.z], k * 3));
    bg.setDrawRange(0, this.P3.debris.length);
    bg.attributes.position.needsUpdate = true;
  }

  // ───────── マシンの姿勢
  poseCar(car, M, dt, isPlayer) {
    const o = this.cl.pose(car.dist, car.x, isPlayer ? this._po : this._ro);
    const g = M.group;
    // モデルのローカルxは左向き（右手系を保つため）
    this._m.makeBasis(this._left.copy(o.right).negate(), o.up, o.fwd);
    g.quaternion.setFromRotationMatrix(this._m);
    let steer;
    if (isPlayer) steer = car.steerVis;
    else {
      const raw = dt > 0 ? clamp(((car.x - (car._px ?? car.x)) / dt) * 2.2, -1, 1) : 0;
      car._st = (car._st || 0) + (raw - (car._st || 0)) * Math.min(1, dt * 6);
      car._px = car.x;
      steer = car._st;
    }
    g.rotateY(-steer * 0.055);
    const sp = car.speed / MAX_SPEED;
    g.position.copy(o.pos);
    g.position.y += Math.sin(this.time * 47 + (car.phase || 0)) * 0.006 * sp + (isPlayer && this.offroad ? (Math.random() - 0.5) * 0.05 : 0);
    if (!this.paused) M.spinA += (car.speed * SL * dt) / 0.36;
    for (const w of M.wheels) {
      w.spin.rotation.x = M.spinA;
      if (w.front) w.group.rotation.y = -steer * 0.32;
    }
    const drs = isPlayer ? this.drsOpen : false;
    M.flap.rotation.x += ((drs ? -0.06 : 0.42) - M.flap.rotation.x) * Math.min(1, dt * 10);
    const blink = Math.floor(this.time * 8) % 2 === 0;
    M.lightMat.emissiveIntensity = isPlayer ? (this.harvest && blink ? 9 : 0.4) : 0.5;
    const b = isPlayer ? car.boostVis : 0;
    M.glow.material.opacity = b;
    const s = 0.4 + b * (1.4 + Math.random() * 0.4);
    M.glow.scale.set(s, s, 1);
    g.updateMatrixWorld();
    return o;
  }

  // ───────── カメラ
  updateCamera(dt, sp) {
    const cam = this.camera;
    const p = this.p;
    const o = this._po;
    const tv = this.mode === 'attract' || this.state === 'finished';
    let fov;
    if (tv) fov = this.tvCamera(dt);
    else {
      const mode = CAMS[this.camIdx].id;
      const k = 1 - Math.exp(-dt * 5.5);
      if (this.camFwd.dot(o.fwd) < 0.5) this.camFwd.copy(o.fwd);
      this.camFwd.lerp(o.fwd, k).normalize();
      if (mode === 'tcam') {
        const g = this.playerModel.group;
        cam.position.set(0, 1.36, 0.05).applyMatrix4(g.matrixWorld);
        cam.up.copy(o.up);
        cam.lookAt(this._v.set(0, 1.0, 20).applyMatrix4(g.matrixWorld));
        fov = 70 + sp * 9 + p.boostVis * 7;
      } else {
        const far = mode === 'far';
        const d = far ? 10.5 : 6.3, h = far ? 3.3 : 1.8;
        cam.position.copy(o.pos).addScaledVector(this.camFwd, -d).addScaledVector(o.right, -p.steerVis * 0.25);
        cam.position.y += h;
        cam.up.set(0, 1, 0);
        cam.lookAt(this._v.copy(o.pos).addScaledVector(this.camFwd, far ? 10 : 8).addScaledVector(o.up, far ? 0.6 : 0.95));
        fov = 55 + sp * 13 + p.boostVis * 9;
      }
      cam.rotateZ(-this.roll * 1.6);
      if (this.shake > 0.05) {
        cam.position.x += (Math.random() - 0.5) * this.shake * 0.012;
        cam.position.y += (Math.random() - 0.5) * this.shake * 0.012;
      }
    }
    if (cam.aspect < 1) fov = Math.min(95, fov * 1.28);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * (tv ? 1 : Math.min(1, dt * 4));
      cam.updateProjectionMatrix();
    }
  }

  newShot() {
    const pick = Math.random() < 0.55 || this.mode !== 'attract' ? this.p : this.rivals[(Math.random() * this.rivals.length) | 0];
    const kinds = ['side', 'side', 'orbit', 'heli', 'low'];
    const kind = kinds[(Math.random() * kinds.length) | 0];
    const tv = { car: pick, kind, t0: this.time, until: this.time + 5.5, a0: Math.random() * 6 };
    if (kind === 'side') {
      const ahead = (70 + Math.random() * 70) / SL;
      tv.dist = pick.dist + ahead;
      const i = Math.floor((((tv.dist % this.L) + this.L) % this.L) / SEG) % this.cl.N;
      const side = Math.random() < 0.5 ? -1 : 1;
      tv.pos = this.cl.P[i].clone().addScaledVector(this.cl.R[i], side * (WALL * HW + 3)).add(new THREE.Vector3(0, 1.6 + Math.random() * 5, 0));
      tv.until = this.time + 12;
    }
    this.tv = tv;
  }

  tvCamera() {
    if (!this.tv || this.time > this.tv.until) this.newShot();
    let tv = this.tv;
    if (tv.kind === 'side' && this.wrapDiff(tv.car.dist - tv.dist) > 22 / SL) { this.newShot(); tv = this.tv; }
    const cam = this.camera;
    const car = tv.car;
    const o = this.cl.pose(car.dist, car.x, this._to);
    const target = this._v2.copy(o.pos).addScaledVector(o.up, 0.55);
    cam.up.set(0, 1, 0);
    if (tv.kind === 'side') {
      cam.position.copy(tv.pos);
      cam.lookAt(target);
      const d = cam.position.distanceTo(target);
      return clamp((2 * Math.atan(3.6 / d) * 180) / Math.PI, 7, 48);
    }
    if (tv.kind === 'orbit') {
      const a = tv.a0 + (this.time - tv.t0) * 0.32;
      cam.position.copy(o.pos).addScaledVector(o.fwd, Math.cos(a) * 7.5).addScaledVector(o.right, Math.sin(a) * 7.5).addScaledVector(o.up, 1.3);
      cam.lookAt(target);
      return 42;
    }
    if (tv.kind === 'heli') {
      cam.position.copy(o.pos).addScaledVector(o.fwd, -26).addScaledVector(o.right, 9).addScaledVector(o.up, 16);
      cam.lookAt(this._v.copy(o.pos).addScaledVector(o.fwd, 8));
      return 38;
    }
    cam.position.copy(o.pos).addScaledVector(o.fwd, 9.5).addScaledVector(o.right, 1.9).addScaledVector(o.up, 0.4);
    cam.lookAt(target);
    return 46;
  }

  // ───────── 描画
  render(dt) {
    const p = this.p;
    const sp = p.speed / MAX_SPEED;
    const tod = this.timeOfDay();
    this.poseCar(p, this.playerModel, dt, true);
    for (const r of this.rivals) this.poseCar(r, this.rivalModels[r.idx], dt, false);
    this.updateCamera(dt, sp);
    this.world.update(tod, this.camera);

    const o = this._po;
    const sun = this.world.sun;
    sun.target.position.copy(o.pos);
    sun.position.copy(o.pos).addScaledVector(this.world.sunDir, 150);
    sun.target.updateMatrixWorld();

    const lit = this.mode === 'race' && this.state === 'grid' ? this.lights : 0;
    this.world.lamps.forEach((m, k) => (m.emissiveIntensity = k < lit ? 7 : 0));

    this.updateParticles3D(dt);
    this.renderer.toneMappingExposure = 1.12 + tod * 0.25;
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);

    // 2Dオーバーレイ（流線・レンズフレア・ビネット）
    const ctx = this.ctx;
    const { w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const sv = this._v.copy(this.camera.position).addScaledVector(this.world.sunDir, 1000).project(this.camera);
    this.sunPos = sv.z < 1 && Math.abs(sv.x) < 1.1 && Math.abs(sv.y) < 1.1 ? { x: ((sv.x + 1) / 2) * w, y: ((1 - sv.y) / 2) * h } : null;
    const tvMode = this.mode === 'attract' || this.state === 'finished';
    if (!tvMode && CAMS[this.camIdx].id !== 'tcam') this.drawStreaks(ctx, dt, sp * 0.92);
    else if (!tvMode) this.drawStreaks(ctx, dt, sp);
    else this.streaks.length = 0;
    ctx.drawImage(this.vignette, 0, 0, w, h);
    if (p.boostVis > 0.02) {
      ctx.fillStyle = `rgba(255,190,90,${p.boostVis * 0.07})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
}
