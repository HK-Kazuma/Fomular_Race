import React from 'react';
import { fmtTime, DIFFICULTY } from '../game/engine.js';
import { ACHIEVEMENTS } from '../game/progress.js';

const headline = (pos) =>
  pos === 1 ? ['WINNER', '最後尾から、頂点へ。'] : pos <= 3 ? ['PODIUM', '表彰台。あと少しで頂点だ。'] : pos <= 6 ? ['STRONG FINISH', 'ペースはある。次はもっと前へ。'] : ['FINISHED', 'ERSとDRSを使い切れ。'];

export default function ResultScreen({ r, onRetry, onTitle }) {
  const [h1, h2] = headline(r.pos);
  const earned = ACHIEVEMENTS.filter((a) => r.got[a.id]);
  return (
    <div className="result">
      <div className="res-left">
        <div className="res-head">
          <div className="res-pos">P{r.pos}</div>
          <div>
            <div className="res-h1">{h1}</div>
            <div className="res-h2">{h2}</div>
            <div className="res-diff">{DIFFICULTY[r.diff]?.label}</div>
          </div>
        </div>
        <div className="stats">
          <div><span>RACE TIME</span><b>{fmtTime(r.time)}</b>{r.records.time && <em>NEW</em>}</div>
          <div><span>BEST LAP</span><b>{fmtTime(r.best)}</b>{r.records.lap && <em>NEW</em>}{r.fastestLap && <em className="fl">FASTEST</em>}</div>
          <div><span>OVERTAKES</span><b>{r.overtakes}</b></div>
          <div><span>TOP SPEED</span><b>{Math.round(r.maxKmh)}<small> km/h</small></b></div>
          <div><span>CONTACTS</span><b>{r.contacts}</b></div>
          <div><span>OFF TRACK</span><b>{r.offTracks}</b></div>
        </div>
        <div className="earned">
          <h4>ACHIEVEMENTS</h4>
          <ul>
            {earned.map((a) => (
              <li key={a.id} className={r.newly.includes(a.id) ? 'new' : ''}>
                <span className="badge">{a.tag}</span>
                {a.name}
                {r.newly.includes(a.id) && <em>UNLOCKED</em>}
              </li>
            ))}
          </ul>
        </div>
        <div className="res-btns">
          <button className="start-btn" onClick={onRetry}><span>RACE AGAIN</span></button>
          <button className="ghost" onClick={onTitle}>TITLE</button>
        </div>
      </div>
      <div className="res-right">
        <h4>CLASSIFICATION</h4>
        <ol className="classif">
          {r.rows.map((row) => (
            <li key={row.code} className={row.isPlayer ? 'me' : ''}>
              <span className="cp">{row.pos}</span>
              <span className="cc" style={{ background: row.color, boxShadow: `inset -4px 0 0 ${row.accent}` }} />
              <span className="cn">{row.code}<small>{row.team}</small></span>
              <span className="ct">{row.gap == null ? fmtTime(row.time) : `+${row.gap.toFixed(3)}`}</span>
              <span className={`cb ${row.fastest ? 'fl' : ''}`}>{fmtTime(row.best)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
