(() => {
'use strict';

// ============ 基础 ============
const Core = window.LumenCore;
const { LEVELS, CHAPTERS, rotMask, bits, DX, DY } = Core;
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2, HP = Math.PI / 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const fmt = s => `${(s / 60) | 0}:${String((s | 0) % 60).padStart(2, '0')}`;
const easeOutBack = x => { const c = 1.70158; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const bump = u => u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0;
const show = (id, on) => $(id).classList.toggle('hidden', !on);

// 方块外形：把任意朝向归到 5 种基本形状 + 需要转几个 90°
const KIND = {};
[['E', 1], ['I', 5], ['L', 3], ['T', 7], ['X', 15]].forEach(([id, canon]) => {
  for (let r = 3; r >= 0; r--) KIND[rotMask(canon, r)] = { id, r0: r };
});
const CANON = { E: 1, I: 5, L: 3, T: 7, X: 15 };

// ============ 四季画风 ============
const LIT = ['#fffcef', '#ffe9b0'], STONE_LIT = ['#e6dab4', '#cdbd91'];
const PATH_LIT = ['#eda23c', '#ffd46f', '#fffdf2'];
const TWIN = ['#ff7fa6', '#3fc9b8', '#b68cff'];
const THEMES = [
  { // 晨雾
    dark: false, mote: 'seed',
    tile: ['#d3dfd9', '#b6c9c5'], edge: 'rgba(92,120,118,.5)', groove: '#88a29e', grooveIn: '#9db5b0',
    stone: ['#b9b3a6', '#9b9587'], stoneGroove: '#7e7869', stoneGrooveIn: '#8f897a',
    plate: '#fffdf6', plateEdge: '#ffffff', plateA: 0.56, plateShadow: 'rgba(80,100,110,.35)', well: 'rgba(92,125,125,.16)', shadow: 'rgba(70,95,100,.26)',
    flowers: [['#fff0f3', '#ff9fb8', 'rgba(214,96,130,.55)'], ['#fffbe0', '#ffd45e', 'rgba(214,150,40,.55)']],
    bud: ['#e3cfd6', '#b79aa6'], petals: ['#ffffff', '#fff3c4', '#ffd9e2'],
  },
  { // 夏野
    dark: false, mote: 'petal',
    tile: ['#cadded', '#a9c5da'], edge: 'rgba(66,108,142,.5)', groove: '#7b9eb9', grooveIn: '#93b3ca',
    stone: ['#bdb7a8', '#9e9888'], stoneGroove: '#7f796a', stoneGrooveIn: '#908a7b',
    plate: '#ffffff', plateEdge: '#ffffff', plateA: 0.5, plateShadow: 'rgba(30,80,130,.35)', well: 'rgba(60,110,150,.16)', shadow: 'rgba(40,85,125,.26)',
    flowers: [['#ffffff', '#ffd0df', 'rgba(220,110,140,.5)'], ['#fff3c0', '#ff9a4a', 'rgba(210,100,30,.55)']],
    bud: ['#dfe6ee', '#a9b8c8'], petals: ['#ffffff', '#ffe1ea', '#fff2b8'],
  },
  { // 暮色
    dark: false, mote: 'petal',
    tile: ['#cdb6c8', '#ad93ad'], edge: 'rgba(104,74,106,.55)', groove: '#8b6f92', grooveIn: '#a287a6',
    stone: ['#b3a79c', '#948a80'], stoneGroove: '#776d64', stoneGrooveIn: '#887e74',
    plate: '#fff5e8', plateEdge: '#fffaf2', plateA: 0.46, plateShadow: 'rgba(120,50,30,.35)', well: 'rgba(110,70,100,.18)', shadow: 'rgba(90,50,80,.28)',
    flowers: [['#ffe4d6', '#ff6f5e', 'rgba(190,60,50,.55)'], ['#fff1c4', '#ffae3d', 'rgba(205,120,30,.55)']],
    bud: ['#e0c3c4', '#b08f96'], petals: ['#ffd9c2', '#ff9a7a', '#ffe7a6'],
  },
  { // 星夜
    dark: true, mote: 'fly',
    tile: ['#5a6896', '#414d7a'], edge: 'rgba(16,22,56,.7)', groove: '#2c3560', grooveIn: '#39446f',
    stone: ['#7b8098', '#62677f'], stoneGroove: '#474c64', stoneGrooveIn: '#565b73',
    plate: '#18204a', plateEdge: '#6f80c4', plateA: 0.58, plateShadow: 'rgba(0,0,20,.5)', well: 'rgba(4,8,28,.34)', shadow: 'rgba(2,6,24,.42)',
    flowers: [['#f2f5ff', '#9db4ff', 'rgba(80,100,200,.6)'], ['#fff0f6', '#ff9ac6', 'rgba(200,80,140,.55)']],
    bud: ['#a7b1d8', '#7783b4'], petals: ['#dfe6ff', '#ffd6ea', '#fff3c4'],
  },
];

// ============ 存档 ============
const SAVE_KEY = 'lumen.save.v2';
let save = { stars: [], muted: false };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && Array.isArray(s.stars)) save = Object.assign(save, s); } catch (e) { /* 无痕模式等：不存档也能玩 */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 忽略 */ } };
const opened = i => i === 0 || (save.stars[i - 1] || 0) > 0;
const current = () => { const c = LEVELS.findIndex((_, i) => !(save.stars[i] > 0)); return c < 0 ? LEVELS.length - 1 : c; };

