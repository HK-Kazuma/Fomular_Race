// ─────────────────────────────────────────────
// サーキット定義（疑似3Dのセグメント列）
// 黄昏の砂漠サーキット「GOLDEN HOUR CIRCUIT」
// ─────────────────────────────────────────────
export const SEG = 200;          // 1セグメントの長さ（ワールド単位）
export const ROAD_W = 2000;      // 路面の半幅
export const RUMBLE_LEN = 3;     // 縁石・路面の縞の周期
export const LAPS = 3;
export const START_SEG = 70;     // コントロールライン位置

const easeIn = (a, b, p) => a + (b - a) * p * p;
const easeInOut = (a, b, p) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5);

export function buildTrack() {
  const segs = [];
  const lastY = () => (segs.length ? segs[segs.length - 1].p2.world.y : 0);

  const add = (curve, y, tag) => {
    const n = segs.length;
    segs.push({
      index: n,
      p1: { world: { y: lastY(), z: n * SEG }, camera: {}, screen: {} },
      p2: { world: { y, z: (n + 1) * SEG }, camera: {}, screen: {} },
      curve,
      tag: tag || '',
      drs: false,
      sprites: [],
      cars: [],
      clip: 0,
    });
  };

  const road = (enter, hold, leave, curve, dy, tag) => {
    const sy = lastY();
    const ey = sy + dy * SEG;
    const total = enter + hold + leave;
    for (let i = 0; i < enter; i++) add(easeIn(0, curve, i / enter), easeInOut(sy, ey, i / total), tag);
    for (let i = 0; i < hold; i++) add(curve, easeInOut(sy, ey, (enter + i) / total), tag);
    for (let i = 0; i < leave; i++) add(easeInOut(curve, 0, i / leave), easeInOut(sy, ey, (enter + hold + i) / total), tag);
  };

  // ── レイアウト（時計回りの1周）
  road(0, 200, 0, 0, 0, 'main');            // メインストレート
  road(20, 20, 20, 6, 0, 'T1');             // T1 右・低速
  road(30, 40, 30, 0, 20, 'climb');         // 上り
  road(20, 20, 20, -4, 0, 'T2');            // T2 左・中速
  road(25, 25, 25, 0, -20, 'drop');         // 下り
  road(30, 170, 30, 0, 5, 'back');          // バックストレート
  road(15, 35, 15, 6, 0, 'hairpin');        // ヘアピン
  road(20, 20, 20, 3, 0, 'esses');          // S字
  road(20, 20, 20, -3, 0, 'esses');
  road(20, 20, 20, 3, 0, 'esses');
  road(40, 50, 40, 0, 30, 'crest');         // クレスト
  road(40, 50, 40, 0, -30, 'dip');
  road(50, 90, 50, 2, 0, 'sweeper');        // 高速スイーパー
  road(20, 30, 20, 4, 0, 'T10');
  road(10, 14, 10, -5, 0, 'chicane');       // シケイン
  road(10, 14, 10, 5, 0, 'chicane');
  road(30, 120, 30, 0, -lastY() / SEG, 'final'); // 最終ストレート

  const N = segs.length;
  // ── DRSゾーン
  const backStart = segs.findIndex((s) => s.tag === 'back');
  const backLen = segs.filter((s) => s.tag === 'back').length;
  const mark = (a, b) => { for (let i = a; i < b; i++) segs[(i + N) % N].drs = true; };
  mark(START_SEG + 10, 195);
  mark(backStart + 35, backStart + backLen - 10);
  mark(N - 130, N);

  // ── 沿道オブジェクト
  const put = (i, type, offset) => segs[(i + N) % N].sprites.push({ type, offset });
  const rnd = mulberry(7);
  const boards = ['board0', 'board1', 'board2', 'board3'];
  for (let i = 0; i < N; i++) {
    const s = segs[i];
    const c = Math.abs(s.curve);
    // メインスタンド
    if ((i < 190 || i > N - 120) && i % 18 === 0) {
      put(i, 'grand', -2.15);
      put(i + 9, 'grand', 2.15);
    }
    // 照明塔
    if (i % 26 === 13) {
      put(i, 'tower', -1.75);
      put(i, 'tower', 1.75);
    }
    // コーナー外側のタイヤバリア
    if (c > 2.5 && i % 4 === 0) put(i, 'tires', s.curve > 0 ? -1.55 : 1.55);
    // コーナー出口の看板
    if (c > 3 && i % 22 === 0) put(i, boards[(i / 22) % 4 | 0], s.curve > 0 ? 1.5 : -1.5);
    // ヤシと看板（その他）
    if ((s.tag === 'back' || s.tag === 'sweeper' || s.tag === 'climb' || s.tag === 'crest' || s.tag === 'dip') && i % 9 === 0) {
      const side = rnd() > 0.5 ? 1 : -1;
      put(i, 'palm', side * (2.0 + rnd() * 1.4));
    }
    if ((s.tag === 'back' || s.tag === 'final') && i % 40 === 20) put(i, boards[(i / 40) % 4 | 0], i % 80 === 20 ? -1.5 : 1.5);
  }
  put(START_SEG, 'gantry', 0);
  put(START_SEG - 2, 'board1', -1.5);

  const mm = buildMinimap(segs);
  return { segments: segs, length: N * SEG, minimap: mm.pts, heading: mm.heading };
}

// 曲率を積分してミニマップ用の2D形状を作る（閉ループ補正つき）
function buildMinimap(segs) {
  const N = segs.length;
  const sum = segs.reduce((a, s) => a + s.curve, 0);
  const K = (Math.PI * 2) / sum;
  let h = -Math.PI / 2, x = 0, y = 0;
  const pts = [];
  const heading = [];
  for (let i = 0; i < N; i++) {
    pts.push([x, y]);
    heading.push(h);
    h += segs[i].curve * K;
    x += Math.cos(h);
    y += Math.sin(h);
  }
  const ex = x, ey = y;
  for (let i = 0; i < N; i++) {
    pts[i][0] -= (ex * i) / N;
    pts[i][1] -= (ey * i) / N;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of pts) {
    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
  }
  const s = 1 / Math.max(maxX - minX, maxY - minY);
  return {
    heading,
    pts: pts.map(([px, py]) => [
      (px - minX) * s + (1 - (maxX - minX) * s) / 2,
      (py - minY) * s + (1 - (maxY - minY) * s) / 2,
    ]),
  };
}

export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
