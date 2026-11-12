// 引光 · 逻辑核心：关卡定义、生成、连通判定、提示。
// 浏览器（window.LumenCore）与 Node（require）共用同一份代码，测试跑的就是游戏实际使用的逻辑。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LumenCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];           // 方向位：0上 1右 2下 3左
const rotMask = (m, r) => { r = ((r % 4) + 4) % 4; return ((m << r) | (m >> (4 - r))) & 15; };
const bits = m => (m & 1) + (m >> 1 & 1) + (m >> 2 & 1) + (m >> 3 & 1);
function rng(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ============ 章节与关卡 ============
const CHAPTERS = [
  { name: '晨雾', sub: '第一章', line: '雾还没散，光已经醒了' },
  { name: '夏野', sub: '第二章', line: '风吹过草坡，云在慢慢走' },
  { name: '暮色', sub: '第三章', line: '晚霞落进了芦苇丛' },
  { name: '星夜', sub: '第四章', line: '把最后一盏灯，留给星星' },
];

// 字段说明：
//   wind     0~1，越大光路越像一条长廊（顺着走就行），越小分叉越多
//   maxDeg   单块最多几个出口（2=尽量一笔画，3=允许三岔，4=允许十字）
//   scramble 被打乱的方块比例；gentle=true 时打乱的方块大多只差一下
//   stones   苔石数量（转不动、但已在正确位置）
//   twins    双生砖对数（系同色丝带的两块一起转）
//   mask     异形棋盘，'.' 为空
const LEVELS = [
  // —— 第一章 晨雾：顺着光一格一格接下去 ——
  { name: '初芽', w: 3, h: 3, seed: 29, wind: 1, maxDeg: 2, scramble: 0.5, gentle: true, src: [0, 2],
    tip: '轻点方块转动它，把光引到花苞那里' },
  { name: '晨露', w: 3, h: 4, seed: 11, wind: 1, maxDeg: 2, scramble: 0.6, gentle: true, src: [1, 3],
    tip: '光只沿着接通的路走 —— 让每一格都亮起来' },
  { name: '小径', w: 4, h: 4, seed: 5, wind: 0.9, maxDeg: 3, scramble: 0.7, gentle: true,
    tip: '从光灵出发，顺着亮起的路往外接' },
  { name: '蒲公英', w: 4, h: 5, seed: 3, wind: 0.85, maxDeg: 3, scramble: 0.8, gentle: true,
    tip: '想不出来时点「提示」，光灵会帮你转好一块' },
  { name: '溪畔', w: 5, h: 5, seed: 35, wind: 0.8, maxDeg: 3, scramble: 0.9, gentle: true,
    tip: '长按方块可以别上一片叶子，标记「这块已经对了」' },
  // —— 第二章 夏野：分叉变多，苔石登场 ——
  { name: '风铃', w: 5, h: 6, seed: 10, wind: 0.65, maxDeg: 3,
    tip: '先看边角：贴着边的方块，出口不会朝向外面' },
  { name: '苔石', w: 5, h: 6, seed: 10, wind: 0.6, maxDeg: 3, stones: 5,
    tip: '长着青苔的石块转不动 —— 它们本来就站对了' },
  { name: '麦浪', w: 6, h: 6, seed: 4, wind: 0.55, maxDeg: 3, stones: 3 },
  { name: '云影', w: 6, h: 7, seed: 6, wind: 0.45, maxDeg: 3, stones: 3 },
  { name: '向日葵', w: 7, h: 7, seed: 5, wind: 0.5, maxDeg: 3, stones: 2,
    mask: ['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..'] },
  // —— 第三章 暮色：异形花园，双生砖登场 ——
  { name: '晚霞', w: 7, h: 7, seed: 1, wind: 0.5, maxDeg: 3, stones: 2,
    mask: ['#######', '#######', '##...##', '##...##', '##...##', '#######', '#######'] },
  { name: '双生', w: 6, h: 6, seed: 3, wind: 0.5, maxDeg: 3, stones: 2, twins: 1,
    tip: '系着同色丝带的两块是双生砖，转一块，另一块也跟着转' },
  { name: '归鸟', w: 6, h: 7, seed: 4, wind: 0.45, maxDeg: 3, stones: 2, twins: 2 },
  { name: '灯笼', w: 7, h: 8, seed: 18, wind: 0.45, maxDeg: 3, stones: 2, twins: 1,
    mask: ['..###..', '.#####.', '#######', '#######', '#######', '#######', '.#####.', '..###..'] },
  { name: '心愿', w: 7, h: 8, seed: 6, wind: 0.35, maxDeg: 3, twins: 2,
    mask: ['.##.##.', '#######', '#######', '#######', '#######', '.#####.', '..###..', '...#...'] },
  // —— 第四章 星夜：大棋盘，自己推理 ——
  { name: '萤火', w: 7, h: 7, seed: 24, wind: 0.4, maxDeg: 3, stones: 2, twins: 2 },
  { name: '银河', w: 6, h: 9, seed: 25, wind: 0.3, maxDeg: 3, twins: 2 },
  { name: '月牙', w: 7, h: 9, seed: 16, wind: 0.3, maxDeg: 4, twins: 3,
    mask: ['..####.', '.######', '#####..', '####...', '###....', '####...', '#####..', '.######', '..####.'] },
  { name: '星座', w: 7, h: 8, seed: 16, wind: 0.25, maxDeg: 4, twins: 3 },
  { name: '引光', w: 7, h: 9, seed: 4, wind: 0.25, maxDeg: 4, twins: 3,
    tip: '最后一座花园。慢慢来，光会等你' },
];
LEVELS.forEach((lv, i) => { lv.chapter = (i / 5) | 0; });

// ============ 生成 ============
// 先长出一棵覆盖全部格子的树（= 标准答案），再把方块转乱。
// 打乱只通过「转动」完成，所以反着转回去一定能解。
function build(def) {
  const w = def.w, h = def.h, n = w * h, R = rng(def.seed);
  const cell = new Uint8Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) { cell[i] = def.mask ? (def.mask[(i / w) | 0][i % w] !== '.' ? 1 : 0) : 1; total += cell[i]; }

  let src = -1;
  if (def.src) src = def.src[1] * w + def.src[0];
  else {
    let bd = 1e9;
    for (let i = 0; i < n; i++) {
      if (!cell[i]) continue;
      const d = Math.abs(i % w - (w - 1) / 2) + Math.abs(((i / w) | 0) - (h - 1) / 2);
      if (d < bd - 1e-9) { bd = d; src = i; }
    }
  }
  if (src < 0 || !cell[src]) throw new Error('关卡 ' + def.name + '：起点不在棋盘上');

  const base = new Uint8Array(n), seen = new Uint8Array(n);
  const wind = def.wind == null ? 0.5 : def.wind;
  let frontier = [], deferred = [], count = 1, last = src, limit = Math.min(def.maxDeg || 3, 4);
  const add = i => {
    const x = i % w, y = (i / w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && cell[ny * w + nx] && !seen[ny * w + nx]) frontier.push(i * 4 + d);
    }
  };
  seen[src] = 1; add(src);
  while (count < total) {
    if (!frontier.length) {
      if (!deferred.length) break;
      frontier = deferred; deferred = []; limit++;               // 走不通了才放宽出口数
    }
    let k;
    if (R() < wind) {                                              // 接着刚长出的那一格往前走；走不动就退回最近的岔口
      k = frontier.length - 1;
      let c = 0; while (k - c >= 0 && (frontier[k - c] >> 2) === last) c++;
      if (c > 1) k -= (R() * c) | 0;
    } else k = (R() * frontier.length) | 0;                        // 随便找一处开新枝
    const e = frontier[k]; frontier.splice(k, 1);
    const i = e >> 2, d = e & 3, j = i + DX[d] + DY[d] * w;
    if (seen[j]) continue;
    if (bits(base[i]) >= limit) { deferred.push(e); continue; }
    base[i] |= 1 << d; base[j] |= 1 << ((d + 2) % 4); seen[j] = 1; count++; add(j); last = j;
  }
  if (count !== total) throw new Error('关卡 ' + def.name + '：棋盘不连通');

  // 苔石：固定在正确位置
  const fixed = new Uint8Array(n), twin = new Int16Array(n).fill(-1), twinId = new Int8Array(n).fill(-1);
  const pickFrom = list => list.splice((R() * list.length) | 0, 1)[0];
  let pool = [];
  for (let i = 0; i < n; i++) if (cell[i] && i !== src && base[i] !== 15) pool.push(i);
  for (let k = 0; k < (def.stones || 0) && pool.length; k++) fixed[pickFrom(pool)] = 1;

  // 双生砖：两块不相邻、且都不是直线/十字（转一圈有四种朝向，状态清楚）
  pool = pool.filter(i => !fixed[i] && base[i] !== 5 && base[i] !== 10);
  for (let p = 0; p < (def.twins || 0) && pool.length >= 2; p++) {
    const a = pickFrom(pool);
    const far = pool.filter(i => Math.abs(i % w - a % w) + Math.abs(((i / w) | 0) - ((a / w) | 0)) >= 2);
    if (!far.length) { continue; }
    const b = far[(R() * far.length) | 0]; pool.splice(pool.indexOf(b), 1);
    twin[a] = b; twin[b] = a; twinId[a] = twinId[b] = p;
  }

  // 打乱
  const rot = new Int32Array(n), scramble = def.scramble == null ? 1 : def.scramble;
  for (let i = 0; i < n; i++) {
    if (!cell[i] || fixed[i] || twin[i] >= 0) continue;
    const roll = R(), pick = R(), soft = R();
    if (roll >= scramble || (def.gentle && i === src)) continue;      // 入门关：光灵自己那格不打乱，第一下就能看到光往前走
    const opts = [1, 2, 3].filter(r => rotMask(base[i], r) !== base[i]);
    if (!opts.length) continue;
    rot[i] = def.gentle && soft < 0.75 && opts.includes(3) ? 3 : opts[(pick * opts.length) | 0];
  }
  for (let i = 0; i < n; i++) if (twin[i] > i) { const k = 1 + ((R() * 3) | 0); rot[i] = k; rot[twin[i]] = k; }

  const s = { def, w, h, n, total, cell, base, rot, fixed, twin, twinId, src, lit: new Uint8Array(n), depth: new Int16Array(n).fill(-1), litCount: 0, maxDepth: 0, par: 0, lamps: 0 };
  flood(s);
  if (s.litCount === s.total) {                                    // 极小概率开局即通：强制拨乱一块
    for (let i = 0; i < n; i++) if (cell[i] && !fixed[i] && twin[i] < 0 && rotMask(base[i], 1) !== base[i]) { rot[i] = 3; break; }
    flood(s);
  }
  for (let i = 0; i < n; i++) {
    if (!cell[i]) continue;
    if (bits(base[i]) === 1 && i !== src) s.lamps++;
    if (twin[i] < 0 || twin[i] > i) s.par += Math.max(0, needs(s, i));
  }
  return s;
}

