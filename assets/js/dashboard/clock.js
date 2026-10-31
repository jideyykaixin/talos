/* 模块 1：顶部时钟 —— 当前时间、日期、星期
 *
 * 每秒更新一次；页面切到后台时暂停（省电），切回来立刻刷新并重新对齐秒边界。
 */
import { el } from '../core/dom.js';

const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

const pad = n => String(n).padStart(2, '0');

/* 按时段返回问候语 */
export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 6) return '凌晨好';
  if (h < 9) return '早安';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  if (h < 23) return '晚上好';
  return '夜深了';
}

function fmtTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtDate(d) {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export function create(container, { config }) {
  const timeEl = el('div', {
    class: 'clock-time font-mono tabular-nums',
    text: '--:--:--',
    role: 'timer',
    'aria-live': 'off',
  });
  const dateEl = el('div', { class: 'clock-date', text: '' });
  const weekEl = el('span', { class: 'clock-week', text: '' });
  const greetEl = el('div', { class: 'clock-greeting', text: '' });

  container.append(
    el('div', { class: 'card clock' },
      el('div', { class: 'clock-main' }, timeEl),
      el('div', { class: 'clock-row' }, dateEl, weekEl),
      greetEl,
    ),
  );

  let timer = null;

  function tick() {
    const now = new Date();
    timeEl.textContent = fmtTime(now);
    dateEl.textContent = fmtDate(now);
    weekEl.textContent = WEEK[now.getDay()];
    greetEl.textContent = config.SITE.name || greeting(now);
  }

  /* 对齐到「下一个整秒」，避免定时器漂移导致秒数跳变不均匀 */
  function schedule() {
    clearTimeout(timer);
    const delay = 1000 - (Date.now() % 1000);
    timer = setTimeout(() => {
      tick();
      if (!document.hidden) schedule();
    }, delay);
  }

  function onVisibility() {
    if (document.hidden) {
      clearTimeout(timer);
    } else {
      tick();
      schedule();
    }
  }

  tick();
  schedule();
  document.addEventListener('visibilitychange', onVisibility);

  return {
    destroy() {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
