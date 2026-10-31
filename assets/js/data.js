/* ==========================================================================
   data.js — 唯一数据源（docs/RULES.md §B）
   规则：任何数值都只能写在这里；HTML/engine 不许硬编码游戏数值。
        版本升级只改本文件 + DATA_VERSION。
   依赖：无。可被浏览器 (type=module) 与 node 直接 import。
   ========================================================================== */

export const DATA_VERSION = "1.0.0";

/* ---------- 1. 食物链与阶位 ---------- */

/** 物种。prey = 它能吃谁（环形链 象→狮→狼→鼠→象） */
export const SPECIES = {
  elephant: { key: "elephant", name: "巨象", icon: "🐘", prey: ["lion", "wolf"] },
  lion:     { key: "lion",     name: "狂狮", icon: "🦁", prey: ["wolf", "rat"] },
  wolf:     { key: "wolf",     name: "头狼", icon: "🐺", prey: ["rat"] },
  rat:      { key: "rat",      name: "硕鼠", icon: "🐭", prey: ["elephant"] },
};

export const SPECIES_LIST = ["elephant", "lion", "wolf", "rat"];

/** 阶位 1..6 */
export const TIERS = [
  { tier: 1, name: "普通", color: "var(--t1)", hex: "#e8e6e2" },
  { tier: 2, name: "魔法", color: "var(--t2)", hex: "#5ea2f5" },
  { tier: 3, name: "稀有", color: "var(--t3)", hex: "#b08bf5" },
  { tier: 4, name: "传奇", color: "var(--t4)", hex: "#f5b93f" },
  { tier: 5, name: "至臻", color: "var(--t5)", hex: "#ef6a5a" },
  { tier: 6, name: "绮彩", color: "var(--t6)", hex: "#ec4899" },
];
export const TIER_MAX = 6;          // 6 = 绮彩，出彩后移出沙盘
export const TIER_RAINBOW = 6;
export const RAINBOW_CAP = 10;      // 一局最多 10 只绮彩（彩池上限）

export const TIER_NAME = Object.fromEntries(TIERS.map(t => [t.tier, t.name]));
export const TIER_HEX = Object.fromEntries(TIERS.map(t => [t.tier, t.hex]));

/* ---------- 2. 沙盘 ---------- */

export const ROOM_COUNT = 16;
export const IX_ROOM = 1;           // 审讯室固定 1 号房
export const MAX_OPTIONS = 3;       // 每日最多 3 个候选房
export const DAYS_DEFAULT = 20;     // 常规 20 天

/** 环形布局：tabIndex 顺序 = 视觉顺序（上 1-6 → 右 7-8 → 下 9-14 → 左 15-16） */
export const ROOM_AREAS = {
  1: "r1", 2: "r2", 3: "r3", 4: "r4", 5: "r5", 6: "r6",
  7: "c1", 8: "c2",
  9: "d6", 10: "d5", 11: "d4", 12: "d3", 13: "d2", 14: "d1",
  15: "l2", 16: "l1",
};

/* ---------- 3. 刑具（31 件） ---------- */
/* id / name / icon / flow: eat|spread|swap / score: 2 万局模拟裸强度
   eatStart: 该刑具把"开吃日"定为第几天（缺省 = 走 DAYS 表的默认档）
   effects: 引擎可读的语义开关（见 engine.js） */

