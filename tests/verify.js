// 引光 · 关卡自检：node tests/verify.js
//   逐关验证「一定能通关」，并打印难度曲线。
//   node tests/verify.js show          同时打印每关的答案与开局
//   node tests/verify.js scan 3 40     给第 3 关试 40 个种子，挑选关卡时用
'use strict';
const C = require('../core.js');
const { LEVELS, CHAPTERS, build, flood, solved, turn, needs, nextHint, rotMask, bits, rng, DX, DY } = C;

const GLYPH = { 0: ' ', 1: '╵', 2: '╶', 4: '╷', 8: '╴', 5: '│', 10: '─', 3: '└', 6: '┌', 12: '┐', 9: '┘', 7: '├', 14: '┬', 13: '┤', 11: '┴', 15: '┼' };
function ascii(s, useRot) {
  const rows = [];
  for (let y = 0; y < s.h; y++) {
    let r = '';
    for (let x = 0; x < s.w; x++) {
      const i = y * s.w + x;
      if (!s.cell[i]) { r += '  '; continue; }
      const g = GLYPH[useRot ? rotMask(s.base[i], s.rot[i]) : s.base[i]];
      r += g + (i === s.src ? '*' : s.fixed[i] ? '#' : s.twin[i] >= 0 ? 'abc'[s.twinId[i]] : ' ');
    }
    rows.push(r);
  }
  return rows;
}

function metrics(s) {
  let tees = 0, crosses = 0, wrong = 0, stones = 0, twins = 0;
  for (let i = 0; i < s.n; i++) {
    if (!s.cell[i]) continue;
    const b = bits(s.base[i]);
    if (b === 3) tees++; if (b === 4) crosses++;
    if (rotMask(s.base[i], s.rot[i]) !== s.base[i]) wrong++;
    if (s.fixed[i]) stones++; if (s.twin[i] > i) twins++;
  }
  return { cells: s.total, lamps: s.lamps, tees, crosses, wrong, stones, twins, par: s.par, startLit: s.litCount };
}

// 所有检查；返回错误列表（空 = 通过）
function check(def) {
  const errs = [], fail = m => errs.push(m);
  let s;
  try { s = build(def); } catch (e) { return { errs: [e.message] }; }
  const { w, h, n } = s;

  // 1. 答案是一棵覆盖全盘的树：连接成对、不出界、不连到空格，边数 = 格子数 - 1
  let edges = 0;
  for (let i = 0; i < n; i++) {
    if (!s.cell[i]) { if (s.base[i]) fail(`空格 ${i} 上有光路`); continue; }
    for (let d = 0; d < 4; d++) {
      if (!(s.base[i] >> d & 1)) continue;
      const x = i % w + DX[d], y = ((i / w) | 0) + DY[d];
      if (x < 0 || y < 0 || x >= w || y >= h) { fail(`格 ${i} 的出口朝向界外`); continue; }
      const j = y * w + x;
      if (!s.cell[j] || !(s.base[j] >> ((d + 2) % 4) & 1)) fail(`格 ${i}→${j} 连接不成对`);
      edges++;
    }
  }
  if (edges !== 2 * (s.total - 1)) fail(`边数 ${edges / 2} ≠ ${s.total - 1}，不是树`);

  // 2. 答案摆法确实全亮
  const a = build(def); a.rot.fill(0); flood(a);
  if (!solved(a)) fail('答案摆法没有全部点亮');

  // 3. 开局没有直接通关，且确实有需要转的方块
  const m = metrics(s);
  if (solved(s)) fail('开局已通关');
  if (m.wrong < 1) fail('开局没有需要转动的方块');
  if (m.stones !== (def.stones || 0)) fail(`苔石数 ${m.stones} ≠ ${def.stones || 0}`);
  if (m.twins !== (def.twins || 0)) fail(`双生砖 ${m.twins} 对 ≠ ${def.twins || 0}`);
  if (s.lamps < 1) fail('没有花灯');

  // 4. 两次生成完全一致（玩家每次看到的是同一关）
  const b = build(def);
  for (let i = 0; i < n; i++) if (b.rot[i] !== s.rot[i] || b.base[i] !== s.base[i] || b.fixed[i] !== s.fixed[i] || b.twin[i] !== s.twin[i]) { fail('生成结果不稳定'); break; }

  // 5. 苔石转不动；双生砖联动，且反向转一下能复原
  for (let i = 0; i < n; i++) {
    if (!s.cell[i]) continue;
    const before = Array.from(s.rot);
    const g = turn(s, i, 1);
    if (s.fixed[i]) { if (g !== null || before.some((v, k) => v !== s.rot[k])) fail(`苔石 ${i} 被转动了`); continue; }
    if (s.twin[i] >= 0 && (g.length !== 2 || s.rot[s.twin[i]] !== before[s.twin[i]] + 1)) fail(`双生砖 ${i} 没有联动`);
    turn(s, i, -1);
    if (before.some((v, k) => v !== s.rot[k])) fail(`格 ${i} 转动后无法复原`);
  }

  // 6. 只用「顺时针轻点」（手机上唯一的操作）照着提示走，一定通关，步数恰为标称最少步数
  let clicks = 0, guard = 0, stepsLit = [], seqOk = true, prevLit = s.litCount;
  while (!solved(s) && guard++ < 1000) {
    const i = nextHint(s); if (i < 0) break;
    const k = needs(s, i); if (k <= 0) { fail(`提示指向了无法转正的格 ${i}`); break; }
    for (let c = 0; c < k; c++) turn(s, i, 1);
    clicks += k;
    if (s.litCount < prevLit) seqOk = false; prevLit = s.litCount; stepsLit.push(s.litCount);
  }
  if (!solved(s)) fail('照提示走完仍未通关');
  if (clicks !== m.par && solved(s) && nextHint(s) < 0) fail(`提示步数 ${clicks} ≠ 标称 ${m.par}`);
  m.hintClicks = clicks; m.seq = seqOk;

  // 7. 乱点一通之后（顺/逆时针、任意格），照样能通关 —— 不存在把关卡玩死的走法
  const R = rng(def.seed * 7919 + 13), f = build(def);
  for (let round = 0; round < 30; round++) {
    for (let t = 0; t < 200; t++) turn(f, (R() * n) | 0, R() < 0.7 ? 1 : -1);
    let g2 = 0;
    while (g2++ < 1000) { const i = nextHint(f); if (i < 0) break; const k = needs(f, i); if (k <= 0) break; for (let c = 0; c < k; c++) turn(f, i, 1); }
    if (!solved(f)) { fail(`乱点第 ${round + 1} 轮后无法通关`); break; }
  }

  // 8. 小棋盘穷举所有摆法，确认真正的最少步数（标称值不能比它小）
  const groups = [];
  const e = build(def);
  for (let i = 0; i < n; i++) if (e.cell[i] && !e.fixed[i] && (e.twin[i] < 0 || e.twin[i] > i)) groups.push(i);
  if (groups.length <= 9) {
    const start = Array.from(e.rot); let best = 1e9, sols = 0;
    for (let code = 0; code < Math.pow(4, groups.length); code++) {
      let c = code, cost = 0;
      for (let k = 0; k < n; k++) e.rot[k] = start[k];
      for (const g of groups) { const r = c & 3; c >>= 2; cost += r; e.rot[g] += r; if (e.twin[g] >= 0) e.rot[e.twin[g]] += r; }
      flood(e);
      if (solved(e)) { sols++; best = Math.min(best, cost); }
    }
    if (!sols) fail('穷举：无解');
    if (best > m.par) fail(`穷举最少 ${best} 步 > 标称 ${m.par}`);
    m.brute = best;
  }
  return { errs, m, s: build(def) };
}

