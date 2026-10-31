/* 模块 2：待办事项 —— 添加 / 勾选完成 / 删除，全部存 localStorage
 *
 * 数据结构：
 *   todos = [ { id, text, done, ts } ]
 *   id  : 递增时间戳 + 随机后缀，保证唯一
 *   ts  : 创建时间，用于排序（新的在上）
 */
import { el, toast } from '../core/dom.js';
import { load, save } from '../core/storage.js';

const KEY = 'todos';
const MAX_LEN = 200;      // 单条待办的最大字数

let seq = 0;
function newId() {
  seq = (seq + 1) % 1000;
  return `${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function create(container, { config }) {
  /* 读取：容错——历史数据可能不是数组，或条目字段缺失 */
  let todos = load(KEY, []);
  if (!Array.isArray(todos)) todos = [];
  todos = todos
    .filter(t => t && typeof t.text === 'string')
    .map(t => ({
      id: typeof t.id === 'string' ? t.id : newId(),
      text: t.text,
      done: !!t.done,
      ts: Number(t.ts) || Date.now(),
    }));

  const persist = () => save(KEY, todos);

  const input = el('input', {
    class: 'input',
    type: 'text',
    maxlength: String(MAX_LEN),
    placeholder: config.TEXT.todoPlaceholder,
    'aria-label': '新待办内容',
  });
  const addBtn = el('button', { class: 'btn btn-primary', type: 'button', text: '添加' });
  const list = el('ul', { class: 'todo-list', role: 'list' });
  const empty = el('li', { class: 'todo-empty', text: config.TEXT.todoEmpty });
  const counter = el('span', { class: 'card-badge', text: '' });

  const card = el('section', { class: 'card' },
    el('header', { class: 'card-head' },
      el('h2', { class: 'card-title', text: config.TEXT.todoTitle }),
      counter,
    ),
    el('div', { class: 'card-body' },
      el('div', { class: 'row' }, input, addBtn),
      list,
    ),
  );

  container.append(card);

  /* ── 渲染 ─────────────────────────────────────────────── */
  function render() {
    list.replaceChildren();

    const sorted = [...todos].sort((a, b) => {
      // 未完成的在前；同组内按创建时间倒序
      if (a.done !== b.done) return a.done ? 1 : -1;
      return b.ts - a.ts;
    });

    if (!sorted.length) {
      list.append(empty);
    } else {
      for (const t of sorted) list.append(row(t));
    }

    const left = todos.filter(t => !t.done).length;
    counter.textContent = todos.length ? `${left}/${todos.length} 未完成` : '';
  }

  function row(t) {
    const box = el('input', {
      type: 'checkbox',
      class: 'todo-check',
      checked: t.done,
      'aria-label': `完成：${t.text}`,
    });
    box.addEventListener('change', () => {
      t.done = box.checked;
      persist();
      render();
    });

    const text = el('span', { class: 'todo-text', text: t.text, title: t.text });

    const del = el('button', {
      class: 'icon-btn todo-del',
      type: 'button',
      text: '✕',
      'aria-label': `删除：${t.text}`,
      title: '删除',
    });
    del.addEventListener('click', () => {
      todos = todos.filter(x => x.id !== t.id);
      persist();
      render();
    });

    const li = el('li', { class: t.done ? 'todo-item is-done' : 'todo-item' },
      el('label', { class: 'todo-label' }, box, text),
      del,
    );
    return li;
  }

  /* ── 添加 ─────────────────────────────────────────────── */
  function add() {
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    if (text.length > MAX_LEN) return toast(`最多 ${MAX_LEN} 个字`);

    todos.push({ id: newId(), text, done: false, ts: Date.now() });
    if (!persist()) toast('保存失败：浏览器存储不可用或已满');
    input.value = '';
    render();
    input.focus();
  }

  addBtn.addEventListener('click', add);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); add(); }
  });

  render();

  return { destroy() { /* 无定时器、无全局监听，无需清理 */ } };
}
