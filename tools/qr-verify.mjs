// 二维码编码器正确性验证：生成矩阵后按 QR 规范反向解码，
// 断言解出的字节与输入完全一致。同时覆盖各版本、各纠错等级。
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const src = readFileSync(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '../assets/js/tools/qrcode.js'), 'utf8');

// 只取编码核心部分（到 "/* ---------------- UI" 之前），避免触碰 DOM
const core = src.slice(0, src.indexOf('/* ---------------- UI'));
// 去掉 export 前缀与 import 语句，挂到沙箱里
const code = core
  .replace(/^\s*import[^;]*;\s*$/gm, '')
  .replace(/^\s*export\s+/gm, '');

const sandbox = { TextEncoder, TextDecoder };
vm.createContext(sandbox);
new vm.Script(code + '\n;this.makeQR = makeQR;').runInContext(sandbox);
const { makeQR } = sandbox;

/* ---------- 反向解码器 ---------- */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
// 独立的表（不引用被测代码，避免自证）
const EC_REV = {
  1: [[7,1],[10,1],[13,1],[17,1]],
  2: [[10,1],[16,1],[22,1],[28,1]],
  3: [[15,1],[26,1],[18,2],[22,2]],
  4: [[20,1],[18,2],[26,2],[16,4]],
  5: [[26,1],[24,2],[18,4],[22,4]],
  6: [[18,2],[16,4],[24,4],[28,4]],
  7: [[20,2],[18,4],[18,6],[26,5]],
  8: [[24,2],[22,4],[22,6],[26,6]],
  9: [[30,2],[22,5],[20,8],[24,8]],
  10:[[18,4],[26,5],[24,8],[28,8]],
};
const TOTAL_REV = {1:26,2:44,3:70,4:100,5:134,6:172,7:196,8:242,9:292,10:346};
const ALIGN_REV = {1:[],2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]};

function isFunction(ver, size, r, c) {
  if (r < 9 && c < 9) return true;
  if (r < 9 && c >= size - 8) return true;
  if (r >= size - 8 && c < 9) return true;
  if (r === 6 || c === 6) return true;
  for (const ar of ALIGN_REV[ver]) for (const ac of ALIGN_REV[ver]) {
    if ((ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 9) || (ar >= size - 9 && ac <= 8)) continue;
    if (Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) return true;
  }
  if (ver >= 7) {
    if (r >= size - 11 && r <= size - 9 && c <= 5) return true;
    if (c >= size - 11 && c <= size - 9 && r <= 5) return true;
  }
  return false;
}

const MASKS = [
  (r,c)=> (r+c)%2===0,
  (r)=> r%2===0,
  (r,c)=> c%3===0,
  (r,c)=> (r+c)%3===0,
  (r,c)=> (Math.floor(r/2)+Math.floor(c/3))%2===0,
  (r,c)=> (r*c)%2 + (r*c)%3 === 0,
  (r,c)=> ((r*c)%2 + (r*c)%3)%2 === 0,
  (r,c)=> ((r+c)%2 + (r*c)%3)%2 === 0,
];

function readFormat(m, size) {
  // 读第一份格式信息，取纠错位与掩码号
  let bits = 0;
  const g = (r,c) => m[r][c];
  for (let i = 0; i <= 5; i++) bits |= g(8, i) << i;
  bits |= g(8, 7) << 6;
  bits |= g(8, 8) << 7;
  bits |= g(7, 8) << 8;
  for (let i = 9; i <= 14; i++) bits |= g(14 - i, 8) << i;
  const raw = bits >>> 10;          // 高 5 位：ecl(2) + mask(3)
  // ISO 格式信息的纠错等级编码与 EC_TABLE 的索引顺序不同：
  //   ISO:  L=01  M=00  Q=11  H=10
  //   表索引: L=0   M=1   Q=2   H=3
  const ISO_TO_IDX = { 1: 0, 0: 1, 3: 2, 2: 3 };
  return { ecl: ISO_TO_IDX[raw >> 3], mask: raw & 7 };
}

