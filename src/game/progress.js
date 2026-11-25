// 実績・自己ベストの保存（localStorage）
export const ACHIEVEMENTS = [
  { id: 'finish', tag: 'FIN', name: 'チェッカーフラッグ', desc: 'レースを完走する' },
  { id: 'top5', tag: 'P5', name: 'トップ5', desc: '5位以内でフィニッシュ' },
  { id: 'podium', tag: 'POD', name: '表彰台', desc: '3位以内でフィニッシュ' },
  { id: 'win', tag: 'WIN', name: '最後尾からの優勝', desc: '10番手スタートから優勝' },
  { id: 'fastest', tag: 'FL', name: 'ファステストラップ', desc: 'レース最速ラップを記録' },
  { id: 'clean', tag: 'CLN', name: 'クリーンレース', desc: '接触・コースオフ0回で完走' },
  { id: 'overtake', tag: 'OVT', name: 'オーバーテイクキング', desc: '1レースで10回以上オーバーテイク' },
  { id: 'drs', tag: 'DRS', name: 'DRSマスター', desc: 'DRS使用中に3台抜く' },
  { id: 'slam', tag: 'GS', name: 'グランドスラム', desc: '優勝＋ファステスト＋クリーンを同時達成' },
  { id: 'legend', tag: 'LGD', name: 'レジェンド', desc: 'LEGENDで優勝する' },
];

const KEY = 'gh_save_v1';

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ach: s.ach || {}, best: s.best || {}, diff: s.diff || 'pro', races: s.races || 0 };
  } catch {
    return { ach: {}, best: {}, diff: 'pro', races: 0 };
  }
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export function evaluate(save, r) {
  const clean = r.contacts === 0 && r.offTracks === 0;
  const got = {
    finish: true,
    top5: r.pos <= 5,
    podium: r.pos <= 3,
    win: r.pos === 1,
    fastest: r.fastestLap,
    clean,
    overtake: r.overtakes >= 10,
    drs: r.drsPasses >= 3,
    slam: r.pos === 1 && r.fastestLap && clean,
    legend: r.pos === 1 && r.diff === 'legend',
  };
  const ach = { ...save.ach };
  const newly = [];
  for (const a of ACHIEVEMENTS) if (got[a.id] && !ach[a.id]) { ach[a.id] = true; newly.push(a.id); }
  const prev = save.best[r.diff] || {};
  const rec = { ...prev };
  const records = {};
  if (prev.pos == null || r.pos < prev.pos) { rec.pos = r.pos; records.pos = prev.pos != null; }
  if (prev.time == null || r.time < prev.time) { rec.time = r.time; records.time = prev.time != null; }
  if (prev.lap == null || r.best < prev.lap) { rec.lap = r.best; records.lap = prev.lap != null; }
  const next = { ...save, ach, best: { ...save.best, [r.diff]: rec }, races: (save.races || 0) + 1 };
  writeSave(next);
  return { save: next, got, newly, records };
}