export const TOOLS = [
  { id: "elefthammer", name: "象脚重锤",        icon: "🔨", flow: "eat",    score: 100, effects: { upCross: true } },
  { id: "redtrap",     name: "染红的捕兽夹",    icon: "🩸", flow: "eat",    score: 99,  eatStart: 15 },
  { id: "lioncrown",   name: "牢中王的铁冠",    icon: "👑", flow: "eat",    score: 90,  effects: { sameTierAny: true, gain: 3 } },
  { id: "coin",        name: "手足的命运硬币",  icon: "🪙", flow: "spread", score: 82,  eatStart: 15 },
  { id: "tusk",        name: "恶欲铁钳",        icon: "🦷", flow: "eat",    score: 79,  eatStart: 15 },
  { id: "blacklist",   name: "执刑官的黑名册",  icon: "📕", flow: "spread", score: 78,  eatStart: 8 },
  { id: "rope",        name: "绞首绳",          icon: "🪢", flow: "swap",   score: 74,  eatStart: 8 },
  { id: "claw",        name: "脏污铁爪",        icon: "🐾", flow: "eat",    score: 71 },
  { id: "chain",       name: "凶兽的饥饿绞链",  icon: "⛓️", flow: "eat",    score: 68,  eatStart: 15 },
  { id: "revenge",     name: "复仇者之匣",      icon: "🧰", flow: "eat",    score: 66 },
  { id: "saw",         name: "锈锯",            icon: "🪚", flow: "eat",    score: 62 },
  { id: "whip",        name: "棘刺铁鞭",        icon: "🔗", flow: "eat",    score: 59 },
  { id: "collar",      name: "疯兽的倒刺项圈",  icon: "⚙️", flow: "eat",    score: 55 },
  { id: "muzzle",      name: "狂兽的剧痛口枷",  icon: "😖", flow: "eat",    score: 52,  effects: { gainOnFew: 3, fewThreshold: 3 } },
  { id: "cage",        name: "拥挤兽笼",        icon: "🪤", flow: "spread", score: 50 },
  { id: "pestle",      name: "铁杵",            icon: "🥢", flow: "swap",   score: 47 },
  { id: "axe",         name: "狱卒的行刑巨斧",  icon: "🪓", flow: "swap",   score: 45,  effects: { execOnSwap: true } },
  { id: "coffin",      name: "切开的人形棺",    icon: "⚰️", flow: "swap",   score: 42 },
  { id: "hook",        name: "挑拣钩",          icon: "🪝", flow: "swap",   score: 38 },
  { id: "keys",        name: "遗落的钥匙串",    icon: "🔑", flow: "spread", score: 36 },
  { id: "forgery",     name: "伪造钥匙",        icon: "🗝️", flow: "spread", score: 34 },
  { id: "brand",       name: "灼痛的烙铁",      icon: "🔥", flow: "spread", score: 32 },
  { id: "chains",      name: "长链脚镣",        icon: "🦿", flow: "spread", score: 30 },
  { id: "short",       name: "短链脚镣",        icon: "🧦", flow: "spread", score: 26 },
  { id: "springbox",   name: "蠕动的铁盒",      icon: "📦", flow: "spread", score: 30 },
  { id: "rathead",     name: "鼠头串",          icon: "🍢", flow: "eat",    score: 44,  effects: { ratEatRat: true, gain: 2 } },
  { id: "wolfblade",   name: "狼牙铡刀",        icon: "🗡️", flow: "eat",    score: 40,  effects: { downCross: true } },
  { id: "guillotine",  name: "替罪人的断头台",  icon: "🔻", flow: "swap",   score: 24,  eatStart: 8 },
  { id: "balance",     name: "典狱官的天平",    icon: "⚖️", flow: "swap",   score: 22,  eatStart: 8 },
  { id: "pillar",      name: "火刑柱",          icon: "🕯️", flow: "swap",   score: 20,  eatStart: 8 },
  { id: "plaque",      name: "重刑铭牌",        icon: "📛", flow: "swap",   score: 16,  eatStart: 8 },
  // 「奢靡 / 囚徒困斗 / 物语情报」属于异常事件，不是刑具 —— 作为 BUFF 单独维护
];

export const TOOL_BY_ID = Object.fromEntries(TOOLS.map(t => [t.id, t]));
export const TOOL_IDS = TOOLS.map(t => t.id);

/** 异常事件 BUFF（不是刑具，不占 "31 件" 名额） */
export const BUFFS = [
  { id: "brawl",   name: "囚徒困斗", icon: "🤼", effects: { downCross: true } },
  { id: "anomaly", name: "奢靡",     icon: "💎", effects: {} },
  { id: "info",    name: "物语情报", icon: "📜", effects: {} },
];
export const BUFF_BY_ID = Object.fromEntries(BUFFS.map(b => [b.id, b]));

/** 开吃日档位（docs/RULES.md §C-2） */
export const EAT_START_DEFAULT = 8;

/** 早吃件：持任意一件 → 开吃日提前到第 1 天（19 件） */
export const EAT_EARLY_TOOLS = [
  "elefthammer", "lioncrown", "claw", "revenge", "saw", "whip", "collar", "muzzle",
  "cage", "pestle", "axe", "coffin", "hook", "keys", "forgery", "brand",
  "chains", "short", "springbox",
];

