/* 模块 3：便签 —— 自由编辑，停下打字后自动保存
 *
 * 保存策略：输入停止 400ms 后写入 localStorage（防抖）。
 * 同时监听页面隐藏 / 关闭，把未落盘的内容立刻写下去，避免丢字。
 */
import { el, debounce } from '../core/dom.js';
import { load, save } from '../core/storage.js';

const KEY = 'note';
const DELAY = 400;          // 防抖延迟（毫秒）
const MAX = 20000;          // 便签最大字数

export function create(container, { config }) {
  const saved = load(KEY, null);
  const initial = typeof saved === 'string' ? saved : config.NOTE_SEED;

  const area = el('textarea', {
    class: 'textarea note-area',
    maxlength: String(MAX),
    placeholder: config.TEXT.notePlaceholder,
    'aria-label': '便签内容',
    spellcheck: 'false',
    rows: '8',
  });
  area.value = initial;

  const state = el('span', { class: 'card-badge note-state', text: '' });
  const count = el('span', { class: 'note-count', text: '' });

  const card = el('section', { class: 'card' },
    el('header', { class: 'card-head' },
      el('h2', { class: 'card-title', text: config.TEXT.noteTitle }),
      state,
    ),
    el('div', { class: 'card-body' },
      area,
      count,
    ),
  );

  container.append(card);

  let lastSaved = initial;
  let pending = false;        // 是否有尚未落盘的输入

  function updateCount() {
    count.textContent = `${area.value.length} 字符`;
  }

  function flush() {
    pending = false;
    if (area.value === lastSaved) {
      // 内容没变，不重复写盘
      state.textContent = lastSaved === '' ? '空便签' : config.TEXT.noteSaved;
      return;
    }
    const ok = save(KEY, area.value);
    if (ok) {
      lastSaved = area.value;
      state.textContent = config.TEXT.noteSaved;
      state.classList.remove('is-err');
    } else {
      state.textContent = '保存失败';
      state.classList.add('is-err');
    }
  }

  const scheduleSave = debounce(flush, DELAY);

  area.addEventListener('input', () => {
    updateCount();
    state.textContent = '输入中…';
    pending = true;
    scheduleSave();
  });

  // 页面被隐藏或即将关闭时立即落盘
  const onHide = () => { if (pending) flush(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);

  updateCount();
  state.textContent = lastSaved ? config.TEXT.noteSaved : '空便签';

  return {
    destroy() {
      // 离开这个栏目时把没保存的写掉
      if (pending) flush();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    },
  };
}
