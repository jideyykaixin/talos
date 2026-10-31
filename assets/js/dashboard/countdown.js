/* 模块 4：倒计时 —— 设置目标日期，显示剩余天数
 *
 * 计算规则（这里是唯一的口径来源，改动请只改这里）：
 *   · 把「今天」和「目标日」都归零到当天 00:00，再相减
 *   · 今天 → 目标日 的天数差就是「还剩几天」
 *     例：今天 11-01，目标 11-11 → 剩 10 天
 *   · 差为 0  → 今天就是目标日
 *   · 差 < 0  → 已过去 N 天
 *
 * 不用 (目标 - 现在)/86400000 向上取整，是因为那样会受当前几点几分影响，
 * 同一目标日在一天里的不同时刻会显示不同天数，难以理解。
 */
import { el, toast } from '../core/dom.js';
import { load, save } from '../core/storage.js';

const KEY = 'countdown';

const DAY = 86400000;

/* 把日期归零到当天 00:00（本地时区） */
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/* 解析 YYYY-MM-DD → 本地零点的 Date；非法返回 null */
export function parseYMD(s) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(y, mo - 1, d);
  // 排除 2024-02-31 这种被自动进位的非法日期
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

/* 核心：算出还剩几天（正数=未来，0=今天，负数=已过去） */
export function daysLeft(targetYMD, now = new Date()) {
  const t = parseYMD(targetYMD);
  if (!t) return null;
  return Math.round((startOfDay(t) - startOfDay(now)) / DAY);
}

export function create(container, { config }) {
  /* 已保存的配置优先，否则用 config.js 里的初始值 */
  const saved = load(KEY, null);
  let name = (saved && typeof saved.name === 'string' && saved.name.trim())
    ? saved.name
    : config.COUNTDOWN_SEED.name;
  let date = (saved && parseYMD(saved.date)) ? saved.date : config.COUNTDOWN_SEED.date;

  /* ── 展示态 ───────────────────────────────────────────── */
  const nameEl = el('div', { class: 'cd-name', text: name });
  const numEl = el('div', { class: 'cd-num font-mono tabular-nums', text: '—' });
  const unitEl = el('div', { class: 'cd-unit', text: '天' });
  const dateEl = el('div', { class: 'cd-date', text: '' });
  const hintEl = el('div', { class: 'cd-hint', text: '' });

  const view = el('div', { class: 'cd-view' },
    nameEl,
    el('div', { class: 'cd-main' }, numEl, unitEl),
    dateEl,
    hintEl,
  );

  /* ── 编辑态 ───────────────────────────────────────────── */
  const nameIn = el('input', {
    class: 'input',
    type: 'text',
    maxlength: '24',
    placeholder: '倒计时名称，例如 春节',
    'aria-label': '倒计时名称',
  });
  const dateIn = el('input', {
    class: 'input',
    type: 'date',
    'aria-label': '目标日期',
  });
  const okBtn = el('button', { class: 'btn btn-primary', type: 'button', text: '保存' });
  const cancelBtn = el('button', { class: 'btn', type: 'button', text: '取消' });

  const form = el('div', { class: 'cd-form' },
    el('div', { class: 'field-inline' }, nameIn),
    el('div', { class: 'field-inline' }, dateIn),
    el('div', { class: 'row' }, okBtn, cancelBtn),
  );

  const editBtn = el('button', { class: 'icon-btn', type: 'button', text: '编辑', title: '修改倒计时' });

  const card = el('section', { class: 'card' },
    el('header', { class: 'card-head' },
      el('h2', { class: 'card-title', text: config.TEXT.countdownTitle }),
      editBtn,
    ),
    el('div', { class: 'card-body' }, view, form),
  );

  container.append(card);

  /* ── 渲染 ─────────────────────────────────────────────── */
  function render() {
    const n = daysLeft(date);

    nameEl.textContent = name;

    if (n === null) {
      numEl.textContent = '—';
      unitEl.textContent = '';
      dateEl.textContent = '未设置日期';
      hintEl.textContent = '';
      return;
    }

    const [y, mo, d] = date.split('-').map(Number);
    dateEl.textContent = `目标：${y} 年 ${mo} 月 ${d} 日`;

    if (n > 1) {
      numEl.textContent = String(n);
      unitEl.textContent = '天';
      hintEl.textContent = `还剩 ${n} 天`;
      card.dataset.state = 'future';
    } else if (n === 1) {
      numEl.textContent = '1';
      unitEl.textContent = '天';
      hintEl.textContent = '就是明天';
      card.dataset.state = 'soon';
    } else if (n === 0) {
      numEl.textContent = '0';
      unitEl.textContent = '天';
      hintEl.textContent = '就是今天';
      card.dataset.state = 'today';
    } else {
      numEl.textContent = String(-n);
      unitEl.textContent = '天前';
      hintEl.textContent = '已过去';
      card.dataset.state = 'past';
    }
  }

  /* ── 编辑开关 ─────────────────────────────────────────── */
  function openForm() {
    nameIn.value = name;
    dateIn.value = date;
    view.classList.add('hide');
    form.classList.add('show');
    editBtn.classList.add('hide');
    nameIn.focus();
  }

  function closeForm() {
    form.classList.remove('show');
    view.classList.remove('hide');
    editBtn.classList.remove('hide');
  }

  function commit() {
    const nv = nameIn.value.trim() || config.COUNTDOWN_SEED.name;
    if (!parseYMD(dateIn.value)) return toast('请选择一个有效的日期');

    name = nv;
    date = dateIn.value;
    if (!save(KEY, { name, date })) toast('保存失败：浏览器存储不可用');
    closeForm();
    render();
  }

  editBtn.addEventListener('click', openForm);
  okBtn.addEventListener('click', commit);
  cancelBtn.addEventListener('click', closeForm);
  nameIn.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    if (e.key === 'Escape') closeForm();
  });

  render();

  /* 跨过零点时自动翻页：每分钟检查一次日期是否变了 */
  let lastDay = startOfDay(new Date());
  const timer = setInterval(() => {
    const today = startOfDay(new Date());
    if (today !== lastDay) {
      lastDay = today;
      render();
    }
  }, 60000);

  return {
    destroy() { clearInterval(timer); },
  };
}
