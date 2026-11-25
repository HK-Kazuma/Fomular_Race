// ─────────────────────────────────────────────
// 疑似3Dレースエンジン（Canvas 2D）
// ─────────────────────────────────────────────
import { buildTrack, SEG, ROAD_W, RUMBLE_LEN, LAPS, START_SEG } from './track.js';
import { drawCar, renderCarImage, makeSprites, makeBackgrounds, makeVignette, PLAYER_LIVERY, RIVALS } from './art.js';
import { Audio } from './audio.js';

const FOV = 100;
const CAM_H = 1000;
const CAM_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
const PLAYER_Z = CAM_H * CAM_DEPTH;
const DRAW_DIST = 220;
export const MAX_SPEED = SEG * 60;
const ACCEL = MAX_SPEED / 4.6;
const BRAKE = -MAX_SPEED * 1.05;
const DECEL = -MAX_SPEED / 5;
const OFF_DECEL = -MAX_SPEED / 1.8;
const OFF_LIMIT = MAX_SPEED / 4;
const CENTRIFUGAL = 0.3;
export const CAR_W = 0.34;
const KMH = 332;
export const LINE_Z = START_SEG * SEG;

export const DIFFICULTY = {
  rookie: { label: 'ROOKIE', top: 0.89, spread: 0.007, desc: '初めてならここから' },
  pro: { label: 'PRO', top: 0.945, spread: 0.006, desc: 'ERSとDRSを使いこなせ' },
  legend: { label: 'LEGEND', top: 0.985, spread: 0.005, desc: '一瞬のミスも許されない' },
};

