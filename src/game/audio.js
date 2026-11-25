// WebAudioによるエンジン音・風切り音・効果音（音源ファイル不要）
export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = (() => { try { return localStorage.getItem('gh_mute') === '1'; } catch { return false; } })();
  }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.32;
    this.master.connect(ctx.destination);

    // エンジン：ノコギリ波＋矩形波 → ローパス
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 900;
    this.filter.Q.value = 4;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.filter.connect(this.engGain).connect(this.master);
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.o3 = ctx.createOscillator(); this.o3.type = 'sawtooth';
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    const g3 = ctx.createGain(); g3.gain.value = 0.5;
    this.o1.connect(this.filter);
    this.o2.connect(g2).connect(this.filter);
    this.o3.connect(g3).connect(this.filter);
    [this.o1, this.o2, this.o3].forEach((o) => { o.frequency.value = 80; o.start(); });

    // 風切り音：ノイズ → バンドパス
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const n = ctx.createBufferSource();
    n.buffer = buf; n.loop = true;
    this.windF = ctx.createBiquadFilter();
    this.windF.type = 'bandpass'; this.windF.frequency.value = 800; this.windF.Q.value = 0.6;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    n.connect(this.windF).connect(this.windG).connect(this.master);
    n.start();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('gh_mute', m ? '1' : '0'); } catch {}
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.32, this.ctx.currentTime, 0.05);
  }

  // rpm: 0..1 , load: 0..1, speed: 0..1
  update(rpm, load, speed, boost, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 55 + rpm * 260 + boost * 30;
    this.o1.frequency.setTargetAtTime(f, t, 0.03);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.o3.frequency.setTargetAtTime(f * 1.007, t, 0.03);
    this.filter.frequency.setTargetAtTime(500 + load * 1800 + rpm * 900, t, 0.05);
    this.engGain.gain.setTargetAtTime(active ? 0.12 + load * 0.16 : 0, t, 0.08);
    this.windG.gain.setTargetAtTime(active ? speed * speed * 0.22 : 0, t, 0.1);
    this.windF.frequency.setTargetAtTime(500 + speed * 1600, t, 0.1);
  }

  beep(freq = 660, dur = 0.18, vol = 0.25, type = 'sine') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  thud(vol = 0.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 600;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + 0.4);
  }

  whoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + 0.65);
  }

  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.beep(f, 0.5, 0.18, 'triangle'), i * 140));
  }
}