// ============ 规则 ============
const maskAt = (s, i) => rotMask(s.base[i], s.rot[i]);
const aligned = (s, i) => maskAt(s, i) === s.base[i];
const group = (s, i) => s.twin[i] >= 0 ? [i, s.twin[i]] : [i];

// 从光灵出发做连通搜索；返回按点亮先后排列的格子序号
function flood(s) {
  const { w, h, lit, depth, src } = s;
  lit.fill(0); depth.fill(-1);
  const q = [src]; lit[src] = 1; depth[src] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % w, y = (i / w) | 0, m = maskAt(s, i);
    for (let d = 0; d < 4; d++) {
      if (!(m >> d & 1)) continue;
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!s.cell[j] || lit[j] || !(maskAt(s, j) >> ((d + 2) % 4) & 1)) continue;
      lit[j] = 1; depth[j] = depth[i] + 1; q.push(j);
    }
  }
  s.litCount = q.length; s.maxDepth = depth[q[q.length - 1]];
  return q;
}
const solved = s => s.litCount === s.total;

// 转动一块（双生砖连同另一块）。dir=1 顺时针，-1 逆时针。返回实际转动的格子；苔石返回 null。
function turn(s, i, dir) {
  if (!s.cell[i] || s.fixed[i]) return null;
  const g = group(s, i);
  for (const j of g) s.rot[j] += dir;
  flood(s);
  return g;
}

