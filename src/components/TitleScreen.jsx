import React, { useState } from 'react';
import { DIFFICULTY, fmtTime } from '../game/engine.js';
import { ACHIEVEMENTS } from '../game/progress.js';
import HeroCar from './HeroCar.jsx';

export default function TitleScreen({ diff, setDiff, save, onStart, muted, onMute, isTouch, mode, setMode, has3D }) {
  const [showAch, setShowAch] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const got = ACHIEVEMENTS.filter((a) => save.ach[a.id]).length;
  const fs = () => {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
  };

  return (
    <div className="title">
      <div className="slashes" aria-hidden>
        <i /><i /><i /><i />
      </div>

      <div className="title-left">
        <div className="logo">
          <span className="big7">7</span>
          <div className="l1">GOLDEN HOUR</div>
          <div className="l2">GRAND PRIX</div>
          <div className="l3">黄昏のサーキット、最後尾10番手から。</div>
        </div>

        <div className="modes" role="radiogroup" aria-label="表示モード">
          <button role="radio" aria-checked={mode === '3d'} className={mode === '3d' ? 'sel' : ''} disabled={!has3D} onClick={() => setMode('3d')}>
            <b>3D</b><small>Three.js・TVカメラ演出</small>
          </button>
          <button role="radio" aria-checked={mode === '2d'} className={mode === '2d' ? 'sel' : ''} onClick={() => setMode('2d')}>
            <b>CLASSIC</b><small>軽快な疑似3D</small>
          </button>
        </div>

        <div className="diffs" role="radiogroup" aria-label="難易度">
          {Object.entries(DIFFICULTY).map(([k, d]) => {
            const b = save.best[k];
            return (
              <button key={k} role="radio" aria-checked={diff === k} className={`diff ${diff === k ? 'sel' : ''}`} onClick={() => setDiff(k)}>
                <span className="d-name">{d.label}</span>
                <span className="d-desc">{d.desc}</span>
                <span className="d-best">{b ? `BEST P${b.pos} · ${fmtTime(b.lap)}` : 'NO RECORD'}</span>
              </button>
            );
          })}
        </div>

        <button className="start-btn" onClick={() => onStart(diff)}>
          <span>RACE START</span>
          <small>3 LAPS · 10 CARS</small>
        </button>

        <div className="title-tools">
          <button onClick={() => setShowHelp(true)}>操作方法</button>
          <button onClick={() => setShowAch(true)}>実績 {got}/{ACHIEVEMENTS.length}</button>
          <button onClick={onMute}>{muted ? 'SOUND OFF' : 'SOUND ON'}</button>
          {isTouch && document.documentElement.requestFullscreen && <button onClick={fs}>全画面</button>}
        </div>
      </div>

      <div className="title-right" aria-hidden>
        {mode === '2d' && <div className="panel p-hero"><HeroCar /></div>}
        <div className="panel p-a"><div className="tag">No.7</div></div>
        <div className="panel p-b"><div className="tag">LAST TO FIRST</div></div>
      </div>

      {showHelp && (
        <div className="modal" onClick={() => setShowHelp(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>HOW TO RACE</h3>
            <table className="help">
              <tbody>
                <tr><th>ステア</th><td>← → / A D</td><td>◀ ▶ パッド</td></tr>
                <tr><th>アクセル</th><td>↑ / W</td><td>自動（設定で切替）</td></tr>
                <tr><th>ブレーキ</th><td>↓ / S</td><td>BRAKE</td></tr>
                <tr><th>ブースト</th><td>Space / Shift</td><td>BOOST</td></tr>
                <tr><th>一時停止</th><td>Esc / P</td><td>Ⅱ ボタン</td></tr>
                <tr><th>カメラ（3D）</th><td>C</td><td>カメラボタン</td></tr>
              </tbody>
            </table>
            <ul className="tips">
              <li><b>ERS</b>：ブレーキやアクセルオフ、スリップストリームで充電。BOOSTで一気に加速。</li>
              <li><b>DRS</b>：DRSゾーン内で前の車と1秒以内なら自動でウイングが開き、最高速アップ。</li>
              <li><b>スリップストリーム</b>：前の車の真後ろにつくと加速とERS充電がアップ。</li>
              <li>コーナーでは外に流される。きついコーナーは手前で減速、縁石の外はグラベルで失速。</li>
            </ul>
            <button className="close" onClick={() => setShowHelp(false)}>OK</button>
          </div>
        </div>
      )}

      {showAch && (
        <div className="modal" onClick={() => setShowAch(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>ACHIEVEMENTS <small>{got}/{ACHIEVEMENTS.length}</small></h3>
            <ul className="ach-list">
              {ACHIEVEMENTS.map((a) => (
                <li key={a.id} className={save.ach[a.id] ? 'got' : ''}>
                  <span className="badge">{a.tag}</span>
                  <div><b>{a.name}</b><small>{a.desc}</small></div>
                </li>
              ))}
            </ul>
            <button className="close" onClick={() => setShowAch(false)}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}
