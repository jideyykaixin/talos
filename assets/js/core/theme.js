/* 主题：跟随系统 → 手动切换后持久化 */
const KEY = 'devkit.theme';

export function currentTheme() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function applyTheme(name) {
  document.documentElement.classList.toggle('dark', name === 'dark');
  try { localStorage.setItem(KEY, name); } catch { /* 隐私模式忽略 */ }
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

export function initTheme() {
  // index.html 内联脚本已在首屏前设好类，这里只挂监听
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const t = toggleTheme();
      btn.title = t === 'dark' ? '切换到浅色' : '切换到深色';
    });
  }
  // 用户没手动选过时，跟随系统变化
  try {
    if (!localStorage.getItem(KEY)) {
      matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', e => applyTheme(e.matches ? 'dark' : 'light'));
    }
  } catch { /* ignore */ }
}
