/* 工具 3：JSON 格式化与压缩 */
import { el, copyText, toast } from '../core/dom.js';

export default {
  id: 'json',
  name: 'JSON 格式化',
  icon: '{}',
  desc: 'JSON 格式化、压缩、校验与键排序，错误会定位到行。',

  mount(root) {
    const src    = el('textarea', { class: 'textarea', id: 'json-in', placeholder: '粘贴 JSON…', spellcheck: 'false' });
    const out    = el('textarea', { class: 'textarea', id: 'json-out', readonly: true, spellcheck: 'false', placeholder: '结果会出现在这里' });
    const status = el('p', { class: 'status' });
    const indent = el('select', { class: 'select', 'aria-label': '缩进' },
      el('option', { value: '2', text: '2 空格' }),
      el('option', { value: '4', text: '4 空格' }),
      el('option', { value: 'tab', text: 'Tab' }),
    );
    const sortChk  = el('input', { type: 'checkbox', id: 'json-sort' });
    const asciiChk = el('input', { type: 'checkbox', id: 'json-ascii' });
    const stat     = el('div', { class: 'counter', text: '' });

    function setStatus(msg, kind) {
      status.textContent = msg || '';
      status.className = 'status' + (kind ? ' ' + kind : '');
    }

    /* 解析；失败时把位置换算成行列 */
    function parse(text) {
      try {
        return { ok: true, value: JSON.parse(text) };
      } catch (e) {
        const m = /position (\d+)/.exec(e.message);
        let where = '';
        if (m) {
          const pos = Number(m[1]);
          const before = text.slice(0, pos).split('\n');
          where = `（第 ${before.length} 行，第 ${before[before.length - 1].length + 1} 列）`;
        }
        return { ok: false, error: (e.message || 'JSON 解析失败') + where };
      }
    }

    /* 递归按键名排序，保持数组顺序 */
    function sortKeys(v) {
      if (Array.isArray(v)) return v.map(sortKeys);
      if (v && typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v).sort()) o[k] = sortKeys(v[k]);
        return o;
      }
      return v;
    }

    function post(obj, pad) {
      let text = JSON.stringify(obj, null, pad);
      if (asciiChk.checked) {
        text = text.replace(/[\u007f-\uffff]/g,
          c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
      }
      return text;
    }

    function currentPad() {
      return indent.value === 'tab' ? '\t' : Number(indent.value);
    }

    function validate() {
      const t = src.value.trim();
      if (!t) { setStatus(''); out.value = ''; stat.textContent = ''; return false; }
      const r = parse(t);
      if (!r.ok) { setStatus(r.error, 'err'); out.value = ''; src.classList.add('err'); stat.textContent = ''; return false; }
      src.classList.remove('err');
      setStatus('✓ 合法 JSON', 'ok');
      return true;
    }

    function doFormat(compress = false) {
      const t = src.value.trim();
      if (!t) return setStatus('');
      const r = parse(t);
      if (!r.ok) { setStatus(r.error, 'err'); out.value = ''; src.classList.add('err'); stat.textContent = ''; return; }
      src.classList.remove('err');
      const obj = sortChk.checked ? sortKeys(r.value) : r.value;
      out.value = compress ? post(obj, 0) : post(obj, currentPad());
      const kb = (new Blob([out.value]).size / 1024).toFixed(2);
      stat.textContent = `${out.value.length} 字符 · ${kb} KB`;
      setStatus(compress ? '已压缩' : (sortChk.checked ? '已格式化并排序' : '已格式化'), 'ok');
    }

    const bFmt  = el('button', { class: 'btn btn-primary', type: 'button', text: '格式化' });
    const bMin  = el('button', { class: 'btn', type: 'button', text: '压缩' });
    const bCopy = el('button', { class: 'btn', type: 'button', text: '复制结果' });
    const bSwap = el('button', { class: 'btn', type: 'button', text: '结果转输入' });
    const bClr  = el('button', { class: 'btn', type: 'button', text: '清空' });

    bFmt.addEventListener('click', () => doFormat(false));
    bMin.addEventListener('click', () => doFormat(true));
    bCopy.addEventListener('click', async () => {
      if (!out.value) return toast('没有可复制的内容');
      toast(await copyText(out.value) ? '已复制' : '复制失败');
    });
    bSwap.addEventListener('click', () => { src.value = out.value; out.value = ''; validate(); src.focus(); });
    bClr.addEventListener('click', () => { src.value = ''; out.value = ''; stat.textContent = ''; setStatus(''); src.focus(); });
    indent.addEventListener('change', () => { if (out.value) doFormat(false); });
    sortChk.addEventListener('change', () => { if (out.value) doFormat(false); });
    asciiChk.addEventListener('change', () => { if (out.value) doFormat(false); });
    src.addEventListener('input', validate);

    // Ctrl/Cmd+Enter 格式化
    src.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); doFormat(false); }
    });

    root.append(
      el('section', { class: 'panel' },
        el('div', { class: 'field' },
          el('label', { class: 'label', for: 'json-in', text: '输入' }),
          src,
        ),
        el('div', { class: 'row', style: 'margin-bottom:14px' },
          bFmt, bMin, bCopy, bSwap, bClr,
          el('span', { style: 'width:8px' }),
          indent,
        ),
        el('div', { class: 'row', style: 'gap:18px' },
          el('label', { class: 'check' }, sortChk, ' 键名排序'),
          el('label', { class: 'check' }, asciiChk, ' 转义为非 ASCII 编码'),
        ),
        status,
        el('div', { class: 'field', style: 'margin:14px 0 0' },
          el('label', { class: 'label', for: 'json-out', text: '结果' }),
          out,
          stat,
        ),
      ),
    );

    src.focus();
    return () => {};
  },
};