// ============ 声音（全部实时合成：八音盒华尔兹 + 音效） ============
const PENTA = [0, 2, 4, 7, 9];
const CHORDS = [[0, 4, 7], [9, 0, 4], [5, 9, 0], [7, 11, 2], [0, 4, 7], [4, 7, 11], [5, 9, 0], [7, 11, 2]];   // C Am F G C Em F G
const A = {
  ac: null, out: null, echo: null, muted: !!save.muted, timer: 0, next: 0, step: 0, motif: [], pos: 5,
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ac = this.ac = new AC();
    this.out = ac.createGain(); this.out.gain.value = this.muted ? 0 : 0.9;
    const comp = ac.createDynamicsCompressor(); this.out.connect(comp); comp.connect(ac.destination);
    const d = this.echo = ac.createDelay(1), fb = ac.createGain(), lp = ac.createBiquadFilter();
    d.delayTime.value = 0.31; fb.gain.value = 0.34; lp.type = 'lowpass'; lp.frequency.value = 2600;
    d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(this.out);
    this.next = ac.currentTime + 0.4;
    this.timer = setInterval(() => this.schedule(), 140);
  },
  // at：ac 时间轴上的绝对时刻
  tone(hz, dur, vol, type, at, echo) {
    const ac = this.ac; if (!ac || ac.state !== 'running') return;
    const t = Math.max(at || 0, ac.currentTime), o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.value = hz;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out);
    if (echo) { const e = ac.createGain(); e.gain.value = echo; g.connect(e); e.connect(this.echo); }
    o.start(t); o.stop(t + dur + 0.05);
  },
  box(hz, vol, at, echo) {                                // 八音盒音色
    this.tone(hz, 1.5, vol, 'sine', at, echo); this.tone(hz * 2, 0.6, vol * 0.22, 'sine', at); this.tone(hz * 4.02, 0.14, vol * 0.12, 'sine', at);
  },
  blip(f0, f1, dur, vol) {                                // 带滑音的短促声
    const ac = this.ac; if (!ac || ac.state !== 'running') return;
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  },
  hz: semi => 261.63 * Math.pow(2, semi / 12),
  // 三拍子：一小节 = 低音 + 两下轻和弦，上面是一条会重复的五声音阶小旋律
  schedule() {
    const ac = this.ac; if (!ac || ac.state !== 'running') return;
    if (this.next < ac.currentTime - 0.2) this.next = ac.currentTime + 0.1;
    const BEAT = 0.64;
    while (this.next < ac.currentTime + 0.5) {
      const beat = this.step % 3, bar = (this.step / 3) | 0, ch = CHORDS[bar % 8], t = this.next;
      if (this.step % 48 === 0 || !this.motif.length) {            // 每 16 小节换一段旋律，中间重复一遍
        this.motif = [];
        for (let i = 0; i < 24; i++) {
          const b = i % 3, r = Math.random();
          this.motif.push(b === 0 ? (r < 0.8 ? 1 : 0) : (r < 0.42 ? 1 : 0));
          this.motif.push([-2, -1, -1, 0, 1, 1, 2][(Math.random() * 7) | 0]);
        }
      }
      if (beat === 0) { this.tone(this.hz(ch[0] - 24), 1.9, 0.07, 'sine', t); this.tone(this.hz(ch[0] - 12), 1.5, 0.03, 'triangle', t); }
      else { this.tone(this.hz(ch[1] - (ch[1] > 7 ? 12 : 0)), 0.9, 0.018, 'triangle', t); this.tone(this.hz(ch[2] - (ch[2] > 7 ? 12 : 0)), 0.9, 0.018, 'triangle', t); }
      const m = (this.step % 24) * 2;
      if (this.motif[m]) {
        this.pos = clamp(this.pos + this.motif[m + 1], 2, 11);
        this.box(this.hz(12 + PENTA[this.pos % 5] + 12 * ((this.pos / 5) | 0)), 0.042, t, 0.4);
      }
      this.step++; this.next += BEAT;
    }
  },
  now() { return this.ac ? this.ac.currentTime : 0; },
  tick(dir) { this.blip(dir > 0 ? 760 : 620, dir > 0 ? 430 : 350, 0.09, 0.1); this.tone(dir > 0 ? 1568 : 1319, 0.05, 0.02, 'sine', this.now()); },
  deny() { this.blip(190, 120, 0.14, 0.11); },
  ui() { this.tone(880, 0.09, 0.045, 'sine', this.now(), 0.25); },
  pin() { const t = this.now(); this.tone(1319, 0.08, 0.04, 'sine', t); this.tone(1760, 0.14, 0.035, 'sine', t + 0.06, 0.3); },
  chime(k) { k = clamp(k, 0, 11); this.box(this.hz(12 + PENTA[k % 5] + 12 * ((k / 5) | 0)), 0.1, this.now(), 0.5); },
  win() {
    const t = this.now();
    [0, 4, 7, 12, 14, 16, 19, 24].forEach((s, i) => this.box(this.hz(12 + s), 0.085, t + i * 0.105, 0.5));
    [0, 7, 16].forEach(s => this.tone(this.hz(s - 12), 2.6, 0.045, 'triangle', t + 0.84));
  },
  setMuted(m) { this.muted = m; if (this.out) this.out.gain.value = m ? 0 : 0.9; save.muted = m; persist(); },
};
document.addEventListener('visibilitychange', () => {
  if (!A.ac) return;
  if (document.hidden) A.ac.suspend(); else A.ac.resume();
});

