import React from 'react';

export default function PauseMenu({ onResume, onRestart, onQuit, muted, onMute, auto, onAuto, isTouch, is3D, onCam, camLabel }) {
  return (
    <div className="modal pause">
      <div className="modal-card">
        <h3>PAUSED</h3>
        <div className="pause-btns">
          <button className="start-btn" onClick={onResume}><span>RESUME</span></button>
          <button className="ghost" onClick={onRestart}>RESTART</button>
          <button className="ghost" onClick={onQuit}>RETIRE（タイトルへ）</button>
        </div>
        <div className="toggles">
          <button onClick={onMute}>サウンド：{muted ? 'OFF' : 'ON'}</button>
          <button onClick={onAuto}>オートアクセル：{auto ? 'ON' : 'OFF'}</button>
          {is3D && <button onClick={onCam}>カメラ：{camLabel}</button>}
        </div>
        {!isTouch && <p className="hint">Esc / P で再開 · M でミュート{is3D ? ' · C でカメラ切替' : ''}</p>}
      </div>
    </div>
  );
}
