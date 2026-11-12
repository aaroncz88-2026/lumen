(() => {
'use strict';

// ============ 基础工具 ============
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];           // 方向位：0上 1右 2下 3左
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rotMask = (m, r) => { r = ((r % 4) + 4) % 4; return ((m << r) | (m >> (4 - r))) & 15; };
const bits = m => (m & 1) + (m >> 1 & 1) + (m >> 2 & 1) + (m >> 3 & 1);
const fmt = s => `${(s / 60) | 0}:${String((s | 0) % 60).padStart(2, '0')}`;
const easeOutBack = x => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const bump = u => u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0;
function rng(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ============ 关卡 ============
const LEVELS = [
  { w: 3, h: 3, name: '初火', seed: 7 },
  { w: 4, h: 4, name: '微光', seed: 21 },
  { w: 5, h: 4, name: '枝蔓', seed: 35 },
  { w: 5, h: 5, name: '回廊', seed: 48 },
  { w: 6, h: 5, name: '星络', seed: 59 },
  { w: 6, h: 6, name: '潮汐', seed: 63 },
  { w: 7, h: 6, name: '织网', seed: 77 },
  { w: 7, h: 7, name: '迷宫', seed: 84 },
  { w: 8, h: 7, name: '穹顶', seed: 92 },
  { w: 9, h: 7, name: '灯海', seed: 108 },
];
const TIPS = [
  '点击方块旋转光路，把火种引向每一盏灯',
  '右键可以逆时针旋转',
  'Shift + 点击可固定已确认的方块',
  '卡住了？按 H 获得提示（使用后最多两星）',
];

// 随机生成树 => 必然有解；再打乱每块的朝向
function generate(w, h, seed) {
  const R = rng(seed), n = w * h;
  const base = new Uint8Array(n), seen = new Uint8Array(n), rot = new Int8Array(n);
  const src = (h >> 1) * w + (w >> 1);
  let frontier = [], deferred = [], count = 1, limit = 3;
  const add = i => {
    const x = i % w, y = (i / w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && !seen[ny * w + nx]) frontier.push(i * 4 + d);
    }
  };
  seen[src] = 1; add(src);
  while (count < n) {
    if (!frontier.length) { if (!deferred.length) break; frontier = deferred; deferred = []; limit = 4; }
    const k = R() < 0.5 ? frontier.length - 1 - ((R() * Math.min(3, frontier.length)) | 0) : (R() * frontier.length) | 0;
    const e = frontier[k]; frontier[k] = frontier[frontier.length - 1]; frontier.pop();
    const i = e >> 2, d = e & 3, j = i + DX[d] + DY[d] * w;
    if (seen[j]) continue;
    if (bits(base[i]) >= limit) { deferred.push(e); continue; }
    base[i] |= 1 << d; base[j] |= 1 << ((d + 2) % 4); seen[j] = 1; count++; add(j);
  }
  for (let i = 0; i < n; i++) {
    rot[i] = (R() * 4) | 0;
    if (rotMask(base[i], rot[i]) === base[i] && base[i] !== 15 && R() < 0.8) rot[i] = 1;
  }
  return { base, rot, src };
}
function minClicks(base, rot) {
  let best = 9;
  for (let r = 0; r < 4; r++) if (rotMask(base, rot + r) === base) best = Math.min(best, r, 4 - r);
  return best;
}

// ============ 存档 ============
const SAVE_KEY = 'lumen.save.v1';
let save = { stars: [] };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && Array.isArray(s.stars)) save = s; } catch (e) { /* 忽略 */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 忽略 */ } };