// ============ 画布与小贴图 ============
const cv = $('c'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, S = 80, OX = 0, OY = 0;
let mode = 'cover', L = null, T = 0, last = performance.now(), hover = -1;
let TH = THEMES[0], SPR = null, sprKey = '', plate = null, platePad = 0;
const parts = [], motes = [];
let moteType = '', motePal = ['#fff'];

function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
function rrPath(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2); g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function rr4(g, x, y, w, h, r) {                         // 四角半径各不相同：[左上, 右上, 右下, 左下]
  g.beginPath(); g.moveTo(x + r[0], y);
  g.lineTo(x + w - r[1], y); if (r[1]) g.arcTo(x + w, y, x + w, y + r[1], r[1]);
  g.lineTo(x + w, y + h - r[2]); if (r[2]) g.arcTo(x + w, y + h, x + w - r[2], y + h, r[2]);
  g.lineTo(x + r[3], y + h); if (r[3]) g.arcTo(x, y + h, x, y + h - r[3], r[3]);
  g.lineTo(x, y + r[0]); if (r[0]) g.arcTo(x, y, x + r[0], y, r[0]);
  g.closePath();
}
function glowSprite(stops) {
  const c = mk(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c;
}
const GLOW = glowSprite([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,238,175,.78)'], [0.5, 'rgba(255,195,95,.22)'], [1, 'rgba(255,170,60,0)']]);
const SOFT = glowSprite([[0, 'rgba(255,255,255,.95)'], [0.35, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
const HALO = glowSprite([[0, 'rgba(255,248,214,.95)'], [0.4, 'rgba(255,226,140,.42)'], [1, 'rgba(255,205,95,0)']]);

function trace(g, m, r) {                                // 在方块局部坐标内描出光路
  g.beginPath();
  if (bits(m) === 2 && m !== 5 && m !== 10) {            // 弯：以方块顶角为圆心的四分之一圆
    for (let d = 0; d < 4; d++) {
      const e = (d + 1) % 4;
      if ((m >> d & 1) && (m >> e & 1)) g.arc((DX[d] + DX[e]) * r, (DY[d] + DY[e]) * r, r, Math.PI + d * HP, HP + d * HP, true);
    }
    return;
  }
  let rest = m;
  if ((m & 5) === 5) { g.moveTo(0, -r); g.lineTo(0, r); rest &= ~5; }
  if ((m & 10) === 10) { g.moveTo(-r, 0); g.lineTo(r, 0); rest &= ~10; }
  for (let d = 0; d < 4; d++) if (rest >> d & 1) { g.moveTo(0, 0); g.lineTo(DX[d] * r, DY[d] * r); }
}

// 一块方块的贴图：水彩底 + 纸纹 + 光路。v: dim / lit / sdim / slit（s = 苔石）
function paintTile(g, mask, v, k) {
  const th = TH, r = S / 2, pad = S * 0.045, rad = S * 0.2, lit = v === 'lit' || v === 'slit', stone = v[0] === 's';
  const R = Core.rng(mask * 97 + (stone ? 31 : 7));
  const body = inset => rrPath(g, -r + pad + inset, -r + pad + inset, S - 2 * (pad + inset), S - 2 * (pad + inset), rad - inset * 0.6);
  const c = stone ? (lit ? STONE_LIT : th.stone) : (lit ? LIT : th.tile);
  const gr = g.createRadialGradient(0, 0, S * 0.08, 0, 0, S * 0.74); gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]);
  body(0); g.fillStyle = gr; g.fill();

  g.save(); body(0); g.clip();
  for (let i = 0; i < 7; i++) {                          // 水彩晕染
    const x = (R() - 0.5) * S, y = (R() - 0.5) * S, q = S * (0.16 + R() * 0.3), light = R() < 0.55;
    const b = g.createRadialGradient(x, y, 0, x, y, q), a = 0.05 + R() * 0.07;
    b.addColorStop(0, light ? `rgba(255,255,255,${a})` : `rgba(70,60,80,${a * 0.7})`); b.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = b; g.fillRect(-r, -r, S, S);
  }
  const dot = Math.max(1 / k, S * 0.012);
  for (let i = 0; i < 70; i++) {                         // 纸纹颗粒
    g.fillStyle = R() < 0.5 ? 'rgba(255,255,255,.14)' : 'rgba(60,50,45,.07)';
    g.fillRect((R() - 0.5) * S, (R() - 0.5) * S, dot * (1 + R()), dot * (1 + R()));
  }
  if (stone) {                                           // 青苔与裂纹
    g.strokeStyle = 'rgba(50,45,40,.22)'; g.lineWidth = Math.max(1 / k, S * 0.012); g.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      let x = (R() - 0.5) * S * 0.7, y = (R() - 0.5) * S * 0.7; g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 3; j++) { x += (R() - 0.5) * S * 0.22; y += (R() - 0.5) * S * 0.22; g.lineTo(x, y); }
      g.stroke();
    }
    const greens = ['#6f9a52', '#86b061', '#9cc373', '#5d8848'];
    for (let cl = 0; cl < 3; cl++) {
      const corner = (R() * 4) | 0, cx = (corner % 2 ? 1 : -1) * r * (0.5 + R() * 0.3), cy = (corner > 1 ? 1 : -1) * r * (0.5 + R() * 0.3);
      for (let i = 0; i < 13; i++) {
        g.fillStyle = greens[(R() * 4) | 0]; g.globalAlpha = 0.85;
        g.beginPath(); g.arc(cx + (R() - 0.5) * S * 0.3, cy + (R() - 0.5) * S * 0.3, S * (0.025 + R() * 0.045), 0, TAU); g.fill();
      }
    }
    g.globalAlpha = 1;
  }
  g.restore();

  body(0); g.lineWidth = Math.max(1 / k, S * 0.02); g.strokeStyle = stone ? 'rgba(70,62,52,.55)' : lit ? 'rgba(214,150,60,.55)' : th.edge; g.stroke();
  body(S * 0.028); g.lineWidth = Math.max(1 / k, S * 0.018); g.strokeStyle = lit ? 'rgba(255,255,255,.7)' : th.dark ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.4)'; g.stroke();

  trace(g, mask, r); g.lineCap = 'butt'; g.lineJoin = 'round';
  if (lit) {
    g.save(); g.shadowColor = 'rgba(255,150,40,.75)'; g.shadowBlur = S * 0.13 * k;
    g.lineWidth = S * 0.19; g.strokeStyle = PATH_LIT[0]; g.stroke(); g.restore();
    g.lineWidth = S * 0.135; g.strokeStyle = PATH_LIT[1]; g.stroke();
    g.lineWidth = S * 0.058; g.strokeStyle = PATH_LIT[2]; g.stroke();
  } else {
    g.lineWidth = S * 0.18; g.strokeStyle = stone ? th.stoneGroove : th.groove; g.stroke();
    g.lineWidth = S * 0.105; g.strokeStyle = stone ? th.stoneGrooveIn : th.grooveIn; g.stroke();
  }
  if (bits(mask) === 1) {                                // 尽头收成圆头
    g.beginPath(); g.arc(0, 0, S * 0.095, 0, TAU); g.fillStyle = lit ? PATH_LIT[0] : stone ? th.stoneGroove : th.groove; g.fill();
    g.beginPath(); g.arc(0, 0, S * 0.062, 0, TAU); g.fillStyle = lit ? PATH_LIT[1] : stone ? th.stoneGrooveIn : th.grooveIn; g.fill();
  }
}
function paintFlower(g, R, c) {                          // 盛开的花灯
  g.drawImage(HALO, -R * 1.6, -R * 1.6, R * 3.2, R * 3.2);
  for (let i = 0; i < 5; i++) {
    g.save(); g.rotate(i * TAU / 5);
    const wd = R * 0.58;
    g.beginPath(); g.moveTo(0, -R * 0.06);
    g.bezierCurveTo(-wd, -R * 0.28, -wd * 0.98, -R * 1.04, 0, -R * 0.97);
    g.bezierCurveTo(wd * 0.98, -R * 1.04, wd, -R * 0.28, 0, -R * 0.06);
    const gr = g.createLinearGradient(0, -R * 0.1, 0, -R); gr.addColorStop(0, c[1]); gr.addColorStop(0.6, c[0]); gr.addColorStop(1, '#ffffff');
    g.fillStyle = gr; g.fill(); g.lineWidth = Math.max(0.5, R * 0.04); g.strokeStyle = c[2]; g.stroke();
    g.beginPath(); g.moveTo(0, -R * 0.34); g.lineTo(0, -R * 0.72); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = R * 0.035; g.lineCap = 'round'; g.stroke();
    g.restore();
  }
  const cg = g.createRadialGradient(-R * 0.06, -R * 0.06, 0, 0, 0, R * 0.3); cg.addColorStop(0, '#fffde6'); cg.addColorStop(1, '#ffc43a');
  g.beginPath(); g.arc(0, 0, R * 0.27, 0, TAU); g.fillStyle = cg; g.fill(); g.lineWidth = R * 0.045; g.strokeStyle = 'rgba(214,140,40,.75)'; g.stroke();
  g.fillStyle = '#e0962b';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(Math.cos(i * TAU / 6) * R * 0.14, Math.sin(i * TAU / 6) * R * 0.14, R * 0.032, 0, TAU); g.fill(); }
}
function paintBud(g, R, c) {                             // 还没醒的花苞
  g.fillStyle = TH.dark ? '#6f9a7e' : '#8db27a'; g.strokeStyle = TH.dark ? 'rgba(30,60,50,.6)' : 'rgba(70,110,60,.6)'; g.lineWidth = Math.max(0.5, R * 0.07);
  for (const sx of [-1, 1]) {
    g.beginPath(); g.moveTo(0, R * 0.95); g.quadraticCurveTo(sx * R * 1.25, R * 0.75, sx * R * 1.05, -R * 0.1); g.quadraticCurveTo(sx * R * 0.4, R * 0.25, 0, R * 0.95); g.fill(); g.stroke();
  }
  g.beginPath(); g.moveTo(0, -R * 1.3);
  g.bezierCurveTo(R * 0.98, -R * 0.5, R * 0.92, R * 0.86, 0, R * 0.92);
  g.bezierCurveTo(-R * 0.92, R * 0.86, -R * 0.98, -R * 0.5, 0, -R * 1.3);
  const gr = g.createLinearGradient(0, -R * 1.3, 0, R); gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]);
  g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(80,60,80,.45)'; g.stroke();
  g.beginPath(); g.moveTo(0, -R * 1.1); g.quadraticCurveTo(R * 0.25, -R * 0.2, 0, R * 0.7); g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = R * 0.08; g.stroke();
}
function paintLeaf(g, R) {                               // 玩家别上的叶子标记
  g.rotate(-0.7);
  g.beginPath(); g.moveTo(0, R); g.quadraticCurveTo(R * 0.95, R * 0.2, 0, -R); g.quadraticCurveTo(-R * 0.95, R * 0.2, 0, R);
  const gr = g.createLinearGradient(-R, 0, R, 0); gr.addColorStop(0, '#9ed27c'); gr.addColorStop(1, '#5fae55');
  g.fillStyle = gr; g.fill(); g.lineWidth = Math.max(0.6, R * 0.12); g.strokeStyle = '#3f8444'; g.stroke();
  g.beginPath(); g.moveTo(0, R * 0.8); g.lineTo(0, -R * 0.7); g.strokeStyle = 'rgba(255,255,255,.65)'; g.lineWidth = Math.max(0.5, R * 0.09); g.stroke();
}
function buildSprites() {
  const P = Math.max(8, Math.round(S * DPR)), k = P / S;
  SPR = { dim: {}, lit: {}, sdim: {}, slit: {}, flower: [], bud: null, leaf: null };
  for (const id in CANON) for (const v of ['dim', 'lit', 'sdim', 'slit']) {
    if (id === 'X' && v[0] === 's') continue;
    const c = mk(P, P), g = c.getContext('2d'); g.scale(k, k); g.translate(S / 2, S / 2);
    paintTile(g, CANON[id], v, k); SPR[v][id] = c;
  }
  const FS = S * 1.3;                                    // 花灯贴图边长（含光晕）
  for (const col of TH.flowers) { const c = mk(FS * DPR, FS * DPR), g = c.getContext('2d'); g.scale(DPR, DPR); g.translate(FS / 2, FS / 2); paintFlower(g, S * 0.36, col); SPR.flower.push(c); }
  { const c = mk(S * DPR, S * DPR), g = c.getContext('2d'); g.scale(DPR, DPR); g.translate(S / 2, S / 2); paintBud(g, S * 0.13, TH.bud); SPR.bud = c; }
  { const c = mk(S * 0.5 * DPR, S * 0.5 * DPR), g = c.getContext('2d'); g.scale(DPR, DPR); g.translate(S * 0.25, S * 0.25); paintLeaf(g, S * 0.15); SPR.leaf = c; }
}
// 棋盘底板：所有格子外扩后的并集，只在真正的外角倒圆
function buildPlate() {
  const th = TH, M = Math.round(S * 0.14), pad = M + 30, w = L.w * S + pad * 2, h = L.h * S + pad * 2;
  const cells = L.tiles.filter(Boolean), has = (x, y) => x >= 0 && y >= 0 && x < L.w && y < L.h && !!L.tiles[y * L.w + x];
  const tmp = mk(w * DPR, h * DPR), g = tmp.getContext('2d'); g.scale(DPR, DPR); g.translate(pad, pad);
  const pass = (grow, col) => {
    g.fillStyle = col; const R = S * 0.2 + grow;
    for (const t of cells) {
      const l = has(t.x - 1, t.y), r = has(t.x + 1, t.y), u = has(t.x, t.y - 1), d = has(t.x, t.y + 1);
      rr4(g, t.x * S - grow, t.y * S - grow, S + grow * 2, S + grow * 2, [l || u ? 0 : R, r || u ? 0 : R, r || d ? 0 : R, l || d ? 0 : R]); g.fill();
    }
  };
  pass(M, th.plateEdge); pass(M - 1.5, th.plate);
  plate = mk(w * DPR, h * DPR); platePad = pad;
  const p = plate.getContext('2d');
  p.save(); p.shadowColor = th.plateShadow; p.shadowBlur = 24 * DPR; p.shadowOffsetY = 9 * DPR; p.globalAlpha = th.plateA; p.drawImage(tmp, 0, 0); p.restore();
  p.scale(DPR, DPR); p.translate(pad, pad);
  const q = S * 0.045, rad = S * 0.2;
  p.fillStyle = th.well; for (const t of cells) { rrPath(p, t.x * S + q * 0.4, t.y * S + q * 0.4, S - q * 0.8, S - q * 0.8, rad); p.fill(); }
  p.fillStyle = th.shadow; for (const t of cells) { rrPath(p, t.x * S + q, t.y * S + q + S * 0.05, S - q * 2, S - q * 2, rad); p.fill(); }
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2); W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  layout();
}
function layout() {
  if (!L) return;
  const top = $('hudTop').getBoundingClientRect().bottom || 104, btm = $('hudBottom').getBoundingClientRect().top || H - 124;
  const mx = W < 560 ? 20 : 44, gap = 16, availH = btm - top - gap * 2;
  S = clamp(Math.floor(Math.min((W - mx * 2) / L.w, availH / L.h)), 22, 108);
  OX = Math.round((W - S * L.w) / 2); OY = Math.round(top + gap + (availH - S * L.h) / 2);
  const key = S + '|' + DPR + '|' + THEMES.indexOf(TH);
  if (key !== sprKey) { sprKey = key; buildSprites(); }
  buildPlate();
}

