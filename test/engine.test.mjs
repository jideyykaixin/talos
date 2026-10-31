/* engine.test.mjs — 每个测试对应 docs/RULES.md 的一条硬规则
   跑法：node --test test/        （node ≥ 18，本项目用 node 24）

   命名约定：T-<规则号> <行为>
   T-A 吃规则   T-B 开吃日   T-C 反缺陷回归   T-D 建议引擎 */

import test from "node:test";
import assert from "node:assert/strict";

import * as E from "../assets/js/engine.js";
import * as D from "../assets/js/data.js";

/* ---------- 测试小工具 ---------- */

/** 造局面：beasts = {房号: [兽种, 阶位]}，其余按"未开"处理 */
function mk(beasts = {}, over = {}) {
  const s = E.createState(over);
  for (const [room, [code, tier]] of Object.entries(beasts)) {
    s.rooms[Number(room)] = { code, tier, locked: false, empty: false, event: false };
  }
  return s;
}
const beast = (code, tier, room) => ({ code, tier, room });

/* =====================================================================
   T-A 吃规则
   ===================================================================== */

test("T-A1 同阶 + 克制 → 成立，升 1 阶", () => {
  const s = mk({});
  const a = beast("lion", 3, 1);
  const b = beast("wolf", 3, 2);
  assert.equal(E.canEat(a, b, s), true);
  assert.equal(E.eatNewTier(a, b, s), 4);
});

test("T-A2 同阶但不在食谱 → 不成立", () => {
  const s = mk({});
  const a = beast("wolf", 3, 1);
  const b = beast("lion", 3, 2);
  assert.equal(E.canEat(a, b, s), false);
});

test("T-A3 跨阶默认不成立（即使克制）", () => {
  const s = mk({});
  const a = beast("lion", 2, 1);   // 狮吃狼
  const b = beast("wolf", 3, 2);
  assert.equal(E.canEat(a, b, s), false, "向上跨阶需要象脚重锤");
  const a2 = beast("lion", 4, 1);
  const b2 = beast("wolf", 3, 2);
  assert.equal(E.canEat(a2, b2, s), false, "向下跨阶需要狼牙铡刀");
});

test("T-A4 铁冠：狂狮同阶任意吃 + 额外升阶", () => {
  const s = mk({ 1: ["lion", 3], 2: ["rat", 3] }, { tools: ["lioncrown"] });
  const a = E.occupants(s).find(p => p.room === 1);
  const b = E.occupants(s).find(p => p.room === 2);
  assert.equal(E.canEat(a, b, s), true, "狮本不吃鼠的同阶，但铁冠破例");
  assert.equal(E.eatNewTier(a, b, s), 6, "3 阶 +1 +2(铁冠)");

  // 铁冠的"同阶任意吃"是全局生效的：头狼拿铁冠也能吃同阶狂狮（口径见 RULES §C-4）
  const s2 = mk({ 1: ["wolf", 3], 2: ["lion", 3] }, { tools: ["lioncrown"] });
  const a2 = E.occupants(s2).find(p => p.room === 1);
  const b2 = E.occupants(s2).find(p => p.room === 2);
  assert.equal(E.canEat(a2, b2, s2), true, "持铁冠时同阶任意吃（不再要求克制）");

  // 没有铁冠就不行
  const s4 = mk({ 1: ["wolf", 3], 2: ["lion", 3] }, {});
  assert.equal(
    E.canEat(E.occupants(s4)[0], E.occupants(s4)[1], s4), false,
    "无刑具时同阶仍必须克制成立");

  // 同样的头狼 + 铁冠，对着自己食谱里同阶的硕鼠依然成立
  const s3 = mk({ 1: ["wolf", 3], 2: ["rat", 3] }, { tools: ["lioncrown"] });
  const a3 = E.occupants(s3).find(p => p.room === 1);
  const b3 = E.occupants(s3).find(p => p.room === 2);
  assert.equal(E.canEat(a3, b3, s3), true);
});

