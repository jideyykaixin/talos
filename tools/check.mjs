// 语法自检：把 ES 模块当普通脚本解析（剥离 import/export 语句后交给 vm.Script 解析）
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jsRoot = join(root, 'assets', 'js');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.js')) files.push(p);
  }
})(jsRoot);

/* 把模块语法改写为可在脚本环境解析的形式：
 *   import x from '...'          -> 删除
 *   import { a, b } from '...'   -> const { a, b } = {};
 *   import * as ns from '...'    -> const ns = {};
 *   export default {             -> const __default = {
 *   export const/let/function …  -> 去掉 export 前缀
 *   export { … }                 -> 删除
 */
function stripModuleSyntax(src) {
  return src
    .replace(/^\s*import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+\*\s+as\s+\w+\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+[\w$]+\s+from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, 'const __default = ')
    .replace(/^\s*export\s+(?=(const|let|var|function|class|async))/gm, '')
    .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '');
}

let fail = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  try {
    new vm.Script(stripModuleSyntax(src), { filename: f });
    console.log('OK   ' + relative(root, f));
  } catch (e) {
    fail++;
    console.log('FAIL ' + relative(root, f) + '\n     ' + e.message);
  }
}

// 校验 registry 引用的工具文件都存在且导出契约完整
const registry = readFileSync(join(jsRoot, 'core', 'registry.js'), 'utf8');
const imports = [...registry.matchAll(/from '\.\.\/tools\/([\w-]+)\.js'/g)].map(m => m[1]);
for (const id of imports) {
  const p = join(jsRoot, 'tools', id + '.js');
  try {
    const size = statSync(p).size;
    const src = readFileSync(p, 'utf8');
    // 契约：默认导出对象里要有 id / name / mount
    const ok = /export default\s*\{/.test(src)
      && /id:\s*'/.test(src)
      && /name:\s*'/.test(src)
      && /\bmount\s*\(/.test(src);
    console.log(`TOOL ${id.padEnd(10)} ${String(size).padStart(6)} bytes  contract:${ok ? 'ok' : 'MISSING'}`);
    if (!ok) fail++;
  } catch {
    console.log(`TOOL ${id}  MISSING FILE`);
    fail++;
  }
}

console.log(fail ? `\n✗ ${fail} 个问题` : '\n✓ 全部通过');
process.exit(fail ? 1 : 0);

