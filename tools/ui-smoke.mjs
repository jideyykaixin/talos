// 不依赖浏览器的 UI 冒烟测试：给模块提供最小 DOM 替身，跑一遍 mount()，
// 验证 —— 不抛异常、关键节点被创建、事件能被触发、返回值是函数或 undefined。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let fail = 0;
const ok = (n, c, e = '') => { if (!c) fail++; console.log(`${c ? 'OK  ' : 'FAIL'} ${n}${e ? '  ' + e : ''}`); };

/* ---------------- 极简 DOM 替身 ---------------- */
class ClassList {
  constructor(node) { this.node = node; this.set = new Set(); }
  add(...c) { c.forEach(x => this.set.add(x)); this._sync(); }
  remove(...c) { c.forEach(x => this.set.delete(x)); this._sync(); }
  toggle(c, on) { if (on === undefined) on = !this.set.has(c); on ? this.set.add(c) : this.set.delete(c); this._sync(); return on; }
  contains(c) { return this.set.has(c); }
  _sync() { this.node._className = [...this.set].join(' '); }
}

class Node {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.attributes = {};
    this.style = {};
    this.dataset = {};
    this.value = '';
    this.checked = false;
    this.textContent = '';
    this._className = '';
    this.classList = new ClassList(this);
    this.id = '';
    this.readOnly = false;
  }
  get nodeType() { return 1; }
  get className() { return this._className; }
  set className(v) { this._className = v; this.classList.set = new Set(String(v).split(/\s+/).filter(Boolean)); }
  append(...ns) { for (const n of ns) { if (n == null) continue; const node = n.nodeType ? n : new Text(n); node.parentNode = this; this.children.push(node); } }
  appendChild(n) { this.append(n); return n; }
  replaceChildren(...ns) { this.children = []; this.append(...ns); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter(f => f !== fn); }
  dispatch(t, ev = {}) { for (const fn of this.listeners[t] || []) fn({ target: this, preventDefault() {}, ...ev }); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  querySelectorAll(sel) {
    const out = [];
    const match = (n) => {
      if (sel.startsWith('#')) return n.id === sel.slice(1);
      if (sel.startsWith('.')) return n.classList.contains(sel.slice(1));
      return n.tagName === sel.toUpperCase();
    };
    const walk = (n) => { for (const c of n.children) { if (match(c)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  focus() {}
  select() {}
  remove() {
    const p = this.parentNode;
    if (p) { p.children = p.children.filter(c => c !== this); this.parentNode = null; }
  }
  click() { this.dispatch('click'); }
  scrollIntoView() {}
  getContext() { return { fillRect() {}, fillStyle: '' }; }
  toBlob(cb) { cb({}); }
  set innerHTML(v) { this._html = v; }
  get innerHTML() { return this._html ?? ''; }
}

class Text extends Node {
  constructor(t) { super('#text'); this.textContent = String(t); }
  get nodeType() { return 3; }
}

function makeDocument() {
  const html = new Node('html');
  const body = new Node('body');
  const doc = {
    html, body,
    documentElement: html,
    visibilityState: 'visible',
    listeners: {},
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter(f => f !== fn); },
    dispatch(t, ev = {}) { for (const fn of this.listeners[t] || []) fn({ target: this, preventDefault() {}, ...ev }); },
    _byId: {},
    createElement: (t) => { const n = new Node(t); n.ownerDocument = doc; return n; },
    createTextNode: (t) => new Text(t),
    getElementById(id) { return this._byId[id] ?? null; },
    querySelector(sel) { return this._all().find(matchOf(sel)) ?? null; },
    querySelectorAll(sel) { return this._all().filter(matchOf(sel)); },
    _all() { return [this.body, ...this.body.querySelectorAll('*')]; },
  };
  function matchOf(sel) {
    return (n) => sel.startsWith('#') ? n.id === sel.slice(1) : n.classList.contains(sel.slice(1));
  }
  return doc;
}

/* ---------------- 加载工具模块 ---------------- */
const toolPath = process.argv[2] || new URL('../assets/js/tools/timestamp.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const src = readFileSync(toolPath, 'utf8');

/** 收集一个模块顶层的具名导出（const/let/var/function/class） */
function namesOf(src) {
  const out = new Set();
  for (const m of src.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]);
  out.delete('__default');
  return [...out];
}

/** 递归把 import 的模块源码拼进来，这样 dashboard.js 里的
 *  `import * as clock from '../dashboard/clock.js'` 也能跑。
 *  只支持本站用到的写法：`export default`、`export const/function`、`import * as ns`、具名 import。 */
function bundle(file, depth = 0) {
  if (depth > 4) throw new Error('import 嵌套过深');

  const strip = (s) => s
    // import * as ns from './x.js' → 占位符，后面按命名空间收集
    .replace(/^\s*import\s+\*\s+as\s+([\w$]+)\s+from\s+['"]([^'"]+)['"];?\s*$/gm,
      (_, ns, spec) => `/*NS:${ns}=${spec}*/`)
    // import { a, b } from './x.js'
    .replace(/^\s*import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
    // import name from './x.js'
    .replace(/^\s*import\s+[\w$]+\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
    // export default { ... } → const __default = { ... }
    .replace(/^\s*export\s+default\s+/gm, 'const __default = ')
    // export const / export function → 去掉 export
    .replace(/^\s*export\s+(?=(const|let|var|function|class|async|function\*))/gm, '');

  let text = strip(readFileSync(file, 'utf8'));

  const specs = [...text.matchAll(/\/\*NS:([\w$]+)=([^*]+)\*\//g)];
  const loaded = [];
  for (const [, ns, spec] of specs) {
    let inner;
    if (spec.includes('core/dom.js')) {
      // dom.js 由下面的 domShim 提供，直接引用它的函数
      inner = `const ${ns} = { el, $, $$, debounce, copyText, toast };`;
    } else if (spec.includes('core/storage.js')) {
      inner = `const ${ns} = { load, save, remove, clearAll };`;
    } else {
      const sub = bundle(resolve(dirname(file), spec.trim()), depth + 1);
      if (/^const __default = /m.test(sub)) {
        inner = `const ${ns} = (function(){\n${sub}\nreturn __default; })();`;
      } else {
        // 只有具名导出的模块（如 clock.js 导出 greeting/create），返回命名空间对象
        inner = `const ${ns} = (function(){\n${sub}\nreturn { ${namesOf(sub).join(', ')} }; })();`;
      }
    }
    loaded.push(inner);
    text = text.replace(`/*NS:${ns}=${spec}*/`, '');
  }
  return loaded.join('\n') + '\n' + text;
}

let code;
try {
  code = bundle(toolPath);
} catch (e) {
  console.log('FAIL 模块打包失败: ' + e.message);
  process.exit(1);
}

// 提供 dom.js 的等价实现
const domShim = `
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === 'id') { node.id = v; document._byId[v] = node; }
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  if (attrs && attrs.id) document._byId[attrs.id] = node;
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c && c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
};
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => root.querySelectorAll(sel);
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const copyText = async () => true;
const toast = (msg) => { globalThis.__lastToast = msg; };
// storage.js 的等价实现：用内存 Map 模拟 localStorage，便于验证持久化行为
const __store = new Map();
const load = (key, fallback = null) => __store.has(key) ? JSON.parse(__store.get(key)) : fallback;
const save = (key, value) => { try { __store.set(key, JSON.stringify(value)); return true; } catch { return false; } };
const remove = (key) => { __store.delete(key); };
const clearAll = () => { __store.clear(); };
`;

const document = makeDocument();
const winListeners = {};
const sandbox = {
  document,
  TextEncoder, TextDecoder,
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  Blob: class { constructor(p) { this.size = Buffer.byteLength(String(p[0] ?? '')); } },
  crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 4294967296); return a; } },
  URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  navigator: { clipboard: null },
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  location: { hash: '', href: '' },
  history: { replaceState() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  setTimeout, clearTimeout, setInterval, clearInterval, console,
  // window 由 sandbox 自身充当（script 里访问的 window.* 都落到这里）
  addEventListener: (t, fn) => { (winListeners[t] ||= []).push(fn); },
  removeEventListener: (t, fn) => { winListeners[t] = (winListeners[t] || []).filter(f => f !== fn); },
  window: {},
  globalThis: null,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
const wrapped = `
(function(){
${domShim}
${code}
globalThis.__tool = __default;
globalThis.__exports = Object.keys({ ${''} });
})();
`;
try {
  new vm.Script(wrapped, { filename: toolPath }).runInContext(sandbox);
} catch (e) {
  console.log('FAIL 模块加载失败: ' + e.message);
  process.exit(1);
}

const tool = sandbox.__tool;
ok('模块可加载并导出默认对象', !!tool);
ok('contract: id/name/icon/desc/mount', !!(tool.id && tool.name && tool.icon && tool.desc && typeof tool.mount === 'function'),
   tool.id);
ok('mount 是函数', typeof tool.mount === 'function');

/* ---------------- 跑 mount ---------------- */
const rootNode = document.createElement('div');
document._byId['toast'] = (() => { const n = document.createElement('div'); n.id = 'toast'; document.body.append(n); return n; })();

let ret, threw = null;
try {
  ret = tool.mount(rootNode);
} catch (e) {
  threw = e;
}
ok('mount() 不抛异常', !threw, threw ? threw.message : '');
const retOk = ret === undefined || typeof ret === 'function'
  || (ret && typeof ret === 'object' && typeof ret.destroy === 'function');
ok('mount() 返回值合法', retOk, ret === undefined ? 'undefined' : typeof ret === 'object' ? '{destroy}' : typeof ret);
ok('mount() 产出了 DOM 节点', rootNode.children.length > 0, `${rootNode.children.length} 个顶层节点`);

/* 对照数量 */
const all = [];
(function collect(n) { for (const c of n.children) { all.push(c); collect(c); } })(rootNode);
const inputs = all.filter(n => n.tagName === 'INPUT');
const textareas = all.filter(n => n.tagName === 'TEXTAREA');
const buttons = all.filter(n => n.tagName === 'BUTTON');
const selects = all.filter(n => n.tagName === 'SELECT');
console.log(`     节点统计: 共 ${all.length} | input ${inputs.length} | textarea ${textareas.length} | button ${buttons.length} | select ${selects.length}`);

ok('至少有一个输入控件', inputs.length + textareas.length > 0);
ok('至少有一个按钮', buttons.length > 0);

/* 触发所有按钮点击（模拟用户逐个点一遍），不应抛异常 */
let clickErr = null;
for (const b of buttons) {
  try { b.dispatch('click'); } catch (e) { clickErr = e; break; }
}
ok('按钮点击全部无异常', !clickErr, clickErr ? clickErr.message : `${buttons.length} 个按钮`);

/* textarea 输入触发 */
let inputErr = null;
for (const ta of textareas) {
  ta.value = '测试 input 内容 123';
  try { ta.dispatch('input'); } catch (e) { inputErr = e; break; }
}
ok('textarea 输入无异常', !inputErr, inputErr ? inputErr.message : '');

/* input 输入触发 */
let ie = null;
for (const i of inputs) {
  if (i.readOnly) continue;
  i.value = i.type === 'checkbox' ? i.checked : '42';
  try { i.dispatch('input'); } catch (e) { ie = e; break; }
}
ok('input 输入无异常', !ie, ie ? ie.message : '');

/* select 变化 */
let se = null;
for (const s of selects) {
  try { s.dispatch('change'); } catch (e) { se = e; break; }
}
ok('select change 无异常', !se, se ? se.message : '');

/* cleanup 可调用 */
if (typeof ret === 'function') {
  try { ret(); ok('cleanup() 可调用', true); } catch (e) { ok('cleanup() 可调用', false, e.message); }
} else if (ret && typeof ret === 'object' && typeof ret.destroy === 'function') {
  try { ret.destroy(); ok('destroy() 可调用', true); } catch (e) { ok('destroy() 可调用', false, e.message); }
}

console.log(fail ? `\n✗ ${fail} 处失败` : `\n✓ ${tool.id} 冒烟测试通过`);
process.exit(fail ? 1 : 0);