/** 晚吃件：持任意一件 → 开吃日推迟到第 15 天（4 件） */
export const EAT_LATE_TOOLS = ["coin", "tusk", "redtrap", "chain"];

/** 黑名单件（明确落在默认档第 8 天，写出来是为了让数据自解释） */
export const EAT_DEFAULT_TOOLS = ["blacklist", "rope", "guillotine", "balance", "pillar", "plaque"];

/* ---------- 4. 事件 ---------- */

export const EVENTS = [
  { id: "usurp4",   name: "僭越·其四", value: 26.4 },
  { id: "usurp3",   name: "僭越·其三", value: 6.8 },
  { id: "meal",     name: "加餐",       value: 4.2 },
  { id: "usurp2",   name: "僭越·其二", value: 3.5 },
  { id: "felon",    name: "重刑犯",     value: 3.1 },
  { id: "share",    name: "有福同享",   value: 2.8 },
  { id: "fix",      name: "暗箱操作",   value: 2.8 },
  { id: "free",     name: "自由的滋味", value: 2.8 },
  { id: "appetite", name: "食欲大增",   value: 2.8 },
  { id: "usurp1",   name: "僭越·其一", value: 1.5 },
  { id: "transfer", name: "同罪移押",   value: 1.2 },
  { id: "rival",    name: "宿敌",       value: 1.2 },
  { id: "tunnel",   name: "暗渠鼠道",   value: 1.1 },
  { id: "exec",     name: "处刑效率",   value: 0.3 },
  { id: "chain",    name: "连锁反应",   value: 0 },
  { id: "treasure", name: "寻「宝」",   value: 0 },
];

/* ---------- 5. 开局任务 ---------- */

export const TASKS = [
  { id: "move",     name: "移动流任务", bonus: { chains: 12, keys: 6, short: 5, axe: 2 } },
  { id: "ascend",   name: "升阶任务",   bonus: { tusk: 8, muzzle: 8, collar: 5, whip: 3, saw: 3, revenge: 3 } },
  { id: "incident", name: "事件任务",   bonus: { keys: 3, blacklist: 2 } },
  { id: "open10",   name: "开门任务",   bonus: { cage: 8, keys: 8, forgery: 8, blacklist: 4, axe: 3 } },
];
export const TASK_BY_ID = Object.fromEntries(TASKS.map(t => [t.id, t]));

/* ---------- 6. 典狱长的珍藏 ---------- */

export const TREASURES = [
  { id: "ring", name: "三首扳指", desc: "随机开启 ≤3 间牢房", rule: "场上「稀以下」囚犯 < 4 名时" },
  { id: "horn", name: "斗争铜号", desc: "所有存在可吃目标的囚犯各发动一次随机吃", rule: "第 19 天起且场上有传奇以上能吃时" },
  { id: "wine", name: "赤色佳酿", desc: "所有低于传奇的囚犯 +1 阶", rule: "默认（第 18 天以前）" },
  { id: "brand", name: "原罪烙印", desc: "随机 ≤4 名无可吃目标的囚犯烙上代号", rule: "不拿（实测垫底）" },
];

/* ---------- 7. 判据阈值（引擎读取，改这里即可调策略） ---------- */

export const RULES = {
  ix: { inciteUntilDay: 10 },     // 第 ≤10 天审讯室选"煽动"，≥11 选"赏赐"
  treasure: { hornMinDay: 19, ringLowMax: 4 },
  eatStart: { earlyGap: 0.4, lateGap: 0.18 }, // 仅供说明：等待可多得的绮彩数
  board: {
    exploreColorWeight: 10, patrolDistWeight: 5,
    longChainBonus: 15, shortChainBonus: 12, eventCoverWeight: 4,
  },
  // 建议区优先级（越小越靠前）—— 与 docs/RULES.md §D 表格一一对应
  prio: {
    RAINBOW: 1, RISE_RED: 2, CROSS_RAINBOW: 2.4, CROSS: 2.6,
    HOLD_FOR_EAT_DAY: 3.2, SWAP_COMMON: 3.5, SWAP_MAGIC: 3.6,
    END_DAY: 4, PAIR: 4.5, MARK_EVENTS: 4.5, GO_EVENT: 5, EVENT_REPLY: 5.5,
    OPEN_ROOM: 6, GO_AND_EAT: 6.2, CHAIN_WARN: 8.5, GUARD: 80, STUCK: 81, DONE: 99,
  },
};
