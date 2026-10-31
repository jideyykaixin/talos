// 静态资源与结构自检：所有 href/src 指向的文件都必须真实存在，且不得指向绝对路径
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const bad = (msg) => { fail++; console.log('FAIL ' + msg); };
const ok = (msg) => console.log('OK   ' + msg);

/* 1. index.html 的本地引用 */
const htmlPath = join(siteRoot, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
let checked = 0;
for (const ref of refs) {
  if (/^(https?:|mailto:|data:|#|\/\/)/.test(ref)) {
    if (/^https?:/.test(ref)) console.log(`INFO 外部资源 ${ref}`);
    continue;
  }
  if (ref.startsWith('/')) { bad(`绝对路径（GitHub Pages 子目录会 404）: ${ref}`); continue; }
  const target = resolve(dirname(htmlPath), ref.split('#')[0].split('?')[0]);
  if (!existsSync(target)) bad(`引用不存在: ${ref}`);
  else { checked++; }
}
ok(`index.html 本地引用 ${checked} 处全部存在`);

/* 2. 页面必需的元素 id */
const required = ['sidebar', 'nav-list', 'view', 'page-title', 'page-desc', 'theme-toggle', 'toast', 'main'];
for (const id of required) {
  if (!html.includes(`id="${id}"`)) bad(`index.html 缺少必需元素 #${id}`);
}
ok(`必需元素 ${required.length} 个齐备`);

/* 3. 模块 import 图可解析（相对路径都指向存在的文件） */
function walkImports(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  if (!existsSync(file)) { bad(`模块缺失: ${file}`); return seen; }
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const t = resolve(dirname(file), m[1]);
    if (!existsSync(t)) bad(`import 目标缺失: ${m[1]}  (在 ${file.split(/[\\/]/).slice(-2).join('/')})`);
    else walkImports(t, seen);
  }
  return seen;
}
const entry = join(siteRoot, 'assets', 'js', 'app.js');
const mods = walkImports(entry);
ok(`模块图 ${mods.size} 个文件全部可解析`);

/* 4. CSS 无 @apply / theme()（link 引入不走 PostCSS），先剥掉注释再判断 */
const cssPath = join(siteRoot, 'assets', 'css', 'app.css');
const cssRaw = readFileSync(cssPath, 'utf8');
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, '');
if (/@apply\b/.test(css)) bad('app.css 含 @apply（<link> 引入不会被 Tailwind 处理）');
else ok('app.css 无 @apply');
if (/\btheme\(/.test(css)) bad('app.css 含 theme()（同上）');
else ok('app.css 无 theme()');

/* 5. CSS 里用到的自定义属性都有定义 */
const usedVars = new Set([...css.matchAll(/var\(--([\w-]+)/g)].map(m => m[1]));
const definedVars = new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map(m => m[1]));
for (const v of usedVars) if (!definedVars.has(v)) bad(`CSS 变量未定义: --${v}`);
ok(`CSS 变量 ${usedVars.size} 个引用均已定义`);

/* 6. 每个工具模块导出的契约 */
const reg = readFileSync(join(siteRoot, 'assets', 'js', 'core', 'registry.js'), 'utf8');
const ids = [...reg.matchAll(/from '\.\.\/tools\/([\w-]+)\.js'/g)].map(m => m[1]);
for (const id of ids) {
  const p = join(siteRoot, 'assets', 'js', 'tools', id + '.js');
  const src = readFileSync(p, 'utf8');
  const fields = {
    id: /id:\s*'[\w-]+'/.test(src),
    name: /name:\s*'[^']+'/.test(src),
    icon: /icon:\s*'[^']+'/.test(src),
    desc: /desc:\s*'[^']+'/.test(src),
    mount: /\bmount\s*\(/.test(src),
    defaultExport: /export default\s*\{/.test(src),
  };
  const missing = Object.entries(fields).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) bad(`工具 ${id} 缺少字段: ${missing.join(', ')}`);
  else ok(`工具 ${id} 契约完整`);
}

/* 7. 除 Tailwind CDN 外不得有网络依赖（SVG/XML 命名空间不算请求）
 *    config.js 里的快捷链接是用户主动点击才跳转的 href，不是运行时请求，豁免。 */
const NAMESPACE_OK = /^https?:\/\/www\.w3\.org\//;
const LINK_DATA_OK = /[\\/]dashboard[\\/]config\.js$/;
const allSrc = [...mods].map(f => [f, readFileSync(f, 'utf8')]);
for (const [f, src] of allSrc) {
  if (LINK_DATA_OK.test(f)) continue;
  const m = src.match(/https?:\/\/[^\s'"]+/g);
  if (m) {
    const real = m.filter(u => !NAMESPACE_OK.test(u));
    if (real.length) bad(`${f.split(/[\\/]/).pop()} 含外部 URL: ${real[0]}`);
  }
}
ok('模块内无网络依赖（仅 SVG 命名空间与快捷链接配置）');

/* 8. 文件体积报告 */
console.log('\n--- 体积 ---');
const sizes = [...mods].map(f => [f.replace(siteRoot, '').replace(/^[\\/]/, ''), statSync(f).size]);
let total = 0;
for (const [f, s] of sizes.sort((a, b) => b[1] - a[1])) {
  total += s;
  console.log(`  ${String(s).padStart(7)}  ${f}`);
}
console.log(`  ${String(total).padStart(7)}  合计（不含 CSS/HTML）`);
console.log(`  ${String(statSync(cssPath).size).padStart(7)}  assets/css/app.css`);
console.log(`  ${String(statSync(htmlPath).size).padStart(7)}  index.html`);

console.log(fail ? `\n✗ ${fail} 个问题` : '\n✓ 静态自检全部通过');
process.exit(fail ? 1 : 0);

