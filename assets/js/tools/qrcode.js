/* 工具 4：二维码生成
 * 自带极简 QR 编码器：字节模式 + Reed-Solomon 纠错 + 8 种掩码择优 + 版本 1..10。
 * 不依赖任何 CDN 或外部库。
 */
import { el, copyText, toast } from '../core/dom.js';

/* ---------------- QR 编码核心 ---------------- */

// 每块纠错码字数 / 块数  [版本][等级 0=L 1=M 2=Q 3=H]
const EC_TABLE = {
  // 版本: [ [ecPerBlock, blocks], ... ]  L, M, Q, H
  1:  [[7,1],[10,1],[13,1],[17,1]],
  2:  [[10,1],[16,1],[22,1],[28,1]],
  3:  [[15,1],[26,1],[18,2],[22,2]],
  4:  [[20,1],[18,2],[26,2],[16,4]],
  5:  [[26,1],[24,2],[18,4],[22,4]],
  6:  [[18,2],[16,4],[24,4],[28,4]],
  7:  [[20,2],[18,4],[18,6],[26,5]],
  8:  [[24,2],[22,4],[22,6],[26,6]],
  9:  [[30,2],[22,5],[20,8],[24,8]],
  10: [[18,4],[26,5],[24,8],[28,8]],
};

// 每版本的总码字数
const TOTAL_CODEWORDS = {
  1:26, 2:44, 3:70, 4:100, 5:134, 6:172, 7:196, 8:242, 9:292, 10:346,
};

// 对齐图形中心坐标
const ALIGN = {
  1:[], 2:[6,18], 3:[6,22], 4:[6,26], 5:[6,30],
  6:[6,34], 7:[6,22,38], 8:[6,24,42], 9:[6,26,46], 10:[6,28,50],
};

const ECL = { L:0, M:1, Q:2, H:3 };
const ECL_BITS = { L:1, M:0, Q:3, H:2 };   // 格式信息里的纠错等级编码

/* GF(256) 表 */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

/* 生成多项式 */
function rsPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/* 计算纠错码字
 * gen 是次数为 ecCount 的生成多项式，系数数组长度为 ecCount + 1，gen[0] 恒为 1（哨兵）。
 * 每处理一个数据字节，就把寄存器的首字节消去，再把"商 × gen[1..]"折回寄存器。
 */
function rsEncode(data, ecCount) {
  const gen = rsPoly(ecCount);
  const res = new Array(ecCount).fill(0);
  for (const b of data) {
    const factor = b ^ res[0];
    for (let i = 0; i < ecCount; i++) {
      res[i] = res[i + 1] ^ gfMul(gen[i + 1], factor);
    }
    res[ecCount - 1] = gfMul(gen[ecCount], factor);
  }
  return res;
}

/* 位缓冲 */
class BitBuffer {
  constructor() { this.bits = []; }
  put(val, len) {
    for (let i = len - 1; i >= 0; i--) this.bits.push((val >>> i) & 1);
  }
  get length() { return this.bits.length; }
}

/* 数据容量（字节数） */
function capacity(ver, ecl) {
  const [ecPer, blocks] = EC_TABLE[ver][ecl];
  const dataWords = TOTAL_CODEWORDS[ver] - ecPer * blocks;
  const headerBits = 4 + (ver < 10 ? 8 : 16);
  return Math.floor((dataWords * 8 - headerBits) / 8);
}

function pickVersion(byteLen, minVer) {
  for (let v = Math.max(1, minVer); v <= 40; v++) {
    if (v > 10) break;     // 本实现支持到版本 10（约 271 字节 / L）
    for (const [eclName, eclIdx] of [['L',0],['M',1],['Q',2],['H',3]]) {
      if (capacity(v, eclIdx) >= byteLen) return { ver: v, ecl: eclIdx, eclName };
    }
  }
  return null;
}

/* 编码为码字序列 */
function encodeData(bytes, ver, ecl) {
  const [ecPer, blocks] = EC_TABLE[ver][ecl];
  const dataWords = TOTAL_CODEWORDS[ver] - ecPer * blocks;
  const bb = new BitBuffer();
  bb.put(0b0100, 4);                       // 字节模式
  bb.put(bytes.length, ver < 10 ? 8 : 16); // 字符计数
  for (const b of bytes) bb.put(b, 8);
  const cap = dataWords * 8;
  if (bb.length > cap) throw new Error('数据超出容量');
  // 终止符 + 补零对齐
  bb.put(0, Math.min(4, cap - bb.length));
  while (bb.length % 8 !== 0) bb.bits.push(0);
  const data = [];
  for (let i = 0; i < bb.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bb.bits[i + j];
    data.push(v);
  }
  const padBytes = [0xEC, 0x11];
  for (let i = 0; data.length < dataWords; i++) data.push(padBytes[i % 2]);

  // 分块 + 纠错
  const totalBlocks = blocks;
  const shortLen = Math.floor(dataWords / totalBlocks);
  const numLong = dataWords % totalBlocks;
  const dataBlocks = [];
  const ecBlocks = [];
  let pos = 0;
  for (let i = 0; i < totalBlocks; i++) {
    const len = shortLen + (i >= totalBlocks - numLong ? 1 : 0);
    const blk = data.slice(pos, pos + len);
    pos += len;
    dataBlocks.push(blk);
    ecBlocks.push(rsEncode(blk, ecPer));
  }
  // 交错
  const out = [];
  const maxLen = shortLen + (numLong > 0 ? 1 : 0);
  for (let i = 0; i < maxLen; i++) {
    for (const blk of dataBlocks) if (i < blk.length) out.push(blk[i]);
  }
  for (let i = 0; i < ecPer; i++) {
    for (const blk of ecBlocks) out.push(blk[i]);
  }
  return out;
}

