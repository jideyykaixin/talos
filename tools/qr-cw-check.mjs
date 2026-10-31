import { readFileSync } from "node:fs";
import vm from "node:vm";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const src = readFileSync(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '../assets/js/tools/qrcode.js'), "utf8");
const core = src.slice(0, src.indexOf("/* ---------------- UI"));
const sandbox = { TextEncoder, TextDecoder };
vm.createContext(sandbox);
new vm.Script(core.replace(/^\s*import[^;]*;\s*$/gm,"").replace(/^\s*export\s+/gm,"") + "\n;this.ex={EC_TABLE,TOTAL_CODEWORDS,encodeData};").runInContext(sandbox);
const { EC_TABLE, TOTAL_CODEWORDS, encodeData } = sandbox.ex;

// 逐版本逐等级：用 L 等级能容纳的最大数据量构造，检查码字总数
let bad = 0;
for (let v = 1; v <= 10; v++) {
  for (let e = 0; e < 4; e++) {
    const [ecPer, blocks] = EC_TABLE[v][e];
    const dataWords = TOTAL_CODEWORDS[v] - ecPer * blocks;
    const payload = dataWords - (v < 10 ? 2 : 3);   // 模式+计数占用
    const bytes = new Uint8Array(Math.max(1, payload));
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    const cw = encodeData(bytes, v, e);
    const expect = TOTAL_CODEWORDS[v];
    const ok = cw.length === expect && cw.every(x => Number.isInteger(x) && x >= 0 && x < 256);
    if (!ok) { bad++; console.log(`v${v}-${"LMQH"[e]} 码字数 ${cw.length} != ${expect}`); }
  }
}
console.log(bad ? `${bad} 处长度不符` : "所有版本/等级的码字总数正确");

// 关键复算：块长度分布
console.log("\n块长度分布（数据块）:");
for (const [v,e] of [[4,2],[4,3],[6,0],[7,1],[9,0],[10,1]]) {
  const [ecPer, blocks] = EC_TABLE[v][e];
  const dataWords = TOTAL_CODEWORDS[v] - ecPer*blocks;
  const shortLen = Math.floor(dataWords/blocks), numLong = dataWords%blocks;
  const lens = [];
  for (let i=0;i<blocks;i++) lens.push(shortLen + (i>=blocks-numLong?1:0));
  console.log(`  v${v}-${"LMQH"[e]} total=${dataWords} blocks=${blocks} -> [${lens.join(",")}]  sum=${lens.reduce((a,b)=>a+b,0)}`);
}