function decode(matrix) {
  const size = matrix.length;
  const ver = (size - 17) / 4;
  if (!Number.isInteger(ver) || ver < 1) throw new Error('size 非法: ' + size);

  const fmt = readFormat(matrix, size);
  // 取掩码后的矩阵（格子数据位已带掩码），先反掩码
  const un = matrix.map(row => row.slice());
  const fn = MASKS[fmt.mask];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (!isFunction(ver, size, r, c)) un[r][c] ^= fn(r, c) ? 1 : 0;
  }

  // 之字形读取比特
  const bits = [];
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let k = 0; k < size; k++) {
      const row = up ? size - 1 - k : k;
      for (const c of [col, col - 1]) {
        if (!isFunction(ver, size, row, c)) bits.push(un[row][c]);
      }
    }
    up = !up;
  }
  const total = TOTAL_REV[ver];
  if (bits.length < total * 8) throw new Error(`数据位不足: ${bits.length} < ${total*8}`);
  const cw = [];
  for (let i = 0; i < total * 8; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    cw.push(v);
  }

  // 去交错：数据段按「第 i 个码字在第 b 块」逐列读取
  const [ecPer, blocks] = EC_REV[ver][fmt.ecl];
  const dataWords = total - ecPer * blocks;
  const shortLen = Math.floor(dataWords / blocks);
  const numLong = dataWords % blocks;
  const lens = [];
  for (let b = 0; b < blocks; b++) lens.push(shortLen + (b >= blocks - numLong ? 1 : 0));

  const dataBlocks = lens.map(() => []);
  let p = 0;
  for (let i = 0; i < shortLen; i++) {
    for (let b = 0; b < blocks; b++) dataBlocks[b][i] = cw[p++];
  }
  // 长块多出的那个码字，紧跟在所有短列之后按块顺序排列
  for (let b = blocks - numLong; b < blocks; b++) dataBlocks[b][shortLen] = cw[p++];

  const data = [];
  for (const blk of dataBlocks) for (const x of blk) data.push(x);

  // 解析 bit 流
  const dbits = [];
  for (const b of data) for (let i = 7; i >= 0; i--) dbits.push((b >>> i) & 1);
  let idx = 0;
  const take = n => { let v = 0; for (let i = 0; i < n; i++) v = (v << 1) | dbits[idx++]; return v; };

  const mode = take(4);
  if (mode !== 0b0100) throw new Error('不是字节模式，mode=' + mode.toString(2));
  const countLen = ver < 10 ? 8 : 16;
  const count = take(countLen);
  const out = [];
  for (let i = 0; i < count; i++) out.push(take(8));
  return { ver, ecl: fmt.ecl, mask: fmt.mask, count, bytes: Uint8Array.from(out) };
}

/* ---------- 用例 ---------- */
const cases = [
  'a',
  'hello',
  'https://jideyykaixin.github.io/talos/',
  '中文测试：二维码生成器 ✓',
  'x'.repeat(40),
  'y'.repeat(120),
  'z'.repeat(200),
];

let fail = 0;
for (const text of cases) {
  for (const ecl of ['L', 'M', 'Q', 'H']) {
    let res;
    try {
      res = makeQR(text, { ecl });
    } catch (e) {
      // 超容量属于预期（H 等级装不下长文本），只在 L 下算失败
      if (/太长/.test(e.message) && ecl !== 'L') { console.log(`SKIP v?-${ecl} len=${text.length} (容量不足)`); continue; }
      fail++; console.log(`FAIL ${ecl} len=${text.length}: ${e.message}`); continue;
    }
    const size = res.matrix.length;
    // 断言：行列数与版本一致
    const expectSize = 17 + res.version * 4;
    if (size !== expectSize) { fail++; console.log(`FAIL 尺寸 ${size} != ${expectSize}`); continue; }
    // 断言：矩阵每行等长、只有 0/1
    if (!res.matrix.every(r => r.length === size && r.every(v => v === 0 || v === 1))) {
      fail++; console.log('FAIL 矩阵含非法值'); continue;
    }
    try {
      const d = decode(res.matrix);
      const want = new TextEncoder().encode(text);
      const same = d.bytes.length === want.length && d.bytes.every((v, i) => v === want[i]);
      if (!same) { fail++; console.log(`FAIL 解码不一致 ${ecl} v${res.version}`); continue; }
      console.log(`OK   ${ecl} v${String(res.version).padStart(2)} mask${d.mask} ${String(want.length).padStart(3)}B  ` +
                  JSON.stringify(text.slice(0, 22)));
    } catch (e) {
      fail++; console.log(`FAIL 解码异常 ${ecl} v${res.version}: ${e.message}`);
    }
  }
}

// 定位图形与暗模块检查（用小尺寸码做，注意 n≥21 才safe取样）
const q = makeQR('test', { ecl: 'M' });
const m = q.matrix, n = m.length;
const zig = (len, i) => Array.from({ length: len }, (_, k) => k).map(k => k * 2);
const checks = [
  ['左上定位', m[0][0] === 1 && m[0][6] === 1 && m[6][0] === 1 && m[3][3] === 1 && m[1][1] === 0],
  ['右上定位', m[0][n-1] === 1 && m[0][n-7] === 1 && m[6][n-1] === 1],
  ['左下定位', m[n-1][0] === 1 && m[n-7][0] === 1 && m[n-1][6] === 1],
  ['定时行', zig(n - 16, 0).every(i => m[6][8 + i] === 1)],
  ['定时列', zig(n - 16, 0).every(i => m[8 + i][6] === 1)],
  ['暗模块', m[n-8][8] === 1],
];
for (const [name, ok] of checks) {
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}`);
}

console.log(fail ? `\n✗ ${fail} 处失败` : '\n✓ 二维码编码器全部通过');
// 仅当显式给出输出路径时才落盘，避免在仓库里产生垃圾文件
if (process.argv[3]) {
  writeFileSync(process.argv[3], fail ? `FAIL ${fail}\n` : 'ALL PASS\n');
}
process.exit(fail ? 1 : 0);

