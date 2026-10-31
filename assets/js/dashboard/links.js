/* 模块 5：快捷链接 —— 8 个常用网站入口
 *
 * 链接内容在 config.js 的 LINKS 里改，这里只负责渲染。
 * 数量不限于 8，网格会自适应。
 *
 * 安全细节：只允许 http / https 链接，
 * 防止配置里误写 javascript: 之类的东西被当成可执行代码。
 */
import { el } from '../core/dom.js';

function safeUrl(u) {
  try {
    const url = new URL(u);
    return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : null;
  } catch {
    return null;
  }
}

export function create(container, { config }) {
  const grid = el('div', { class: 'link-grid' });

  for (const item of config.LINKS) {
    const href = safeUrl(item.url);
    if (!href) continue;      // 配置写错就跳过，不渲染坏链接

    const a = el('a', {
      class: 'link-card',
      href,
      target: '_blank',
      rel: 'noopener noreferrer',
      title: item.desc || item.name,
    },
      el('span', { class: 'link-icon', text: item.icon || '●', 'aria-hidden': 'true' }),
      el('span', { class: 'link-name', text: item.name }),
    );
    grid.append(a);
  }

  const card = el('section', { class: 'card' },
    el('header', { class: 'card-head' },
      el('h2', { class: 'card-title', text: config.TEXT.linksTitle }),
      el('span', { class: 'card-badge', text: `${grid.children.length} 个` }),
    ),
    el('div', { class: 'card-body' }, grid),
  );

  container.append(card);

  return { destroy() { /* 纯静态，无需清理 */ } };
}