test("T-A5 狼牙铡刀向下跨阶 / 象脚重锤向上跨阶", () => {
  const down = mk({}, { tools: ["wolfblade"] });
  assert.equal(E.canEat(beast("wolf", 4, 1), beast("rat", 2, 2), down), true);
  assert.equal(E.eatNewTier(beast("wolf", 4, 1), beast("rat", 2, 2), down), 5);

  const up = mk({}, { tools: ["elefthammer"] });
  assert.equal(E.canEat(beast("elephant", 2, 1), beast("wolf", 4, 2), up), true);
  assert.equal(E.eatNewTier(beast("elephant", 2, 1), beast("wolf", 4, 2), up), 6, "目标阶 +2");
});

test("T-A6 鼠头串：鼠吃鼠 + 额外升阶；其他同种不放行", () => {
  const s = mk({}, { tools: ["rathead"] });
  assert.equal(E.canEat(beast("rat", 3, 1), beast("rat", 3, 2), s), true);
  assert.equal(E.eatNewTier(beast("rat", 3, 1), beast("rat", 3, 2), s), 6);

  const none = mk({});
  assert.equal(E.canEat(beast("rat", 3, 1), beast("rat", 3, 2), none), false);
  assert.equal(E.canEat(beast("wolf", 3, 1), beast("wolf", 3, 2), none), false);
});

test("T-A7 囚徒困斗 BUFF：泛用向下跨阶（不进 tools 也生效）", () => {
  const s = mk({}, { buffs: ["brawl"] });
  assert.equal(E.canEat(beast("lion", 4, 1), beast("rat", 1, 2), s), true);
  assert.equal(E.canEat(beast("lion", 1, 1), beast("rat", 4, 2), s), false, "BUFF 只给向下");
});

test("T-A8 口枷：全场（含自己与目标）≤3 时才额外升阶", () => {
  const few = mk({ 1: ["lion", 3], 2: ["wolf", 3] }, { tools: ["muzzle"] });
  assert.equal(E.eatNewTier(beast("lion", 3, 1), beast("wolf", 3, 2), few), 6,
    "场上 2 名 ≤ 3 → +3 额外");

  const three = mk({ 1: ["lion", 3], 2: ["wolf", 3], 3: ["rat", 1] }, { tools: ["muzzle"] });
  assert.equal(E.eatNewTier(beast("lion", 3, 1), beast("wolf", 3, 2), three), 6,
    "场上 3 名 = 3 → 仍触发（口径见 RULES §C-3）");

  const four = mk({ 1: ["lion", 3], 2: ["wolf", 3], 3: ["rat", 1], 4: ["rat", 1] }, { tools: ["muzzle"] });
  assert.equal(E.eatNewTier(beast("lion", 3, 1), beast("wolf", 3, 2), four), 4,
    "场上 4 名 → 不触发");
});

test("T-A9 绮彩（6 阶）不进沙盘、不能当食物", () => {
  const s = mk({ 1: ["lion", 5], 2: ["wolf", 5] });
  const occ = E.occupants(s);
  assert.equal(occ.length, 2);
  assert.equal(E.canEat(beast("lion", 5, 1), beast("wolf", 6, 2), s), false);
});

/* =====================================================================
   T-B 开吃日
   ===================================================================== */

test("T-B1 无刑具 / 黑白名单刑具 → 第 8 天", () => {
  assert.equal(E.eatStartDay(mk()), 8);
  assert.equal(E.eatStartDay(mk({}, { tools: ["blacklist"] })), 8);
  assert.equal(E.eatStartDay(mk({}, { tools: ["rope"] })), 8);
});

test("T-B2 早吃件 → 第 1 天（不被 8 覆盖）", () => {
  assert.equal(E.eatStartDay(mk({}, { tools: ["elefthammer"] })), 1);
  assert.equal(E.eatStartDay(mk({}, { tools: ["lioncrown", "claw"] })), 1);
});

test("T-B3 晚吃件 → 第 15 天；与早吃件同持取晚的那天", () => {
  assert.equal(E.eatStartDay(mk({}, { tools: ["coin"] })), 15);
  assert.equal(E.eatStartDay(mk({}, { tools: ["tusk", "redtrap", "chain"] })), 15);
  assert.equal(E.eatStartDay(mk({}, { tools: ["elefthammer", "coin"] })), 15);
});

