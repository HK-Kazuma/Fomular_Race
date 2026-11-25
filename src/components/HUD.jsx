import React, { useEffect, useRef } from 'react';
import { fmtTime } from '../game/engine.js';

const gapStr = (g) => (g == null ? 'LEADER' : `+${g.toFixed(1)}`);

function Lights({ n }) {
  return (
    <div className="lights">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="pod">
          <span className={i < n ? 'on' : ''} />
          <span className={i < n ? 'on' : ''} />
        </div>
      ))}
    </div>
  );
}

function ShiftLights({ rpm }) {
  const lit = Math.round(Math.max(0, Math.min(1, (rpm - 0.45) / 0.55)) * 15);
  return (
    <div className={`shift ${lit >= 15 ? 'max' : ''}`}>
      {Array.from({ length: 15 }, (_, i) => (
        <i key={i} className={`${i < 5 ? 'g' : i < 10 ? 'r' : 'b'} ${i < lit ? 'on' : ''}`} />
      ))}
    </div>
  );
}

export default function HUD({ hud, radio, pops, engine, onPause, isTouch, portrait, is3D, onCam, camLabel }) {
  const mini = useRef(null);
  useEffect(() => {
    engine?.setMinimap(mini.current);
    return () => engine?.setMinimap(null);
  }, [engine]);

  const me = hud.tower.findIndex((t) => t.isPlayer);
  const compact = isTouch;
  const near = hud.tower.slice(Math.max(0, me - 1), me + 2);
  const drsCls = hud.drsOpen ? 'open' : hud.drsAvail ? 'avail' : hud.drsZone ? 'zone' : '';

  return (
    <div className="hud">
      {/* 左上：順位とタイミングタワー */}
      <div className="tower">
        <div className="pos-box">
          <div className="pos">
            <small>P</small>
            {hud.rank}
            <em>/{hud.total}</em>
          </div>
          <div className="lap">
            LAP <b>{hud.lap}</b>/{hud.laps}
          </div>
        </div>
        <ol className={`tower-list ${compact ? 'compact' : ''}`}>
          {(compact ? near : hud.tower).map((t) => (
            <li key={t.code} className={t.isPlayer ? 'me' : ''}>
              <span className="tp">{t.pos}</span>
              <span className="tc" style={{ background: t.color, boxShadow: `inset -3px 0 0 ${t.accent}` }} />
              <span className="tn">{t.code}</span>
              <span className="tg">{t.pos === 1 ? 'LEADER' : gapStr(t.gap)}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* 右上：タイム＋ミニマップ */}
      <div className="timing">
        <div className="hud-btns">
          {is3D && (
            <button className="cam-btn" onClick={onCam} aria-label="カメラ切替">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d="M4 7h3l2-2h6l2 2h3v12H4z" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
              {!isTouch && <span>{camLabel}</span>}
            </button>
          )}
          <button className="pause-btn" onClick={onPause} aria-label="一時停止">
            <span /><span />
          </button>
        </div>
        <div className="times">
          <div className="t-main">{fmtTime(hud.curLap)}</div>
          <div className="t-row"><span>BEST</span>{fmtTime(hud.best)}</div>
          {!compact && <div className="t-row"><span>LAST</span>{fmtTime(hud.last)}</div>}
        </div>
        <canvas ref={mini} className="minimap" />
      </div>

      {/* 速度クラスター */}
      <div className="cluster">
        <ShiftLights rpm={hud.rpm} />
        <div className="cl-main">
          <div className="speed">
            {hud.kmh}
            <small>km/h</small>
          </div>
          <div className="gear">{hud.gear}</div>
        </div>
        <div className={`ers ${hud.boost ? 'boost' : ''} ${hud.harvest ? 'harvest' : ''}`}>
          <span className="lbl">ERS</span>
          <div className="bar"><i style={{ width: `${hud.ers}%` }} /></div>
          <span className="val">{Math.round(hud.ers)}</span>
        </div>
        <div className="badges">
          <span className={`drs ${drsCls}`}>{hud.drsOpen ? 'DRS OPEN' : 'DRS'}</span>
          <span className={`tow ${hud.tow ? 'on' : ''}`}>SLIPSTREAM</span>
          {hud.auto && <span className="auto">AUTO</span>}
        </div>
        {compact && (
          <div className="gaps">
            <span>▲ {hud.gapAhead != null ? `${hud.gapAhead.toFixed(1)}s` : '—'}</span>
            <span>▼ {hud.gapBehind != null ? `${hud.gapBehind.toFixed(1)}s` : '—'}</span>
          </div>
        )}
      </div>

      {/* スタートシグナル */}
      {hud.state === 'grid' && (
        <div className="grid-ov">
          <Lights n={hud.lights} />
          <p>{isTouch ? 'シグナル消灯でスタート（アクセル自動）' : '↑ / W を踏んで待て — シグナル消灯でスタート'}</p>
        </div>
      )}

      {/* チーム無線 */}
      {radio && (
        <div className="radio" key={radio.id}>
          <div className="r-head">
            <span className="wave"><i /><i /><i /><i /></span>
            RACE ENGINEER
          </div>
          <div className="r-text">{radio.text}</div>
        </div>
      )}

      {/* ポップアップ */}
      <div className="pops">
        {pops.map((p) => (
          <div key={p.id} className={`pop ${p.kind}`}>{p.text}</div>
        ))}
      </div>
    </div>
  );
}