// ============ 背景与氛围 ============
const bgLayers = [...document.querySelectorAll('.bgl')];
let bgKey = 'cover', bgIdx = 0;
function setBg(key) {
  if (key === bgKey) return; bgKey = key;
  const a = bgLayers[bgIdx]; bgIdx ^= 1; const b = bgLayers[bgIdx];
  b.className = 'bgl b-' + key + ' on'; a.classList.remove('on');
}
function setMotes(type, pal) {
  motePal = pal || motePal;
  if (type === moteType) return;
  moteType = type; motes.length = 0;
  const n = W * H < 420000 ? 22 : 34;
  for (let i = 0; i < n; i++) motes.push(newMote(true));
}
function newMote(anywhere) {
  const m = { x: Math.random(), y: Math.random(), ph: rand(0, TAU), sp: rand(0.6, 1.8), s: 4, vx: 0, vy: 0, rot: rand(0, TAU), vr: rand(-1.2, 1.2), c: motePal[(Math.random() * motePal.length) | 0] };
  if (moteType === 'fly') { m.s = rand(3, 9); m.vx = rand(-0.008, 0.008); m.vy = -rand(0.004, 0.016); m.y = anywhere ? rand(0.3, 1.05) : 1.05; }
  else if (moteType === 'seed') { m.s = rand(2.4, 4.6); m.vx = rand(0.006, 0.022); m.vy = -rand(0.003, 0.014); if (!anywhere) { m.x = -0.05; m.y = rand(0.2, 1.05); } }
  else { m.s = rand(3.5, 7); m.vx = rand(0.012, 0.034); m.vy = rand(0.012, 0.03); if (!anywhere) { if (Math.random() < 0.6) { m.y = -0.05; } else { m.x = -0.05; m.y = rand(0, 0.7); } } }
  return m;
}
function updateMotes(dt) {
  for (let i = 0; i < motes.length; i++) {
    const m = motes[i];
    m.x += (m.vx + Math.sin(T * m.sp + m.ph) * 0.006) * dt; m.y += m.vy * dt;
    if (m.y < -0.08 || m.y > 1.08 || m.x < -0.08 || m.x > 1.08) motes[i] = newMote(false);
  }
}
function drawMotes() {
  const a0 = mode === 'select' ? 0.35 : 1;
  if (moteType === 'fly') {
    ctx.globalCompositeOperation = 'lighter';
    for (const m of motes) { ctx.globalAlpha = a0 * (0.2 + 0.8 * (0.5 + 0.5 * Math.sin(T * m.sp + m.ph))); ctx.drawImage(GLOW, m.x * W - m.s, m.y * H - m.s, m.s * 2, m.s * 2); }
    ctx.globalCompositeOperation = 'source-over';
  } else if (moteType === 'seed') {
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.8;
    for (const m of motes) {
      const x = m.x * W, y = m.y * H, tilt = Math.sin(T * m.sp + m.ph) * 0.4;
      ctx.globalAlpha = a0 * 0.9; ctx.drawImage(SOFT, x - m.s * 1.6, y - m.s * 1.6, m.s * 3.2, m.s * 3.2);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.sin(tilt) * m.s * 2.6, y + Math.cos(tilt) * m.s * 2.6); ctx.stroke();
    }
  } else {
    for (const m of motes) {
      const a = m.rot + T * m.vr, flip = Math.max(0.25, Math.abs(Math.cos(T * m.sp * 1.6 + m.ph))), c = Math.cos(a), s = Math.sin(a);
      ctx.setTransform(DPR * c, DPR * s, -DPR * s * flip, DPR * c * flip, DPR * m.x * W, DPR * m.y * H);
      ctx.globalAlpha = a0 * 0.85; ctx.fillStyle = m.c; ctx.beginPath(); ctx.ellipse(0, 0, m.s, m.s * 0.58, 0, 0, TAU); ctx.fill();
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  ctx.globalAlpha = 1;
}

// ============ 游戏流程 ============
function setMode(m) { mode = m; document.body.dataset.mode = m; }
function startLevel(idx, endlessDef) {
  const def = idx >= 0 ? LEVELS[idx] : (endlessDef || Core.endless((Date.now() ^ (Math.random() * 1e9)) & 0xfffffff));
  const s = Core.build(def);
  TH = THEMES[def.chapter];
  L = { idx, def, s, w: s.w, h: s.h, n: s.n, tiles: [], moves: 0, hints: 0, time: 0, done: false, undo: [], intro: 0, winT: -1, winDelay: 0, idle: 0, guide: -1, link: null, look: { x: 0, y: 0 }, lampsLit: 0, stoneTold: false };
  for (let i = 0; i < s.n; i++) {
    if (!s.cell[i]) { L.tiles.push(null); continue; }
    const k = KIND[s.base[i]];
    L.tiles.push({ i, x: i % s.w, y: (i / s.w) | 0, kind: k.id, r0: k.r0, src: i === s.src, lamp: bits(s.base[i]) === 1 && i !== s.src, stone: !!s.fixed[i], twin: s.twin[i], twinId: s.twinId[i],
      ang: s.rot[i], lit: false, was: false, depth: -1, glow: 0, bt: 0, delay: 0, note: 0, pin: false, pulse: 0, flash: 0, shake: 0, held: false, wdone: false, cx: 0, cy: 0, sc: 0, wk: 0, fv: (i + ((i / s.w) | 0)) % 2, ph: rand(0, TAU) });
  }
  relight(true);
  setMode('play'); hover = -1; parts.length = 0; press = null;
  show('cover', false); show('select', false); show('win', false); show('hud', true); show('toast', false);
  const ch = CHAPTERS[def.chapter];
  $('lvCh').textContent = idx >= 0 ? `${ch.sub} · ${ch.name}` : `${ch.name} · ${s.w}×${s.h}`;
  $('lvName').textContent = idx >= 0 ? `${idx + 1} · ${def.name}` : def.name;
  $('lampsAll').textContent = '/' + s.lamps;
  $('tip').textContent = def.tip || '';
  document.body.dataset.theme = def.chapter;
  setBg(def.chapter); setMotes(TH.mote, TH.petals);
  layout(); hud();
}

// 逻辑层已重新算过连通；这里把结果同步到画面，并给新亮起的方块排好先后（光像水一样漫过去）
function relight(initial) {
  const s = L.s; let minD = 1e9, before = 0, maxDelay = 0; const fresh = [];
  for (const t of L.tiles) { if (!t) continue; t.was = t.lit; t.lit = !!s.lit[t.i]; t.depth = s.depth[t.i]; }
  for (const t of L.tiles) { if (!t || !t.lit) continue; if (!t.was) minD = Math.min(minD, t.depth); else if (t.lamp) before++; }
  for (const t of L.tiles) {
    if (!t || !t.lit || t.was) continue;
    t.delay = (initial ? 0.75 : 0.07) + (t.depth - minD) * 0.06; maxDelay = Math.max(maxDelay, t.delay);
    if (t.lamp) fresh.push(t);
  }
  fresh.sort((a, b) => a.depth - b.depth).forEach((t, k) => { t.note = before + k; });
  L.lampsLit = before + fresh.length;
  return maxDelay;
}
function acted() { L.idle = 0; L.guide = -1; }
function afterMove() {
  const md = relight(false);
  if (Core.solved(L.s)) { L.done = true; L.winDelay = md + 0.5; hover = -1; cv.style.cursor = 'default'; }
  hud();
}
const members = i => Core.group(L.s, i);
function rotate(i, dir) {
  if (!L || L.done) return false;
  const t = L.tiles[i]; if (!t) return false;
  acted();
  if (t.stone) {
    t.shake = 1; A.deny();
    if (!L.stoneTold) { L.stoneTold = true; toast('苔石转不动，它已经站对了'); }
    return false;
  }
  const g = members(i);
  if (g.some(j => L.tiles[j].pin)) { for (const j of g) L.tiles[j].shake = 1; A.deny(); toast('这块别着叶子 · 长按可取下'); return false; }
  Core.turn(L.s, i, dir);
  for (const j of g) L.tiles[j].pulse = 1;
  if (g.length > 1) L.link = { a: g[0], b: g[1], t: 1 };
  const src = L.tiles[L.s.src], dx = t.x - src.x, dy = t.y - src.y, dl = Math.hypot(dx, dy) || 1;
  L.look.x = dx / dl; L.look.y = dy / dl;
  L.moves++; L.undo.push([i, dir]);
  A.tick(dir); afterMove();
  return true;
}
function undo() {
  if (!L || L.done) return;
  const u = L.undo.pop(); if (!u) { A.deny(); return; }
  acted();
  Core.turn(L.s, u[0], -u[1]);
  for (const j of members(u[0])) L.tiles[j].pulse = 1;
  L.moves = Math.max(0, L.moves - 1);
  A.tick(-u[1]); afterMove();
}
function togglePin(i) {
  if (!L || L.done) return;
  const t = L.tiles[i]; if (!t || t.stone) return;
  acted();
  const g = members(i), on = !t.pin;
  for (const j of g) { L.tiles[j].pin = on; L.tiles[j].flash = 0.45; }
  A.pin();
}
function hint() {
  if (!L || L.done) return;
  const i = Core.nextHint(L.s); if (i < 0) return;
  acted();
  const k = Core.needs(L.s, i), g = members(i);
  for (let c = 0; c < k; c++) Core.turn(L.s, i, 1);
  for (const j of g) { const t = L.tiles[j]; t.pin = true; t.flash = 1; t.pulse = 1; }
  L.undo = L.undo.filter(u => !g.includes(u[0]));
  L.hints++; L.moves += k;
  A.chime(7); afterMove();
}
function hud() { $('moves').textContent = L.moves; $('lamps').textContent = L.lampsLit; }

function starsFor(moves, par, hints) {
  let st = moves <= par + Math.max(2, Math.ceil(par * 0.25)) ? 3 : moves <= par * 2 + 4 ? 2 : 1;
  if (hints && st > 2) st = 2;
  return st;
}
function showWin() {
  setMode('win');
  const s = L.s, stars = starsFor(L.moves, s.par, L.hints), idx = L.idx, last = idx === LEVELS.length - 1;
  let unlock = '';
  if (idx >= 0) {
    const first = !(save.stars[idx] > 0);
    save.stars[idx] = Math.max(save.stars[idx] || 0, stars); persist();
    if (first && idx % 5 === 4 && !last) { const c = CHAPTERS[(idx + 1) / 5]; unlock = `${c.sub}「${c.name}」已开启`; }
  }
  [...$('stars').children].forEach((el, i) => { el.className = ''; void el.offsetWidth; if (i < stars) el.className = 'on'; });
  $('winCap').textContent = idx >= 0 ? `第 ${idx + 1} 关 · ${L.def.name}` : '无尽花园';
  $('winTitle').textContent = last ? '万灯皆明' : '花灯盛开';
  $('rMoves').textContent = L.moves; $('rPar').textContent = s.par; $('rTime').textContent = fmt(L.time);
  $('rNote').textContent = last ? '谢谢你，把光带到了这里' : L.hints ? `光灵帮了 ${L.hints} 次忙` : stars === 3 ? '一步不多，刚刚好' : stars === 2 ? '再少走几步，就是三颗星' : '灯都亮了，下次试试少走几步';
  $('rUnlock').textContent = unlock;
  $('btnNext').textContent = idx < 0 ? '再来一座' : last ? '无尽花园' : '下一关';
  show('win', true);
}
function next() { if (L.idx < 0 || L.idx === LEVELS.length - 1) startLevel(-1); else startLevel(L.idx + 1); }
function restart() { startLevel(L.idx, L.idx < 0 ? L.def : null); }

// ============ 封面 / 选关 ============
function leaveGame() { L = null; hover = -1; press = null; cv.style.cursor = 'default'; parts.length = 0; show('hud', false); show('win', false); show('toast', false); }
function toCover() {
  leaveGame(); setMode('cover'); show('select', false); show('cover', true);
  setBg('cover'); setMotes('fly');
  const any = save.stars.some(s => s > 0), all = LEVELS.every((_, i) => save.stars[i] > 0);
  $('btnPlay').textContent = all ? '再走一遍' : any ? '继续旅程' : '开始旅程';
}
function toSelect() {
  leaveGame(); setMode('select'); show('cover', false); show('select', true);
  setBg('cover'); setMotes('fly');
  const box = $('chapters'), cur = current(); box.innerHTML = '';
  let total = 0;
  CHAPTERS.forEach((ch, c) => {
    const el = document.createElement('article'); el.className = 'chap c' + c;
    let got = 0; for (let i = c * 5; i < c * 5 + 5; i++) got += save.stars[i] || 0; total += got;
    el.innerHTML = `<div class="chap-head"><small>${ch.sub}</small><h3>${ch.name}</h3><em><u>★</u> ${got}/15</em></div><p class="chap-line">${ch.line}</p><div class="nodes"></div>`;
    const nodes = el.querySelector('.nodes');
    for (let i = c * 5; i < c * 5 + 5; i++) {
      const b = document.createElement('button'), st = save.stars[i] || 0, open = opened(i);
      b.className = 'node' + (open ? '' : ' locked') + (st ? ' done' : '') + (i === cur && !st ? ' cur' : '');
      b.innerHTML = `<span class="num">${open ? i + 1 : '<svg><use href="#i-lock"/></svg>'}</span><span class="nm">${LEVELS[i].name}</span><span class="st"><u>${'★'.repeat(st)}</u>${'★'.repeat(3 - st)}</span>`;
      b.onclick = open ? () => { A.init(); A.ui(); startLevel(i); } : () => { A.init(); A.deny(); toast('先点亮前一关的花灯'); };
      nodes.appendChild(b);
    }
    box.appendChild(el);
  });
  $('starTotal').textContent = total;
  const curEl = box.querySelector('.node.cur'); if (curEl) curEl.closest('.chap').scrollIntoView({ block: 'center' });
}
let toastTimer = 0;
function toast(text) {
  const el = $('toast'); el.textContent = text; show('toast', false); void el.offsetWidth; show('toast', true);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => show('toast', false), 2200);
}