export const PAL = [
  { skyTop: [92, 128, 152], skyMid: [170, 188, 198], horizon: [244, 204, 140], haze: [226, 200, 158], sandA: [206, 172, 126], sandB: [197, 162, 116], run: [88, 95, 108], roadA: [66, 68, 75], roadB: [61, 63, 70] },
  { skyTop: [26, 36, 62], skyMid: [92, 84, 116], horizon: [230, 128, 72], haze: [150, 106, 98], sandA: [118, 96, 80], sandB: [110, 89, 74], run: [50, 55, 66], roadA: [42, 44, 51], roadB: [38, 40, 47] },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (a, n) => ((a % n) + n) % n;
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function fmtTime(t) {
  if (t == null || !isFinite(t)) return '--:--.---';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
}

export class Engine {
  constructor(canvas, cb = {}, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cb = cb;
    this.opts = opts;
    this.carLen = SEG * 0.95;   // 前後方向の車長（接触判定）
    this.miniCanvas = null;
    const T = buildTrack();
    this.segs = T.segments;
    this.N = this.segs.length;
    this.L = T.length;
    this.minimap = T.minimap;
    this.heading = T.heading;
    this.sprites = makeSprites();
    this.bg = makeBackgrounds();
    this.rivalImgs = RIVALS.map(renderCarImage);
    document.fonts?.ready?.then(() => {
      this.sprites = makeSprites();
      this.rivalImgs = RIVALS.map(renderCarImage);
      this.rivals?.forEach((r, i) => (r.img = this.rivalImgs[r.idx]));
    });
    this.audio = new Audio();
    this.keys = {};
    this.touch = {};
    this.autoThrottle = window.matchMedia?.('(pointer: coarse)').matches || false;
    this.paused = false;
    this.particles = [];
    this.streaks = [];
    this.shake = 0;
    this.roll = 0;
    this.time = 0;
    this.radioLast = {};
    this.hudTimer = 0;
    this._bindKeys();
    this.initRenderer();
    this.resize();
    this.setupAttract();
    this._last = performance.now();
    this._raf = requestAnimationFrame(this._frame);
  }

  initRenderer() {}

  destroy() {
    cancelAnimationFrame(this._raf);
    clearTimeout(this._finTimer);
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
  }

  // ───────── 入力
  _bindKeys() {
    const map = {
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
      Space: 'boost', ShiftLeft: 'boost', ShiftRight: 'boost', KeyX: 'boost',
    };
    this._kd = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = map[e.code];
      if (k) { this.keys[k] = true; e.preventDefault(); }
      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.autoThrottleKeyUsed = true;
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.mode === 'race') this.cb.onEvent?.({ type: 'pauseKey' });
      if (e.code === 'KeyM') this.toggleMute();
    };
    this._ku = (e) => {
      const k = map[e.code];
      if (k) { this.keys[k] = false; e.preventDefault(); }
    };
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
  }

  setTouch(k, v) { this.touch[k] = v; }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    this.cb.onEvent?.({ type: 'mute', muted: this.audio.muted });
  }

  humanInput() {
    const k = this.keys, t = this.touch;
    const down = !!(k.down || t.down);
    let up = !!(k.up || t.up);
    if (this.autoThrottle && !this.autoThrottleKeyUsed) up = !down;
    return { left: !!(k.left || t.left), right: !!(k.right || t.right), up, down, boost: !!(k.boost || t.boost) };
  }

  // ───────── 画面サイズ
  resize() {
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w * dpr > 2400) dpr = 2400 / w;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dpr = dpr;
    this.w = w; this.h = h;
    this.xUnit = Math.max(w * 0.31, h * 0.36);
    this.horizon = h > w ? h * 0.44 : h * 0.5;
    this.yUnit = Math.max(h * 0.25, h - (this.bottomInset || 0) - this.horizon);
    this.vignette = makeVignette(w, h);
    this._miniDirty = true;
  }

  setBottomInset(px) {
    if (px === this.bottomInset) return;
    this.bottomInset = px;
    this.resize();
  }

  setMinimap(c) { this.miniCanvas = c; this._miniDirty = true; }

  // ───────── セットアップ
  _makeCars(diffKey, attract) {
    const d = DIFFICULTY[diffKey] || DIFFICULTY.pro;
    this.rivals = RIVALS.map((liv, i) => ({
      idx: i, liv, img: this.rivalImgs[i],
      base: d.top - i * d.spread + (Math.random() - 0.5) * 0.008,
      dist: attract ? LINE_Z + (i + 1) * 9 * SEG : LINE_Z - 2 * SEG - i * 6 * SEG,
      x: i % 2 ? 0.36 : -0.36,
      speed: attract ? MAX_SPEED * 0.8 : 0,
      react: 0.12 + Math.random() * 0.25,
      phase: Math.random() * 10,
      lapsDone: -1, lapStart: 0, bestLap: Infinity, lastLap: null,
      finished: false, finishTime: null, isPlayer: false,
    }));
    this.p = {
      isPlayer: true, liv: PLAYER_LIVERY,
      dist: attract ? LINE_Z : LINE_Z - 2 * SEG - 9 * 6 * SEG,
      x: 0.36, speed: attract ? MAX_SPEED * 0.8 : 0,
      steerVis: 0, ers: 60, boostVis: 0,
      lapsDone: -1, lapStart: 0, bestLap: Infinity, lastLap: null,
      finished: false, finishTime: null,
    };
    this.all = [this.p, ...this.rivals];
    this.stats = { overtakes: 0, contacts: 0, offTracks: 0, drsPasses: 0, maxKmh: 0 };
    this.rank = 10;
    this.prevRank = 10;
    this.drsOpen = false;
    this.drsAvail = false;
    this.tow = false;
    this.offroad = false;
    this.contactCd = 0;
    this.wallCd = 0;
    this.lastDrsTime = -10;
    this.particles = [];
    this.raceTime = 0;
    this.prevSlope = 0;
  }

  setupAttract() {
    clearTimeout(this._finTimer);
    this.mode = 'attract';
    this.state = 'racing';
    this.diffKey = 'pro';
    this._makeCars('pro', true);
  }

  startRace(diffKey) {
    this.audio.init();
    this.mode = 'race';
    this.diffKey = diffKey;
    this._makeCars(diffKey, false);
    this.state = 'grid';
    this.raceId = (this.raceId || 0) + 1;
    clearTimeout(this._finTimer);
    this.gridT = 0;
    this.lights = 0;
    this.outAt = 1.0 + 4 * 0.85 + 0.7 + Math.random() * 1.1;
    this.paused = false;
    this.finishT = 0;
    this.radioLast = {};
    this.radio('ラジオチェック。最後尾10番手から、全員抜くぞ。', 'r0', 0, 1.2);
    this.emitHud(true);
  }

  setPaused(v) {
    this.paused = v;
    if (v) this.audio.update(0, 0, 0, 0, false);
  }

  radio(text, key, cd = 6, delay = 0) {
    const now = this.time;
    if (this.radioLast[key] != null && now - this.radioLast[key] < cd) return;
    this.radioLast[key] = now;
    const send = () => this.cb.onEvent?.({ type: 'radio', text });
    if (delay) setTimeout(send, delay * 1000); else send();
  }
  pop(text, kind = '') { this.cb.onEvent?.({ type: 'pop', text, kind }); }

  // ───────── ループ
  _frame = (now) => {
    this._raf = requestAnimationFrame(this._frame);
    let dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    if (!this.paused) {
      const steps = Math.ceil(dt / (1 / 60));
      const sdt = dt / steps;
      for (let i = 0; i < steps; i++) this.update(sdt);
    }
    this.render(dt);
    this.drawMinimap();
    this.hudTimer += dt;
    if (this.hudTimer > 0.07) { this.hudTimer = 0; this.emitHud(); }
  };

  segAt(z) { return this.segs[Math.floor(mod(z, this.L) / SEG) % this.N]; }
  wrapDiff(d) { return mod(d + this.L / 2, this.L) - this.L / 2; }

  // ───────── 更新
  update(dt) {
    this.time += dt;
    const p = this.p;
    const race = this.mode === 'race';

    // スタートシグナル
    if (race && this.state === 'grid') {
      this.gridT += dt;
      const lit = clamp(Math.floor((this.gridT - 1.0) / 0.85) + 1, 0, 5);
      if (lit !== this.lights && this.gridT < this.outAt) {
        this.lights = lit;
        this.audio.beep(520, 0.16, 0.22);
      }
      const inp = this.humanInput();
      this.audio.update(inp.up ? 0.75 + Math.sin(this.time * 30) * 0.05 : 0.12, inp.up ? 0.8 : 0.2, 0, 0, true);
      if (this.gridT >= this.outAt) {
        this.lights = 0;
        this.state = 'racing';
        this.raceTime = 0;
        this.audio.whoosh();
        this.pop('LIGHTS OUT', 'big');
        this.radio('ライトアウト！行け行け！', 'go', 0);
      }
      return;
    }

    if (race && (this.state === 'racing' || this.state === 'finished')) this.raceTime += dt;

    // ── プレイヤー
    const ai = !race || this.state === 'finished';
    const inp = ai ? this.aiInput() : this.humanInput();
    const pSeg = this.segAt(p.dist);
    const sp = p.speed / MAX_SPEED;

    // 前方車両（DRS・スリップストリーム判定）
    let ahead = null, aheadDz = Infinity;
    for (const r of this.rivals) {
      const dz = this.wrapDiff(r.dist - p.dist);
      if (dz > 0 && dz < aheadDz) { aheadDz = dz; ahead = r; }
    }
    const gapSec = ahead ? aheadDz / Math.max(p.speed, MAX_SPEED * 0.55) : 99;
    this.gapAhead = gapSec;
    this.tow = !!ahead && aheadDz > this.carLen * 1.4 && aheadDz < this.carLen + SEG * 15 && Math.abs(ahead.x - p.x) < 0.42 && sp > 0.5;
    const wasAvail = this.drsAvail;
    this.drsAvail = pSeg.drs && gapSec < 1.0 && this.state === 'racing';
    this.drsOpen = this.drsAvail && !inp.down;
    if (this.drsOpen) this.lastDrsTime = this.time;
    if (race && this.drsAvail && !wasAvail) {
      this.radio('DRS有効。開けろ！', 'drs', 9);
      this.audio.beep(990, 0.08, 0.12, 'square');
    }

    // ERS
    const boosting = inp.boost && p.ers > 0.5 && sp > 0.15 && this.state === 'racing';
    if (boosting) p.ers = Math.max(0, p.ers - 26 * dt);
    let harvest = false;
    if (!boosting) {
      let gain = 1.4;
      if (inp.down && sp > 0.25) { gain += 24; harvest = true; }
      else if (!inp.up && sp > 0.25) { gain += 7; harvest = true; }
      if (this.tow) gain += 9;
      const before = p.ers;
      p.ers = Math.min(100, p.ers + gain * dt);
      if (race && before < 100 && p.ers >= 100) this.radio('バッテリー満タン。オーバーテイクボタン使っていいぞ。', 'ers', 25);
    }
    if (boosting && !this._wasBoost && race) this.audio.whoosh();
    this._wasBoost = boosting;
    p.boostVis = lerp(p.boostVis, boosting ? 1 : 0, Math.min(1, dt * 8));
    this.harvest = harvest;

    // ステアリング
    const steer = dt * 2.6 * Math.min(1, sp * 1.15);
    if (inp.left) p.x -= steer;
    if (inp.right) p.x += steer;
    p.x -= dt * 2 * sp * sp * pSeg.curve * CENTRIFUGAL;
    p.steerVis = lerp(p.steerVis, (inp.right ? 1 : 0) - (inp.left ? 1 : 0), Math.min(1, dt * 9));

    // 加減速
    const accelM = (boosting ? 1.75 : 1) * (this.tow ? 1.12 : 1) * (this.drsOpen ? 1.08 : 1);
    if (inp.down) p.speed += BRAKE * dt;
    else if (inp.up) p.speed += ACCEL * accelM * dt * (1 - sp * 0.35);
    else p.speed += DECEL * dt;

    const absX = Math.abs(p.x);
    const wasOff = this.offroad;
    this.offroad = absX > 1.06;
    if (this.offroad) {
      if (p.speed > OFF_LIMIT) p.speed += OFF_DECEL * dt;
      this.shake = Math.max(this.shake, 3 * sp);
      if (Math.random() < 0.7) this.spawnDust();
      if (!wasOff && race && this.state === 'racing') {
        this.stats.offTracks++;
        this.radio('コース上に留まれ！', 'off', 10);
      }
    } else if (absX > 0.93 && sp > 0.3) {
      this.shake = Math.max(this.shake, 1.3);
    }
    if (absX > 2.3) {
      p.x = Math.sign(p.x) * 2.3;
      if (this.wallCd <= 0) {
        p.speed *= 0.5;
        this.wallCd = 0.8;
        this.shake = 14;
        this.audio.thud(0.7);
        this.spawnDebris();
        if (race && this.state === 'racing') { this.stats.contacts++; this.radio('ウォール！大丈夫か？…走れるなら走り続けろ。', 'wall', 8); }
      }
    }
    this.wallCd -= dt;

    const cap = MAX_SPEED * (1 + (boosting ? 0.13 : 0) + (this.drsOpen ? 0.075 : 0) + (this.tow ? 0.04 : 0));
    if (p.speed > cap) p.speed = Math.max(cap, p.speed - MAX_SPEED * 0.55 * dt);
    p.speed = Math.max(0, p.speed);
    p.dist += p.speed * dt;
    p.x = clamp(p.x, -2.4, 2.4);

    // ── ライバルAI
    const started = this.state !== 'grid';
    for (const r of this.rivals) {
      if (race && this.raceTime < r.react && this.state === 'racing') continue;
      const seg = this.segAt(r.dist);
      const ahead12 = this.segAt(r.dist + SEG * 14);
      const curv = Math.max(Math.abs(seg.curve), Math.abs(ahead12.curve) * 0.85);
      let target = r.base * (1 - curv * 0.036) * MAX_SPEED * (1 + 0.022 * Math.sin(this.time * 0.6 + r.phase));
      let tx = clamp(ahead12.curve * 0.11, -0.6, 0.6) + Math.sin(this.time * 0.15 + r.phase) * 0.15;
      for (const o of this.all) {
        if (o === r) continue;
        const dz = this.wrapDiff(o.dist - r.dist);
        if (dz > 0 && dz < this.carLen + SEG * 7 && Math.abs(o.x - r.x) < CAR_W * 1.2 && o.speed < target * 1.02) {
          const side = o.x > r.x ? -1 : 1;
          tx = clamp(o.x + side * CAR_W * 1.55, -0.85, 0.85);
          if (Math.abs(tx - o.x) < CAR_W) tx = o.x - side * CAR_W * 1.55;
          if (dz < this.carLen + SEG * 1.5) target = Math.min(target, o.speed * 0.985);
        }
      }
      r.x += clamp(tx - r.x, -0.85 * dt, 0.85 * dt);
      r.x = clamp(r.x, -0.88, 0.88);
      r.speed += clamp(target - r.speed, -MAX_SPEED * 0.9 * dt, ACCEL * 0.92 * dt);
      r.speed = Math.max(0, r.speed);
      r.dist += r.speed * dt;
    }

    // ── 接触判定
    this.contactCd -= dt;
    for (const r of this.rivals) {
      const dz = this.wrapDiff(r.dist - p.dist);
      if (Math.abs(dz) < this.carLen && Math.abs(r.x - p.x) < CAR_W * 0.92) {
        if (dz > 0) {
          if (p.speed > r.speed) { p.speed = r.speed * 0.84; p.dist = r.dist - this.carLen; }
        } else if (r.speed > p.speed) { r.speed = p.speed * 0.9; r.dist = p.dist - this.carLen; }
        const push = p.x < r.x ? -1 : 1;
        p.x += push * 0.07;
        r.x -= push * 0.05;
        if (this.contactCd <= 0) {
          this.contactCd = 0.9;
          this.shake = 10;
          this.audio.thud(0.55);
          this.spawnDebris();
          if (race && this.state === 'racing') {
            this.stats.contacts++;
            this.radio('接触！ダメージは…問題なし。プッシュ続行。', 'contact', 7);
          }
        }
      }
    }

    // ── ラップ・順位
    if (race && started) this.updateLaps();

    // ── 演出用パラメータ
    const sp2 = p.speed / MAX_SPEED;
    const slope = (pSeg.p2.world.y - pSeg.p1.world.y) / SEG;
    if (sp2 > 0.8 && slope - this.prevSlope > 0.004) for (let i = 0; i < 8; i++) this.spawnSpark(true);
    this.prevSlope = slope;
    if (sp2 > 0.86 && Math.random() < (sp2 - 0.86) * 4) this.spawnSpark(false);
    if (Math.abs(pSeg.curve) > 3 && sp2 > 0.6 && Math.random() < 0.08) this.spawnSpark(false);
    this.shake *= Math.pow(0.02, dt);
    this.roll = lerp(this.roll, pSeg.curve * sp2 * 0.0042 - p.steerVis * 0.004, Math.min(1, dt * 3));
    if (race) this.stats.maxKmh = Math.max(this.stats.maxKmh, sp2 * KMH);

    // サウンド
    const g = this.gearInfo(sp2);
    this.audio.update(g.rpm, inp.up ? 1 : 0.15, sp2, p.boostVis, race && !this.paused);

    this.updateParticles(dt);
  }

  gearInfo(sp) {
    const kmh = sp * KMH;
    const th = [0, 85, 125, 160, 195, 230, 265, 300, 9999];
    let gIdx = 1;
    while (gIdx < 8 && kmh > th[gIdx]) gIdx++;
    const lo = th[gIdx - 1], hi = gIdx === 8 ? 360 : th[gIdx];
    const rpm = clamp(0.35 + ((kmh - lo) / (hi - lo)) * 0.65, 0.1, 1);
    return { gear: kmh < 3 ? 'N' : String(gIdx), rpm };
  }

  aiInput() {
    const p = this.p;
    const seg = this.segAt(p.dist + SEG * 6);
    const far = this.segAt(p.dist + SEG * 16);
    const c = Math.max(Math.abs(seg.curve), Math.abs(far.curve) * 0.9);
    let tx = clamp(far.curve * 0.1, -0.5, 0.5);
    for (const r of this.rivals) {
      const dz = this.wrapDiff(r.dist - p.dist);
      if (dz > 0 && dz < this.carLen + SEG * 8 && Math.abs(r.x - tx) < CAR_W * 1.3) tx = r.x > 0 ? r.x - CAR_W * 1.6 : r.x + CAR_W * 1.6;
    }
    tx = clamp(tx, -0.85, 0.85);
    const sp = p.speed / MAX_SPEED;
    const maxSp = c > 0.5 ? Math.min(1, 4.1 / c) : 1;
    const lim = this.mode === 'attract' ? 0.93 : 0.85;
    return {
      left: p.x > tx + 0.06,
      right: p.x < tx - 0.06,
      up: sp < Math.min(lim, maxSp) * 0.98,
      down: sp > Math.min(lim, maxSp) + 0.07,
      boost: false,
    };
  }

  updateLaps() {
    for (const c of this.all) {
      if (c.finished) continue;
      if (c.dist < LINE_Z) continue;
      const done = Math.floor((c.dist - LINE_Z) / this.L);
      if (done > c.lapsDone) {
        if (done >= 1 && c.lapsDone >= 0) {
          const lt = this.raceTime - c.lapStart;
          c.lastLap = lt;
          if (lt < c.bestLap) {
            const wasBest = c.isPlayer && isFinite(c.bestLap);
            c.bestLap = lt;
            if (wasBest) this.pop('PERSONAL BEST', 'pb');
          }
          c.lapStart = this.raceTime;
        }
        c.lapsDone = done;
        if (done >= LAPS) {
          c.finished = true;
          c.finishTime = this.raceTime;
          if (c.isPlayer) this.onPlayerFinish();
        } else if (c.isPlayer && done >= 1) {
          if (done === LAPS - 1) {
            this.pop('FINAL LAP', 'big');
            this.radio(this.rank === 1 ? 'ファイナルラップ。トップだ、持ち帰れ。' : `ファイナルラップ。P${this.rank}、全部出し切れ！`, 'final', 0);
          } else {
            this.pop(`LAP ${done + 1}`, 'lap');
            const g = this.gapAhead < 20 ? `前とのギャップ ${this.gapAhead.toFixed(1)}秒。` : '';
            this.radio(`ラップ${done + 1}。P${this.rank}。${g}`, 'lap' + done, 0);
          }
        }
      }
    }
    // 順位
    const order = this.classification();
    const rank = order.indexOf(this.p) + 1;
    if (this.state === 'racing' && rank < this.prevRank) {
      const n = this.prevRank - rank;
      this.stats.overtakes += n;
      if (this.time - this.lastDrsTime < 1.5) this.stats.drsPasses += n;
      this.pop(`P${rank}`, rank === 1 ? 'p1' : 'gain');
      this.audio.beep(rank === 1 ? 1320 : 880, 0.12, 0.15, 'triangle');
      if (rank === 1) this.radio('P1！トップに立った！', 'p1', 15);
      else if (rank <= 3) this.radio(`ナイスムーブ。P${rank}、表彰台圏内だ。`, 'pod' + rank, 12);
      else this.radio(['いいぞ、次だ。', 'クリーンなオーバーテイクだ。', `P${rank}。ペースはある。`, 'その調子。'][(Math.random() * 4) | 0], 'gain', 7);
    }
    this.prevRank = rank;
    this.rank = rank;
    this.order = order;
  }

  classification() {
    return [...this.all].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.dist - a.dist;
    });
  }

  onPlayerFinish() {
    this.state = 'finished';
    this.finishT = 0;
    const r = this.rank;
    this.pop('CHEQUERED FLAG', 'flag');
    this.audio.fanfare();
    this.radio(r === 1 ? 'P1！P1！最高だ、最後尾からの優勝だ！' : r <= 3 ? `P${r}、表彰台だ！素晴らしいレースだった。` : `P${r}でフィニッシュ。次はもっと上を狙おう。`, 'fin', 0);
    clearTimeout(this._finTimer);
    this._finTimer = setTimeout(() => this.finishRace(), 4200);
  }

  finishRace() {
    if (this.mode !== 'race') return;
    const t = this.raceTime;
    for (const c of this.all) {
      if (!c.finished) {
        const remain = LAPS * this.L - (c.dist - LINE_Z);
        c.finishTime = t + remain / Math.max(MAX_SPEED * 0.6, c.speed);
        c.finished = true;
        if (!isFinite(c.bestLap)) c.bestLap = c.lastLap || c.finishTime / LAPS;
      }
    }
    const order = this.classification();
    const fastest = Math.min(...this.all.map((c) => c.bestLap));
    const winT = order[0].finishTime;
    const rows = order.map((c, i) => ({
      pos: i + 1, code: c.liv.code, team: c.liv.team, num: c.liv.num, color: c.liv.body, accent: c.liv.accent,
      time: c.finishTime, gap: i === 0 ? null : c.finishTime - winT, best: c.bestLap,
      fastest: c.bestLap === fastest, isPlayer: !!c.isPlayer,
    }));
    const me = rows.find((r) => r.isPlayer);
    this.cb.onFinish?.({
      rows, diff: this.diffKey,
      pos: me.pos, time: me.time, best: me.best, fastestLap: me.fastest,
      ...this.stats,
    });
  }

  // ───────── HUD送信
  emitHud(force) {
    if (!this.cb.onHud || (this.mode !== 'race' && !force)) return;
    const p = this.p;
    const sp = p.speed / MAX_SPEED;
    const g = this.gearInfo(sp);
    const order = this.order || this.classification();
    const leader = order[0];
    const avg = MAX_SPEED * 0.86;
    const tower = order.map((c, i) => ({
      pos: i + 1, code: c.liv.code, color: c.liv.body, accent: c.liv.accent, isPlayer: !!c.isPlayer,
      gap: i === 0 ? null : c.finished && leader.finished ? c.finishTime - leader.finishTime : (leader.dist - c.dist) / avg,
    }));
    const myIdx = order.indexOf(p);
    const behind = order[myIdx + 1];
    const lapNow = clamp(p.lapsDone + 1, 1, LAPS);
    this.cb.onHud({
      state: this.state, lights: this.lights || 0,
      rank: myIdx + 1, total: this.all.length,
      lap: lapNow, laps: LAPS,
      raceTime: this.raceTime,
      curLap: this.state === 'grid' ? 0 : this.raceTime - p.lapStart,
      best: isFinite(p.bestLap) ? p.bestLap : null, last: p.lastLap,
      kmh: Math.round(sp * KMH), gear: g.gear, rpm: g.rpm,
      ers: p.ers, boost: p.boostVis > 0.5, harvest: this.harvest,
      drsZone: this.segAt(p.dist).drs, drsAvail: this.drsAvail, drsOpen: this.drsOpen, tow: this.tow,
      gapAhead: myIdx > 0 ? (order[myIdx - 1].dist - p.dist) / avg : null,
      gapBehind: behind ? (p.dist - behind.dist) / avg : null,
      tower,
      auto: this.autoThrottle && !this.autoThrottleKeyUsed,
    });
  }

  // ───────── パーティクル
  carScreen() {
    const w = this.w;
    const carW = (CAM_DEPTH / PLAYER_Z) * ROAD_W * CAR_W * this.xUnit;
    return { x: w / 2, y: this._playerScreenY || this.h, w: carW };
  }
  spawnSpark(burst) {
    const c = this.carScreen();
    this.particles.push({
      t: 'spark', x: c.x + (Math.random() - 0.5) * c.w * 0.5, y: c.y - c.w * 0.02,
      vx: (Math.random() - 0.5) * c.w * (burst ? 7 : 4), vy: c.w * (0.5 + Math.random() * (burst ? 3 : 1.6)),
      life: 0, max: 0.25 + Math.random() * 0.35, s: c.w / 100,
    });
  }
  spawnDust() {
    const c = this.carScreen();
    const side = Math.random() < 0.5 ? -1 : 1;
    this.particles.push({
      t: 'dust', x: c.x + side * c.w * 0.4, y: c.y - c.w * 0.05,
      vx: side * c.w * (0.3 + Math.random()), vy: -c.w * (0.2 + Math.random() * 0.6),
      life: 0, max: 0.6 + Math.random() * 0.5, s: c.w * (0.06 + Math.random() * 0.08),
    });
  }
  spawnDebris() {
    const c = this.carScreen();
    for (let i = 0; i < 16; i++) {
      this.particles.push({
        t: 'debris', x: c.x + (Math.random() - 0.5) * c.w, y: c.y - c.w * 0.3,
        vx: (Math.random() - 0.5) * c.w * 6, vy: -c.w * (1 + Math.random() * 2.5),
        life: 0, max: 0.7 + Math.random() * 0.4, s: c.w * 0.02, rot: Math.random() * 6,
      });
    }
  }
  updateParticles(dt) {
    const g = this.w * 3;
    for (const q of this.particles) {
      q.life += dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.t === 'spark') q.vy += g * dt * 0.6;
      else if (q.t === 'debris') { q.vy += g * dt; q.rot += dt * 10; }
      else { q.s += dt * this.w * 0.08; q.vx *= 0.96; }
    }
    this.particles = this.particles.filter((q) => q.life < q.max);
    if (this.particles.length > 260) this.particles.splice(0, this.particles.length - 260);
  }

  // ───────── 描画
  timeOfDay() {
    if (this.mode === 'attract') return 0.35 + Math.sin(this.time * 0.05) * 0.3;
    const prog = (this.p.dist - LINE_Z) / (LAPS * this.L);
    return clamp(0.05 + prog * 0.95, 0, 1);
  }

  render(dt) {
    const ctx = this.ctx;
    const { w, h, dpr } = this;
    const p = this.p;
    const tod = this.timeOfDay();
    const C = {};
    for (const k in PAL[0]) C[k] = mix(PAL[0][k], PAL[1][k], tod);
    const sp = p.speed / MAX_SPEED;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = rgb(C.sandB);
    ctx.fillRect(0, 0, w, h);

    // カメラ揺れ＋ロール
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.save();
    ctx.translate(w / 2 + sx, h / 2 + sy);
    ctx.rotate(this.roll);
    ctx.scale(1.05, 1.05);
    ctx.translate(-w / 2, -h / 2);

    const position = mod(p.dist - PLAYER_Z, this.L);
    const baseIdx = Math.floor(position / SEG) % this.N;
    const base = this.segs[baseIdx];
    const basePct = (position % SEG) / SEG;
    const pSeg = this.segAt(p.dist);
    const pPct = (mod(p.dist, this.L) % SEG) / SEG;
    const playerY = lerp(pSeg.p1.world.y, pSeg.p2.world.y, pPct);

    // 向き（太陽・背景のパララックス）
    const hd = lerp(this.heading[pSeg.index], this.heading[(pSeg.index + 1) % this.N], pPct);
    this.drawSky(ctx, C, tod, hd, playerY);

    // 路面投影
    let maxy = h;
    let x = 0;
    let dx = -(base.curve * basePct);
    const segs = this.segs;
    const N = this.N;
    for (const r of this.rivals) {
      const s = this.segAt(r.dist);
      s.cars.push(r);
    }
    const drawn = [];
    for (let n = 0; n < DRAW_DIST; n++) {
      const seg = segs[(baseIdx + n) % N];
      const looped = seg.index < baseIdx;
      const camZ = position - (looped ? this.L : 0);
      seg.fog = Math.min(1, Math.pow(n / DRAW_DIST, 1.8));
      seg.clip = maxy;
      this.project(seg.p1, p.x * ROAD_W - x, playerY + CAM_H, camZ);
      this.project(seg.p2, p.x * ROAD_W - x - dx, playerY + CAM_H, camZ);
      x += dx;
      dx += seg.curve;
      drawn.push(seg);
      if (seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) { seg.vis = false; continue; }
      seg.vis = true;
      this.drawSegment(ctx, seg, C);
      maxy = seg.p1.screen.y;
    }

    // スプライト・車両（奥→手前）
    const glowA = 0.18 + tod * 0.82;
    let playerDrawn = false;
    for (let n = drawn.length - 1; n > 0; n--) {
      const seg = drawn[n];
      for (const s of seg.sprites) {
        const S = this.sprites[s.type];
        if (!S) continue;
        const scale = seg.p1.screen.scale;
        const sxp = seg.p1.screen.x + scale * s.offset * ROAD_W * this.xUnit;
        const r = this.drawSprite(ctx, S.img, S.w, scale, sxp, seg.p1.screen.y, s.offset === 0 ? -0.5 : s.offset < 0 ? -1 : 0, -1, seg.clip, seg.fog, C.haze);
        if (r && S.glow && glowA > 0.05) {
          const gx = r.x + r.w * S.glow[0], gy = r.y + r.h * S.glow[1];
          const gr = r.w * 2.2;
          const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
          gg.addColorStop(0, `rgba(255,240,200,${0.55 * glowA})`);
          gg.addColorStop(1, 'rgba(255,220,160,0)');
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = gg;
          ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      if (seg.cars.length) {
        seg.cars.sort((a, b) => mod(a.dist, this.L) - mod(b.dist, this.L));
        for (const car of seg.cars) {
          const pct = (mod(car.dist, this.L) % SEG) / SEG;
          const scale = lerp(seg.p1.screen.scale, seg.p2.screen.scale, pct);
          const cx = lerp(seg.p1.screen.x, seg.p2.screen.x, pct) + scale * car.x * ROAD_W * this.xUnit;
          const cy = lerp(seg.p1.screen.y, seg.p2.screen.y, pct);
          if (scale > 0) this.drawSprite(ctx, car.img, CAR_W * (420 / 380), scale, cx, cy, -0.5, -0.97, seg.clip, seg.fog * 0.6, C.haze);
        }
        seg.cars.length = 0;
      }
      if (seg === pSeg) { this.drawPlayer(ctx, pSeg, pPct, sp); playerDrawn = true; }
    }
    for (const r of this.rivals) this.segAt(r.dist).cars.length = 0;
    if (!playerDrawn) this.drawPlayer(ctx, pSeg, pPct, sp);

    this.drawParticles(ctx);
    ctx.restore();

    this.drawStreaks(ctx, dt, sp);
    ctx.drawImage(this.vignette, 0, 0, w, h);
    // ブースト時の色味
    if (p.boostVis > 0.02) {
      ctx.fillStyle = `rgba(255,190,90,${p.boostVis * 0.08})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.mode === 'attract') {
      ctx.fillStyle = 'rgba(8,12,20,0.18)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  project(pt, camX, camY, camZ) {
    pt.camera.x = 0 - camX;
    pt.camera.y = pt.world.y - camY;
    pt.camera.z = pt.world.z - camZ;
    const s = (pt.screen.scale = CAM_DEPTH / pt.camera.z);
    pt.screen.x = Math.round(this.w / 2 + s * pt.camera.x * this.xUnit);
    pt.screen.y = Math.round(this.horizon - s * pt.camera.y * this.yUnit);
    pt.screen.w = Math.round(s * ROAD_W * this.xUnit);
  }

  drawSky(ctx, C, tod, hd, playerY) {
    const { w, h } = this;
    const hz = this.horizon;
    const pad = w * 0.1;
    const g = ctx.createLinearGradient(0, -h * 0.05, 0, hz + 4);
    g.addColorStop(0, rgb(C.skyTop));
    g.addColorStop(0.62, rgb(C.skyMid));
    g.addColorStop(1, rgb(C.horizon));
    ctx.fillStyle = g;
    ctx.fillRect(-pad, -h * 0.1, w + pad * 2, hz + h * 0.1 + 6);

    // 斜めの光の筋（ポスターのスラッシュ構図）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const ox = mod(-hd * w * 0.35 + i * w * 0.42, w * 1.7) - w * 0.35;
      const gg = ctx.createLinearGradient(ox, 0, ox + w * 0.12, 0);
      gg.addColorStop(0, 'rgba(255,255,255,0)');
      gg.addColorStop(0.5, `rgba(255,245,225,${0.05 * (1 - tod * 0.6)})`);
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.moveTo(ox, hz);
      ctx.lineTo(ox + w * 0.35, -h * 0.1);
      ctx.lineTo(ox + w * 0.47, -h * 0.1);
      ctx.lineTo(ox + w * 0.12, hz);
      ctx.fill();
    }
    ctx.restore();

    // 太陽
    const sunAng = 2.2;
    let rel = mod(sunAng - hd + Math.PI, Math.PI * 2) - Math.PI;
    const sunX = w / 2 + rel * w * 0.55;
    const sunY = hz - h * (0.12 - tod * 0.1);
    this.sunPos = null;
    if (Math.abs(rel) < 1.6) {
      const R = h * 0.55;
      const sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, R);
      sg.addColorStop(0, `rgba(255,252,235,${0.95 - tod * 0.3})`);
      sg.addColorStop(0.06, `rgba(255,236,180,${0.8 - tod * 0.3})`);
      sg.addColorStop(0.25, `rgba(255,200,120,${0.3})`);
      sg.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = sg;
      ctx.fillRect(sunX - R, sunY - R, R * 2, R * 2);
      ctx.globalCompositeOperation = 'source-over';
      this.sunPos = { x: sunX, y: sunY };
    }

    // 遠景（向きに応じてスクロール）
    const yOff = clamp(-playerY / 60, -h * 0.06, h * 0.06);
    const layer = (img, hh, k, alpha) => {
      const dh = hh;
      const dw = (img.width / img.height) * dh;
      const off = mod(-hd * dw * k, dw);
      ctx.globalAlpha = alpha;
      for (let xx = off - dw - pad; xx < w + pad; xx += dw) ctx.drawImage(img, xx, hz - dh + 2 + yOff, dw, dh);
      ctx.globalAlpha = 1;
    };
    layer(this.bg.dunes, h * 0.17, 0.16, 0.9);
    layer(this.bg.city, h * 0.13, 0.24, 0.92);
    // 地平線のもや
    const hg = ctx.createLinearGradient(0, hz - h * 0.08, 0, hz + 6);
    hg.addColorStop(0, `rgba(${C.haze.map((v) => v | 0).join(',')},0)`);
    hg.addColorStop(1, `rgba(${C.haze.map((v) => v | 0).join(',')},0.75)`);
    ctx.fillStyle = hg;
    ctx.fillRect(-pad, hz - h * 0.08, w + pad * 2, h * 0.08 + 6);
  }

  drawSegment(ctx, seg, C) {
    const a = seg.p1.screen, b = seg.p2.screen;
    const { w } = this;
    const alt = Math.floor(seg.index / RUMBLE_LEN) % 2;
    const f = seg.fog;
    const pad = w * 0.15;
    const quad = (x1, y1, x2, y2, x3, y3, x4, y4, col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4);
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = rgb(mix(alt ? C.sandA : C.sandB, C.haze, f));
    ctx.fillRect(-pad, b.y, w + pad * 2, a.y - b.y + 1);
    const rw1 = a.w * 1.9, rw2 = b.w * 1.9;
    quad(a.x - rw1, a.y + 1, a.x + rw1, a.y + 1, b.x + rw2, b.y, b.x - rw2, b.y, rgb(mix(C.run, C.haze, f)));
    const kerb = Math.abs(seg.curve) > 1;
    const ew = kerb ? 1.15 : 1.035;
    const ec = rgb(mix(kerb ? (alt ? [205, 38, 43] : [236, 236, 236]) : [232, 232, 228], C.haze, f));
    const y1 = a.y + 1.5, y2 = b.y - 0.5;
    quad(a.x - a.w * ew, y1, a.x - a.w * 0.98, y1, b.x - b.w * 0.98, y2, b.x - b.w * ew, y2, ec);
    quad(a.x + a.w * 0.98, y1, a.x + a.w * ew, y1, b.x + b.w * ew, y2, b.x + b.w * 0.98, y2, ec);
    quad(a.x - a.w, y1, a.x + a.w, y1, b.x + b.w, y2, b.x - b.w, y2, rgb(mix(alt ? C.roadA : C.roadB, C.haze, f)));
    // レコードライン（タイヤのゴム）
    ctx.globalAlpha = 0.14 * (1 - f);
    quad(a.x - a.w * 0.3, a.y + 1, a.x + a.w * 0.3, a.y + 1, b.x + b.w * 0.3, b.y, b.x - b.w * 0.3, b.y, '#000');
    ctx.globalAlpha = 1;
    // コントロールライン（チェッカー）
    if (seg.index === START_SEG) {
      const cols = 14;
      const my = (a.y + b.y) / 2, mx = (a.x + b.x) / 2, mw = (a.w + b.w) / 2;
      for (let row = 0; row < 2; row++) for (let i = 0; i < cols; i++) {
        if ((i + row) % 2) continue;
        const u1 = -1 + (2 * i) / cols, u2 = -1 + (2 * (i + 1)) / cols;
        const [ya, xa, wa, yb, xb, wb] = row === 0 ? [a.y, a.x, a.w, my, mx, mw] : [my, mx, mw, b.y, b.x, b.w];
        quad(xa + wa * u1, ya, xa + wa * u2, ya, xb + wb * u2, yb, xb + wb * u1, yb, '#f2f2f2');
      }
    }
    // DRS検知ライン
    if (seg.drs && !this.segs[(seg.index - 1 + this.N) % this.N].drs) {
      const yy = (a.y + b.y) / 2;
      ctx.fillStyle = 'rgba(240,240,240,0.9)';
      ctx.fillRect(a.x - a.w, yy - Math.max(1, (a.y - b.y) * 0.15), a.w * 2, Math.max(1.5, (a.y - b.y) * 0.3));
    }
  }

  drawSprite(ctx, img, wUnits, scale, destX, destY, offX, offY, clipY, fog, haze) {
    const destW = wUnits * scale * ROAD_W * this.xUnit;
    if (destW < 1.5 || destW > this.w * 6) return null;
    const destH = destW * (img.height / img.width);
    destX += destW * offX;
    destY += destH * offY;
    const clipH = clipY ? Math.max(0, destY + destH - clipY) : 0;
    if (clipH >= destH) return null;
    const sh = img.height - (img.height * clipH) / destH;
    if (fog > 0.2) ctx.globalAlpha = 1 - (fog - 0.2) * 0.7;
    ctx.drawImage(img, 0, 0, img.width, sh, destX, destY, destW, destH - clipH);
    ctx.globalAlpha = 1;
    return { x: destX, y: destY, w: destW, h: destH };
  }

  drawPlayer(ctx, seg, pct, sp) {
    const p = this.p;
    const camY = lerp(seg.p1.camera.y, seg.p2.camera.y, pct);
    const y = this.horizon - (CAM_DEPTH / PLAYER_Z) * camY * this.yUnit;
    this._playerScreenY = y;
    const carW = (CAM_DEPTH / PLAYER_Z) * ROAD_W * CAR_W * this.xUnit * (420 / 380);
    const bounce = Math.sin(this.time * 45) * sp * carW * 0.004 + (this.offroad ? (Math.random() - 0.5) * carW * 0.03 : 0);
    const cx = this.w / 2 + p.steerVis * carW * 0.04;
    const light = this.harvest ? Math.floor(this.time * 8) % 2 === 0 : false;
    drawCar(ctx, cx, y + bounce, carW * (380 / 420), PLAYER_LIVERY, {
      tilt: p.steerVis * 0.03,
      light,
      drs: this.drsOpen,
      boost: p.boostVis,
    });
    // 熱で揺らぐ排気の光
    if (p.boostVis > 0.05 || sp > 0.9) {
      const gx = cx, gy = y - carW * 0.24;
      const gr = carW * (0.1 + p.boostVis * 0.22);
      const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      gg.addColorStop(0, `rgba(255,210,120,${0.25 + p.boostVis * 0.5})`);
      gg.addColorStop(1, 'rgba(255,150,40,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = gg;
      ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawParticles(ctx) {
    for (const q of this.particles) {
      const a = 1 - q.life / q.max;
      if (q.t === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,${180 + ((Math.random() * 60) | 0)},90,${a})`;
        ctx.lineWidth = Math.max(1, q.s * 0.9);
        ctx.beginPath();
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - q.vx * 0.025, q.y - q.vy * 0.025);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (q.t === 'dust') {
        ctx.fillStyle = `rgba(214,184,140,${a * 0.45})`;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.s, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot);
        ctx.fillStyle = `rgba(20,20,20,${a})`;
        ctx.fillRect(-q.s, -q.s / 2, q.s * 2, q.s);
        ctx.restore();
      }
    }
  }

  drawStreaks(ctx, dt, sp) {
    const { w, h } = this;
    const boost = this.p.boostVis;
    const inten = clamp((sp - 0.62) / 0.38, 0, 1) + boost * 0.6 + (this.tow ? 0.25 : 0);
    const cx = w / 2, cy = this.horizon;
    const want = Math.floor(inten * 34);
    while (this.streaks.length < want) {
      const ang = Math.random() * Math.PI * 2;
      this.streaks.push({ ang, r: Math.hypot(w, h) * (0.12 + Math.random() * 0.25), v: 1.6 + Math.random() * 1.6, len: 0.05 + Math.random() * 0.12, gold: Math.random() < 0.35 });
    }
    if (this.streaks.length > want + 4) this.streaks.length = want;
    if (!this.streaks.length) return;
    const R = Math.hypot(w, h);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const s of this.streaks) {
      s.r += s.r * s.v * dt * (1 + boost);
      if (s.r > R * 0.8) { s.r = R * (0.1 + Math.random() * 0.2); s.ang = Math.random() * Math.PI * 2; }
      const c = Math.cos(s.ang), si = Math.sin(s.ang);
      const r2 = s.r * (1 + s.len * (1 + boost * 2));
      const a = Math.min(0.5, inten * 0.28) * clamp(s.r / (R * 0.3), 0, 1);
      ctx.strokeStyle = s.gold && boost > 0.2 ? `rgba(255,205,120,${a * 1.4})` : `rgba(255,255,255,${a})`;
      ctx.lineWidth = 1 + (s.r / R) * 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + c * s.r, cy + si * s.r * 0.8);
      ctx.lineTo(cx + c * r2, cy + si * r2 * 0.8);
      ctx.stroke();
    }
    ctx.restore();
    // レンズフレア
    if (this.sunPos) {
      const { x, y } = this.sunPos;
      const vx = cx - x, vy = h * 0.55 - y;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      [[0.5, 0.05, 0.08], [0.9, 0.025, 0.12], [1.3, 0.07, 0.05], [1.6, 0.035, 0.09]].forEach(([t, r, a]) => {
        ctx.fillStyle = `rgba(255,220,160,${a})`;
        ctx.beginPath();
        ctx.arc(x + vx * t, y + vy * t, h * r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
  }

  // ───────── ミニマップ
  drawMinimap() {
    const c = this.miniCanvas;
    if (!c || !c.isConnected) return;
    const r = c.getBoundingClientRect();
    const dpr = this.dpr;
    if (this._miniDirty || c.width !== Math.round(r.width * dpr)) {
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      this._miniDirty = false;
      const S = r.width, pad = S * 0.08;
      const path = new Path2D();
      this.minimap.forEach(([x, y], i) => (i ? path.lineTo(pad + x * (S - pad * 2), pad + y * (S - pad * 2)) : path.moveTo(pad + x * (S - pad * 2), pad + y * (S - pad * 2))));
      path.closePath();
      this._miniPath = path;
      this._miniS = S;
    }
    const g = c.getContext('2d');
    const S = this._miniS, pad = S * 0.08;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, S, S);
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = S * 0.07;
    g.stroke(this._miniPath);
    g.strokeStyle = 'rgba(236,230,214,0.9)';
    g.lineWidth = S * 0.025;
    g.stroke(this._miniPath);
    const pt = (dist) => {
      const f = mod(dist, this.L) / SEG;
      const i = Math.floor(f) % this.N, j = (i + 1) % this.N, t = f - Math.floor(f);
      const A = this.minimap[i], B = this.minimap[j];
      return [pad + lerp(A[0], B[0], t) * (S - pad * 2), pad + lerp(A[1], B[1], t) * (S - pad * 2)];
    };
    const [lx, ly] = pt(LINE_Z);
    g.fillStyle = '#fff';
    g.fillRect(lx - S * 0.025, ly - S * 0.025, S * 0.05, S * 0.05);
    for (const rv of this.rivals) {
      const [x, y] = pt(rv.dist);
      g.fillStyle = rv.liv.body;
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, S * 0.03, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    const [px, py] = pt(this.p.dist);
    g.fillStyle = '#d4ad55';
    g.shadowColor = '#ffd27a';
    g.shadowBlur = 8;
    g.beginPath(); g.arc(px, py, S * 0.045, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = '#111'; g.lineWidth = 1.5; g.stroke();
  }
}
