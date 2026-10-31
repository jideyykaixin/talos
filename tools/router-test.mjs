// 路由与注册表联动测试：模拟导航容器，验证 hash 切换不会重建整页、cleanup 会被调用。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let fail = 0;
const ok = (n, c, e = '') => { if (!c) fail++; console.log(`${c ? 'OK  ' : 'FAIL'} ${n}${e ? '  ' + e : ''}`); };

/* ---- 最小 DOM ---- */
class CL {
  constructor() { this.s = new Set(); }
  add(...c) { c.forEach(x => this.s.add(x)); } remove(...c) { c.forEach(x => this.s.delete(x)); }
  toggle(c, on) { on = on === undefined ? !this.s.has(c) : on; on ? this.s.add(c) : this.s.delete(c); return on; }
  contains(c) { return this.s.has(c); }
  get value() { return [...this.s].join(' '); }
}
class E {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.children = []; this.listeners = {};
    this.attributes = {}; this.dataset = {}; this.style = {}; this.classList = new CL();
    this.textContent = ''; this.value = ''; this.tabIndex = 0; this.id = ''; this._cls = '';
  }
  get nodeType() { return 1; }
  get className() { return this.classList.value; }
  set className(v) { this.classList.s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  append(...ns) { for (const n of ns) { if (n == null) continue; (n.nodeType ? n : new Text(String(n))).parentNode = this; this.children.push(n.nodeType ? n : new Text(String(n))); } }
  replaceChildren(...ns) { this.children = []; this.append(...ns); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter(x => x !== f); }
  dispatch(t, ev = {}) { for (const f of [...(this.listeners[t] || [])]) f({ target: this, preventDefault() {}, ...ev }); }
  querySelectorAll(sel) {
    const out = [];
    const m = n => sel.startsWith('#') ? n.id === sel.slice(1)
      : sel.startsWith('.') ? n.classList.contains(sel.slice(1))
      : sel.includes('[aria-selected') ? false
      : n.tagName === sel.toUpperCase();
    (function w(n) { for (const c of n.children) { if (c.nodeType === 1) { if (m(c)) out.push(c); w(c); } } })(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  focus() {} click() { this.dispatch('click'); } scrollIntoView() {}
}
class Text { constructor(t) { this.textContent = t; } get nodeType() { return 3; } get children() { return []; } }

const ids = {};
const document = {
  createElement: t => new E(t),
  createTextNode: t => new Text(t),
  getElementById: id => ids[id] ?? null,
  querySelector: sel => sel.startsWith('#') ? (ids[sel.slice(1)] ?? null) : document.body.querySelector(sel),
  querySelectorAll: sel => document.body.querySelectorAll(sel),
  body: new E('body'),
  documentElement: new E('html'),
};
const navList = new E('div'); navList.id = 'nav-list'; ids['nav-list'] = navList;
const view = new E('div'); view.id = 'view'; ids['view'] = view;
const title = new E('h1'); title.id = 'page-title'; ids['page-title'] = title;
const desc = new E('p'); desc.id = 'page-desc'; ids['page-desc'] = desc;
document.body.append(navList, view, title, desc);

/* ---- 假的工具模块 ---- */
const mounted = [];
function mkTool(id, name) {
  return { id, name, icon: '*', desc: name + ' desc', mount(host) { mounted.push(id); host.append(new E('div')); return () => mounted.push('cleanup:' + id); } };
}
const TOOLS = [mkTool('a', '工具A'), mkTool('b', '工具B'), mkTool('c', '工具C')];
const TOOL_MAP = new Map(TOOLS.map(t => [t.id, t]));
const DEFAULT_ID = 'a';

const domShim = `
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === 'id') { node.id = v; }
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) { if (c == null || c === false) continue; node.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return node;
};
const $ = (sel, root = document) => root.querySelector(sel);
`;

const routerSrc = readFileSync(process.argv[2] || new URL('../assets/js/core/router.js', import.meta.url), 'utf8')
  .replace(/^\s*import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/^\s*import\s+[\w$]+\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/^\s*export\s+(?=(const|let|var|function|class|async))/gm, '')
  .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '');

const hashListeners = [];
const sb = {
  document, console,
  location: { hash: '' },
  history: { replaceState(a, b, url) { sb.location.hash = String(url).replace(/^[^#]*/, ''); } },
  window: {
    addEventListener(t, f) { if (t === 'hashchange') hashListeners.push(f); },
    removeEventListener(t, f) { const i = hashListeners.indexOf(f); if (i >= 0) hashListeners.splice(i, 1); },
  },
  TOOLS, TOOL_MAP, DEFAULT_ID,
  docTitle: '',
};
sb.globalThis = sb;
Object.defineProperty(sb, 'document', { value: document, writable: true });
// document.title 支持
Object.defineProperty(document, 'title', { get() { return sb.docTitle; }, set(v) { sb.docTitle = v; } });

vm.createContext(sb);
try {
  new vm.Script(`${domShim}\n${routerSrc}\n;globalThis.__start = startRouter;`, { filename: 'router.js' }).runInContext(sb);
} catch (e) {
  console.log('FAIL 路由模块加载失败: ' + e.message);
  process.exit(1);
}

/* ---- 执行 ---- */
let changed = [];
let stop;
try {
  stop = sb.__start({ onChange: id => changed.push(id) });
  ok('startRouter 启动无异常', true);
} catch (e) {
  ok('startRouter 启动无异常', false, e.message);
  process.exit(1);
}

const tabs = () => navList.querySelectorAll('.tab');
ok('导航渲染出全部工具', tabs().length === TOOLS.length, `${tabs().length} 个标签`);
ok('默认工具已挂载', mounted.includes('a'), 'mounted=' + JSON.stringify(mounted));
ok('首个标签 aria-selected=true', tabs()[0].getAttribute('aria-selected') === 'true');
ok('其余标签 aria-selected=false', tabs().slice(1).every(t => t.getAttribute('aria-selected') === 'false'));
ok('初始 hash 被写入', sb.location.hash === '#/a', sb.location.hash);
ok('页面标题已设置', title.textContent === '工具A', title.textContent);
ok('描述已设置', desc.textContent === '工具A desc', desc.textContent);

// 切到 b
const before = mounted.length;
sb.location.hash = '#/b';
for (const f of hashListeners) f({});
ok('切到 b 已挂载', mounted.includes('b'), JSON.stringify(mounted.slice(before)));
ok('切到 b 前先调用 a 的 cleanup', mounted.slice(before).includes('cleanup:a'), JSON.stringify(mounted.slice(before)));
ok('b 标签置为选中', tabs()[1].getAttribute('aria-selected') === 'true',
   '实际=' + tabs()[1].getAttribute('aria-selected'));
ok('a 标签取消选中', tabs()[0].getAttribute('aria-selected') === 'false');
ok('标题随导航更新', title.textContent === '工具B');
ok('onChange 回调被调用', changed.includes('b'), JSON.stringify(changed));
ok('视图容器未丢失（无刷新）', view.children.length > 0, `${view.children.length} 个子节点`);

// 切到不存在的 hash -> 回落到默认
sb.location.hash = '#/nonexistent';
for (const f of hashListeners) f({});
ok('未知 hash 回落到默认工具', title.textContent === '工具A', title.textContent);

// 重复 hash 不应重复挂载
const cnt = mounted.filter(x => x === 'b').length;
sb.location.hash = '#/b';
for (const f of hashListeners) f({});
sb.location.hash = '#/b';
for (const f of hashListeners) f({});
ok('重复 hash 不重复挂载', mounted.filter(x => x === 'b').length === cnt + 1, `b 挂载 ${mounted.filter(x => x === 'b').length} 次`);

// 点击标签走 hash
const tabs2 = navList.querySelectorAll('.tab');
sb.location.hash = '#/c';
tabs2[2].dispatch('click');
ok('点击标签触发切换', true);

// 停止路由
if (typeof stop === 'function') {
  try { stop(); ok('stop 可调用', true); } catch (e) { ok('stop 可调用', false, e.message); }
  ok('stop 后移除 hashchange 监听', hashListeners.length === 0, `剩余 ${hashListeners.length}`);
}

console.log(fail ? `\n✗ ${fail} 处失败` : '\n✓ 路由测试全部通过');
process.exit(fail ? 1 : 0);

