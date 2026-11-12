// 选种子用的小工具：node tests/pick.js
// 对每一关在 1..N 的种子里统计花灯数分布，并列出符合「目标难度」的候选。
'use strict';
const { LEVELS, build, bits, rotMask } = require('../core.js');

// 每关的目标区间：[花灯min, 花灯max, 三岔max, 开局亮max, 多余步数max(最少步 - 待转块数)]
const TARGET = [
  [1, 1, 0, 2, 0], [2, 2, 1, 2, 1], [2, 3, 1, 3, 2], [3, 4, 2, 4, 3], [4, 5, 3, 5, 5],
  [6, 7, 5, 4, 99], [7, 8, 6, 6, 99], [9, 10, 8, 6, 99], [10, 12, 10, 6, 99], [10, 12, 10, 6, 99],
  [9, 11, 9, 5, 99], [10, 11, 9, 5, 99], [12, 13, 11, 5, 99], [13, 14, 12, 5, 99], [13, 15, 13, 5, 99],
  [15, 17, 15, 5, 99], [17, 19, 17, 5, 99], [13, 16, 14, 4, 99], [19, 22, 20, 4, 99], [21, 24, 22, 4, 99],
];
const N = +process.argv[2] || 300;

LEVELS.forEach((def, li) => {
  const [lo, hi, teeMax, litMax, extraMax] = TARGET[li], hist = {}, hits = [];
  for (let seed = 1; seed <= N; seed++) {
    let s; try { s = build(Object.assign({}, def, { seed })); } catch (e) { continue; }
    let tees = 0, crosses = 0, wrong = 0, srcDeg = bits(s.base[s.src]);
    for (let i = 0; i < s.n; i++) {
      if (!s.cell[i]) continue;
      const b = bits(s.base[i]); if (b === 3) tees++; if (b === 4) crosses++;
      if (rotMask(s.base[i], s.rot[i]) !== s.base[i]) wrong++;
    }
    hist[s.lamps] = (hist[s.lamps] || 0) + 1;
    if (s.lamps >= lo && s.lamps <= hi && tees <= teeMax && s.litCount <= litMax && s.par - wrong <= extraMax && crosses <= (def.maxDeg === 4 ? 3 : 0))
      hits.push(`${seed}(灯${s.lamps} 岔${tees} 十${crosses} 转${wrong} 步${s.par} 亮${s.litCount} 源${srcDeg})`);
  }
  console.log(`${String(li + 1).padStart(2)} ${def.name}  花灯分布 ${Object.keys(hist).map(k => k + ':' + hist[k]).join(' ')}`);
  console.log('   候选: ' + (hits.slice(0, 8).join('  ') || '无'));
});