/* 功能图形 + 数据填充 */
function buildMatrix(ver, eclIdx, codewords) {
  const size = 17 + ver * 4;
  const m = Array.from({ length: size }, () => new Array(size).fill(null));

  const finder = (r, c) => {
    for (let i = -1; i <= 7; i++) {
      for (let j = -1; j <= 7; j++) {
        const rr = r + i, cc = c + j;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const on = (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
                   (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
                   (i >= 2 && i <= 4 && j >= 2 && j <= 4);
        m[rr][cc] = on ? 1 : 0;
      }
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  // 定时图形
  for (let i = 8; i < size - 8; i++) {
    if (m[6][i] === null) m[6][i] = (i % 2 === 0) ? 1 : 0;
    if (m[i][6] === null) m[i][6] = (i % 2 === 0) ? 1 : 0;
  }

  // 对齐图形
  const pos = ALIGN[ver];
  for (const r of pos) {
    for (const c of pos) {
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
      for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
          const on = Math.max(Math.abs(i), Math.abs(j)) !== 1;
          m[r + i][c + j] = on ? 1 : 0;
        }
      }
    }
  }

  // 预留格式信息区
  const reserve = (r, c) => { if (m[r][c] === null) m[r][c] = 0; };
  for (let i = 0; i <= 8; i++) { reserve(i, 8); reserve(8, i); }
  for (let i = 0; i < 8; i++) { reserve(8, size - 1 - i); reserve(size - 1 - i, 8); }
  // 暗模块
  m[size - 8][8] = 1;

  // 版本信息（版本 >= 7）
  if (ver >= 7) {
    let d = ver;
    for (let i = 0; i < 12; i++) d = (d << 1) ^ ((d >>> 11) * 0x1F25);
    const bits = ((ver << 12) | d) & 0xFFFFFF;
    for (let i = 0; i < 18; i++) {
      const on = (bits >>> i) & 1;
      const a = Math.floor(i / 3), b = i % 3;
      m[size - 11 + b][a] = on;
      m[a][size - 11 + b] = on;
    }
  }

  // 数据填充（之字形）
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  const getBit = i => {
    if (i >= totalBits) return 0;
    return (codewords[i >>> 3] >>> (7 - (i & 7))) & 1;
  };
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;   // 跳过定时列
    for (let k = 0; k < size; k++) {
      const row = up ? size - 1 - k : k;
      for (const c of [col, col - 1]) {
        if (m[row][c] === null) {
          m[row][c] = getBit(bitIdx++);
        }
      }
    }
    up = !up;
  }
  return m;
}

/* 掩码 */
const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
  (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
];

function isFunctionModule(ver, size, r, c) {
  if (r < 9 && c < 9) return true;
  if (r < 9 && c >= size - 8) return true;
  if (r >= size - 8 && c < 9) return true;
  if (r === 6 || c === 6) return true;
  const pos = ALIGN[ver];
  for (const ar of pos) for (const ac of pos) {
    if ((ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 9) || (ar >= size - 9 && ac <= 8)) continue;
    if (Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) return true;
  }
  if (ver >= 7) {
    if (r >= size - 11 && r <= size - 9 && c <= 5) return true;
    if (c >= size - 11 && c <= size - 9 && r <= 5) return true;
  }
  return false;
}

function applyMask(m, ver, maskIdx, eclIdx) {
  const size = m.length;
  const out = m.map(row => row.slice());
  const fn = MASKS[maskIdx];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isFunctionModule(ver, size, r, c)) {
        out[r][c] ^= fn(r, c) ? 1 : 0;
      }
    }
  }
  // 写入格式信息
  const eclBits = ECL_BITS[Object.keys(ECL_BITS)[eclIdx]];
  let fmt = (eclBits << 3) | maskIdx;
  let d = fmt << 10;
  for (let i = 0; i < 10; i++) d = (d << 1) ^ ((d >>> 9) * 0x537);
  const bits = ((fmt << 10) | (d & 0x3FF)) & 0x7FFF;

  for (let i = 0; i <= 5; i++) out[8][i] = (bits >>> i) & 1;
  out[8][7] = (bits >>> 6) & 1;
  out[8][8] = (bits >>> 7) & 1;
  out[7][8] = (bits >>> 8) & 1;
  for (let i = 9; i <= 14; i++) out[14 - i][8] = (bits >>> i) & 1;

  for (let i = 0; i <= 7; i++) out[size - 1 - i][8] = (bits >>> i) & 1;
  for (let i = 8; i <= 14; i++) out[8][size - 15 + i] = (bits >>> i) & 1;
  out[size - 8][8] = 1;
  return out;
}

