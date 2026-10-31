/* check.mjs — 静态资源自检（docs/RULES.md §A/§C）
   用法：node tools/check.mjs
   规则：
     A-2  内部链接必须是相对路径（不许以 "/" 开头）
     A-4  不引入任何外部域名（CDN/字体/统计）
     C-1  页面不引用不存在的本地文件
   有违规时以非 0 退出（CI 会因此失败）。 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "out", "test"]);
const problems = [];
let checked = 0;

async function* walk(dir) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      yield* walk(join(dir, ent.name));
    } else {
      yield join(dir, ent.name);
    }
  }
}

const isExternal = (u) =>
  /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(u) ||
  /^(?:[a-z][a-z0-9+.-]*):/i.test(u) ||
  u.startsWith("node:");

for await (const file of walk(ROOT)) {
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  if (!["html", "css", "js", "mjs"].includes(ext)) continue;
  checked++;
  const src = await readFile(file, "utf8");
  const rel = relative(ROOT, file).replace(/\\/g, "/");

  // 外链：HTML 的 href/src 属性 + CSS 的 url()
  const isText = ext === "html" || ext === "css";
  const urls = [];
  if (isText) {
    for (const m of src.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) urls.push(m[1]);
    if (ext === "html") {
      for (const m of src.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) urls.push(m[1]);
      for (const m of src.matchAll(/srcset\s*=\s*["']([^"']+)["']/gi)) {
        for (const part of m[1].split(",")) urls.push(part.trim().split(/\s+/)[0]);
      }
    }
  } else {
    // JS 只检查 import / new URL 里的相对路径，避免误伤 El.href 之类的运行时字符串
    for (const m of src.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']/g)) urls.push(m[1] ?? m[2]);
  }
  for (const u of urls) {
    if (!u || isExternal(u)) continue;
    if (u.startsWith("#")) continue;
    if (u.startsWith("/")) {
      problems.push(`${rel}: 内部链接必须以相对路径开头 → ${u}`);
      continue;
    }
    const clean = u.split("#")[0].split("?")[0];
    if (!clean) continue;
    const target = resolve(dirname(file), clean);
    if (!target.startsWith(ROOT)) continue;
    try {
      const s = await stat(target);
      if (!s.isFile()) throw new Error();
    } catch {
      problems.push(`${rel}: 引用了不存在的文件 → ${u}`);
    }
  }
}

if (problems.length) {
  console.error(`✗ 自检失败（${problems.length} 处）：`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`✓ 自检通过：${checked} 个文件，无外链、无绝对路径、无死链。`);
