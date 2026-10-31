/* 个人仪表盘 —— 把 5 个模块拼在一张页面上
 *
 * 布局（桌面端多列，移动端单列堆叠）：
 *   ┌─────────────────────────────┐
 *   │  时钟（跨满整行）            │
 *   ├──────────────┬──────────────┤
 *   │  待办事项     │  倒计时       │
 *   ├──────────────┴──────────────┤
 *   │  便签（跨满整行）            │
 *   ├─────────────────────────────┤
 *   │  快捷链接（跨满整行）        │
 *   └─────────────────────────────┘
 *
 * 想改内容（文字、链接、初始倒计时日期）→ 编辑 config.js，不用动这个文件。
 */
import * as clock from '../dashboard/clock.js';
import * as todos from '../dashboard/todos.js';
import * as note from '../dashboard/note.js';
import * as countdown from '../dashboard/countdown.js';
import * as links from '../dashboard/links.js';
import { el } from '../core/dom.js';
import * as config from '../dashboard/config.js';

export default {
  id: 'dashboard',
  name: '仪表盘',
  icon: '◱',
  desc: '时间、待办、便签、倒计时与常用入口，数据只存在你的浏览器里。',

  /**
   * 挂载仪表盘
   * @param {HTMLElement} container 由路由清空后交给我们的容器
   * @returns {{ destroy(): void }} 离开栏目时路由会调用 destroy
   */
  mount(container) {
    // 给外层加一个标记，方便 CSS 只针对仪表盘调网格
    const root = el('div', { class: 'dash' });

    // 每个模块自己负责创建 .card 并塞进它的容器
    const cells = {
      clock: el('div', { class: 'dash-cell dash-clock' }),
      todos: el('div', { class: 'dash-cell dash-todos' }),
      countdown: el('div', { class: 'dash-cell dash-cd' }),
      note: el('div', { class: 'dash-cell dash-note' }),
      links: el('div', { class: 'dash-cell dash-links' }),
    };

    root.append(
      cells.clock, cells.todos, cells.countdown, cells.note, cells.links,
    );
    container.append(root);

    // 装配：每个模块返回 { destroy() }
    const parts = [
      clock.create(cells.clock, { config }),
      todos.create(cells.todos, { config }),
      countdown.create(cells.countdown, { config }),
      note.create(cells.note, { config }),
      links.create(cells.links, { config }),
    ];

    return {
      destroy() {
        // 逐个清理（清定时器、解绑事件、便签落盘）
        for (const p of parts) {
          try {
            if (p && typeof p.destroy === 'function') p.destroy();
          } catch (e) {
            console.error(e);
          }
        }
        root.remove();
      },
    };
  },
};
