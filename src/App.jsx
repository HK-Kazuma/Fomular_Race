import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from './game/engine.js';
import { webgl2 } from './game/webgl.js';
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
  const glRef = useRef(null);
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
  const [mode, setModeState] = useState(() => {
    const m = loadSave().mode;
    return !webgl2() ? '2d' : m || '3d';
  });
  const [camLabel, setCamLabel] = useState('CHASE CAM');
  const [loading, setLoading] = useState(false);
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
    let e = null, ro = null, dead = false;
    const cb = {
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
        } else if (ev.type === 'cam') {
          setCamLabel(ev.label);
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
    };
    const vis = () => { if (document.hidden && screenRef.current === 'race' && e && !e.paused) togglePause(true); };
    (async () => {
      let E = Engine;
      const opts = {};
      if (mode === '3d') {
        setLoading(true);
        try {
          const m = await import('./game3d/engine3d.js');
          E = m.Engine3D;
          opts.glCanvas = glRef.current;
        } catch (err) {
          console.error(err);
        }
      }
      if (dead) return;
      try {
        e = new E(canvasRef.current, cb, opts);
      } catch (err) {
        console.error(err);
        e = new Engine(canvasRef.current, cb, {});
      }
      setLoading(false);
      engineRef.current = e;
      if (import.meta.env.DEV) window.__gh = e;
      setMuted(e.audio.muted);
      setAuto(e.autoThrottle);
      setCamLabel(e.camLabel || '');
      ro = new ResizeObserver(() => e.resize());
      ro.observe(canvasRef.current);
    })();
    document.addEventListener('visibilitychange', vis);
    return () => {
      dead = true;
      ro?.disconnect();
      document.removeEventListener('visibilitychange', vis);
      e?.destroy();
      engineRef.current = null;
    };
  }, [togglePause, mode]);

  const setMode = (m) => {
    if (m === mode) return;
    setSave((s) => { const n = { ...s, mode: m }; writeSave(n); return n; });
    setModeState(m);
  };
  const cycleCam = () => engineRef.current?.cycleCam?.();

  const start = (d = diff) => {
    const e = engineRef.current;
    if (!e) return;
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
    if (!e) return;
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
  const cls = ['app', `mode-${mode}`, isTouch ? 'is-touch' : 'is-desk', portrait ? 'is-portrait' : 'is-land', `scr-${screen}`, touchPad ? 'has-pad' : ''].join(' ');

  return (
    <div className={cls}>
      <div className="view">
        {mode === '3d' && <canvas key="gl3d" ref={glRef} className="game-canvas gl" />}
        <canvas ref={canvasRef} className="game-canvas" />
        {loading && <div className="loading">LOADING 3D CIRCUIT…</div>}
        {flash ? <div key={flash} className="flash" /> : null}
        {screen === 'race' && hud && (
          <HUD hud={hud} radio={radio} pops={pops} engine={engineRef.current} onPause={() => togglePause(true)} isTouch={isTouch} portrait={portrait} is3D={mode === '3d'} onCam={cycleCam} camLabel={camLabel} />
        )}
        {screen === 'title' && (
          <TitleScreen diff={diff} setDiff={setDiff} save={save} onStart={start} muted={muted} onMute={toggleMute} isTouch={isTouch} mode={mode} setMode={setMode} has3D={webgl2()} />
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
            is3D={mode === '3d'}
            onCam={cycleCam}
            camLabel={camLabel}
          />
        )}
      </div>
      {touchPad && <TouchControls engine={engineRef.current} portrait={portrait} auto={auto} />}
    </div>
  );
}
