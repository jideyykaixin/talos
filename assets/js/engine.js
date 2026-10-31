/* ==========================================================================
   engine.js — 纯规则引擎（docs/RULES.md §C / §D）
   · 无 DOM、无 localStorage、无 Date.now：同样输入 → 同样输出
   · 可被浏览器 import，也可被 `node --test` 直接 import
   · 所有游戏数值来自 data.js，本文件不含任何"魔法数字"以外的业务常量
   ========================================================================== */

import {
  SPECIES, SPECIES_LIST, TIERS, TIER_MAX, TIER_RAINBOW, RAINBOW_CAP,
  TIER_NAME, ROOM_COUNT, IX_ROOM, MAX_OPTIONS, DAYS_DEFAULT,
  TOOL_BY_ID, BUFF_BY_ID, TOOL_IDS,
  EAT_START_DEFAULT, EAT_EARLY_TOOLS, EAT_LATE_TOOLS, EAT_DEFAULT_TOOLS,
  RULES,
} from "./data.js";

const P = RULES.prio;

/* ==========================================================================
   1. 环形距离
   ========================================================================== */

/** 顺时针单向距离 a→b（不含起点，含终点），1..15 */
export function fwd(a, b) {
  return ((Number(b) - Number(a) + ROOM_COUNT) % ROOM_COUNT) || ROOM_COUNT;
}
/** 双向最短距离 */
export function dist(a, b) {
  const d = fwd(a, b);
  return Math.min(d, ROOM_COUNT - d);
}

/* ==========================================================================
   2. 局面读写
   ========================================================================== */

/** 造一个全新局面：1 号房 = 审讯室（已开），其余未开 */
export function createState(over = {}) {
  const rooms = {};
  for (let i = 1; i <= ROOM_COUNT; i++) {
    rooms[i] = { code: null, tier: null, locked: i !== IX_ROOM, empty: false, event: false };
  }
  return {
    days: 1,                 // 第几天（1..lastDay），默认值在 normalizeState 里按 lastDay 夹紧
    lastDay: DAYS_DEFAULT,
    rainbow: 0,              // 已出绮彩数（彩池）
    cur: IX_ROOM,            // 当前所在房
    phase: "act",            // 'setup' 布场尚未开始 | 'go' 可移动 | 'act' 已到今日目标房
    swapped: false,          // 今天是否已"换"过
    task: null,              // TASKS[].id
    taskProg: 0,
    opts: [],                // 今日候选房 [1..3]
    tools: [],               // 已持刑具 id[]
    buffs: [],               // 生效中的 BUFF（如 'brawl'）
    rooms,
    ...over,
  };
}

/** 安全读取一格（兼容 flat 输入 {code,tier}） */
export function roomAt(state, i) {
  return state.rooms?.[i] ?? null;
}

/** 场上存活囚犯（不含已出绮彩） */
export function occupants(state) {
  const out = [];
  for (let i = 1; i <= ROOM_COUNT; i++) {
    const r = state.rooms[i];
    if (!r || r.locked || r.empty || !r.code || !r.tier) continue;
    if (r.tier >= TIER_RAINBOW) continue;
    out.push({ room: i, code: r.code, tier: r.tier, event: !!r.event });
  }
  return out;
}

/** 已开并放着囚犯的格子数（含自己与目标） */
export function onBoardCount(state) {
  return occupants(state).length;
}

export function lockedRooms(state) {
  const out = [];
  for (let i = 1; i <= ROOM_COUNT; i++) if (state.rooms[i]?.locked) out.push(i);
  return out;
}

export function lastDayNo(state) {
  return state.lastDay ?? DAYS_DEFAULT;
}
/** 剩余天数（不含今天） */
export function remainingDays(state) {
  return Math.max(0, lastDayNo(state) - state.days);
}

/* ==========================================================================
   3. 刑具能力聚合
   ========================================================================== */

export function toolSet(state) {
  const s = new Set(state.tools ?? []);
  for (const b of state.buffs ?? []) s.add(b);
  return s;
}

export function hasTool(state, id) {
  return toolSet(state).has(id);
}

