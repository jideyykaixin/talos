import { initTheme } from './core/theme.js';
import { startRouter } from './core/router.js';

initTheme();
startRouter();

// 键盘快捷键：d = 切主题（输入框内不触发）
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
  if (e.key === 'd' || e.key === 'D') {
    document.getElementById('theme-toggle')?.click();
  }
});