test("T-B4 天数/剩余天数换算只有一个来源", () => {
  const s = mk({}, { days: 16, lastDay: 20 });
  assert.equal(E.remainingDays(s), 4);
  const moved = E.applyMove(s, 5).state;
  assert.equal(moved.days, 17);
  assert.equal(E.remainingDays(moved), 3);
  const last = mk({}, { days: 20, lastDay: 20 });
  assert.equal(E.remainingDays(last), 0);
  assert.equal(E.applyMove(last, 5).state.days, 20, "最后一天不再推进");
});

/* =====================================================================
   T-C 反缺陷回归 —— 对应原版工具被实测出的 11 个 bug
   ===================================================================== */

test("T-C1 空盘必须给引导（原版此分支永不可达）", () => {
  const s = E.createState();
  assert.equal(E.isEmptyBoard(s), true);
  const top = E.analyze(s)[0];
  assert.equal(top.prio, 0.5);
  assert.match(top.act, /录入/);
});

test("T-C2 ���池满时必须硬拦截，不再冒出彩建议（原版同时出现'停手'与'出彩'）", () => {
  const s = mk({ 1: ["lion", 5], 2: ["wolf", 5] }, { rainbow: D.RAINBOW_CAP, cur: 1, phase: "act" });
  const adv = E.analyze(s);
  assert.ok(adv.some(a => /彩池已满/.test(a.act)), "应有停手提示");
  assert.equal(adv.some(a => /出彩/.test(a.act)), false, "不应再建议出彩");
});

test("T-C3 被吃空的格子必须从今日选项移除（原版仍把它当'可开门'）", () => {
  const s = mk({ 3: ["lion", 5], 7: ["wolf", 5], 8: ["rat", 2] },
    { cur: 3, opts: [7, 8, 12], phase: "act" });
  const res = E.applyEat(s, 3, 7);
  assert.equal(res.result.ok, true);
  assert.equal(res.state.opts.includes(7), false, "7 号已被吃空，应从候选里消失");
  assert.equal(res.state.rooms[7].locked, true);
});

test("T-C4 吃过之后 state.swapped = true，'换'建议必须消失（原版不看 swapped）", () => {
  const s = mk({ 1: ["rat", 1], 2: ["lion", 5], 3: ["wolf", 5] }, { cur: 2, opts: [3], phase: "act" });
  const r1 = E.analyze(s);
  assert.ok(r1.some(a => /【换】/.test(a.act)) === false, "当前房是红兽，本来就不该换");

  const s2 = mk({ 1: ["rat", 1] }, { cur: 1, opts: [2], phase: "act" });
  const before = E.analyze(s2);
  assert.ok(before.some(a => /【换】/.test(a.act)), "白色阶应建议换");

  const after = E.applyEat(s2, 1, 1);
  assert.equal(after.result.ok, false, "不能吃自己");

  const swapped = E.applySwap(s2, { code: "lion", tier: 3 }).state;
  assert.equal(swapped.swapped, true);
  const adv = E.analyze(swapped);
  assert.equal(adv.some(a => /【换】/.test(a.act)), false, "换过之后不应再建议换");
});

test("T-C5 吃 → 升阶由引擎算，不需要用户手填", () => {
  const s = mk({ 1: ["lion", 3], 2: ["wolf", 3] }, { cur: 1, phase: "act" });
  const res = E.applyEat(s, 1, 2);
  assert.equal(res.result.newTier, 4);
  assert.equal(res.state.rooms[1].tier, 4);
  assert.equal(res.state.rooms[2].locked, true);
});

test("T-C6 升到彩 → 移出沙盘、彩池 +1、原房重新上锁", () => {
  const s = mk({ 3: ["lion", 5], 9: ["wolf", 5] }, { cur: 3, opts: [9], rainbow: 3, phase: "act" });
  const res = E.applyEat(s, 3, 9);
  assert.equal(res.result.rainbow, true);
  assert.equal(res.state.rainbow, 4);
  assert.equal(res.state.rooms[3].locked, true);
  assert.equal(E.occupants(res.state).length, 0);
});