// ============ 每帧更新 ============
function burst(t, big) {
  const col = TH.flowers[t.fv], n = big ? 10 : 7, k = S / 70;
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), v = rand(40, 120) * k, life = rand(0.6, 1.1);
    parts.push({ type: 'petal', x: t.cx, y: t.cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30 * k, life, max: life, s: rand(2.6, 4.6) * k + 1, c: Math.random() < 0.5 ? col[0] : col[1], rot: rand(0, TAU), vr: rand(-7, 7), drag: 2 });
  }
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), v = rand(30, 130) * k, life = rand(0.4, 0.9);
    parts.push({ type: 'glow', x: t.cx, y: t.cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20 * k, life, max: life, s: rand(3, 7), drag: 2.4 });
  }
}
function petalRain() {
  const pal = [...TH.flowers[0].slice(0, 2), ...TH.flowers[1].slice(0, 2)];
  for (let i = 0; i < 54; i++) {
    const life = rand(2.6, 4.4);
    parts.push({ type: 'petal', x: rand(-0.1, 1) * W, y: -rand(10, H * 0.55), vx: rand(-10, 46), vy: rand(70, 150), life, max: life, s: rand(4, 8), c: pal[(Math.random() * pal.length) | 0], rot: rand(0, TAU), vr: rand(-4, 4), drag: 0 });
  }
}
function update(dt) {
  updateMotes(dt);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy = p.vy * (1 - p.drag * dt) + 60 * dt; } else p.x += Math.sin(T * 2 + p.rot) * 22 * dt;
  }
  if (!L) return;
  const s = L.s, src = L.tiles[s.src];
  L.intro += dt;
  if (mode === 'play' && !L.done) {
    L.time += dt; L.idle += dt;
    // 第一章：发一会儿呆，就轻轻圈出下一块该转的（不扣星）
    if (L.idx >= 0 && L.idx < 5 && L.idle > 4.2 && L.guide < 0) L.guide = Core.nextHint(s);
  }
  if (L.done && L.winT < 0) { L.winDelay -= dt; if (L.winDelay <= 0) { L.winT = 0; A.win(); petalRain(); } }
  if (L.winT >= 0) { L.winT += dt; if (mode === 'play' && L.winT > s.maxDepth * 0.06 + 1.5) showWin(); }
  if (L.link && (L.link.t -= dt * 1.5) <= 0) L.link = null;
  const decay = 1 - Math.min(1, dt * 1.2); L.look.x *= decay; L.look.y *= decay;
  for (const t of L.tiles) {
    if (!t) continue;
    t.ang += (s.rot[t.i] - t.ang) * Math.min(1, dt * 18);
    t.pulse = Math.max(0, t.pulse - dt * 4.5); t.flash = Math.max(0, t.flash - dt * 1.3); t.shake = Math.max(0, t.shake - dt * 3.5);
    const a = clamp((L.intro - (Math.abs(t.x - src.x) + Math.abs(t.y - src.y)) * 0.045) / 0.42, 0, 1);
    t.wk = L.winT >= 0 ? bump((L.winT - t.depth * 0.06) / 0.5) : 0;
    t.sc = (a <= 0 ? 0 : easeOutBack(a)) * (1 - 0.07 * Math.sin(t.pulse * Math.PI)) * (1 + 0.07 * t.wk) * (t.held ? 0.94 : 1);
    t.cx = OX + t.x * S + S / 2 + Math.sin(t.shake * 28) * t.shake * S * 0.05; t.cy = OY + t.y * S + S / 2;
    if (t.lit) {
      if (t.delay > 0) {
        t.delay -= dt;
        if (t.delay <= 0 && t.lamp) { A.chime(Math.round(t.note / Math.max(1, s.lamps - 1) * 9)); burst(t, false); }
      } else { t.glow += (1 - t.glow) * Math.min(1, dt * 9); if (t.lamp) t.bt = Math.min(1, t.bt + dt / 0.5); }
    } else { t.glow -= t.glow * Math.min(1, dt * 12); t.bt = Math.max(0, t.bt - dt / 0.16); }
    if (L.winT >= 0 && t.lamp && !t.wdone && L.winT > t.depth * 0.06 + 0.2) { t.wdone = true; burst(t, true); }
  }
}

