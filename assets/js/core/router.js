/* 路由：基于 hash，无刷新切换
 *
 * 导航按「分区」分组渲染：
 *   桌面端 = 左侧栏里的小标题 + 竖排条目
 *   移动端 = 横向滚动的标签条（分区标题会隐藏，靠条目的图标区分）
 */
import { SECTIONS, TOOL_MAP, DEFAULT_ID } from './registry.js';
import { el, $ } from './dom.js';

let currentId = null;
let cleanup = null;      // 上一个条目返回的清理函数
let onNavigate = null;
let tabs = [];           // 导航条目引用，避免每次切换都查一遍全局 DOM

function renderNav() {
  const list = $('#nav-list');
  if (!list) return;

  tabs = [];
  const nodes = [];

  SECTIONS.forEach((section, si) => {
    // 分区标题：移动端顶部横滑时不占位（hidden），桌面端才显示（md:block）
    const label = el('div', {
      class: si > 0
        ? 'nav-section nav-section-gap hidden md:block'
        : 'nav-section hidden md:block',
      text: section.label,
      'aria-hidden': 'true',
    });
    nodes.push(label);

    for (const item of section.items) {
      const a = el('a', {
        class: 'tab',
        href: `#/${item.id}`,
        role: 'tab',
        id: `tab-${item.id}`,
        'aria-selected': 'false',
        'aria-controls': 'view',
        dataset: { id: item.id, section: section.id },
        on: {
          click: e => { e.preventDefault(); location.hash = `#/${item.id}`; },
        },
      },
        el('span', { class: 'tab-ico', text: item.icon, 'aria-hidden': 'true' }),
        el('span', { class: 'tab-text', text: item.name }),
      );
      a.tabIndex = -1;
      tabs.push(a);
      nodes.push(a);
    }
  });

  list.replaceChildren(...nodes);
}

function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '').trim();
  return TOOL_MAP.has(raw) ? raw : DEFAULT_ID;
}

function render(id) {
  const tool = TOOL_MAP.get(id);
  if (!tool) return;

  // 清理上一个条目（解绑监听、停定时器）
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch { /* ignore */ }
  }
  cleanup = null;

  // 导航态
  for (const a of tabs) {
    const on = a.dataset.id === id;
    a.setAttribute('aria-selected', on ? 'true' : 'false');
    a.tabIndex = on ? 0 : -1;
    if (on && a.scrollIntoView) {
      // 移动端把当前标签滚进视野
      a.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }

  // 头部
  $('#page-title').textContent = tool.name;
  $('#page-desc').textContent = tool.desc ?? '';
  document.title = `${tool.name} · DEVKIT`;

  // 内容
  const view = $('#view');
  view.replaceChildren();
  const host = el('div', { class: 'tool' });
  view.append(host);
  const ret = tool.mount(host);
  if (typeof ret === 'function') cleanup = ret;

  currentId = id;
  if (onNavigate) onNavigate(id);
}

export function startRouter({ onChange } = {}) {
  onNavigate = onChange;
  renderNav();

  const go = () => {
    const id = parseHash();
    if (id === currentId) return;
    render(id);
  };

  window.addEventListener('hashchange', go);

  // 首次进入
  const id = parseHash();
  if (!location.hash) history.replaceState(null, '', `#/${id}`);
  render(id);

  return () => { window.removeEventListener('hashchange', go); if (cleanup) cleanup(); };
}