/** 汇总所有刑具/BUFF 的生效开关 */
export function effects(state) {
  const set = toolSet(state);
  const e = {
    sameTierAny: false,   // 同阶任意吃（铁冠）
    downCross: false,     // 向下跨阶（铡刀 / 困斗 BUFF）
    upCross: false,       // 向上跨阶（重锤）
    ratEatRat: false,     // 鼠吃鼠（鼠头串）
    gain: 0,              // 额外升阶（取最大）
    gainOnFew: 0,         // 场上人少时额外升阶
    fewThreshold: 0,
  };
  for (const id of set) {
    const t = TOOL_BY_ID[id] ?? BUFF_BY_ID[id];
    const fx = t?.effects;
    if (!fx) continue;
    if (fx.sameTierAny) e.sameTierAny = true;
    if (fx.downCross) e.downCross = true;
    if (fx.upCross) e.upCross = true;
    if (fx.ratEatRat) e.ratEatRat = true;
    if (fx.gain) e.gain = Math.max(e.gain, fx.gain);
    if (fx.gainOnFew) {
      e.gainOnFew = Math.max(e.gainOnFew, fx.gainOnFew);
      e.fewThreshold = Math.max(e.fewThreshold, fx.fewThreshold ?? 0);
    }
  }
  return e;
}

/** 该刑具把开吃日定在第几天：早吃件 → 1，晚吃件 → 15，两者同持取晚，其余 → 8 */
export function eatStartDay(state) {
  const set = toolSet(state);
  // 兼容旧数据：TOOLS 里仍带 eatStart 字段的一律以这里的白名单为准
  const hasEarly = EAT_EARLY_TOOLS.some(id => set.has(id));
  const hasLate = EAT_LATE_TOOLS.some(id => set.has(id));
  if (hasLate) return 15;
  if (hasEarly) return 1;
  return EAT_START_DEFAULT;
}

/** 流派投票：有吃件一票否决 */
export function flowMode(state) {
  const set = toolSet(state);
  const votes = { eat: 0, spread: 0, swap: 0 };
  for (const id of set) {
    const f = TOOL_BY_ID[id]?.flow;
    if (f && f in votes) votes[f]++;
  }
  if (votes.eat > 0) return "eat";
  if (votes.spread >= votes.swap) return "spread";
  return "swap";
}

/* ==========================================================================
   4. 核心规则：吃 / 换 / 移
   ========================================================================== */

/** b 是否在 a 的食谱里（环形链） */
export function preysOn(aCode, bCode) {
  return !!SPECIES[aCode]?.prey?.includes(bCode);
}

/**
 * a 能否吃掉 b
 * @param a {{code,tier}} 发起方
 * @param b {{code,tier}} 目标
 */
export function canEat(a, b, state) {
  if (!a || !b || a === b) return false;
  if (a.room != null && a.room === b.room) return false;
  if (!a.code || !b.code) return false;
  if (b.tier >= TIER_RAINBOW) return false;      // 绮彩不进沙盘
  const e = effects(state);
  const same = a.code === b.code;

  // 同种：只有鼠头串放行（鼠吃鼠）
  if (same) return e.ratEatRat && a.code === "rat" && a.tier === b.tier;

  // 同阶：默认要求克制成立（环形链是单向的：狼不能吃狮；鼠只吃象）
  if (a.tier === b.tier) return preysOn(a.code, b.code) || e.sameTierAny;

  if (!preysOn(a.code, b.code)) return false;     // 跨阶必须先满足克制
  if (a.tier < b.tier) return e.upCross;          // 向上
  return e.downCross;                             // 向下
}

/**
 * 吃完后 a 变成几阶（不计彩池上限裁剪）
 * 口径（docs/RULES.md §C-3）：
 *   基线 = 发起方阶 + 1
 *   象脚重锤向上跨阶 → 目标阶 + 2（最优先，直接决定结果）
 *   铁冠 / 鼠头串 / 口枷 → 额外 +N（取最大）
 *   口枷按"全场含自己与目标"计人数
 */
export function eatNewTier(a, b, state) {
  const e = effects(state);
  let t;
  if (e.upCross && a.tier < b.tier) {
    t = Math.max(a.tier, b.tier) + 2;      // 重锤：目标阶 +2
  } else {
    t = a.tier + 1;
    if (e.gain) t += e.gain;
    if (e.gainOnFew) {
      const n = onBoardCount(state);
      if (n > 0 && n <= e.fewThreshold) t += e.gainOnFew;
    }
  }
  return clampTier(t);
}

export function clampTier(t) {
  return Math.max(1, Math.min(TIER_MAX, t));
}

/** 彩池是否已满 */
export function rainbowFull(state) {
  return (state.rainbow ?? 0) >= RAINBOW_CAP;
}