test("T-C7 彩池满时不执行吃（拒绝结算）", () => {
  const s = mk({ 3: ["lion", 5], 9: ["wolf", 5] }, { rainbow: D.RAINBOW_CAP });
  const res = E.applyEat(s, 3, 9);
  assert.equal(res.result.ok, false);
  assert.equal(res.result.reason, "RAINBOW_FULL");
});

test("T-C8 '去 X 号开房' 只在今日候选里出现（原版不排除非候选房）", () => {
  // 只有 5 号是今日候选：12 号、2 号都未开但不在候选里 → 只许推 5 号
  const s = mk({ 1: ["lion", 2] }, { cur: 1, opts: [5], phase: "act" });
  const adv = E.analyze(s).filter(a => /开房/.test(a.act));
  const rooms = adv.map(a => Number(a.act.match(/(\d+) 号/)[1]));
  assert.deepEqual(rooms, [5], "只有候选里的未开房才允许推荐");

  // 候选格已经被开过 → 不该再推（走过去没意义）
  const s2 = mk({ 1: ["lion", 2], 5: ["rat", 1] }, { cur: 1, opts: [5], phase: "act" });
  const adv2 = E.analyze(s2).filter(a => /开房/.test(a.act));
  assert.equal(adv2.length, 0, "5 号已开，不该再建议去开房");
});

test("T-C9 当前房发起的配对优先于'走开去别处吃'（原版只按当前房算，这条锁住口径）", () => {
  const s = mk({ 2: ["lion", 5], 6: ["wolf", 5] }, { cur: 2, opts: [6], phase: "act" });
  const adv = E.analyze(s);
  const top = adv[0];
  assert.match(top.act, /出彩/);
  assert.equal(top.prio, D.RULES.prio.RAINBOW);
});

test("T-C10 审讯室：第 ≤10 天煽动，≥11 天赏赐（原版硬编码在 analyzer 内部）", () => {
  const early = E.analyze(mk({ 2: ["lion", 2] }, { cur: D.IX_ROOM, days: 5, phase: "act" }));
  assert.ok(early.some(a => /煽动/.test(a.act)));

  const late = E.analyze(mk({ 2: ["lion", 2] }, { cur: D.IX_ROOM, days: 12, phase: "act" }));
  assert.ok(late.some(a => /赏赐/.test(a.act)));
  assert.equal(late.some(a => /煽动/.test(a.act)), false);
});

test("T-C11 铺场流会把低阶互吃排到 6.6（原版 4.5/6.6 混用）", () => {
  const beasts = { 1: ["lion", 2], 2: ["wolf", 2] };

  const spread = E.analyze(mk(beasts, { cur: 1, tools: ["coin"], opts: [2], phase: "act" }));
  const rowSpread = spread.find(a => /吃/.test(a.act) && a.prio === 6.6);
  assert.ok(rowSpread, "铺场流低阶互吃 prio 应为 6.6");

  const eatFlow = E.analyze(mk(beasts, { cur: 1, tools: ["collar"], opts: [2], phase: "act" }));
  assert.equal(eatFlow.some(a => a.prio === 6.6), false, "吃流不应出现 6.6");
});

/* =====================================================================
   T-D 建议引擎 · 开吃日与典藏
   ===================================================================== */

test("T-D1 未到开吃日时给出'先留着别吃'警告", () => {
  const s = mk({ 1: ["lion", 2], 2: ["wolf", 2] }, { cur: 1, days: 3, tools: [], phase: "act" });
  const adv = E.analyze(s);
  assert.ok(adv.some(a => /开吃日还没到/.test(a.act)));
});

test("T-D2 到了开吃日就不再警告", () => {
  const s = mk({ 1: ["lion", 2], 2: ["wolf", 2] }, { cur: 1, days: 9, tools: [], phase: "act" });
  assert.equal(E.analyze(s).some(a => /开吃日还没到/.test(a.act)), false);
});