// 这一组还要顺时针转几下才回到答案位置（0~3）；-1 表示转不回去（不应出现）
function needs(s, i) {
  const g = group(s, i);
  for (let k = 0; k < 4; k++) if (g.every(j => rotMask(s.base[j], s.rot[j] + k) === s.base[j])) return k;
  return -1;
}

// 提示：沿答案这棵树从光灵向外数，第一块还没对上的方块 —— 转好它，光一定会往前走
function nextHint(s) {
  const { w, base, src } = s, seen = new Uint8Array(s.n), q = [src]; seen[src] = 1;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    if (!s.fixed[i] && needs(s, i) > 0) return i;
    for (let d = 0; d < 4; d++) {
      if (!(base[i] >> d & 1)) continue;
      const j = i + DX[d] + DY[d] * w;
      if (!seen[j]) { seen[j] = 1; q.push(j); }
    }
  }
  return -1;
}

// 无尽花园：由种子随机出一座花园（同样是「先有答案再打乱」，必然可解）
function endless(seed) {
  const R = rng(seed), w = 5 + ((R() * 3) | 0), h = w + 1 + ((R() * 2) | 0);
  return { name: '无尽花园', endless: true, w, h, seed, wind: 0.25 + R() * 0.4, maxDeg: R() < 0.3 ? 4 : 3,
    stones: (R() * 4) | 0, twins: (R() * 3) | 0, chapter: (R() * 4) | 0 };
}

return { DX, DY, rotMask, bits, rng, CHAPTERS, LEVELS, build, flood, solved, turn, needs, nextHint, maskAt, aligned, group, endless };
});