/* 掩码罚分 */
function penalty(m) {
  const size = m.length;
  let score = 0;
  // 规则1：连续同色
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      if (m[r][c] === m[r][c - 1]) run++;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
    if (run >= 5) score += run - 2;
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r < size; r++) {
      if (m[r][c] === m[r - 1][c]) run++;
      else { if (run >= 5) score += run - 2; run = 1; }
    }
    if (run >= 5) score += run - 2;
  }
  // 规则2：2x2 同色块
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c+1] && v === m[r+1][c] && v === m[r+1][c+1]) score += 3;
    }
  }
  // 规则3：类定位图形
  const pat1 = [1,0,1,1,1,0,1,0,0,0,0];
  const pat2 = [0,0,0,0,1,0,1,1,1,0,1];
  const seq = (get) => {
    for (let s = 0; s + 11 <= size; s++) {
      let a = true, b = true;
      for (let i = 0; i < 11; i++) {
        const v = get(s + i);
        if (v !== pat1[i]) a = false;
        if (v !== pat2[i]) b = false;
      }
      if (a) score += 40;
      if (b) score += 40;
    }
  };
  for (let r = 0; r < size; r++) seq(i => m[r][i]);
  for (let c = 0; c < size; c++) seq(i => m[i][c]);
  // 规则4：暗色比例
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
  const ratio = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10;
  return score;
}

/* 对外：文本 → 二维 0/1 矩阵 */
export function makeQR(text, opts = {}) {
  const bytes = new TextEncoder().encode(text);
  const minVer = Math.max(1, Math.min(10, opts.minVersion || 1));
  const forced = opts.ecl && ECL[opts.ecl] != null ? opts.ecl : null;

  let ver, eclIdx;
  if (forced) {
    eclIdx = ECL[forced];
    for (ver = minVer; ver <= 10; ver++) {
      if (capacity(ver, eclIdx) >= bytes.length) break;
    }
    if (ver > 10) throw new Error('内容太长：版本 10 也放不下，请缩短文本');
  } else {
    const pick = pickVersion(bytes.length, minVer);
    if (!pick) throw new Error('内容太长：版本 10 也放不下，请缩短文本');
    ver = pick.ver; eclIdx = pick.ecl;
  }

  const codewords = encodeData(bytes, ver, eclIdx);
  const base = buildMatrix(ver, eclIdx, codewords);

  let best = null, bestScore = Infinity;
  for (let k = 0; k < 8; k++) {
    const masked = applyMask(base, ver, k, eclIdx);
    const s = penalty(masked);
    if (s < bestScore) { bestScore = s; best = masked; }
  }
  return { matrix: best, version: ver, ecl: 'LMQH'[eclIdx] };
}

/* ---------------- UI ---------------- */

