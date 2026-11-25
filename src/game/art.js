// ─────────────────────────────────────────────
// 手続き生成アート：マシン（リアビュー）・沿道スプライト・背景
// ─────────────────────────────────────────────
import { mulberry } from './track.js';

export const PLAYER_LIVERY = {
  team: 'GOLDEN SEVEN', code: 'YOU', num: '7',
  body: '#151515', accent: '#d4ad55', wing: '#1b1b1b', helmet: '#ece6d6', tyre: '#e0362c',
};

export const RIVALS = [
  { team: 'VORTEX', code: 'VTX', num: '3', body: '#b9c3c9', accent: '#19b3a3', wing: '#20262b', helmet: '#19b3a3', tyre: '#e0362c' },
  { team: 'SCARLET DYN.', code: 'SCD', num: '11', body: '#c3161c', accent: '#f4f4f4', wing: '#b31318', helmet: '#ffd100', tyre: '#f1c232' },
  { team: 'NOVA', code: 'NOV', num: '19', body: '#ff7a12', accent: '#1d6fd6', wing: '#16202c', helmet: '#ff7a12', tyre: '#e0362c' },
  { team: 'AZURE', code: 'AZR', num: '22', body: '#1a3d91', accent: '#ff4f9a', wing: '#1a3d91', helmet: '#ffffff', tyre: '#f1c232' },
  { team: 'VERDANT', code: 'VRD', num: '27', body: '#0f5c3a', accent: '#b6f03c', wing: '#0f5c3a', helmet: '#b6f03c', tyre: '#eeeeee' },
  { team: 'STRATOS', code: 'STR', num: '31', body: '#eeeef1', accent: '#6b35c9', wing: '#25262b', helmet: '#6b35c9', tyre: '#e0362c' },
  { team: 'IRONCLAD', code: 'IRC', num: '42', body: '#575b61', accent: '#e2231a', wing: '#2b2d31', helmet: '#e2231a', tyre: '#f1c232' },
  { team: 'TIDE', code: 'TDE', num: '58', body: '#3aa7e8', accent: '#ffffff', wing: '#0d3b66', helmet: '#ffffff', tyre: '#eeeeee' },
  { team: 'HELIX', code: 'HLX', num: '88', body: '#f2c400', accent: '#121212', wing: '#121212', helmet: '#121212', tyre: '#e0362c' },
];

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

const FONT = "'Barlow Condensed', 'Arial Narrow', Impact, sans-serif";

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