test("T-D3 典藏：第 19 天且有可吃传奇 → 斗争铜号", () => {
  const s = mk({ 1: ["lion", 4], 2: ["wolf", 4] }, { days: 19 });
  assert.equal(E.recommendTreasure(s).id, "horn");
});

test("T-D4 典藏：稀以下 < 4 名 → 三首扳指", () => {
  const s = mk({ 1: ["lion", 4], 2: ["wolf", 4] }, { days: 5 });
  assert.equal(E.recommendTreasure(s).id, "ring");
});

test("T-D5 典藏：默认赤色佳酿", () => {
  const s = mk({ 1: ["lion", 1], 2: ["wolf", 1], 3: ["rat", 1], 4: ["elephant", 1], 5: ["lion", 4] }, { days: 12 });
  assert.equal(E.recommendTreasure(s).id, "wine");
});

test("T-D6 连吃路径能算到底并正确处理出彩", () => {
  // 无刑具：狂狮 4 阶吃头狼 4 阶 → 至臻 5；下一口跨阶不成立 → 路径应在这里停
  const s = mk({ 1: ["lion", 4], 2: ["wolf", 4], 3: ["rat", 4] }, {});
  const path = E.chainPath(s, 1);
  assert.equal(path.length, 1, "第二口需要跨阶刑具，没有就该停");
  assert.equal(path[0].tier, 5);

  // 铁冠在手：狂狮 4 阶吃同阶 → +1+2 = 7 → 夹紧到 6，直接出彩，路径终止于彩
  const s2 = mk({ 1: ["lion", 4], 2: ["wolf", 4], 3: ["rat", 4] }, { tools: ["lioncrown"] });
  const p2 = E.chainPath(s2, 1);
  assert.equal(p2.length, 1, "出彩后立即终止");
  assert.equal(p2[0].tier, 6);
  assert.equal(p2[0].rainbow, true, "出彩后路径终止");
});

/* =====================================================================
   T-E 数据完整性（防止有人手改 data.js 引入脏数据）
   ===================================================================== */

test("T-E1 刑具表 31 件、id 唯一、score 为数字", () => {
  assert.equal(D.TOOLS.length, 31);
  const ids = new Set(D.TOOLS.map(t => t.id));
  assert.equal(ids.size, D.TOOLS.length);
  for (const t of D.TOOLS) {
    assert.equal(typeof t.score, "number", `${t.name} 缺 score`);
    assert.ok(["eat", "spread", "swap"].includes(t.flow), `${t.name} flow 非法`);
  }
});

test("T-E2 食物链是闭合环形（象→狮→狼→鼠→象）", () => {
  for (const k of D.SPECIES_LIST) {
    assert.ok(D.SPECIES[k].prey.length > 0, `${k} 没有猎物`);
    for (const p of D.SPECIES[k].prey) assert.ok(D.SPECIES[p], `${k} 的猎物 ${p} 不存在`);
  }
  assert.ok(D.SPECIES.rat.prey.includes("elephant"));
  assert.ok(D.SPECIES.lion.prey.includes("rat"));
});

test("T-E3 优先级表覆盖引擎用到的每个 key", () => {
  const used = ["RAINBOW", "RISE_RED", "CROSS_RAINBOW", "CROSS", "HOLD_FOR_EAT_DAY",
    "SWAP_COMMON", "SWAP_MAGIC", "END_DAY", "PAIR", "MARK_EVENTS", "GO_EVENT",
    "EVENT_REPLY", "OPEN_ROOM", "GO_AND_EAT", "CHAIN_WARN", "GUARD", "STUCK", "DONE"];
  for (const k of used) assert.equal(typeof D.RULES.prio[k], "number", `缺 prio.${k}`);
});

test("T-E4 环形距离：1→16 是 15，顺时针单调", () => {
  assert.equal(E.fwd(1, 2), 1);
  assert.equal(E.fwd(16, 1), 1);
  assert.equal(E.fwd(1, 16), 15);
  assert.equal(E.dist(1, 9), 8);
});
