import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from './game/engine.js';
import { loadSave, writeSave, evaluate } from './game/progress.js';
import HUD from './components/HUD.jsx';
import TouchControls from './components/TouchControls.jsx';
import TitleScreen from './components/TitleScreen.jsx';
import ResultScreen from './components/ResultScreen.jsx';
import PauseMenu from './components/PauseMenu.jsx';

const useMedia = (q) => {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener?.('change', f);
    return () => mq.removeEventListener?.('change', f);
  }, [q]);
  return m;
};

export default function App() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const screenRef = useRef('title');
  const [screen, setScreenState] = useState('title');
  const [hud, setHud] = useState(null);
  const [radio, setRadio] = useState(null);
  const [pops, setPops] = useState([]);
  const [paused, setPaused] = useState(false);
  const [result, setResult] = useState(null);
  const [save, setSave] = useState(loadSave);
  const [diff, setDiff] = useState(() => loadSave().diff);
  const [muted, setMuted] = useState(false);
  const [auto, setAuto] = useState(false);
  const [flash, setFlash] = useState(0);
  const isTouch = useMedia('(pointer: coarse)');
  const portrait = useMedia('(orientation: portrait)');

  const setScreen = (s) => { screenRef.current = s; setScreenState(s); };

  const togglePause = useCallback((v) => {
    const e = engineRef.current;
    if (!e || screenRef.current !== 'race') return;
    const next = typeof v === 'boolean' ? v : !e.paused;
    e.setPaused(next);
    setPaused(next);
  }, []);

  useEffect(() => {
    const radioTimer = { t: null };
    const e = new Engine(canvasRef.current, {
      onHud: setHud,
      onEvent: (ev) => {
        if (ev.type === 'radio') {
          setRadio({ text: ev.text, id: Math.random() });
          clearTimeout(radioTimer.t);
          radioTimer.t = setTimeout(() => setRadio(null), 3800);
        } else if (ev.type === 'pop') {
          const id = Math.random();
          setPops((p) => [...p.slice(-2), { ...ev, id }]);
          setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), ev.kind === 'big' || ev.kind === 'flag' ? 2200 : 1500);
          if (ev.kind === 'big' || ev.kind === 'p1' || ev.kind === 'flag') setFlash(Math.random());
        } else if (ev.type === 'pauseKey') {
          togglePause();
        } else if (ev.type === 'mute') {
          setMuted(ev.muted);
        }
      },
      onFinish: (res) => {
        setSave((s) => {
          const ev = evaluate(s, res);
          setResult({ ...res, ...ev });
          return ev.save;
        });
        setScreen('result');
      },
    });
    engineRef.current = e;
    if (import.meta.env.DEV) window.__gh = e;
    setMuted(e.audio.muted);
    setAuto(e.autoThrottle);
    const ro = new ResizeObserver(() => e.resize());
    ro.observe(canvasRef.current);
    const vis = () => { if (document.hidden && screenRef.current === 'race' && !e.paused) togglePause(true); };
    document.addEventListener('visibilitychange', vis);
    return () => { ro.disconnect(); document.removeEventListener('visibilitychange', vis); e.destroy(); };
  }, [togglePause]);

  const start = (d = diff) => {
    const e = engineRef.current;
    setDiff(d);
    setSave((s) => { const n = { ...s, diff: d }; writeSave(n); return n; });
    setResult(null);
    setPaused(false);
    setPops([]);
    setRadio(null);
    setScreen('race');
    e.startRace(d);
  };

  const toTitle = () => {
    const e = engineRef.current;
    e.setPaused(false);
    setPaused(false);
    e.setupAttract();
    setScreen('title');
    setHud(null);
    setRadio(null);
    setPops([]);
  };

  const toggleMute = () => engineRef.current?.toggleMute();
  const toggleAuto = () => {
    const e = engineRef.current;
    e.autoThrottle = !e.autoThrottle;
    e.autoThrottleKeyUsed = false;
    setAuto(e.autoThrottle);
  };

  const touchPad = screen === 'race' && isTouch;
  useEffect(() => {
    engineRef.current?.setBottomInset(touchPad ? (portrait ? 98 : 80) : 0);
  }, [touchPad, portrait]);
  const cls = ['app', isTouch ? 'is-touch' : 'is-desk', portrait ? 'is-portrait' : 'is-land', `scr-${screen}`, touchPad ? 'has-pad' : ''].join(' ');

  return (
    <div className={cls}>
      <div className="view">
        <canvas ref={canvasRef} className="game-canvas" />
        {flash ? <div key={flash} className="flash" /> : null}
        {screen === 'race' && hud && (
          <HUD hud={hud} radio={radio} pops={pops} engine={engineRef.current} onPause={() => togglePause(true)} isTouch={isTouch} portrait={portrait} />
        )}
        {screen === 'title' && (
          <TitleScreen diff={diff} setDiff={setDiff} save={save} onStart={start} muted={muted} onMute={toggleMute} isTouch={isTouch} />
        )}
        {screen === 'result' && result && <ResultScreen r={result} onRetry={() => start(result.diff)} onTitle={toTitle} />}
        {screen === 'race' && paused && (
          <PauseMenu
            onResume={() => togglePause(false)}
            onRestart={() => start(diff)}
            onQuit={toTitle}
            muted={muted}
            onMute={toggleMute}
            auto={auto}
            onAuto={toggleAuto}
            isTouch={isTouch}
          />
        )}
      </div>
      {touchPad && <TouchControls engine={engineRef.current} portrait={portrait} auto={auto} />}
    </div>
  );
}