// ============ 音频（全部实时合成） ============
const A = {
  ac: null, out: null, echo: null, muted: false,
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ac = this.ac = new AC();
    this.out = ac.createGain(); this.out.gain.value = this.muted ? 0 : 0.9;
    const comp = ac.createDynamicsCompressor(); this.out.connect(comp); comp.connect(ac.destination);
    const d = this.echo = ac.createDelay(1), fb = ac.createGain(), lp = ac.createBiquadFilter();
    d.delayTime.value = 0.27; fb.gain.value = 0.4; lp.type = 'lowpass'; lp.frequency.value = 2200;
    d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(this.out);
    // 环境铺底
    const pad = ac.createGain(), f = ac.createBiquadFilter();
    pad.gain.setValueAtTime(0, ac.currentTime); pad.gain.linearRampToValueAtTime(0.055, ac.currentTime + 5);
    f.type = 'lowpass'; f.frequency.value = 520; f.connect(pad); pad.connect(this.out);
    [110, 164.81, 220.6, 329.2].forEach((hz, i) => {
      const o = ac.createOscillator(), g = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
      o.type = i % 2 ? 'sine' : 'triangle'; o.frequency.value = hz; g.gain.value = 0.5;
      l.frequency.value = 0.05 + i * 0.03; lg.gain.value = 0.35;
      l.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(f); o.start(); l.start();
    });
  },
  tone(hz, dur, vol, type = 'sine', delay = 0, echo = 0) {
    const ac = this.ac; if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out);
    if (echo) { const e = ac.createGain(); e.gain.value = echo; g.connect(e); e.connect(this.echo); }
    o.start(t); o.stop(t + dur + 0.05);
  },
  tick(dir) { this.tone(dir > 0 ? 392 : 330, 0.12, 0.1, 'triangle'); this.tone(dir > 0 ? 1568 : 1320, 0.04, 0.03); },
  deny() { this.tone(150, 0.14, 0.1, 'triangle'); },
  ui() { this.tone(660, 0.1, 0.06, 'sine', 0, 0.3); },
  chime(k) {                                             // 五声音阶，越接近完成音越高
    const P = [0, 2, 4, 7, 9], hz = 392 * Math.pow(2, (P[k % 5] + 12 * Math.min(2, (k / 5) | 0)) / 12);
    this.tone(hz, 1.1, 0.11, 'sine', 0, 0.5); this.tone(hz * 2, 0.5, 0.03, 'sine', 0, 0.3);
  },
  win() {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => {
      const hz = 392 * Math.pow(2, s / 12);
      this.tone(hz, 1.6, 0.1, 'sine', i * 0.11, 0.5); this.tone(hz / 2, 1.2, 0.05, 'triangle', i * 0.11);
    });
  },
  toggle() { this.muted = !this.muted; if (this.out) this.out.gain.value = this.muted ? 0 : 0.9; return this.muted; },
};

// ============ 画布 ============
const cv = $('c'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, S = 80, OX = 0, OY = 0, bg = null, vig = null;
let mode = 'menu', L = null, T = 0, last = performance.now(), hover = -1;
const parts = [], flies = [];
for (let i = 0; i < 46; i++) flies.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.012, vy: -(0.004 + Math.random() * 0.012), ph: Math.random() * TAU, s: 3 + Math.random() * 7, sp: 0.6 + Math.random() * 1.6 });

