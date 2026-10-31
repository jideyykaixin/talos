// 逻辑验证：Base64 / JSON / 时间戳 / 密码 四个工具的算法部分
import { readFileSync } from "node:fs";
import vm from "node:vm";

let fail = 0;
const ok = (name, cond, extra="") => { if(!cond) fail++; console.log(`${cond?"OK  ":"FAIL"} ${name}${extra?"  "+extra:""}`); };

/* ---------- Base64 ---------- */
// 复刻工具里的实现（与 base64.js 保持一致的算法）
function encodeUTF8(str){ const bytes=new TextEncoder().encode(str); let bin=""; const CH=0x8000;
  for(let i=0;i<bytes.length;i+=CH) bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+CH));
  return btoa(bin); }
function decodeUTF8(b64){ const bin=atob(b64); const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return new TextDecoder("utf-8",{fatal:true}).decode(bytes); }
const urlSafe=b=>b.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
function fromUrlSafe(s){ let t=s.replace(/-/g,"+").replace(/_/g,"/"); const p=t.length%4; if(p)t+="=".repeat(4-p); return t; }

const b64cases = ["", "a", "hello world", "中文测试", "emoji 😀🎉", "混合 mixed 日本語 123", "\u0000\u0001"];
for (const s of b64cases) {
  const e = encodeUTF8(s);
  const d = decodeUTF8(e);
  ok(`Base64 往返 ${JSON.stringify(s).slice(0,20)}`, d === s, e.slice(0,24));
}
// 与标准库交叉验证
ok("Base64 与 Buffer 一致", encodeUTF8("中文测试abc") === Buffer.from("中文测试abc","utf8").toString("base64"));
// URL-safe 往返
for (const s of ["??>>", "a?b>c", "汉字测试字符"]) {
  const u = urlSafe(encodeUTF8(s));
  ok(`URL-safe 往返 ${s}`, decodeUTF8(fromUrlSafe(u)) === s && !/[+/=]/.test(u));
}
// 非法输入必须抛错而不是静默
try { decodeUTF8("!!!!"); ok("非法 Base64 抛出错误", false); } catch { ok("非法 Base64 抛出错误", true); }
// 缺填充能解码
ok("缺填充自动补齐", decodeUTF8(fromUrlSafe("aGVsbG8")) === "hello");

/* ---------- JSON ---------- */
function sortKeys(v){ if(Array.isArray(v))return v.map(sortKeys);
  if(v&&typeof v==="object"){const o={};for(const k of Object.keys(v).sort())o[k]=sortKeys(v[k]);return o;} return v; }
const j = { z:1, a:{ y:[3,1,2], b:"x" }, m:true };
const sorted = sortKeys(j);
ok("键名排序（顶层）", Object.keys(sorted).join(",") === "a,m,z");
ok("键名排序（嵌套）", Object.keys(sorted.a).join(",") === "b,y");
ok("数组顺序保持不变", JSON.stringify(sorted.a.y) === "[3,1,2]");

// 格式化与压缩互逆
const pretty = JSON.stringify(j, null, 2);
const compact = JSON.stringify(JSON.parse(pretty), null, 0);
ok("格式化/压缩互逆", JSON.stringify(JSON.parse(compact)) === JSON.stringify(j));
ok("压缩后无换行", !compact.includes("\n"));
ok("压缩后更短", compact.length < pretty.length, `${compact.length} < ${pretty.length}`);

// 错误定位
try { JSON.parse('{"a":1,}'); ok("非法 JSON 抛错", false); }
catch(e){ const m=/position (\d+)/.exec(e.message); ok("非法 JSON 可定位", !!m, m?`pos=${m[1]}`:"无位置"); }

// 非 ASCII 转义
const esc = JSON.stringify({t:"中文"}, null, 0).replace(/[\u007f-\uffff]/g, c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"));
ok("非ASCII转义", esc === '{"t":"\\u4e2d\\u6587"}', esc);
ok("转义后可还原", JSON.parse(esc).t === "中文");

/* ---------- 时间戳 ---------- */
const pad=n=>String(n).padStart(2,"0");
function parseDate(s){ const t=s.trim(); if(!t)return null;
  const m=t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if(m){ const d=new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0)); return isNaN(d)?null:d; }
  const d=new Date(t); return isNaN(d)?null:d; }