// ============ 绘制 ============
function drawSpirit(t) {                                 // 光灵：住在起点的小火苗
  const R = S * 0.25, bob = Math.sin(T * 2.1) * S * 0.018, sc = t.sc, happy = L.winT >= 0;
  ctx.setTransform(DPR * sc, 0, 0, DPR * sc, DPR * t.cx, DPR * (t.cy + bob));
  const q = S * (0.8 + 0.5 * t.wk);
  ctx.globalAlpha = 0.78 + 0.2 * Math.sin(T * 2.6);
  if (TH.dark) ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(TH.dark ? GLOW : HALO, -q, -q, q * 2, q * 2);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const sway = Math.sin(T * 3.1) * R * 0.16;
  ctx.beginPath(); ctx.moveTo(sway, -R * 1.5);
  ctx.bezierCurveTo(R * 0.38 + sway * 0.3, -R * 1.05, R, -R * 0.55, R, R * 0.05);
  ctx.arc(0, R * 0.05, R, 0, Math.PI);
  ctx.bezierCurveTo(-R, -R * 0.55, -R * 0.38 + sway * 0.3, -R * 1.05, sway, -R * 1.5);
  const gr = ctx.createRadialGradient(-R * 0.2, -R * 0.2, R * 0.1, 0, 0, R * 1.35);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#fff3bf'); gr.addColorStop(1, '#ffc95c');
  ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = Math.max(1, S * 0.024); ctx.strokeStyle = '#f0a040'; ctx.stroke();
  const lx = L.look.x * R * 0.1, ly = L.look.y * R * 0.08, ink = '#5b3a26';
  ctx.fillStyle = 'rgba(255,128,120,.42)';
  ctx.beginPath(); ctx.arc(-R * 0.6 + lx, R * 0.34 + ly, R * 0.15, 0, TAU); ctx.arc(R * 0.6 + lx, R * 0.34 + ly, R * 0.15, 0, TAU); ctx.fill();
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = Math.max(1, R * 0.085); ctx.lineCap = 'round';
  if (happy) {
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * R * 0.36 + lx, R * 0.1 + ly, R * 0.14, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  } else {
    const blink = (T % 4.3) < 0.13 ? 0.12 : 1;
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * R * 0.36 + lx, R * 0.04 + ly, R * 0.1, R * 0.15 * blink, 0, 0, TAU); ctx.fill(); }
    if (blink === 1) { ctx.fillStyle = '#fff'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * R * 0.36 + lx - R * 0.03, R * 0.0 + ly - R * 0.04, R * 0.035, 0, TAU); ctx.fill(); } }
  }
  ctx.beginPath(); ctx.arc(lx, R * 0.3 + ly, R * (happy ? 0.16 : 0.1), Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
}
function drawBoard() {
  const tiles = L.tiles, r = S / 2, pad = S * 0.045, rad = S * 0.2, ia = clamp(L.intro / 0.4, 0, 1);
  ctx.globalAlpha = ia; ctx.drawImage(plate, OX - platePad, OY - platePad, plate.width / DPR, plate.height / DPR); ctx.globalAlpha = 1;
  if (TH.dark) {                                          // 夜里：亮起的方块向四周溢出一点暖光
    ctx.globalCompositeOperation = 'lighter';
    for (const t of tiles) if (t && t.glow > 0.02) { ctx.globalAlpha = t.glow * 0.3; ctx.drawImage(GLOW, t.cx - S * 0.95, t.cy - S * 0.95, S * 1.9, S * 1.9); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  // 第一遍：方块本体（整块跟着转）
  for (const t of tiles) {
    if (!t || t.sc <= 0.01) continue;
    const a = (t.r0 + t.ang) * HP, c = Math.cos(a) * DPR * t.sc, s = Math.sin(a) * DPR * t.sc;
    ctx.setTransform(c, s, -s, c, DPR * t.cx, DPR * t.cy);
    if (t.glow < 0.99) ctx.drawImage(SPR[t.stone ? 'sdim' : 'dim'][t.kind], -r, -r, S, S);
    if (t.glow > 0.01) {
      const lit = SPR[t.stone ? 'slit' : 'lit'][t.kind];
      ctx.globalAlpha = t.glow; ctx.drawImage(lit, -r, -r, S, S);
      // 微光从光灵沿着光路一波波往外淌
      const wave = Math.sin(T * 2.8 - t.depth * 0.75);
      if (wave > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = t.glow * wave * 0.16; ctx.drawImage(lit, -r, -r, S, S); ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = 1;
    }
  }
  // 第二遍：不随方块转动的标记
  for (const t of tiles) {
    if (!t || t.sc <= 0.01) continue;
    ctx.setTransform(DPR * t.sc, 0, 0, DPR * t.sc, DPR * t.cx, DPR * t.cy);
    const box = inset => rrPath(ctx, -r + pad + inset, -r + pad + inset, S - 2 * (pad + inset), S - 2 * (pad + inset), rad - inset * 0.6);
    if (t.twinId >= 0) {                                  // 双生砖：同色丝带边 + 一粒珠子
      const col = TWIN[t.twinId];
      box(S * 0.035); ctx.lineWidth = Math.max(1.5, S * 0.045); ctx.strokeStyle = col; ctx.stroke();
      const bx = r - pad - S * 0.1, by = -r + pad + S * 0.1;
      ctx.beginPath(); ctx.arc(bx, by, S * 0.085, 0, TAU); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = Math.max(1, S * 0.025); ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.beginPath(); ctx.arc(bx - S * 0.025, by - S * 0.025, S * 0.025, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
    }
    if (t.wk > 0) { ctx.globalAlpha = t.wk * 0.45; ctx.fillStyle = '#fff'; box(0); ctx.fill(); ctx.globalAlpha = 1; }
    if (t.flash > 0) { ctx.globalAlpha = Math.min(1, t.flash) * 0.6; ctx.fillStyle = '#fff6d8'; box(0); ctx.fill(); ctx.globalAlpha = 1; }
    if (t.i === hover && !L.done && !t.stone) { box(0); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke(); }
    if (t.i === L.guide) {
      const u = (T * 0.9) % 1;
      box(-S * 0.02); ctx.lineWidth = Math.max(2, S * 0.05); ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.4 * Math.sin(T * 5)})`; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, S * (0.12 + 0.34 * u), 0, TAU); ctx.lineWidth = Math.max(1.5, S * 0.035); ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - u)})`; ctx.stroke();
    }
    if (t.lamp) {
      if (t.bt < 1) { ctx.globalAlpha = 1 - t.bt; ctx.drawImage(SPR.bud, -r, -r, S, S); ctx.globalAlpha = 1; }
      if (t.bt > 0) {
        const f = (t.lit ? easeOutBack(t.bt) : t.bt) * (1 + 0.14 * t.wk), a = Math.sin(T * 1.2 + t.ph) * 0.1 - (1 - t.bt) * 0.9 + t.wk * 0.5;
        const c = Math.cos(a) * DPR * t.sc * f, s = Math.sin(a) * DPR * t.sc * f, FS = S * 1.3;
        ctx.setTransform(c, s, -s, c, DPR * t.cx, DPR * t.cy);
        ctx.drawImage(SPR.flower[t.fv], -FS / 2, -FS / 2, FS, FS);
        ctx.setTransform(DPR * t.sc, 0, 0, DPR * t.sc, DPR * t.cx, DPR * t.cy);
      }
    }
    if (t.pin) ctx.drawImage(SPR.leaf, -r + pad - S * 0.06, -r + pad - S * 0.07, S * 0.5, S * 0.5);
  }
  const src = tiles[L.s.src]; if (src.sc > 0.01) drawSpirit(src);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (L.link) {                                           // 双生砖转动时，中间闪过一条丝线
    const a = tiles[L.link.a], b = tiles[L.link.b], mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2, nx = -(b.cy - a.cy) * 0.18, ny = (b.cx - a.cx) * 0.18;
    ctx.globalAlpha = L.link.t; ctx.strokeStyle = TWIN[a.twinId]; ctx.lineWidth = Math.max(2, S * 0.05); ctx.lineCap = 'round'; ctx.setLineDash([S * 0.02, S * 0.14]);
    ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.quadraticCurveTo(mx + nx, my + ny, b.cx, b.cy); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
}
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, W, H);
  drawMotes();
  if (L) drawBoard();
  for (const p of parts) {
    const k = p.life / p.max;
    if (p.type === 'glow') { const s = p.s * (0.5 + 0.5 * k); ctx.globalAlpha = k; ctx.drawImage(GLOW, p.x - s, p.y - s, s * 2, s * 2); }
    else {
      const a = p.rot + T * p.vr, flip = Math.max(0.25, Math.abs(Math.cos(T * 3 + p.rot))), c = Math.cos(a), s = Math.sin(a);
      ctx.setTransform(DPR * c, DPR * s, -DPR * s * flip, DPR * c * flip, DPR * p.x, DPR * p.y);
      ctx.globalAlpha = Math.min(1, k * 2.5) * 0.92; ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.6, 0, 0, TAU); ctx.fill();
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
  }
  ctx.globalAlpha = 1;
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
  return x >= 0 && y >= 0 && x < L.w && y < L.h && L.tiles[y * L.w + x] ? y * L.w + x : -1;
}
// 触屏：轻点 = 转动，长按 = 别叶子。鼠标：左键转、右键反转、Shift/中键别叶子。
let press = null;
function endPress() { if (press) { clearTimeout(press.timer); if (L && L.tiles[press.i]) L.tiles[press.i].held = false; press = null; } }
cv.addEventListener('pointerdown', e => {
  if (mode !== 'play') return;
  A.init();
  const i = pick(e); if (i < 0) return;
  e.preventDefault();
  if (e.pointerType === 'mouse') {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) togglePin(i);
    else if (e.button === 2) rotate(i, -1);
    else if (e.button === 0) rotate(i, 1);
    return;
  }
  endPress();
  L.tiles[i].held = true;
  press = { id: e.pointerId, i, x: e.clientX, y: e.clientY, used: false, timer: setTimeout(() => {
    if (!press || press.used || !L) return;
    press.used = true; L.tiles[press.i].held = false; togglePin(press.i);
    if (navigator.vibrate) navigator.vibrate(12);
  }, 420) };
});
cv.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { hover = mode === 'play' ? pick(e) : -1; cv.style.cursor = hover >= 0 && !L.tiles[hover].stone ? 'pointer' : 'default'; return; }
  if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 18) endPress();
});
cv.addEventListener('pointerup', e => {
  if (!press || e.pointerId !== press.id) return;
  const p = press; endPress();
  if (!p.used && mode === 'play' && pick(e) === p.i) rotate(p.i, 1);
});
cv.addEventListener('pointercancel', endPress);
cv.addEventListener('pointerleave', () => { hover = -1; });
cv.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
window.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

