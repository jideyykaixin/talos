/* 工具 1：时间戳转换 */
import { el, copyText, toast } from '../core/dom.js';

const pad = n => String(n).padStart(2, '0');

function fmtLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function fmtUTC(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
         `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

/* 宽松解析：支持 "2024-01-01 12:00:00" / ISO / "2024/1/1" */
function parseDate(s) {
  const t = s.trim();
  if (!t) return null;
  // 本地时间写法（不带时区）优先按本地解析
  const m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(d) ? null : d;
  }
  const d = new Date(t);
  return isNaN(d) ? null : d;
}

export default {
  id: 'timestamp',
  name: '时间戳转换',
  icon: '⏱',
  desc: 'Unix 时间戳与日期互转，支持秒/毫秒与本地时区。',

  mount(root) {
    const nowBtn    = el('button', { class: 'btn btn-primary', type: 'button', text: '取当前时间' });
    const tsIn      = el('input', { class: 'input', type: 'text', inputmode: 'numeric', placeholder: '例如 1700000000', 'aria-label': 'Unix 时间戳' });
    const unitSel   = el('select', { class: 'select', 'aria-label': '时间戳单位' },
      el('option', { value: 's', text: '秒 (s)' }),
      el('option', { value: 'ms', text: '毫秒 (ms)' }),
    );
    const toDateBtn = el('button', { class: 'btn', type: 'button', text: '转日期' });
    const dateIn    = el('input', { class: 'input', type: 'text', placeholder: '例如 2024-01-01 12:00:00', 'aria-label': '日期时间' });
    const toTsBtn   = el('button', { class: 'btn', type: 'button', text: '转时间戳' });

    const outLocal  = el('dd', { class: 'mono', text: '—' });
    const outUTC    = el('dd', { class: 'mono', text: '—' });
    const outSec    = el('dd', { class: 'mono', text: '—' });
    const outMs     = el('dd', { class: 'mono', text: '—' });
    const outWeek   = el('dd', { class: 'mono', text: '—' });
    const outRel    = el('dd', { class: 'mono', text: '—' });
    const status    = el('p', { class: 'status' });

    const result = el('section', { class: 'panel' },
      el('dl', { class: 'kv' },
        el('dt', { text: '本地时间' }), outLocal,
        el('dt', { text: 'UTC' }),      outUTC,
        el('dt', { text: '秒' }),       outSec,
        el('dt', { text: '毫秒' }),     outMs,
        el('dt', { text: '星期' }),     outWeek,
        el('dt', { text: '相对现在' }), outRel,
      ),
      el('div', { class: 'row', style: 'margin-top:12px' },
        (() => { const b = el('button', { class: 'btn', type: 'button', text: '复制秒' }); b.addEventListener('click', () => doCopy(outSec.textContent)); return b; })(),
        (() => { const b = el('button', { class: 'btn', type: 'button', text: '复制毫秒' }); b.addEventListener('click', () => doCopy(outMs.textContent)); return b; })(),
      ),
      status,
    );

    async function doCopy(v) {
      if (!v || v === '—') return toast('没有可复制的内容');
      toast(await copyText(v) ? '已复制' : '复制失败');
    }

    function relText(d) {
      const diff = Date.now() - d.getTime();
      const abs = Math.abs(diff);
      const s = Math.floor(abs / 1000);
      const units = [
        [31536000, '年'], [2592000, '月'], [86400, '天'],
        [3600, '小时'], [60, '分钟'], [1, '秒'],
      ];
      for (const [n, label] of units) {
        if (s >= n) {
          const v = Math.floor(s / n);
          return diff >= 0 ? `${v} ${label}前` : `${v} ${label}后`;
        }
      }
      return '刚刚';
    }

    function show(d) {
      outLocal.textContent = fmtLocal(d);
      outUTC.textContent   = fmtUTC(d);
      outSec.textContent   = String(Math.floor(d.getTime() / 1000));
      outMs.textContent    = String(d.getTime());
      outWeek.textContent  = '周' + '日一二三四五六'[d.getDay()];
      outRel.textContent   = relText(d);
    }

    function clearOut() {
      [outLocal, outUTC, outSec, outMs, outWeek, outRel].forEach(n => n.textContent = '—');
    }

    function setStatus(msg, kind) {
      status.textContent = msg || '';
      status.className = 'status' + (kind ? ' ' + kind : '');
      tsIn.classList.toggle('err', kind === 'err');
      dateIn.classList.toggle('err', false);
    }

    function fromTs() {
      const raw = tsIn.value.trim();
      if (!raw) { clearOut(); setStatus(''); return; }
      if (!/^-?\d+$/.test(raw)) { clearOut(); return setStatus('时间戳必须是整数', 'err'); }
      const n = Number(raw);
      const ms = unitSel.value === 'ms' ? n : n * 1000;
      const d = new Date(ms);
      if (isNaN(d.getTime())) { clearOut(); return setStatus('时间戳超出可表示范围', 'err'); }
      show(d);
      setStatus('');
    }

    function fromDate() {
      const raw = dateIn.value.trim();
      if (!raw) return setStatus('');
      const d = parseDate(raw);
      if (!d) {
        dateIn.classList.add('err');
        return setStatus('无法识别的日期格式', 'err');
      }
      dateIn.classList.remove('err');
      tsIn.value = String(Math.floor(d.getTime() / 1000));
      unitSel.value = 's';
      show(d);
      setStatus('');
    }

    nowBtn.addEventListener('click', () => {
      const now = new Date();
      tsIn.value = String(Math.floor(now.getTime() / 1000));
      unitSel.value = 's';
      dateIn.value = fmtLocal(now);
      show(now);
      setStatus('');
    });
    tsIn.addEventListener('input', fromTs);
    unitSel.addEventListener('change', fromTs);
    toDateBtn.addEventListener('click', fromTs);
    dateIn.addEventListener('input', fromDate);
    toTsBtn.addEventListener('click', fromDate);

    root.append(
      el('section', { class: 'panel' },
        el('div', { class: 'field' },
          el('label', { class: 'label', for: 'ts-in', text: 'Unix 时间戳 → 日期' }),
          el('div', { class: 'row' },
            el('div', { style: 'flex:1 1 220px' }, (tsIn.id = 'ts-in', tsIn)),
            unitSel,
            toDateBtn,
            nowBtn,
          ),
          el('p', { class: 'hint', text: '秒与毫秒会自动按所选单位换算；也可直接回车。' }),
        ),
        el('div', { class: 'field', style: 'margin-bottom:0' },
          el('label', { class: 'label', for: 'dt-in', text: '日期 → Unix 时间戳' }),
          el('div', { class: 'row' },
            el('div', { style: 'flex:1 1 220px' }, (dateIn.id = 'dt-in', dateIn)),
            toTsBtn,
          ),
          el('p', { class: 'hint', text: '支持 2024-01-01 12:00:00 / 2024/1/1 / ISO 8601；不带时区按本地时间。' }),
        ),
      ),
      result,
    );

    // 初始：填当前时间
    nowBtn.click();

    return () => {};
  },
};
