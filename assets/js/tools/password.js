/* 工具 5：密码生成器 */
import { el, copyText, toast } from '../core/dom.js';

const SETS = {
  lower:  'abcdefghijklmnopqrstuvwxyz',
  upper:  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digit:  '0123456789',
  symbol: '!@#$%^&*()-_=+[]{};:,.?/~',
};
const AMBIGUOUS = /[Il1O0o]/g;

export default {
  id: 'password',
  name: '密码生成器',
  icon: '⚿',
  desc: '可设长度与字符类型，使用 crypto 随机源，离线生成。',

  mount(root) {
    const out     = el('input', { class: 'input big mono', id: 'pw-out', readonly: true, spellcheck: 'false' });
    const lenIn   = el('input', { type: 'range', min: '4', max: '128', value: '20', id: 'pw-len', class: 'range' });
    const lenNum  = el('input', { class: 'input num', type: 'number', min: '4', max: '128', value: '20', id: 'pw-len-num', 'aria-label': '长度' });
    const status  = el('p', { class: 'status' });
    const meter   = el('div', { class: 'meter' }, el('i', {}));
    const meterTx = el('div', { class: 'counter', text: '' });

    const chks = {
      lower:  el('input', { type: 'checkbox', id: 'pw-lower', checked: true }),
      upper:  el('input', { type: 'checkbox', id: 'pw-upper', checked: true }),
      digit:  el('input', { type: 'checkbox', id: 'pw-digit', checked: true }),
      symbol: el('input', { type: 'checkbox', id: 'pw-symbol', checked: true }),
    };
    const noAmbiguous = el('input', { type: 'checkbox', id: 'pw-noamb' });
    const many        = el('input', { class: 'input num', type: 'number', min: '1', max: '50', value: '5', id: 'pw-count' });

    const list = el('div', { class: 'pw-list' });

    /* 无偏随机整数 */
    function randInt(max) {
      const buf = new Uint32Array(1);
      const limit = Math.floor(0xFFFFFFFF / max) * max;
      let x;
      do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
      return x % max;
    }

    function pool() {
      let p = '';
      for (const [k, set] of Object.entries(SETS)) {
        if (chks[k].checked) p += noAmbiguous.checked ? set.replace(AMBIGUOUS, '') : set;
      }
      return p;
    }

    function generateOne() {
      const chars = pool();
      const n = Math.max(4, Math.min(128, Number(lenNum.value) || 20));
      if (!chars) return '';
      // 先保证每个被选中的类别至少出现一次，再补足长度后洗牌
      const picked = [];
      for (const [k, set] of Object.entries(SETS)) {
        if (!chks[k].checked) continue;
        const s = noAmbiguous.checked ? set.replace(AMBIGUOUS, '') : set;
        if (s) picked.push(s[randInt(s.length)]);
      }
      while (picked.length < n) picked.push(chars[randInt(chars.length)]);
      picked.length = n;
      for (let i = n - 1; i > 0; i--) {
        const j = randInt(i + 1);
        [picked[i], picked[j]] = [picked[j], picked[i]];
      }
      return picked.join('');
    }

    function strength(p) {
      const types = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(p)).length;
      const entropy = p.length * Math.log2(Math.max(1, types * 20));
      if (p.length === 0) return { score: 0, text: '—' };
      if (entropy < 40) return { score: 1, text: '弱' };
      if (entropy < 60) return { score: 2, text: '中' };
      if (entropy < 90) return { score: 3, text: '强' };
      return { score: 4, text: '很强' };
    }

    function render() {
      const p = generateOne();
      out.value = p;
      const s = strength(p);
      meter.dataset.score = String(s.score);
      meterTx.textContent = p ? `强度：${s.text} · ${p.length} 位` : '未选择任何字符类型';

      // 批量列表（>=2 时显示）
      const n = Math.max(1, Math.min(50, Number(many.value) || 1));
      list.replaceChildren();
      if (n > 1) {
        for (let i = 0; i < n; i++) {
          const v = generateOne();
          const b = el('button', { class: 'pw-item', type: 'button', title: '点击复制' },
            el('span', { class: 'mono', text: v }));
          b.addEventListener('click', async () => {
            toast(await copyText(v) ? '已复制' : '复制失败');
          });
          list.append(b);
        }
      }
      status.textContent = '';
      status.className = 'status';
    }

    function syncLen(fromNum) {
      if (fromNum) lenIn.value = lenNum.value;
      else lenNum.value = lenIn.value;
      render();
    }

    const bGen  = el('button', { class: 'btn btn-primary', type: 'button', text: '重新生成' });
    const bCopy = el('button', { class: 'btn', type: 'button', text: '复制' });
    const bAll  = el('button', { class: 'btn', type: 'button', text: '复制全部' });

    bGen.addEventListener('click', render);
    bCopy.addEventListener('click', async () => {
      if (!out.value) return toast('没有可复制的内容');
      toast(await copyText(out.value) ? '已复制' : '复制失败');
    });
    bAll.addEventListener('click', async () => {
      const vals = [...list.querySelectorAll('.mono')].map(n => n.textContent);
      if (!vals.length) return toast('列表为空（数量设为 1 时不显示列表）');
      toast(await copyText(vals.join('\n')) ? `已复制 ${vals.length} 条` : '复制失败');
    });

    lenIn.addEventListener('input', () => syncLen(false));
    lenNum.addEventListener('input', () => syncLen(true));
    for (const c of Object.values(chks)) c.addEventListener('change', () => {
      if (!pool()) {
        // 至少保留一类
        c.checked = true;
        return toast('至少要选择一种字符类型');
      }
      render();
    });
    noAmbiguous.addEventListener('change', render);
    many.addEventListener('input', render);

    const typeLabel = { lower: '小写 a-z', upper: '大写 A-Z', digit: '数字 0-9', symbol: '符号 !@#$' };

    root.append(
      el('section', { class: 'panel' },
        el('div', { class: 'field' },
          el('label', { class: 'label', for: 'pw-out', text: '生成结果' }),
          el('div', { class: 'row' }, out, bGen, bCopy),
        ),
        el('div', { class: 'field' },
          el('label', { class: 'label', for: 'pw-len', text: '长度' }),
          el('div', { class: 'row' }, lenIn, lenNum),
          meter,
          meterTx,
        ),
        el('div', { class: 'field' },
          el('label', { class: 'label', text: '字符类型' }),
          el('div', { class: 'grid2' },
            ...Object.entries(chks).map(([k, c]) =>
              el('label', { class: 'check' }, c, ' ' + typeLabel[k])),
            el('label', { class: 'check' }, noAmbiguous, ' 排除易混淆字符 I l 1 O 0 o'),
          ),
        ),
        el('div', { class: 'field', style: 'margin-bottom:0' },
          el('label', { class: 'label', for: 'pw-count', text: '批量生成' }),
          el('div', { class: 'row' }, many, bAll),
          el('p', { class: 'hint', text: '数量 > 1 时下方列出多条，点击任意一条即可复制。' }),
        ),
        list,
        status,
      ),
    );

    render();
    return () => {};
  },
};
