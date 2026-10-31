/* 本地存储封装
 *
 * 全部数据只存在浏览器的 localStorage 里，不发往任何服务器。
 * 统一加前缀，方便在开发者工具里一眼认出本站的数据：
 *     Application → Local Storage → devkit.dash.todos 等
 *
 * 所有读写都做了 try/catch —— 隐私模式 / 存储配额满的时候
 * localStorage 会直接抛异常，不能让整个页面跟着挂掉。
 */

const PREFIX = 'devkit.dash.';

/* 读取；不存在或损坏时返回 fallback */
export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

/* 写入；失败返回 false（调用方可据此提示用户） */
export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* 删除单项 */
export function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
}

/* 清空本站仪表盘的全部数据（「重置」按钮用） */
export function clearAll() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
    return true;
  } catch {
    return false;
  }
}
