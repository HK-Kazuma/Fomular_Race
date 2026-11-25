// 3D用の手続き生成テクスチャ（Canvas → THREE.CanvasTexture）
import * as THREE from 'three';
import { mulberry } from '../game/track.js';

const FONT = "'Barlow Condensed', 'Arial Narrow', Impact, sans-serif";

function canvas(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  return c;
}

export function tex(c, { repeat = [1, 1], srgb = true, aniso = 8, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(g, w, h, base, amp, n, rnd, size = 1) {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (rnd() - 0.5) * amp;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    g.fillRect(rnd() * w, rnd() * h, size + rnd() * size, size + rnd() * size);
  }
}

export function asphalt(lines) {
  const rnd = mulberry(3);
  return canvas(512, 512, (g, w, h) => {
    noise(g, w, h, lines ? '#62666e' : '#565c66', 0.2, 26000, rnd, 1.2);
    if (lines) {
      // ゴムの乗ったレコードライン
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0.25, 'rgba(0,0,0,0)');
      gr.addColorStop(0.42, 'rgba(10,10,12,0.28)');
      gr.addColorStop(0.58, 'rgba(10,10,12,0.28)');
      gr.addColorStop(0.75, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#eeeeea';
      const lw = Math.round(w * 0.018);
      g.fillRect(0, 0, lw, h);
      g.fillRect(w - lw, 0, lw, h);
    }
  });
}

export function sand(light) {
  const rnd = mulberry(light ? 8 : 5);
  return canvas(512, 512, (g, w, h) => {
    noise(g, w, h, light ? '#d8c09a' : '#caa679', 0.16, 22000, rnd, 1.5);
    g.strokeStyle = 'rgba(120,80,40,0.08)';
    g.lineWidth = 3;
    for (let y = 0; y < h; y += 18) {
      g.beginPath();
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + y) * 5);
      g.stroke();
    }
  });
}

export function wall(boards) {
  return canvas(2048, 160, (g, w, h) => {
    g.fillStyle = '#9ea3a8';
    g.fillRect(0, 0, w, h);
    const rnd = mulberry(11);
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`;
      g.fillRect(rnd() * w, rnd() * h, 2, 2);
    }
    // 広告バナー
    const bw = w / 4;
    for (let i = 0; i < 4; i++) {
      const b = boards[i];
      g.drawImage(b, 5, 5, b.width - 10, 100, i * bw + 6, 8, bw - 12, h * 0.68);
    }
    g.fillStyle = '#111';
    g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = '#d4ad55';
    for (let x = 0; x < w; x += 64) g.fillRect(x, h * 0.78, 32, h * 0.05);
  });
}

export function fence() {
  return canvas(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 3;
    for (let i = -w; i < w * 2; i += 32) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
      g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke();
    }
    g.lineWidth = 8;
    g.beginPath(); g.moveTo(0, 2); g.lineTo(w, 2); g.stroke();
  });
}

export function checker() {
  return canvas(448, 64, (g, w, h) => {
    const s = 32;
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      g.fillStyle = (x / s + y / s) % 2 ? '#111' : '#f2f2f2';
      g.fillRect(x, y, s, s);
    }
  });
}

export function windows() {
  const rnd = mulberry(21);
  return canvas(128, 256, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    for (let y = 6; y < h; y += 12) for (let x = 6; x < w; x += 10) {
      if (rnd() < 0.38) {
        g.fillStyle = rnd() < 0.8 ? '#ffcf86' : '#cfe6ff';
        g.fillRect(x, y, 5, 6);
      }
    }
  });
}

export function radial(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  return canvas(size, size, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, inner);
    gr.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'));
    gr.addColorStop(1, outer);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
  });
}

export function blob() {
  return canvas(128, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)');
    gr.addColorStop(0.6, 'rgba(0,0,0,0.45)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.scale(1, h / w);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
    g.restore();
  });
}

// マシン用：リアウイング上面の文字・ゼッケン
export function wingText(team, num, fg, bg) {
  return canvas(512, 170, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = `800 italic 74px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(team, w / 2, h / 2 + 4, w - 30);
  });
}

export function numberTex(num, fg) {
  return canvas(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = `900 italic 104px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(num, w / 2, h / 2 + 6);
  });
}
