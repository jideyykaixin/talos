import { readFileSync } from "node:fs";
import vm from "node:vm";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const src = readFileSync(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '../assets/js/tools/qrcode.js'), "utf8");
const core = src.slice(0, src.indexOf("/* ---------------- UI"));
const sandbox = { TextEncoder, TextDecoder };
vm.createContext(sandbox);
new vm.Script(core.replace(/^\s*import[^;]*;\s*$/gm,"").replace(/^\s*export\s+/gm,"") + "\n;this.ex={makeQR};").runInContext(sandbox);
const { makeQR } = sandbox.ex;

// 计算图形函数区（与编码器无关的独立实现）
const ALIGN={1:[],2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]};
function isFn(ver,size,r,c){
  if(r<9&&c<9)return true; if(r<9&&c>=size-8)return true; if(r>=size-8&&c<9)return true;
  if(r===6||c===6)return true;
  for(const ar of ALIGN[ver])for(const ac of ALIGN[ver]){
    if((ar<=8&&ac<=8)||(ar<=8&&ac>=size-9)||(ar>=size-9&&ac<=8))continue;
    if(Math.abs(r-ar)<=2&&Math.abs(c-ac)<=2)return true;
  }
  if(ver>=7){ if(r>=size-11&&r<=size-9&&c<=5)return true; if(c>=size-11&&c<=size-9&&r<=5)return true; }
  return false;
}

// 统计数据位总数，用于计算"能承受多少随机位翻转"
for (const [len,ecl] of [[5,"M"],[37,"M"],[37,"H"],[120,"Q"]]) {
  const res = makeQR("Q".repeat(len), { ecl });
  const size = res.matrix.length, ver = (size-17)/4;
  let dataCells = 0;
  for(let r=0;r<size;r++)for(let c=0;c<size;c++) if(!isFn(ver,size,r,c)) dataCells++;
  console.log(`${ecl} v${String(ver).padStart(2)} 数据位=${String(dataCells).padStart(5)} 数据区字节≈${Math.floor(dataCells/8)}`);
}

// 一致性：同输入同参数必须产出完全相同的矩阵（确定性）
const a = makeQR("determinism test 123", { ecl: "M" });
const b = makeQR("determinism test 123", { ecl: "M" });
const same = JSON.stringify(a.matrix) === JSON.stringify(b.matrix);
console.log("\n确定性（同输入同输出）:", same ? "✓" : "✗");

// 不同内容应产出不同矩阵
const c1 = makeQR("hello", { ecl: "M" });
const c2 = makeQR("hellp", { ecl: "M" });
console.log("不同内容产出不同矩阵:", JSON.stringify(c1.matrix) !== JSON.stringify(c2.matrix) ? "✓" : "✗");

// 空字符串与超长
try { const z = makeQR("", { ecl: "M" }); console.log("空字符串:", z ? `v${z.version} 可生成 ✓` : "✗"); }
catch(e){ console.log("空字符串: 抛错 -", e.message); }
try { makeQR("x".repeat(500), { ecl: "L" }); console.log("500字节: 未抛错（异常）"); }
catch(e){ console.log("500字节超限:", /太长/.test(e.message) ? "✓ 正确报错" : "✗ 错误信息不符"); }