// ---------- 入口 ----------
const [, , cmd, a1, a2] = process.argv;
if (cmd === 'scan') {
  const idx = +a1 - 1, count = +a2 || 30, def = LEVELS[idx];
  console.log(`第 ${idx + 1} 关「${def.name}」种子扫描`);
  for (let seed = 1; seed <= count; seed++) {
    const r = check(Object.assign({}, def, { seed }));
    if (r.errs.length) { console.log(String(seed).padStart(3), '✗', r.errs[0]); continue; }
    const m = r.m;
    console.log(String(seed).padStart(3), `灯${String(m.lamps).padStart(2)} 三岔${String(m.tees).padStart(2)} 十字${m.crosses} 待转${String(m.wrong).padStart(2)} 最少${String(m.par).padStart(3)} 开局亮${String(m.startLit).padStart(2)}/${m.cells}`, ' ', ascii(r.s, false).join(' | '));
  }
  process.exit(0);
}

let bad = 0;
console.log('关  名称     尺寸  格数 花灯 三岔 十字 苔石 双生 待转 最少步 开局亮  结果');
LEVELS.forEach((def, i) => {
  if (i % 5 === 0) console.log(`—— ${CHAPTERS[i / 5].sub} ${CHAPTERS[i / 5].name} ——`);
  const r = check(def), m = r.m || {};
  const ok = !r.errs.length; if (!ok) bad++;
  const pad = (v, k) => String(v == null ? '-' : v).padStart(k);
  const name = def.name + '　'.repeat(4 - def.name.length);
  console.log(`${pad(i + 1, 2)}  ${name} ${def.w}×${def.h} ${pad(m.cells, 4)} ${pad(m.lamps, 4)} ${pad(m.tees, 4)} ${pad(m.crosses, 4)} ${pad(m.stones, 4)} ${pad(m.twins, 4)} ${pad(m.wrong, 4)} ${pad(m.par, 5)} ${pad(m.startLit, 4)}/${m.cells}  ${ok ? '✓ 可通关' + (m.brute != null ? `（穷举最少 ${m.brute}）` : '') : '✗ ' + r.errs.join('；')}`);
  if (cmd === 'show' && r.s) {
    const A = ascii(r.s, false), B = ascii(r.s, true);
    A.forEach((row, y) => console.log('      ' + row + '      ' + B[y]));
    console.log('      (左：答案   右：开局   * 光灵  # 苔石  a/b/c 双生砖)');
  }
});
// 无尽花园：随机抽 400 座，同样全套检查
let badEndless = 0;
for (let k = 1; k <= 400; k++) {
  const def = C.endless(k * 2654435761 % 268435455), r = check(def);
  if (r.errs.length) { badEndless++; if (badEndless <= 5) console.log(`✗ 无尽 种子 ${def.seed}（${def.w}×${def.h}）：${r.errs.join('；')}`); }
}
console.log(badEndless ? `\n✗ 无尽花园 400 座中有 ${badEndless} 座未通过` : '\n✓ 无尽花园随机 400 座全部可通关');
bad += badEndless;

console.log(bad ? `✗ 共 ${bad} 项未通过` : `✓ ${LEVELS.length} 关全部通过：答案有效、开局未解、照提示可通关、乱点后仍可通关`);
process.exit(bad ? 1 : 0);