/**
 * 执行"吃"：返回 { state, result }
 * 修补原版缺陷：
 *  - 彩池满 → 拒绝
 *  - 目标房被吃空 → 从今日选项里移除（不会出现"去刚吃空的格子开门"）
 *  - 升到 6 阶 → 出彩：发起方移出沙盘、彩池 +1、原房重新上锁
 */
export function applyEat(state, fromRoom, toRoom) {
  const a = { ...occupants(state).find(o => o.room === fromRoom) };
  const b = { ...occupants(state).find(o => o.room === toRoom) };
  if (!a.code || !b.code) return { state, result: { ok: false, reason: "EMPTY" } };
  if (!canEat(a, b, state)) return { state, result: { ok: false, reason: "ILEGAL" } };
  if (rainbowFull(state)) return { state, result: { ok: false, reason: "RAINBOW_FULL" } };

  const next = cloneState(state);
  const newTier = eatNewTier(a, b, state);
  const rainbow = newTier >= TIER_RAINBOW;

  if (rainbow) {
    next.rooms[fromRoom] = lockedRoom(next.rooms[fromRoom]);
    next.rainbow = Math.min(RAINBOW_CAP, (next.rainbow ?? 0) + 1);
  } else {
    next.rooms[fromRoom] = { ...next.rooms[fromRoom], code: a.code, tier: newTier, locked: false, empty: false };
  }
  next.rooms[toRoom] = lockedRoom(next.rooms[toRoom]);
  next.opts = (next.opts ?? []).filter(i => next.rooms[i] && !next.rooms[i].locked);
  next.swapped = true;   // 吃过之后今天不能再换

  return {
    state: next,
    result: { ok: true, newTier, rainbow, gained: newTier - a.tier },
  };
}

function lockedRoom(prev) {
  return { code: null, tier: null, locked: true, empty: false, event: !!prev?.event };
}

/**
 * 执行"换"：当前房的囚犯随机重抽
 * newBeast 省略时由调用方提供随机（引擎不做随机，保持确定性）
 */
export function applySwap(state, newBeast, room = state.cur) {
  if (state.swapped) return { state, result: { ok: false, reason: "ALREADY_SWAPPED" } };
  const next = cloneState(state);
  if (newBeast) {
    next.rooms[room] = { ...next.rooms[room], code: newBeast.code, tier: clampTier(newBeast.tier), locked: false, empty: false };
  }
  next.swapped = true;
  return { state: next, result: { ok: true } };
}

/**
 * 移动到 i：推进一天
 * 修补原版缺陷：吃/换不推进天数，只有移动推进；天数由 (lastDay - remaining) 单一来源换算
 */
export function applyMove(state, room) {
  if (room < 1 || room > ROOM_COUNT) return { state, result: { ok: false, reason: "BAD_ROOM" } };
  const next = cloneState(state);
  if (remainingDays(state) > 0) next.days = state.days + 1;
  next.cur = room;
  next.swapped = false;
  next.phase = "act";
  if (next.rooms[room]?.locked) {
    next.rooms[room] = { ...next.rooms[room], locked: false, empty: false };
  }
  if (next.rooms[room]?.event) next.rooms[room] = { ...next.rooms[room], event: false };
  return { state: next, result: { ok: true } };
}

/** 深度克隆（结构化克隆，node 与浏览器都支持） */
export function cloneState(state) {
  return typeof structuredClone === "function"
    ? structuredClone(state)
    : JSON.parse(JSON.stringify(state));
}

/* ==========================================================================
   5. 局面自检（修补原版"空盘引导不可达"）
   ========================================================================== */

export function isEmptyBoard(state) {
  if (occupants(state).length > 0) return false;
  // "空盘" = 除审讯室外没有任何房被开过
  for (let i = 1; i <= ROOM_COUNT; i++) {
    if (i === IX_ROOM) continue;
    if (!state.rooms[i]?.locked) return false;
  }
  return true;
}

/** 只给 16 格里的已开列，用于"我已录入"的进度 */
export function boardSummary(state) {
  const occ = occupants(state);
  return {
    beasts: occ.length,
    locked: lockedRooms(state).length,
    options: state.opts ?? [],
    rainbow: state.rainbow ?? 0,
    remaining: remainingDays(state),
  };
}

/* ==========================================================================
   6. 建议引擎 analyze()
   ========================================================================== */

/**
 * @returns {Array<{prio:number, act:string, why:string, cls:string, ops:Array, dst?:number}>}
 */