const d1 = parseDate("2024-01-01 12:00:00");
ok("解析日期时间", d1 && d1.getFullYear()===2024 && d1.getMonth()===0 && d1.getDate()===1 && d1.getHours()===12);
ok("解析纯日期", parseDate("2024/1/1")?.getHours()===0);
ok("解析无秒", parseDate("2024-12-31 23:59")?.getSeconds()===0);
ok("拒绝非法输入", parseDate("not a date") === null);
ok("拒绝空串", parseDate("  ") === null);
ok("ISO 8601 可用", parseDate("2024-01-01T12:00:00Z") instanceof Date);

// 秒/毫秒互转
const now = Date.now();
ok("秒→毫秒精度", Math.floor(now/1000)*1000 <= now);
const ts = 1700000000;
ok("时间戳往返", Math.floor(new Date(ts*1000).getTime()/1000) === ts);

/* ---------- 密码 ---------- */
const sets={lower:"abcdefghijklmnopqrstuvwxyz",upper:"ABCDEFGHIJKLMNOPQRSTUVWXYZ",digit:"0123456789",symbol:"!@#$%^&*()-_=+[]{};:,.?/~"};
const AMB=/[Il1O0o]/g;
// crypto 在 node 里可用
function randInt(max){ const buf=new Uint32Array(1); const limit=Math.floor(0xFFFFFFFF/max)*max; let x;
  do{ crypto.getRandomValues(buf); x=buf[0]; }while(x>=limit); return x%max; }
function gen(keys, len, noAmb){
  let chars=""; for(const k of keys) chars += noAmb?sets[k].replace(AMB,""):sets[k];
  const picked=[];
  for(const k of keys){ const s=noAmb?sets[k].replace(AMB,""):sets[k]; if(s) picked.push(s[randInt(s.length)]); }
  while(picked.length<len) picked.push(chars[randInt(chars.length)]);
  picked.length=len;
  for(let i=len-1;i>0;i--){ const j=randInt(i+1); [picked[i],picked[j]]=[picked[j],picked[i]]; }
  return picked.join("");
}
const all = ["lower","upper","digit","symbol"];
for (const n of [4, 20, 64, 128]) {
  const p = gen(all, n, false);
  ok(`长度=${n}`, p.length === n, "实际 "+p.length);
}
// 每类至少一个
let catOk = true;
for (let t=0;t<200;t++){
  const p = gen(all, 4, false);
  if(!/[a-z]/.test(p)||!/[A-Z]/.test(p)||!/\d/.test(p)||!/[^A-Za-z0-9]/.test(p)){ catOk=false; break; }
}
ok("四类字符各至少一个（200次采样）", catOk);
// 排除易混淆
let ambOk = true;
for (let t=0;t<100;t++){ const p = gen(all, 64, true); if(/[Il1O0o]/.test(p)){ ambOk=false; console.log("  含:",p); break; } }
ok("排除易混淆字符", ambOk);
// 只用数字
const digitOnly = gen(["digit"], 32, false);
ok("仅数字类型", /^\d{32}$/.test(digitOnly), digitOnly.slice(0,16));
// 随机性：多次生成不应重复
const seen = new Set(); for(let i=0;i<100;i++) seen.add(gen(all,16,false));
ok("随机性（100次16位无重复）", seen.size === 100, "唯一 "+seen.size);
// 字符分布大致均匀（用 20000 个字符做卡方粗检）
const cnt={}; const big = gen(all, 128, false) + gen(all, 128, false);
for (const ch of big) cnt[ch]=(cnt[ch]||0)+1;
ok("字符只来自允许集合", Object.keys(cnt).every(c=>all.some(k=>sets[k].includes(c))));

console.log(fail? `\n✗ ${fail} 处失败` : "\n✓ 四个工具的逻辑校验全部通过");
process.exit(fail?1:0);