function syncMute() { for (const id of ['btnMute', 'btnMuteC']) $(id).classList.toggle('off', A.muted); }
function toggleMute() { A.setMuted(!A.muted); syncMute(); }
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  const k = e.code;
  if (k === 'KeyM') { toggleMute(); return; }
  if (mode === 'play') {
    if (k === 'KeyZ') undo(); else if (k === 'KeyH') hint(); else if (k === 'KeyR') restart(); else if (k === 'Escape') toSelect();
  } else if (mode === 'win') {
    if (k === 'Enter' || k === 'Space') { e.preventDefault(); next(); } else if (k === 'KeyR') restart(); else if (k === 'Escape') toSelect();
  } else if (mode === 'select') { if (k === 'Escape') toCover(); }
  else if (k === 'Enter') { e.preventDefault(); $('btnPlay').click(); }
});
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });
const on = (id, fn) => { $(id).onclick = () => { A.init(); A.ui(); fn(); }; };
on('btnPlay', () => { if (LEVELS.every((_, i) => save.stars[i] > 0)) toSelect(); else startLevel(current()); });
on('btnLevels', toSelect); on('btnEndless', () => startLevel(-1)); on('btnSelBack', toCover);
on('btnBack', toSelect); on('btnMute', toggleMute); on('btnMuteC', toggleMute);
on('btnUndo', undo); on('btnHint', hint); on('btnReset', restart);
on('btnNext', next); on('btnRetry', restart); on('btnMenu', toSelect);

// 自检接口：tests/e2e 与控制台调试用
window.__lumen = {
  get level() { return L; }, get mode() { return mode; }, get save() { return save; },
  start: startLevel, rotate, undo, hint, togglePin, toCover, toSelect,
  step(sec) { for (let t = 0; t < sec; t += 0.04) { T += 0.04; update(0.04); } },
  cellXY(i) { return { x: OX + (i % L.w + 0.5) * S, y: OY + (((i / L.w) | 0) + 0.5) * S, size: S }; },
};

// 离线可玩（仅 https / localhost 下生效）
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* 忽略 */ }); });
}

syncMute(); resize(); toCover(); requestAnimationFrame(frame);
})();
