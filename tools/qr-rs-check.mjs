import { readFileSync } from "node:fs";
import vm from "node:vm";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const src = readFileSync(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '../assets/js/tools/qrcode.js'), "utf8");
const core = src.slice(0, src.indexOf("/* ---------------- UI"));
const sandbox = { TextEncoder, TextDecoder };
vm.createContext(sandbox);
new vm.Script(core.replace(/^\s*import[^;]*;\s*$/gm,"").replace(/^\s*export\s+/gm,"") + "\n;this.ex={EC_TABLE,TOTAL_CODEWORDS,rsEncode};").runInContext(sandbox);
const { EC_TABLE, TOTAL_CODEWORDS, rsEncode } = sandbox.ex;

// 用规范里的已知向量验证 RS：ISO/IEC 18004 Annex I 示例（5-Q）
// 数据码字 [32,91,11,120,209,114,220,77,67,64,236,17,236,17,236,17]
// 期望的 18 个纠错码字
const data = [32,91,11,120,209,114,220,77,67,64,236,17,236,17,236,17];
const expect = [196,35,39,119,235,215,231,226,93,23,0,0,0,0,0,0,0,0];
// 上面期望值不含 padding 差异，改用更可靠的检查：纠错码字应让整个码字多项式被生成多项式整除
const got = rsEncode(data, 18);
console.log("RS 输出长度:", got.length);

// 自检：把 (data+ec) 当作多项式，除以生成多项式，余数必须全 0
const EXP=new Uint8Array(512),LOG=new Uint8Array(256);
{let x=1;for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&0x100)x^=0x11D;}for(let i=255;i<512;i++)EXP[i]=EXP[i-255];}
const mul=(a,b)=>(a===0||b===0)?0:EXP[LOG[a]+LOG[b]];
function gen(n){let p=[1];for(let i=0;i<n;i++){const nx=new Array(p.length+1).fill(0);for(let j=0;j<p.length;j++){nx[j]^=p[j];nx[j+1]^=mul(p[j],EXP[i]);}p=nx;}return p;}
function remainder(poly, g){
  const r = poly.slice();
  for(let i=0;i<r.length-(g.length-1);i++){
    const c=r[i];
    if(c===0) continue;
    for(let j=0;j<g.length;j++) r[i+j]^=mul(g[j],c);
  }
  return r.slice(r.length-(g.length-1));
}

let bad=0;
for (const n of [7,10,13,16,17,18,20,22,24,26,28,30]) {
  const g = gen(n);
  const testData = data.concat(new Array(Math.max(0,40)).fill(0)).slice(0,40);
  const ec = rsEncode(testData, n);
  const rem = remainder(testData.concat(ec), g);
  const ok = rem.every(v=>v===0);
  if(!ok) bad++;
  console.log(`ecLen=${String(n).padStart(2)} 余数全零=${ok?"是":"否"} ${ok?"":"<<< RS 错误"}`);
}
console.log(bad? `\n✗ RS 编码有 ${bad} 处错误` : "\n✓ RS 纠错编码正确（余式全零）");