export function analyze(state) {
  const adv = [];
  const push = (prio, act, why, cls, ops = [], extra = {}) =>
    adv.push({ prio, act, why, cls, ops, ...extra });

  const ps = occupants(state);
  const cur = state.rooms[state.cur];
  // 今日候选 = 用户填的选项里、还没被开过的房（已开的房走过去也没意义）
  const opts = (state.opts ?? []).map(Number)
    .filter(i => {
      const r = state.rooms[i];
      return r && r.locked && i !== state.cur;   // 含下一行即将开的那一格也要排除自己
    });
  const esd = eatStartDay(state);
  const flow = flowMode(state);
  const full = rainbowFull(state);

  /* --- 0. 引导：空盘（原版此分支永不可达，这里作为第一优先级） --- */
  if (isEmptyBoard(state)) {
    push(0.5, "先录入你的沙盘", "把 16 个牢房现在关着谁填进去：点格子 → 选兽种和阶位。填完建议才会准。",
      "top", [{ label: "一键加载示例局面", action: "example" }]);
    return sortAdv(adv);
  }

  /* --- 0.5 彩池已满：硬拦截，所有"出彩"建议在这一层就被砍掉 --- */
  if (full) {
    push(0, `彩池已满 ${RAINBOW_CAP} 只，停手`, "再出彩不结算。现在只做：开房铺场 / 收尾结束回合。", "warn");
  }

  /* --- 1. 配对（只由当前房发起） --- */
  const me = ps.find(p => p.room === state.cur);
  const pairs = [];
  if (me) {
    for (const q of ps) {
      if (q.room === me.room) continue;
      if (!canEat(me, q, state)) continue;
      pairs.push({ from: me, to: q, newTier: eatNewTier(me, q, state) });
    }
  }
  const same = pairs.filter(p => p.from.tier === p.to.tier);
  const cross = pairs.filter(p => p.from.tier !== p.to.tier);
  const isRainbow = p => p.newTier >= TIER_RAINBOW;

  for (const p of same) {
    if (isRainbow(p)) {
      if (!full) push(P.RAINBOW,
        `【出彩】${roomName(p.from.room)} ${label(p.from)} 吃 ${roomName(p.to.room)} ${label(p.to)}`,
        `吃完变绮彩，出彩移出沙盘并计入彩池。`, "top",
        eatOps(p));
    }
  }
  for (const p of same) {
    if (p.newTier === 5) {
      push(P.RISE_RED,
        `【升红】${roomName(p.from.room)} ${label(p.from)} 吃 ${roomName(p.to.room)} ${label(p.to)}`,
        `同阶克制吃，升到至臻；下一次同阶克制吃就能出彩。`, "high", eatOps(p));
    }
  }
  for (const p of same) {
    if (p.newTier >= 3 && p.newTier <= 4) {
      push(3, `${roomName(p.from.room)} ${label(p.from)} 吃 ${roomName(p.to.room)} ${label(p.to)}`,
        `同阶克制吃 → ${TIER_NAME[p.newTier]}。`, "mid", eatOps(p));
    }
  }
  for (const p of cross) {
    if (isRainbow(p)) {
      if (!full) push(P.CROSS_RAINBOW,
        `【跨阶出彩】${roomName(p.from.room)} ${label(p.from)} 吃 ${roomName(p.to.room)} ${label(p.to)}`,
        `靠刑具破例完成跨阶吃，直接出彩。`, "top", eatOps(p));
    } else {
      push(P.CROSS, `${roomName(p.from.room)} ${label(p.from)} 吃 ${roomName(p.to.room)} ${label(p.to)}`,
        `跨阶吃（需对应刑具），结果 ${TIER_NAME[p.newTier]}。`, "mid", eatOps(p));
    }
  }

  /* --- 2. 开吃日门：还没到日子就别吃普通对 --- */
  const lowTierPairs = pairs.filter(p => p.from.tier < 5 && !isRainbow(p));
  if (state.days < esd && lowTierPairs.length) {
    push(P.HOLD_FOR_EAT_DAY, `开吃日还没到（第 ${esd} 天），先留着这几只别吃`,
      `现在能吃 ${lowTierPairs.length} 对，但它们吃完都不出彩。持 ${toolsLabel(state)} 时开吃日定在第 ${esd} 天；` +
      `早吃平均少 ${RULES.eatStart.earlyGap} 只绮彩。`,
      "warn");
  }

  /* --- 3. 换（白/蓝） --- */
  const curBeast = cur && !cur.locked && cur.code && cur.tier ? cur : null;
  if (curBeast && !state.swapped && curBeast.tier <= 2) {
    const p = curBeast.tier === 1 ? P.SWAP_COMMON : P.SWAP_MAGIC;
    push(p, `【换】${roomName(state.cur)} 的${label(curBeast)}`,
      curBeast.tier === 1 ? "普通阶必换：换一次等于白嫖一次重抽。" : "魔法阶看开吃日与刑具，能换就先换。",
      "low", [{ label: "已换过", action: "swap-done" }]);
  }
  if (state.swapped) {
    push(3.45, "今天已经换过了，可以接着吃", "换不影响吃；但如果决定要吃，今天就结束了。", "info");
  }

  /* --- 4. 低阶互吃（吃流 4.5 / 铺场流 6.6） --- */
  const lowPrio = flow === "spread" ? 6.6 : P.PAIR;
  for (const p of same) {
    if (p.from.tier <= 2 && !isRainbow(p) && p.newTier <= 3) {
      push(lowPrio, `${roomName(p.from.room)} ${label(p.from)} 吃 ${roomName(p.to.room)} ${label(p.to)}`,
        flow === "spread" ? "铺场流：低阶互吃会减少场上的人数，优先级压低。" : "阶位提升，能吃就吃。",
        "low", eatOps(p));
    }
  }

  /* --- 5. 事件 --- */
  const eventsKnown = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
    .filter(i => state.rooms[i] && !state.rooms[i].locked && state.rooms[i].event);
  if (!eventsKnown.length) {
    push(P.MARK_EVENTS, "你还没标事件房", "系统保底至少 1 个「!」在场；进房才触发，吃掉不算。标了以后路线建议会准得多。", "info");
  } else {
    for (const i of eventsKnown) {
      if (i === state.cur) continue;
      push(P.GO_EVENT, `去 ${roomName(i)} 事件房`, "「!」必须走进房间才触发，吃掉囚犯不算触发。", "mid",
        [{ label: "已到达", action: "go-eat", dst: i }]);
    }
  }

  /* --- 6. 审讯室 --- */
  if (state.cur === IX_ROOM) {
    const incite = state.days <= RULES.ix.inciteUntilDay;
    const reds = ps.filter(p => p.tier === 5).length;
    const golds = ps.filter(p => p.tier === 4).length;
    const ixScore = reds * 8 + golds * 3 + (incite ? 6 : 0);
    push(2.9, incite ? "审讯室：选「煽动」" : "审讯室：选「赏赐」",
      incite
        ? `第 ${state.days} 天（≤${RULES.ix.inciteUntilDay}）煽动收益高于赏赐，还能顺推任务进度。`
        : `第 ${state.days} 天起选赏赐：红兽×8 + 金兽×3 的定向升阶分 = ${ixScore}。`,
      "high");
  } else if (state.task !== "incident" && state.days <= RULES.ix.inciteUntilDay) {
    push(5.2, `去 ${roomName(IX_ROOM)} 审讯室（煽动）`, "前期审讯室的「煽动」收益比开房高，还能推进任务。", "mid",
      [{ label: "已到达", action: "go-eat", dst: IX_ROOM }]);
  }

  /* --- 7. 开房 / 铺场 --- */
  // 日优先：剩余天数不多时，先把开房/铺场提到"结束回合"前面
  const nearEnd = remainingDays(state) <= 3;
  const openPrio = nearEnd ? P.END_DAY - 0.05 : P.OPEN_ROOM;
  if (!opts.length) {
    push(P.OPEN_ROOM + 0.1, "今天没有候选房，先填「今日选项」",
      `每天系统给最多 ${MAX_OPTIONS} 个候选房，只能从里面选。不填的话开房建议只能按距离排序。`, "info");
  }
  const scored = opts
    .filter(i => i !== state.cur)
    .map(i => ({ i, s: openScore(state, i) }))
    .sort((a, b) => b.s - a.s);
  for (const { i, s } of scored) {
    push(openPrio, `去 ${roomName(i)} 开房`,
      `开房评分 ${s.toFixed(1)}：探查色、巡狱距离、事件覆盖加权${nearEnd ? "；剩余天数不多，开房优先于收工" : ""}。`,
      "low", [{ label: "已到达", action: "go-eat", dst: i }]);
  }

  /* --- 8. 结束回合 --- */
  push(P.END_DAY, "结束今天，进入下一天", `当前第 ${state.days} / ${lastDayNo(state)} 天。`, "info",
    [{ label: "推进一天", action: "end-day" }]);

  if (state.taskProg >= 100) {
    push(P.DONE, "开局任务已完成", "可以考虑换下一件刑具了。", "info");
  }

  return sortAdv(adv);
}