// ── マシン（後方から）。(cx, by) = 接地中心, W = 全幅px
export function drawCar(ctx, cx, by, W, L, o = {}) {
  const u = W / 100;
  ctx.save();
  ctx.translate(cx, by);
  if (o.tilt) ctx.rotate(o.tilt);
  ctx.scale(u, u);

  // 影
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, -0.5, 56, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // サスペンションアーム
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-15, -17); ctx.lineTo(-31, -15);
  ctx.moveTo(-15, -25); ctx.lineTo(-31, -24);
  ctx.moveTo(15, -17); ctx.lineTo(31, -15);
  ctx.moveTo(15, -25); ctx.lineTo(31, -24);
  ctx.stroke();

  // タイヤ
  const tyre = (x) => {
    const g = ctx.createLinearGradient(x, 0, x + 21, 0);
    g.addColorStop(0, '#060606'); g.addColorStop(0.45, '#2b2b2b'); g.addColorStop(1, '#070707');
    ctx.fillStyle = g;
    rr(ctx, x, -34, 21, 34, 4.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(x + 3, -33, 15, 1.4);
    ctx.fillStyle = L.tyre || '#e0362c';
    const sx = x < 0 ? x + 1 : x + 18.8;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(sx, -29, 1.2, 24);
    ctx.globalAlpha = 1;
  };
  tyre(-51); tyre(30);

  // フロア／サイドポッド
  const bodyG = ctx.createLinearGradient(0, -44, 0, -6);
  bodyG.addColorStop(0, shade(L.body, 0.28));
  bodyG.addColorStop(0.5, L.body);
  bodyG.addColorStop(1, shade(L.body, -0.35));
  ctx.fillStyle = bodyG;
  poly(ctx, [-30, -7, -28, -21, -18, -28, 18, -28, 28, -21, 30, -7]);
  ctx.fill();
  ctx.strokeStyle = L.accent;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-28.5, -20); ctx.lineTo(-18, -27); ctx.lineTo(18, -27); ctx.lineTo(28.5, -20);
  ctx.stroke();

  // ディフューザー
  ctx.fillStyle = '#0c0c0c';
  poly(ctx, [-27, -2.5, -24, -13, 24, -13, 27, -2.5]);
  ctx.fill();
  ctx.strokeStyle = '#2c2c2c';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (const x of [-16, -8, 8, 16]) { ctx.moveTo(x, -12.5); ctx.lineTo(x * 1.08, -3); }
  ctx.stroke();

  // エンジンカバー
  ctx.fillStyle = bodyG;
  poly(ctx, [-17, -27, -9, -42, 9, -42, 17, -27]);
  ctx.fill();
  ctx.fillStyle = L.accent;
  poly(ctx, [-2.2, -42, 2.2, -42, 3.4, -27, -3.4, -27]);
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.globalAlpha = 1;

  // ミラー
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.ellipse(-15, -40, 3.2, 1.6, 0, 0, Math.PI * 2);
  ctx.ellipse(15, -40, 3.2, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // ヘルメット＋Halo
  ctx.fillStyle = L.helmet;
  ctx.beginPath();
  ctx.arc(0, -45.5, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = L.accent;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, -45.5, 4.4, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-10.5, -41);
  ctx.quadraticCurveTo(0, -58, 10.5, -41);
  ctx.stroke();

  // エアボックス
  ctx.fillStyle = bodyG;
  poly(ctx, [-4.6, -40, -3.2, -52.5, 3.2, -52.5, 4.6, -40]);
  ctx.fill();
  ctx.fillStyle = '#050505';
  ctx.fillRect(-2.6, -52.5, 5.2, 2.2);

  // ビームウイング
  ctx.fillStyle = '#141414';
  ctx.fillRect(-27, -33, 54, 2.6);

  // ギアボックス＆レインライト
  ctx.fillStyle = shade(L.body, -0.2);
  ctx.fillRect(-7, -23, 14, 10);
  if (o.light) {
    ctx.shadowColor = '#ff2a2a';
    ctx.shadowBlur = 14;
  }
  ctx.fillStyle = o.light ? '#ff3b30' : '#5a1010';
  ctx.fillRect(-3.6, -20, 7.2, 3.6);
  ctx.shadowBlur = 0;

  // 排気（ブースト時に発光）
  if (o.boost > 0) {
    const r = 3 + o.boost * 4 + Math.random() * 2;
    const g = ctx.createRadialGradient(0, -26, 0, 0, -26, r * 2);
    g.addColorStop(0, 'rgba(255,250,220,0.95)');
    g.addColorStop(0.3, 'rgba(255,196,80,0.75)');
    g.addColorStop(1, 'rgba(255,120,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -26, r * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#1e1e1e';
  ctx.beginPath();
  ctx.arc(0, -26, 2.3, 0, Math.PI * 2);
  ctx.fill();

  // リアウイング
  ctx.fillStyle = '#101010';
  ctx.fillRect(-1.2, -50, 2.4, 20);
  ctx.fillStyle = L.wing;
  ctx.fillRect(-41, -61, 4.4, 31);
  ctx.fillRect(36.6, -61, 4.4, 31);
  ctx.fillStyle = L.accent;
  ctx.fillRect(-41, -61, 4.4, 4);
  ctx.fillRect(36.6, -61, 4.4, 4);
  ctx.fillStyle = '#0b0b0b';
  ctx.fillRect(-37, -51.5, 74, 7);
  ctx.fillStyle = L.accent;
  ctx.font = `800 italic 6.4px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(L.team, 0, -47.8, 62);
  // 上段フラップ（DRSで開く）
  ctx.fillStyle = L.wing;
  if (o.drs) {
    ctx.fillRect(-37, -62, 74, 1.8);
    ctx.fillStyle = '#4ef08a';
    ctx.fillRect(-37, -60.2, 74, 0.7);
  } else {
    ctx.fillRect(-37, -59, 74, 6.2);
    ctx.fillStyle = L.accent;
    ctx.fillRect(-37, -53.6, 74, 0.9);
    ctx.font = `900 italic 6.4px ${FONT}`;
    ctx.fillStyle = L.num === '7' ? '#f4efe2' : L.accent;
    ctx.fillText(L.num, 0, -56);
  }
  ctx.restore();
}

// 車両画像のキャッシュ（ライバル描画用）
export function renderCarImage(L) {
  const c = document.createElement('canvas');
  c.width = 420; c.height = 280;
  const ctx = c.getContext('2d');
  drawCar(ctx, 210, 272, 380, L, {});
  return c;
}

// ── 沿道スプライト
function mk(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  return c;
}

export function makeSprites() {
  const rnd = mulberry(42);
  const S = {};

  S.tower = { w: 0.22, img: mk(90, 460, (g, w, h) => {
    const pg = g.createLinearGradient(38, 0, 52, 0);
    pg.addColorStop(0, '#2c3038'); pg.addColorStop(0.5, '#646b75'); pg.addColorStop(1, '#2c3038');
    g.fillStyle = pg;
    g.fillRect(40, 40, 10, h - 40);
    g.fillStyle = '#23272e';
    g.fillRect(4, 6, 82, 40);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      g.fillStyle = '#fff6dc';
      g.beginPath();
      g.arc(14 + c * 15.5, 15 + r * 11.5, 4.6, 0, Math.PI * 2);
      g.fill();
    }
  }), glow: [0.5, 0.05] };

  S.grand = { w: 1.9, img: mk(560, 250, (g, w, h) => {
    // 屋根の柱
    g.fillStyle = '#3a404a';
    for (let x = 30; x < w; x += 125) g.fillRect(x, 30, 8, h - 30);
    // 段
    for (let t = 0; t < 7; t++) {
      const y = 70 + t * 24;
      g.fillStyle = t % 2 ? '#59606b' : '#4e5560';
      g.fillRect(0, y, w, 24);
      for (let x = 6; x < w - 4; x += 9) {
        if (rnd() < 0.86) {
          const hue = [0, 42, 200, 0, 0, 350, 45, 210][(rnd() * 8) | 0];
          g.fillStyle = rnd() < 0.3 ? '#f2f0ea' : `hsl(${hue},${30 + rnd() * 55}%,${35 + rnd() * 30}%)`;
          g.fillRect(x, y + 5 + rnd() * 3, 6, 10);
          g.fillStyle = '#d9b48c';
          g.fillRect(x + 1, y + 1 + rnd() * 2, 4, 5);
        }
      }
    }
    g.fillStyle = '#2a2f37';
    g.fillRect(0, h - 22, w, 22);
    g.fillStyle = '#d4ad55';
    g.fillRect(0, h - 22, w, 4);
    g.font = `800 italic 15px ${FONT}`;
    g.fillStyle = '#e9e4d8';
    g.textBaseline = 'middle';
    for (let x = 20; x < w; x += 190) g.fillText('GOLDEN HOUR GRAND PRIX', x, h - 9);
    // 屋根（白い膜）
    g.fillStyle = '#e9edf1';
    g.beginPath();
    g.moveTo(0, 42);
    for (let x = 0; x <= w; x += 70) g.quadraticCurveTo(x + 35, 8, x + 70, 42);
    g.lineTo(w, 58); g.lineTo(0, 58);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,220,150,0.8)';
    for (let x = 18; x < w; x += 46) g.fillRect(x, 56, 16, 3);
  }) };

  const boardTexts = [
    ['GOLDEN HOUR GP', '#111', '#d4ad55'],
    ['No.7  SEVEN RACING', '#d4ad55', '#111'],
    ['APEX // FULL SEND', '#e9eef2', '#1b2633'],
    ['黄昏を、駆け抜けろ。', '#1b2633', '#f2c98a'],
  ];
  boardTexts.forEach(([txt, bg, fg], i) => {
    S['board' + i] = { w: 0.95, img: mk(380, 170, (g, w, h) => {
      g.fillStyle = '#2b3038';
      g.fillRect(40, 100, 12, 70);
      g.fillRect(w - 52, 100, 12, 70);
      g.fillStyle = '#0c0e12';
      g.fillRect(0, 0, w, 110);
      g.fillStyle = bg;
      g.fillRect(5, 5, w - 10, 100);
      g.fillStyle = fg;
      g.save();
      g.beginPath();
      g.rect(5, 5, w - 10, 100);
      g.clip();
      g.globalAlpha = 0.18;
      for (let x = -100; x < w; x += 60) {
        g.beginPath();
        g.moveTo(x, 105); g.lineTo(x + 40, 5); g.lineTo(x + 52, 5); g.lineTo(x + 12, 105);
        g.fill();
      }
      g.restore();
      g.fillStyle = fg;
      g.font = `900 italic 46px ${FONT}, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(txt, w / 2, 58, w - 30);
    }) };
  });

  S.palm = { w: 0.75, img: mk(200, 320, (g, w, h) => {
    g.strokeStyle = '#5a4630';
    g.lineWidth = 12;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(100, h);
    g.quadraticCurveTo(84, 170, 104, 70);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    g.lineWidth = 2;
    for (let y = 90; y < h; y += 14) { g.beginPath(); g.moveTo(90, y); g.lineTo(106, y - 3); g.stroke(); }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const len = 70 + rnd() * 25;
      g.fillStyle = i % 2 ? '#2f5a3a' : '#3c6d45';
      g.beginPath();
      g.moveTo(104, 70);
      const ex = 104 + Math.cos(a) * len, ey = 70 + Math.sin(a) * len * 0.55 + 28;
      g.quadraticCurveTo(104 + Math.cos(a) * len * 0.5, 70 + Math.sin(a) * len * 0.3 - 22, ex, ey);
      g.quadraticCurveTo(104 + Math.cos(a) * len * 0.5, 70 + Math.sin(a) * len * 0.3 - 6, 104, 76);
      g.fill();
    }
  }) };

  S.tires = { w: 0.55, img: mk(260, 66, (g, w, h) => {
    for (let r = 0; r < 2; r++) for (let x = 0; x < w; x += 26) {
      const cx = x + 13 + (r ? 13 : 0);
      if (cx > w - 10) continue;
      g.fillStyle = '#111';
      g.beginPath(); g.arc(cx, h - 16 - r * 24, 15, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = (Math.floor(rnd() * 2) ? '#c8262b' : '#eeeeee');
    g.fillRect(0, 22, w, 8);
    g.fillStyle = '#eeeeee';
    for (let x = 0; x < w; x += 52) g.fillRect(x, 22, 26, 8);
  }) };

  S.gantry = { w: 2.55, img: mk(1100, 520, (g, w, h) => {
    g.fillStyle = '#1d2128';
    g.fillRect(20, 40, 34, h - 40);
    g.fillRect(w - 54, 40, 34, h - 40);
    g.fillStyle = '#111419';
    g.fillRect(0, 20, w, 70);
    g.fillStyle = '#d4ad55';
    g.fillRect(0, 86, w, 5);
    g.font = `900 italic 44px ${FONT}`;
    g.fillStyle = '#ece6d6';
    g.textBaseline = 'middle';
    g.fillText('GOLDEN HOUR', 70, 56);
    g.textAlign = 'right';
    g.fillText('GRAND PRIX', w - 70, 56);
    g.textAlign = 'center';
    for (let i = 0; i < 5; i++) {
      const x = w / 2 - 120 + i * 60;
      g.fillStyle = '#0a0a0a';
      g.fillRect(x - 22, 24, 44, 110);
      for (let j = 0; j < 2; j++) {
        g.fillStyle = '#3a0c0c';
        g.beginPath(); g.arc(x, 50 + j * 50, 16, 0, Math.PI * 2); g.fill();
      }
    }
  }) };

  return S;
}

// ── 背景（遠景の砂丘と都市シルエット）
export function makeBackgrounds() {
  const rnd = mulberry(99);
  const W = 2400;
  const dunes = mk(W, 240, (g, w, h) => {
    const layer = (base, amp, color, seed) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        const t = (x / w) * Math.PI * 2;
        const y = base - amp * (0.55 * Math.sin(t * 2 + seed) + 0.3 * Math.sin(t * 5 + seed * 2) + 0.15 * Math.sin(t * 11 + seed * 3));
        g.lineTo(x, y);
      }
      g.lineTo(w, h);
      g.closePath();
      g.fill();
    };
    layer(150, 60, 'rgba(120,130,150,0.55)', 1);
    layer(185, 40, 'rgba(95,100,118,0.75)', 4);
    layer(215, 20, 'rgba(70,72,86,0.9)', 7);
  });
  const city = mk(W, 300, (g, w, h) => {
    let x = 0;
    while (x < w) {
      const bw = 18 + rnd() * 46;
      const bh = 30 + Math.pow(rnd(), 2.2) * 200;
      const tall = rnd() < 0.06;
      const H = tall ? 230 + rnd() * 50 : bh;
      g.fillStyle = `rgb(${32 + rnd() * 12},${38 + rnd() * 12},${52 + rnd() * 14})`;
      if (tall) {
        g.beginPath();
        g.moveTo(x, h); g.lineTo(x + bw * 0.2, h - H); g.lineTo(x + bw * 0.5, h - H - 30); g.lineTo(x + bw * 0.8, h - H); g.lineTo(x + bw, h);
        g.fill();
      } else g.fillRect(x, h - H, bw, H);
      for (let wy = h - H + 8; wy < h - 6; wy += 9) for (let wx = x + 4; wx < x + bw - 4; wx += 7) {
        if (rnd() < 0.32) {
          g.fillStyle = rnd() < 0.8 ? 'rgba(255,205,120,0.85)' : 'rgba(200,230,255,0.7)';
          g.fillRect(wx, wy, 3, 4);
        }
      }
      x += bw + rnd() * 30 + (rnd() < 0.15 ? 120 : 0);
    }
  });
  return { dunes, city };
}

export function makeVignette(w, h) {
  return mk(Math.max(2, w | 0), Math.max(2, h | 0), (g) => {
    const r = Math.hypot(w, h) / 2;
    const vg = g.createRadialGradient(w / 2, h * 0.55, r * 0.45, w / 2, h * 0.55, r * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(5,10,18,0.6)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
  });
}
