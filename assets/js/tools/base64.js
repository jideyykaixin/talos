/* 工具 2：Base64 编解码（正确支持 UTF-8 与 URL-safe） */
import { el, copyText, toast } from '../core/dom.js';

function encodeUTF8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}

function decodeUTF8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function urlSafe(b64) {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromUrlSafe(s) {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = t.length % 4;
  if (pad) t += '='.repeat(4 - pad);
  return t;
}

export default {
  id: 'base64',
  name: 'Base64',
  icon: '⌗',
  desc: 'UTF-8 安全的 Base64 编码与解码，可选 URL-safe。',

  mount(root) {
    const src     = el('textarea', { class: 'textarea', id: 'b64-in', placeholder: '输入要编码或解码的文本…', spellcheck: 'false' });
    const out     = el('textarea', { class: 'textarea', id: 'b64-out', placeholder: '结果会出现在这里', readonly: true, spellcheck: 'false' });
    const status  = el('p', { class: 'status' });
    const counter = el('div', { class: 'counter', text: '0 字符' });

    const urlSafeChk = el('input', { type: 'checkbox', id: 'b64-urlsafe' });
    const wrapChk    = el('input', { type: 'checkbox', id: 'b64-wrap' });

    const run = () => {
      const raw = src.value;
      counter.textContent = `${[...raw].length} 字符`;
      status.textContent = '';
      status.className = 'status';
      out.classList.remove('err');
      if (!raw) { out.value = ''; return; }

      // 自动判断方向：看起来像 Base64 就解码，否则编码
      const looksB64 = /^[A-Za-z0-9+/\-_=\s]+$/.test(raw) && raw.replace(/\s/g, '').length > 0
                       && raw.replace(/\s/g, '').length % 4 !== 1;

      try {
        let res;
        if (looksB64) {
          let t = raw.replace(/\s/g, '');
          if (urlSafeChk.checked || /[-_]/.test(t)) t = fromUrlSafe(t);
          res = decodeUTF8(t);
          setStatus('已解码', 'ok');
        } else {
          res = encodeUTF8(raw);
          if (urlSafeChk.checked) res = urlSafe(res);
          setStatus('已编码', 'ok');
        }
        if (wrapChk.checked && !looksB64) res = res.replace(/(.{76})/g, '$1\n');
        out.value = res;
      } catch (e) {
        out.classList.add('err');
        out.value = '';
        setStatus('无法解码：内容不是合法的 Base64 或不是 UTF-8 文本', 'err');
      }
    };

    function setStatus(msg, kind) {
      status.textContent = msg || '';
      status.className = 'status' + (kind ? ' ' + kind : '');
    }

    const btnEncode = el('button', { class: 'btn btn-primary', type: 'button', text: '编码' });
    const btnDecode = el('button', { class: 'btn', type: 'button', text: '解码' });
    const btnSwap   = el('button', { class: 'btn', type: 'button', text: '结果转输入' });
    const btnCopy   = el('button', { class: 'btn', type: 'button', text: '复制结果' });
    const btnClear  = el('button', { class: 'btn', type: 'button', text: '清空' });

    btnEncode.addEventListener('click', () => {
      try { out.value = encodeUTF8(src.value); if (wrapChk.checked) out.value = out.value.replace(/(.{76})/g, '$1\n'); setStatus('已编码', 'ok'); }
      catch { setStatus('编码失败', 'err'); }
    });
    btnDecode.addEventListener('click', () => {
      try {
        let t = src.value.replace(/\s/g, '');
        if (/[-_]/.test(t)) t = fromUrlSafe(t);
        out.value = decodeUTF8(t);
        setStatus('已解码', 'ok');
      } catch { setStatus('解码失败：不是合法 Base64 或非 UTF-8', 'err'); }
    });
    btnSwap.addEventListener('click', () => { src.value = out.value; out.value = ''; run(); src.focus(); });
    btnCopy.addEventListener('click', async () => {
      if (!out.value) return toast('没有可复制的内容');
      toast(await copyText(out.value) ? '已复制' : '复制失败');
    });
    btnClear.addEventListener('click', () => { src.value = ''; out.value = ''; run(); src.focus(); });

    src.addEventListener('input', run);
    urlSafeChk.addEventListener('change', run);
    wrapChk.addEventListener('change', run);

    root.append(
      el('section', { class: 'panel' },
        el('div', { class: 'field' },
          el('label', { class: 'label', for: 'b64-in', text: '输入' }),
          src,
          counter,
        ),
        el('div', { class: 'row', style: 'margin-bottom:14px' },
          btnEncode, btnDecode, btnSwap, btnCopy, btnClear,
        ),
        el('div', { class: 'row', style: 'gap:18px' },
          el('label', { class: 'check' }, urlSafeChk, ' URL-safe（- _ 代替 + /，去填充）'),
          el('label', { class: 'check' }, wrapChk, ' 每 76 字符换行'),
        ),
        status,
        el('div', { class: 'field', style: 'margin:14px 0 0' },
          el('label', { class: 'label', for: 'b64-out', text: '结果' }),
          out,
        ),
      ),
    );

    src.focus();
    return () => {};
  },
};