function eatOps(p) {
  return [
    { label: "执行吃", action: "eat", from: p.from.room, to: p.to.room },
    { label: "看连吃", action: "chain", from: p.from.room, to: p.to.room },
  ];
}

export function sortAdv(adv) {
  return adv.sort((a, b) => a.prio - b.prio || String(a.act).localeCompare(String(b.act)));
}

/** 开房评分 */
export function openScore(state, i) {
  const r = state.rooms[i];
  if (!r || !r.locked) return -Infinity;
  const b = RULES.board;
  const color = (TIERS.find(t => t.tier === 4)?.tier ?? 4) * b.exploreColorWeight; // 未开房 ≈ 传奇探查色
  const patrol = fwd(state.cur, i) * b.patrolDistWeight;
  const chain = hasTool(state, "chains") && fwd(state.cur, i) >= 4 ? b.longChainBonus : 0;
  const short = hasTool(state, "short") && fwd(state.cur, i) <= 3 ? b.shortChainBonus : 0;
  let evt = 0;
  for (let k = 1; k <= ROOM_COUNT; k++) {
    if (state.rooms[k]?.event && dist(i, k) <= 6) evt += b.eventCoverWeight;
  }
  const ix = Math.max(0, 4 - fwd(i, IX_ROOM)) * 2;
  return color + patrol * 0.1 + chain + short + evt + ix;
}

