import React, { useEffect, useRef } from 'react';
import { drawCar, PLAYER_LIVERY } from '../game/art.js';

// タイトル用：No.7マシンのクローズアップ（光の筋＋排気グロー）
export default function HeroCar() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    let raf;
    const streaks = Array.from({ length: 14 }, () => ({ x: Math.random(), y: Math.random(), v: 0.4 + Math.random() * 0.9, l: 0.1 + Math.random() * 0.3 }));
    const t0 = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const t = (now - t0) / 1000;
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
      const w = r.width, h = r.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#41566a');
      g.addColorStop(0.55, '#c9a46a');
      g.addColorStop(1, '#1a1510');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // 夕日のバースト
      const sg = ctx.createRadialGradient(w * 0.5, h * 0.62, 0, w * 0.5, h * 0.62, w * 0.9);
      sg.addColorStop(0, 'rgba(255,248,225,0.95)');
      sg.addColorStop(0.15, 'rgba(255,214,150,0.6)');
      sg.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, w, h);
      // 路面
      ctx.fillStyle = '#1b1d22';
      ctx.beginPath();
      ctx.moveTo(w * 0.42, h * 0.62); ctx.lineTo(w * 0.58, h * 0.62); ctx.lineTo(w * 1.4, h); ctx.lineTo(-w * 0.4, h);
      ctx.fill();
      // 光の筋（斜め）
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of streaks) {
        s.x += s.v * 0.016;
        if (s.x > 1.4) { s.x = -0.4; s.y = Math.random(); }
        const x = s.x * w, y = s.y * h;
        const lg = ctx.createLinearGradient(x, y, x + w * s.l, y - w * s.l * 0.6);
        lg.addColorStop(0, 'rgba(255,255,255,0)');
        lg.addColorStop(1, 'rgba(255,240,210,0.35)');
        ctx.strokeStyle = lg;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w * s.l, y - w * s.l * 0.6);
        ctx.stroke();
      }
      ctx.restore();
      const cw = Math.min(w * 0.86, h * 1.25);
      drawCar(ctx, w / 2, h * 0.93 + Math.sin(t * 22) * 0.6, cw, PLAYER_LIVERY, {
        light: Math.floor(t * 3) % 2 === 0,
        boost: 0.35 + Math.sin(t * 9) * 0.15,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="hero-canvas" />;
}
