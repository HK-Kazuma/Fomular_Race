import React, { useRef, useState } from 'react';

// 左右ステア：指を滑らせても左右が切り替わるパッド
function SteerPad({ engine }) {
  const ptrs = useRef(new Map());
  const [side, setSide] = useState(0);
  const apply = () => {
    let l = false, r = false;
    for (const s of ptrs.current.values()) { if (s < 0) l = true; else r = true; }
    engine.setTouch('left', l);
    engine.setTouch('right', r);
    setSide(l && !r ? -1 : r && !l ? 1 : 0);
  };
  const sideOf = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientX < rect.left + rect.width / 2 ? -1 : 1;
  };
  return (
    <div
      className="steer"
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); ptrs.current.set(e.pointerId, sideOf(e)); apply(); }}
      onPointerMove={(e) => { if (ptrs.current.has(e.pointerId)) { ptrs.current.set(e.pointerId, sideOf(e)); apply(); } }}
      onPointerUp={(e) => { ptrs.current.delete(e.pointerId); apply(); }}
      onPointerCancel={(e) => { ptrs.current.delete(e.pointerId); apply(); }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className={`half l ${side === -1 ? 'on' : ''}`}><span>◀</span></div>
      <div className={`half r ${side === 1 ? 'on' : ''}`}><span>▶</span></div>
    </div>
  );
}

function Hold({ engine, k, className, children }) {
  const [on, setOn] = useState(false);
  const set = (v) => (e) => { e.preventDefault(); if (v) e.currentTarget.setPointerCapture?.(e.pointerId); engine.setTouch(k, v); setOn(v); };
  return (
    <button
      className={`hold ${className} ${on ? 'on' : ''}`}
      onPointerDown={set(true)}
      onPointerUp={set(false)}
      onPointerCancel={set(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

export default function TouchControls({ engine, portrait, auto }) {
  if (!engine) return null;
  return (
    <div className={`pad ${portrait ? 'pad-portrait' : 'pad-land'}`}>
      <SteerPad engine={engine} />
      <div className="pad-right">
        {!auto && <Hold engine={engine} k="up" className="gas">GAS</Hold>}
        <Hold engine={engine} k="down" className="brake">BRAKE</Hold>
        <Hold engine={engine} k="boost" className="boost">
          <b>BOOST</b>
          <small>ERS</small>
        </Hold>
      </div>
    </div>
  );
}