export default {
  id: 'qrcode',
  name: '二维码生成',
  icon: '▦',
  desc: '把文字或链接转成二维码，可调纠错等级与尺寸，支持下载 SVG/PNG。',

  mount(root) {
    const input   = el('textarea', { class: 'textarea', id: 'qr-in', placeholder: '输入要生成二维码的文字或网址…', spellcheck: 'false' });
    const status  = el('p', { class: 'status' });
    const outBox  = el('div', { class: 'qr-box' });
    const meta    = el('div', { class: 'counter', text: '' });

    const eccSel  = el('select', { class: 'select', id: 'qr-ecc', 'aria-label': '纠错等级' },
      el('option', { value: 'L', text: 'L · 7%' }),
      el('option', { value: 'M', text: 'M · 15%', selected: true }),
      el('option', { value: 'Q', text: 'Q · 25%' }),
      el('option', { value: 'H', text: 'H · 30%' }),
    );
    const sizeSel = el('select', { class: 'select', id: 'qr-size', 'aria-label': '尺寸' },
      el('option', { value: '256', text: '256 px' }),
      el('option', { value: '320', text: '320 px', selected: true }),
      el('option', { value: '512', text: '512 px' }),
    );
    const darkCol  = el('input', { type: 'color', value: '#101012', id: 'qr-dark', class: 'color' });
    const lightCol = el('input', { type: 'color', value: '#ffffff', id: 'qr-light', class: 'color' });
    const marginIn = el('input', { type: 'number', min: '0', max: '10', value: '2', id: 'qr-margin', class: 'input num' });

    let matrix = null;
    let lastText = '';

    function setStatus(msg, kind) {
      status.textContent = msg || '';
      status.className = 'status' + (kind ? ' ' + kind : '');
    }

    function draw() {
      const text = input.value;
      if (!text.trim()) {
        outBox.replaceChildren(el('p', { class: 'hint', text: '在上方输入内容后自动生成。' }));
        meta.textContent = '';
        matrix = null;
        setStatus('');
        return;
      }
      let res;
      try {
        res = makeQR(text, { ecl: eccSel.value });
      } catch (e) {
        matrix = null;
        outBox.replaceChildren(el('p', { class: 'status err', text: e.message }));
        meta.textContent = '';
        setStatus(e.message, 'err');
        return;
      }
      matrix = res.matrix;
      lastText = text;

      const n = matrix.length;
      const margin = Math.max(0, Math.min(10, Number(marginIn.value) || 0));
      const total = n + margin * 2;
      const px = Number(sizeSel.value);
      const dark = darkCol.value;
      const light = lightCol.value;

      // 用 canvas 画（可下载 PNG），同时保留 SVG 下载
      const cv = document.createElement('canvas');
      cv.width = cv.height = px;
      const ctx = cv.getContext('2d');
      const scale = px / total;
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, px, px);
      ctx.fillStyle = dark;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (!matrix[r][c]) continue;
          // 用 round 保证边缘不出现亚像素缝
          const x = Math.round((c + margin) * scale);
          const y = Math.round((r + margin) * scale);
          const w = Math.round((c + margin + 1) * scale) - x;
          const h = Math.round((r + margin + 1) * scale) - y;
          ctx.fillRect(x, y, w, h);
        }
      }
      cv.className = 'qr-canvas';
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', '生成的二维码');

      outBox.replaceChildren(cv);
      meta.textContent = `版本 ${res.version} · 纠错 ${res.ecl} · ${n}×${n} 模块 · ${new Blob([text]).size} 字节`;
      setStatus('');
    }

    const bSvg = el('button', { class: 'btn', type: 'button', text: '下载 SVG' });
    const bPng = el('button', { class: 'btn', type: 'button', text: '下载 PNG' });
    const bCopy = el('button', { class: 'btn', type: 'button', text: '复制内容' });

    function download(name, blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    bSvg.addEventListener('click', () => {
      if (!matrix) return toast('先输入内容');
      const n = matrix.length;
      const margin = Math.max(0, Math.min(10, Number(marginIn.value) || 0));
      const total = n + margin * 2;
      let path = '';
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (matrix[r][c]) path += `M${c + margin} ${r + margin}h1v1h-1z`;
        }
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
        `<rect width="${total}" height="${total}" fill="${lightCol.value}"/>` +
        `<path d="${path}" fill="${darkCol.value}"/></svg>`;
      download('qrcode.svg', new Blob([svg], { type: 'image/svg+xml' }));
      toast('已下载 SVG');
    });

    bPng.addEventListener('click', () => {
      const cv = outBox.querySelector('canvas');
      if (!cv) return toast('先输入内容');
      cv.toBlob(b => download('qrcode.png', b), 'image/png');
      toast('已下载 PNG');
    });

    bCopy.addEventListener('click', async () => {
      if (!input.value) return toast('没有可复制的内容');
      toast(await copyText(input.value) ? '已复制' : '复制失败');
    });

    input.addEventListener('input', draw);
    eccSel.addEventListener('change', draw);
    sizeSel.addEventListener('change', draw);
    darkCol.addEventListener('input', draw);
    lightCol.addEventListener('input', draw);
    marginIn.addEventListener('input', draw);

    root.append(
      el('section', { class: 'panel' },
        el('div', { class: 'field' },
          el('label', { class: 'label', for: 'qr-in', text: '内容' }),
          input,
        ),
        el('div', { class: 'row', style: 'margin-bottom:14px' },
          el('label', { class: 'check' }, '纠错 ', eccSel),
          el('label', { class: 'check' }, '尺寸 ', sizeSel),
          el('label', { class: 'check' }, '留白 ', marginIn),
          el('label', { class: 'check' }, '前景 ', darkCol),
          el('label', { class: 'check' }, '背景 ', lightCol),
        ),
        status,
        el('div', { class: 'field', style: 'margin-top:14px' },
          el('div', { class: 'row', style: 'margin-bottom:12px' }, bPng, bSvg, bCopy),
          outBox,
          meta,
        ),
      ),
    );

    draw();
    input.focus();
    return () => {};
  },
};