/* ==========================================================================
   7. 典藏
   ========================================================================== */

export function recommendTreasure(state, psArg) {
  const ps = psArg ?? occupants(state);
  const day = state.days;
  const { hornMinDay, ringLowMax } = RULES.treasure;
  const low = ps.filter(p => p.tier <= 2).length;
  const belowLegend = ps.filter(p => p.tier < 4).length;
  const canEatLegend = ps.some(a => a.tier >= 4 && ps.some(b => b.room !== a.room && canEat(a, b, state)));

  if (day >= hornMinDay && canEatLegend) {
    return { id: "horn", reason: `第 ${day} 天且场上有可吃的传奇以上囚犯：铜号能让它们连吃一轮。` };
  }
  if (low < ringLowMax) {
    return { id: "ring", reason: `场上「稀以下」只有 ${low} 名（<${ringLowMax}），先用扳指补人堆基数。` };
  }
  if (belowLegend > 0) {
    return { id: "wine", reason: `场上有 ${belowLegend} 名低于传奇，佳酿整体 +1 阶最赚。` };
  }
  return { id: "ring", reason: "没有可吃的传奇以上、也没有低于传奇目标，补人。", };
}

/** 连吃路径：从 fromRoom 出发能连续吃几次（只算当前房发起） */
export function chainPath(state, fromRoom) {
  let st = cloneState(state);
  const path = [];
  let cur = fromRoom;
  for (let step = 0; step < 8; step++) {
    const me = occupants(st).find(p => p.room === cur);
    if (!me) break;
    const target = occupants(st).find(p => p.room !== cur && canEat(me, p, st));
    if (!target) break;
    const res = applyEat(st, cur, target.room);
    if (!res.result.ok) break;
    st = res.state;
    if (res.result.rainbow) path.push({ from: cur, to: target.room, tier: res.result.newTier, rainbow: true });
    else path.push({ from: cur, to: target.room, tier: res.result.newTier });
    if (res.result.rainbow) break;
  }
  return path;
}

/* ==========================================================================
   8. 展示辅助（纯字符串，不碰 DOM）
   ========================================================================== */

export function roomName(i) {
  return `${i} 号`;
}
export function label(b) {
  if (!b || !b.code || !b.tier) return "空";
  const sp = SPECIES[b.code];
  return `${sp?.icon ?? ""}${sp?.name ?? b.code}(${TIER_NAME[b.tier] ?? b.tier})`;
}
export function toolsLabel(state) {
  const ids = [...toolSet(state)].filter(id => TOOL_BY_ID[id]);
  if (!ids.length) return "无刑具";
  return ids.map(id => TOOL_BY_ID[id].name).join("、");
}
export { SPECIES, SPECIES_LIST, TIERS, TIER_NAME, ROOM_COUNT, IX_ROOM, MAX_OPTIONS, TOOL_BY_ID, BUFF_BY_ID, TOOL_IDS, RAINBOW_CAP };
