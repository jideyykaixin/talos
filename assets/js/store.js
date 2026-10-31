/* store.js — localStorage 封装（docs/RULES.md §C-6）
   key 命名空间：site.<tool>.<ver>，版本升级自动丢弃旧存档 */

const NS = "site";

export function keyOf(tool, ver) {
  return `${NS}.${tool}.${ver}`;
}

export function save(tool, ver, value) {
  try {
    localStorage.setItem(keyOf(tool, ver), JSON.stringify(value));
    return true;
  } catch {
    return false;   // 隐私模式 / 配额满：静默失败，页面照常可用
  }
}

export function load(tool, ver, fallback = null) {
  try {
    const raw = localStorage.getItem(keyOf(tool, ver));
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function clear(tool, ver) {
  try { localStorage.removeItem(keyOf(tool, ver)); } catch { /* noop */ }
}

/* 主题：读写 <html data-theme>，默认跟随系统 */
export function applyTheme(mode) {
  const html = document.documentElement;
  if (mode === "light" || mode === "dark") html.dataset.theme = mode;
  else delete html.dataset.theme;
  try { localStorage.setItem(`${NS}.theme`, mode); } catch { /* noop */ }
}

export function currentTheme() {
  try { return localStorage.getItem(`${NS}.theme`) || "auto"; } catch { return "auto"; }
}

export function cycleTheme() {
  const order = ["auto", "light", "dark"];
  const next = order[(order.indexOf(currentTheme()) + 1) % order.length];
  applyTheme(next);
  return next;
}