function glowSprite(rgb, core) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, core ? 'rgba(255,255,255,1)' : `rgba(${rgb},.8)`);
  gr.addColorStop(0.22, `rgba(${rgb},.62)`); gr.addColorStop(0.55, `rgba(${rgb},.18)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c;
}
const GLOW = glowSprite('255,180,95', true), WARM = glowSprite('255,150,70', false);
const BLUE = glowSprite('70,110,255', false), PURP = glowSprite('170,80,220', false);

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2); W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#080c1f'); bg.addColorStop(0.6, '#120f2e'); bg.addColorStop(1, '#1b1130');
  vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,.55)');
  layout();
}
function layout() {
  if (!L) return;
  const top = 92, bot = 104;
  S = Math.floor(Math.min((W - 56) / L.w, (H - top - bot) / L.h, 150));
  OX = Math.round((W - S * L.w) / 2); OY = Math.round(top + (H - top - bot - S * L.h) / 2);
}
function rr(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ============ 游戏逻辑 ============
function startLevel(idx, seed) {
  let def = LEVELS[idx];
  if (idx < 0) { const s = seed || (Date.now() & 0xfffffff); def = { w: 6 + s % 3, h: 6 + (s >> 3) % 2, name: '无尽', seed: s }; }
  const g = generate(def.w, def.h, def.seed);
  L = { idx, def, w: def.w, h: def.h, n: def.w * def.h, src: g.src, tiles: [], moves: 0, hints: 0, time: 0, shownT: -1, done: false, undo: [], intro: 0, winT: -1, winDelay: 0, par: 0, litCount: 0, maxDepth: 0, prog: 0, lamps: 0 };
  for (let i = 0; i < L.n; i++) {
    const b = g.base[i];
    L.tiles.push({ base: b, rot: g.rot[i], ang: g.rot[i], lamp: bits(b) === 1 && i !== g.src, lit: false, depth: -1, glow: 0, delay: 0, note: 0, pin: false, pulse: 0, flash: 0, shake: 0, wdone: false, cx: 0, cy: 0, sc: 0, wk: 0 });
  }
  flood(true);
  if (L.litCount === L.n) { const t = L.tiles[0]; t.rot++; t.ang++; for (const o of L.tiles) { o.lit = false; o.delay = 0; } flood(true); }   // 极小概率开局即解：拨乱一角
  for (const t of L.tiles) { L.par += minClicks(t.base, t.rot); if (t.lamp) L.lamps++; }
  mode = 'play'; hover = -1; parts.length = 0;
  $('menu').classList.add('hidden'); $('win').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('lvNo').textContent = idx >= 0 ? `第 ${idx + 1} 关` : '无尽模式';
  $('lvName').textContent = def.name;
  $('par').textContent = `/ ${L.par}`; $('total').textContent = `/ ${L.n}`; $('time').textContent = '0:00';
  $('tip').textContent = idx >= 0 ? (TIPS[idx] || '') : '';
  layout(); hud();
}

// 从灯芯出发做连通搜索，标记被点亮的方块
function flood(initial) {
  const { w, h, tiles, src } = L;
  const was = tiles.map(t => t.lit);
  for (const t of tiles) { t.lit = false; t.depth = -1; }
  const q = [src]; tiles[src].lit = true; tiles[src].depth = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % w, y = (i / w) | 0, m = rotMask(tiles[i].base, tiles[i].rot);
    for (let d = 0; d < 4; d++) {
      if (!(m >> d & 1)) continue;
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const tj = tiles[ny * w + nx];
      if (tj.lit || !(rotMask(tj.base, tj.rot) >> ((d + 2) % 4) & 1)) continue;
      tj.lit = true; tj.depth = tiles[i].depth + 1; q.push(ny * w + nx);
    }
  }
  L.litCount = q.length; L.maxDepth = tiles[q[q.length - 1]].depth;
  let minD = 1e9, lampsBefore = 0, k = 0, maxDelay = 0;
  for (const i of q) { if (!was[i]) minD = Math.min(minD, tiles[i].depth); else if (tiles[i].lamp) lampsBefore++; }
  for (const i of q) {
    const t = tiles[i]; if (was[i]) continue;
    t.delay = (initial ? 0.6 : 0.1) + (t.depth - minD) * 0.055; maxDelay = Math.max(maxDelay, t.delay);
    if (t.lamp) t.note = lampsBefore + k++;
  }
  return maxDelay;
}
function afterMove() {
  const md = flood(false);
  if (L.litCount === L.n) { L.done = true; L.winDelay = md + 0.45; hover = -1; cv.style.cursor = 'default'; }
  hud();
}
function rotate(i, dir, fromUndo) {
  if (L.done) return;
  const t = L.tiles[i];
  if (t.pin && !fromUndo) { t.shake = 1; A.deny(); return; }
  t.rot += dir; t.pulse = 1;
  if (fromUndo) L.moves = Math.max(0, L.moves - 1); else { L.moves++; L.undo.push([i, dir]); }
  A.tick(dir); afterMove();
}
function undo() {
  if (L.done) return;
  const u = L.undo.pop(); if (!u) { A.deny(); return; }
  rotate(u[0], -u[1], true);
}
function togglePin(i) { if (L.done) return; const t = L.tiles[i]; t.pin = !t.pin; t.flash = 0.5; A.ui(); }
function hint() {
  if (L.done) return;
  const sx = L.src % L.w, sy = (L.src / L.w) | 0; let best = -1, bd = 1e9;
  L.tiles.forEach((t, i) => {
    if (rotMask(t.base, t.rot) === t.base) return;
    const d = Math.abs(i % L.w - sx) + Math.abs(((i / L.w) | 0) - sy);
    if (d < bd) { bd = d; best = i; }
  });
  if (best < 0) return;
  const t = L.tiles[best];
  for (const r of [1, -1, 2]) if (rotMask(t.base, t.rot + r) === t.base) { t.rot += r; break; }
  t.pin = true; t.flash = 1; t.pulse = 1; L.hints++;
  L.undo = L.undo.filter(u => u[0] !== best);
  A.chime(6); afterMove();
}
function hud() { $('moves').textContent = L.moves; $('lit').textContent = L.litCount; }

function showWin() {
  mode = 'win';
  let stars = L.moves <= Math.ceil(L.par * 1.2) + 1 ? 3 : L.moves <= L.par * 2 + 2 ? 2 : 1;
  if (L.hints && stars > 2) stars = 2;
  if (L.idx >= 0) { save.stars[L.idx] = Math.max(save.stars[L.idx] || 0, stars); persist(); }
  [...$('stars').children].forEach((el, i) => { el.className = ''; void el.offsetWidth; if (i < stars) el.className = 'on'; });
  $('rMoves').textContent = L.moves; $('rPar').textContent = L.par; $('rTime').textContent = fmt(L.time);
  $('rNote').textContent = L.hints ? `使用了 ${L.hints} 次提示` : stars === 3 ? '光路精准，分毫不差' : stars === 2 ? '再少走几步即可三星' : '灯已点亮，路还可以更短';
  $('btnNext').textContent = L.idx < 0 || L.idx === LEVELS.length - 1 ? '无尽 · 随机' : '下一关';
  $('win').classList.remove('hidden');
}
function next() { if (L.idx < 0 || L.idx === LEVELS.length - 1) startLevel(-1); else startLevel(L.idx + 1); }
function restart() { startLevel(L.idx, L.def.seed); }

function buildMenu() {
  const box = $('levels'); box.innerHTML = '';
  const open = i => i === 0 || (save.stars[i - 1] || 0) > 0;
  let cur = LEVELS.findIndex((_, i) => !(save.stars[i] > 0)); if (cur < 0) cur = LEVELS.length - 1;
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button'), st = save.stars[i] || 0;
    b.className = 'lv' + (open(i) ? '' : ' locked') + (i === cur ? ' cur' : '');
    b.innerHTML = `<small>${lv.w} × ${lv.h}</small><b>${lv.name}</b><em><u>${'★'.repeat(st)}</u>${'★'.repeat(3 - st)}</em>`;
    if (open(i)) b.onclick = () => { A.init(); A.ui(); startLevel(i); };
    box.appendChild(b);
  });
  $('btnPlay').textContent = save.stars.some(s => s > 0) ? '继续旅程' : '开始旅程';
  $('btnPlay').onclick = () => { A.init(); A.ui(); startLevel(cur); };
}
function toMenu() {
  mode = 'menu'; L = null; hover = -1; cv.style.cursor = 'default';
  $('hud').classList.add('hidden'); $('win').classList.add('hidden'); $('menu').classList.remove('hidden');
  buildMenu();
}

// ============ 每帧更新 ============
function sparks(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = (30 + Math.random() * 130) * S / 80, life = 0.45 + Math.random() * 0.5;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life, max: life, s: 3 + Math.random() * 5 });
  }
}
function update(dt) {
  for (const f of flies) {
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.y < -0.05) { f.y = 1.05; f.x = Math.random(); } if (f.x < -0.05) f.x = 1.05; else if (f.x > 1.05) f.x = -0.05;
  }
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 2.2 * dt; p.vy = p.vy * (1 - 2.2 * dt) + 50 * dt;
  }
  if (!L) return;
  L.intro += dt;
  if (mode === 'play' && !L.done) {
    L.time += dt; const s = L.time | 0;
    if (s !== L.shownT) { L.shownT = s; $('time').textContent = fmt(s); }
  }
  if (L.done && L.winT < 0) { L.winDelay -= dt; if (L.winDelay <= 0) { L.winT = 0; A.win(); } }
  if (L.winT >= 0) { L.winT += dt; if (mode === 'play' && L.winT > L.maxDepth * 0.07 + 1.25) showWin(); }
  L.prog += (L.litCount / L.n - L.prog) * Math.min(1, dt * 3);
  const sx = L.src % L.w, sy = (L.src / L.w) | 0, tiles = L.tiles;
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i], x = i % L.w, y = (i / L.w) | 0;
    t.ang += (t.rot - t.ang) * Math.min(1, dt * 20);
    t.pulse = Math.max(0, t.pulse - dt * 5); t.flash = Math.max(0, t.flash - dt * 1.2); t.shake = Math.max(0, t.shake - dt * 3.5);
    const a = clamp((L.intro - (Math.abs(x - sx) + Math.abs(y - sy)) * 0.05) / 0.45, 0, 1);
    t.wk = L.winT >= 0 ? bump((L.winT - t.depth * 0.07) / 0.5) : 0;
    t.sc = (a <= 0 ? 0 : easeOutBack(a)) * (1 - 0.08 * Math.sin(t.pulse * Math.PI)) * (1 + 0.06 * t.wk);
    t.cx = OX + x * S + S / 2 + Math.sin(t.shake * 28) * t.shake * S * 0.06; t.cy = OY + y * S + S / 2;
    if (t.lit) {
      if (t.delay > 0) {
        t.delay -= dt;
        if (t.delay <= 0 && t.lamp) { A.chime(Math.round(t.note / Math.max(1, L.lamps - 1) * 12)); sparks(t.cx, t.cy, 12); }
      } else t.glow += (1 - t.glow) * Math.min(1, dt * 9);
    } else t.glow -= t.glow * Math.min(1, dt * 12);
    if (L.winT >= 0 && t.lamp && !t.wdone && L.winT > t.depth * 0.07 + 0.2) { t.wdone = true; sparks(t.cx, t.cy, 16); }
  }
}

// ============ 绘制 ============
function trace(m, r) {                                   // 在方块局部坐标内描出管线路径
  ctx.beginPath();
  if (bits(m) === 2 && m !== 5 && m !== 10) {            // 弯管：以方块顶角为圆心的四分之一圆
    for (let d = 0; d < 4; d++) {
      const e = (d + 1) % 4;
      if ((m >> d & 1) && (m >> e & 1)) ctx.arc((DX[d] + DX[e]) * r, (DY[d] + DY[e]) * r, r, Math.PI + d * Math.PI / 2, Math.PI / 2 + d * Math.PI / 2, true);
    }
    return;
  }
  let rest = m;
  if ((m & 5) === 5) { ctx.moveTo(0, -r); ctx.lineTo(0, r); rest &= ~5; }
  if ((m & 10) === 10) { ctx.moveTo(-r, 0); ctx.lineTo(r, 0); rest &= ~10; }
  for (let d = 0; d < 4; d++) if (rest >> d & 1) { ctx.moveTo(0, 0); ctx.lineTo(DX[d] * r, DY[d] * r); }
}
function node(t, isSrc) {                                // 灯 / 灯芯
  const g = t.glow, R = S * (isSrc ? 0.2 : 0.165);
  if (g > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = g * (0.72 + 0.28 * Math.sin(T * 3.2 + t.depth * 1.3)) * (isSrc ? 1 : 0.85);
    const q = S * (isSrc ? 0.85 : 0.7) * (1 + 0.5 * t.wk);
    ctx.drawImage(GLOW, -q, -q, q * 2, q * 2);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fillStyle = '#141b36'; ctx.fill();
  if (g > 0.01) { ctx.globalAlpha = g; ctx.fillStyle = isSrc ? '#fffaf0' : '#ffe9b8'; ctx.fill(); ctx.globalAlpha = 1; }
  ctx.lineWidth = Math.max(1.5, S * 0.028); ctx.strokeStyle = g > 0.5 ? '#ffc56e' : '#55668f'; ctx.stroke();
  if (isSrc) {
    ctx.save(); ctx.rotate(T * 0.6); ctx.setLineDash([S * 0.07, S * 0.06]);
    ctx.beginPath(); ctx.arc(0, 0, R * 1.5, 0, TAU);
    ctx.strokeStyle = 'rgba(255,225,160,.75)'; ctx.lineWidth = Math.max(1.2, S * 0.022); ctx.stroke(); ctx.restore();
    const k = R * 0.5; ctx.fillStyle = '#ff9d3c';
    ctx.beginPath(); ctx.moveTo(0, -k); ctx.lineTo(k, 0); ctx.lineTo(0, k); ctx.lineTo(-k, 0); ctx.closePath(); ctx.fill();
  } else if (g <= 0.5) {
    ctx.fillStyle = '#55668f'; ctx.beginPath(); ctx.arc(0, 0, R * 0.26, 0, TAU); ctx.fill();
  }
}
function drawBoard() {
  const { w, h, tiles, src } = L, r = S / 2, lw = Math.max(4, S * 0.15), pad = Math.max(2, S * 0.035), rad = S * 0.16;
  const ia = clamp(L.intro / 0.4, 0, 1), HP = Math.PI / 2;
  // 底板
  ctx.save(); ctx.globalAlpha = ia; ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 50 * DPR; ctx.shadowOffsetY = 12 * DPR;
  ctx.fillStyle = 'rgba(13,17,40,.72)'; rr(OX - 16, OY - 16, S * w + 32, S * h + 32, rad + 14); ctx.fill(); ctx.restore();
  ctx.globalAlpha = ia; ctx.strokeStyle = 'rgba(255,226,170,.14)'; ctx.lineWidth = 1;
  rr(OX - 16, OY - 16, S * w + 32, S * h + 32, rad + 14); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
  // 第一遍：方块 + 未点亮的管线
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]; if (t.sc <= 0.01) continue;
    ctx.save(); ctx.translate(t.cx, t.cy); ctx.scale(t.sc, t.sc);
    rr(-r + pad, -r + pad, S - pad * 2, S - pad * 2, rad);
    ctx.fillStyle = t.pin ? 'rgba(5,7,20,.6)' : 'rgba(255,255,255,.035)'; ctx.fill();
    if (t.glow > 0.01) { ctx.fillStyle = `rgba(255,190,110,${(0.07 * t.glow).toFixed(3)})`; ctx.fill(); }
    ctx.lineWidth = 1;
    ctx.strokeStyle = i === hover && !L.done ? 'rgba(255,236,200,.65)' : t.pin ? 'rgba(255,213,138,.4)' : 'rgba(255,255,255,.07)'; ctx.stroke();
    if (t.pin) { ctx.fillStyle = 'rgba(255,213,138,.85)'; ctx.beginPath(); ctx.arc(-r + pad + rad * 0.8, -r + pad + rad * 0.8, Math.max(1.5, S * 0.03), 0, TAU); ctx.fill(); }
    ctx.rotate(t.ang * HP); trace(t.base, r);
    ctx.lineWidth = lw; ctx.strokeStyle = '#2c3858'; ctx.stroke();
    ctx.lineWidth = lw * 0.36; ctx.strokeStyle = '#3c4a70'; ctx.stroke();
    ctx.restore();
  }
  // 第二遍：光
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]; if (t.sc <= 0.01) continue;
    ctx.save(); ctx.translate(t.cx, t.cy); ctx.scale(t.sc, t.sc);
    if (t.glow > 0.01) {
      ctx.save(); ctx.rotate(t.ang * HP); trace(t.base, r);
      ctx.globalAlpha = t.glow * (0.8 + 0.2 * Math.sin(T * 2.6 - t.depth * 0.6));
      ctx.shadowColor = 'rgba(255,140,40,.95)'; ctx.shadowBlur = S * 0.3 * DPR;
      ctx.lineWidth = lw; ctx.strokeStyle = '#ffcd7c'; ctx.stroke();
      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      ctx.lineWidth = lw * 0.4; ctx.strokeStyle = '#fff8e6'; ctx.stroke();
      if (t.wk > 0) { ctx.globalAlpha = t.wk; ctx.lineWidth = lw; ctx.strokeStyle = '#ffffff'; ctx.stroke(); }
      ctx.restore();
    }
    if (i === src || t.lamp) node(t, i === src);
    if (t.flash > 0) { ctx.globalAlpha = t.flash * 0.5; ctx.fillStyle = '#fff3d6'; rr(-r + pad, -r + pad, S - pad * 2, S - pad * 2, rad); ctx.fill(); }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const prog = L ? L.prog : 0.3 + 0.1 * Math.sin(T * 0.5), M = Math.max(W, H);
  const blob = (x, y, r, spr, a) => { ctx.globalAlpha = a; ctx.drawImage(spr, x - r, y - r, r * 2, r * 2); };
  ctx.globalCompositeOperation = 'lighter';
  blob(W * (0.5 + 0.32 * Math.sin(T * 0.07)), H * (0.28 + 0.1 * Math.cos(T * 0.09)), M * 0.55, BLUE, 0.2);
  blob(W * (0.5 - 0.35 * Math.sin(T * 0.05 + 1)), H * (0.78 + 0.1 * Math.sin(T * 0.08)), M * 0.5, PURP, 0.15);
  blob(W / 2, L ? OY + S * L.h / 2 : H * 0.4, Math.min(W, H) * (0.5 + 0.45 * prog), WARM, 0.05 + 0.3 * prog);
  for (const f of flies) {
    const a = (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(T * f.sp + f.ph))) * (0.45 + 0.55 * prog), s = f.s * (1 + 0.4 * prog);
    ctx.globalAlpha = a; ctx.drawImage(GLOW, f.x * W - s, f.y * H - s, s * 2, s * 2);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (L) drawBoard();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of parts) { const k = p.life / p.max, s = p.s * (0.5 + 0.5 * k); ctx.globalAlpha = k; ctx.drawImage(GLOW, p.x - s, p.y - s, s * 2, s * 2); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H);
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (dt <= 0) return;
  T += dt; update(dt); draw();
}

// ============ 输入 ============
function pick(e) {
  if (!L || L.done) return -1;
  const x = Math.floor((e.clientX - OX) / S), y = Math.floor((e.clientY - OY) / S);
  return x >= 0 && y >= 0 && x < L.w && y < L.h ? y * L.w + x : -1;
}
cv.addEventListener('pointerdown', e => {
  if (mode !== 'play') return;
  A.init();
  const i = pick(e); if (i < 0) return;
  e.preventDefault();
  if (e.button === 1 || (e.button === 0 && e.shiftKey)) togglePin(i);
  else rotate(i, e.button === 2 ? -1 : 1);
});
cv.addEventListener('pointermove', e => { hover = mode === 'play' ? pick(e) : -1; cv.style.cursor = hover >= 0 ? 'pointer' : 'default'; });
cv.addEventListener('pointerleave', () => { hover = -1; });
cv.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
window.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('resize', resize);

function setMute() { const m = A.toggle(); $('btnMute').classList.toggle('off', m); }
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.code;
  if (k === 'KeyM') { setMute(); return; }
  if (mode === 'play') {
    if (k === 'KeyZ') undo(); else if (k === 'KeyH') hint(); else if (k === 'KeyR') restart(); else if (k === 'Escape') toMenu();
  } else if (mode === 'win') {
    if (k === 'Enter' || k === 'Space') { e.preventDefault(); next(); } else if (k === 'KeyR') restart(); else if (k === 'Escape') toMenu();
  } else if (k === 'Enter') { e.preventDefault(); $('btnPlay').click(); }
});
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });
const on = (id, fn) => { $(id).onclick = () => { A.init(); A.ui(); fn(); }; };
on('btnBack', toMenu); on('btnMute', setMute); on('btnUndo', undo); on('btnHint', hint); on('btnReset', restart);
on('btnNext', next); on('btnRetry', restart); on('btnMenu', toMenu); on('btnEndless', () => startLevel(-1));

// 自检接口（控制台可用）：__lumen.verify() 校验全部关卡可解；__lumen.solve() 一键还原当前关
window.__lumen = {
  get level() { return L; },
  solve() { for (const t of L.tiles) t.rot += [0, 1, -1, 2].find(r => rotMask(t.base, t.rot + r) === t.base); afterMove(); },
  verify() {
    const out = LEVELS.map((lv, i) => {
      startLevel(i);
      const r = { name: lv.name, n: L.n, par: L.par, lamps: L.lamps, startLit: L.litCount, cross: L.tiles.filter(t => t.base === 15).length };
      this.solve(); r.solvable = L.litCount === L.n; return r;
    });
    toMenu(); return out;
  },
};

resize(); buildMenu(); requestAnimationFrame(frame);
})();
