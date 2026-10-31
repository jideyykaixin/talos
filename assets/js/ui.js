/* ui.js — DOM 渲染（只有这里碰 document；规则全在 engine.js） */

import * as E from "./engine.js";
import * as D from "./data.js";
import * as store from "./store.js";

const TOOL = "talos";
const VER = D.DATA_VERSION;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, props = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of [].concat(kids)) if (kid) n.append(kid);
  return n;
};

/* ---------- 状态 ---------- */
let state = store.load(TOOL, VER, null);
if (!state || !state.rooms) state = E.createState();
if (state.lastDay == null) state.lastDay = D.DAYS_DEFAULT;

const persist = () => store.save(TOOL, VER, state);
const rerender = () => { persist(); renderAll(); };

/* ---------- 主题 ---------- */
store.applyTheme(store.currentTheme());

/* ---------- 渲染：状态条 ---------- */
function renderStats() {
  const s = E.boardSummary(state);
  const box = $("#statbar");
  box.replaceChildren();
  const stat = (k, v, low) =>
    el("span", { class: "stat" }, [
      el("span", { class: "k", text: k }),
      el("span", { class: low ? "v low" : "v", text: String(v) }),
    ]);
  const plain = (k, v) => el("span", { class: "stat" }, [el("span", { class: "k", text: k }), el("span", { class: "v", text: String(v) })]);
  box.append(
    stat("第", `${state.days} / ${state.lastDay} 天`),
    stat("剩余", s.remaining, s.remaining <= 3),
    el("span", { class: "stat-div" }),
    stat("绮彩", `${s.rainbow}/${D.RAINBOW_CAP}`),
    el("span", { class: "stat-div" }),
    plain("场上", `${s.beasts} 名`),
    plain("未开", `${s.locked} 间`),
    el("span", { class: "stat-div" }),
    plain("开吃日", `第 ${E.eatStartDay(state)} 天`),
    plain("流派", flowName(E.flowMode(state))),
    plain("今天", state.swapped ? "已换/已吃" : "未换"),
  );
}

function flowName(f) {
  return { eat: "吃流", spread: "铺场流", swap: "换流" }[f] ?? "—";
}

/* ---------- 渲染：今日选项 ---------- */
function renderOpts() {
  const host = $("#opts");
  host.replaceChildren();
  for (let k = 0; k < D.MAX_OPTIONS; k++) {
    const v = state.opts[k] ?? "";
    const id = `opt-${k + 1}`;
    const stale = v && state.rooms[v]?.locked === false && state.rooms[v]?.code;
    const wrap = el("span", { class: `opt-slot${stale ? " stale" : ""}` }, [
      el("label", { for: id, text: "选项", class: "sr-only" }),
      el("span", { class: "k small muted", text: `#${k + 1}` }),
      el("input", {
        id, type: "number", min: 1, max: D.ROOM_COUNT, inputmode: "numeric",
        value: v, placeholder: "—",
        oninput: (ev) => {
          const n = Number(ev.target.value);
          const next = state.opts.slice();
          if (!ev.target.value) next.splice(k, 1);
          else if (n >= 1 && n <= D.ROOM_COUNT) next[k] = n;
          state.opts = next.filter(Boolean).slice(0, D.MAX_OPTIONS);
          rerender();
        },
      }),
    ]);
    host.append(wrap);
  }
  host.append(el("button", { class: "btn btn-ghost small", type: "button", onclick: () => {
    state.opts = []; rerender();
  } }, "清空选项"));
}

/* ---------- 渲染：棋盘 ---------- */
function renderBoard() {
  const board = $("#board");
  board.replaceChildren();
  const opts = new Set(state.opts ?? []);
  for (let i = 1; i <= D.ROOM_COUNT; i++) {
    const r = state.rooms[i];
    const occ = r && !r.locked && r.code && r.tier;
    const isIx = i === D.IX_ROOM;
    let st = "locked";
    if (occ) st = "occupied";
    else if (r && !r.locked) st = "open";
    if (i === state.cur) st = "current";
    const btn = el("button", {
      type: "button",
      class: `room${isIx ? " is-ix" : ""}${opts.has(i) && occ ? " is-target" : ""}`,
      "data-state": st,
      "data-room": i,
      style: `grid-area:${D.ROOM_AREAS[i] ?? "auto"}`,
      "aria-label": roomAria(i, r, occ),
      onclick: () => openPop(i),
    }, [
      el("span", { class: "no", text: `${i}${isIx ? " 🔱" : ""}` }),
      el("span", { class: "beast", text: occ ? D.SPECIES[r.code]?.icon ?? "❓" : (r?.locked ? "🔒" : "") }),
      el("span", { class: "meta", text: occ ? `${D.SPECIES[r.code]?.name} · ${D.TIER_NAME[r.tier]}` : (r?.locked ? "未开" : "已开·空") }),
      occ ? el("span", { class: "tier-dot", style: `background:${D.TIER_HEX[r.tier]}` }) : null,
      r?.event ? el("span", { class: "flag evt-flag", text: "!", "aria-hidden": "true" }) : null,
    ]);
    const dots = opts.has(i) ? el("span", { class: "flag", text: "◆", "aria-hidden": "true", style: "right:20px;color:var(--accent)" }) : null;
    if (dots) btn.append(dots);
    board.append(btn);
  }
}

function roomAria(i, r, occ) {
  const parts = [`${i} 号房`];
  if (i === D.IX_ROOM) parts.push("审讯室");
  if (i === state.cur) parts.push("你当前所在");
  if ((state.opts ?? []).includes(i)) parts.push("今日候选");
  if (occ) parts.push(E.label({ code: r.code, tier: r.tier }));
  else parts.push(r?.locked ? "未开" : "已开，空");
  if (r?.event) parts.push("事件房");
  return parts.join("，");
}

/* ---------- 渲染：建议 ---------- */
function renderAdv() {
  const adv = E.analyze(state);
  const list = $("#adv-list");
  list.replaceChildren();
  $("#adv-count").textContent = `${adv.length} 条建议`;
  if (!adv.length) {
    list.append(el("li", { class: "empty", text: "没有建议 —— 先录入沙盘。" }));
  }
  for (const a of adv.slice(0, 14)) {
    const cls = advClass(a);
    const li = el("li", { class: `adv ${cls}` }, [
      el("div", { class: "row1" }, [
        el("span", { class: "prio", text: a.prio.toFixed(2) }),
        el("span", { class: "act", text: a.act }),
      ]),
      a.why ? el("div", { class: "why", text: a.why }) : null,
    ]);
    if (a.ops?.length) {
      li.append(el("div", { class: "ops" }, a.ops.map(o =>
        el("button", {
          class: `btn small${o.action === "eat" ? " btn-primary" : ""}`,
          type: "button",
          onclick: () => doOp(o),
        }, o.label)
      )));
    }
    list.append(li);
  }
  // 读屏播报：与视觉同一个"第一条"
  const live = $("#adv-live");
  const msg = adv.length ? `共 ${adv.length} 条建议。首要：${adv[0].act}` : "";
  if (live.textContent !== msg) live.textContent = msg;
}

function advClass(a) {
  if (a.cls === "top") return "p-top";
  if (a.cls === "high") return "p-high";
  if (a.cls === "mid") return "p-mid";
  if (a.cls === "low") return "p-low";
  if (a.cls === "warn") return "p-warn";
  if (a.cls === "bad") return "p-bad";
  return "p-info";
}

function doOp(o) {
  if (o.action === "eat") {
    const res = E.applyEat(state, o.from, o.to);
    if (!res.result.ok) return toast(errMsg(res.result.reason));
    state = res.state;
    toast(`吃掉 → ${D.TIER_NAME[res.result.newTier]}${res.result.rainbow ? "（绮彩！）" : ""}`);
  } else if (o.action === "chain") {
    const path = E.chainPath(state, o.from);
    toast(path.length ? `连吃路径：${path.map(p => `→${D.TIER_NAME[p.tier]}${p.rainbow ? "彩" : ""}`).join(" ")}` : "没有可连吃的目标");
    return;
  } else if (o.action === "swap-done") {
    state.swapped = true;
    toast("已标记：今天换过了");
  } else if (o.action === "end-day") {
    if (E.remainingDays(state) <= 0) return toast("已经是最后一天");
    state.days += 1;
    state.swapped = false;
    toast(`进入第 ${state.days} 天`);
  } else if (o.action === "go-eat") {
    state = E.applyMove(state, o.dst).state;
    toast(`已移动到 ${o.dst} 号，第 ${state.days} 天`);
  } else if (o.action === "example") {
    state = exampleState();
    toast("已加载示例局面");
  }
  rerender();
}

function errMsg(code) {
  return ({
    EMPTY: "那一格已经是空的",
    ILEGAL: "不满足「同阶 + 克制」，也没有对应刑具破例",
    RAINBOW_FULL: `彩池已满 ${D.RAINBOW_CAP} 只，不再出彩`,
    ALREADY_SWAPPED: "今天已经换过了",
  })[code] ?? code;
}

/* ---------- 渲染：刑具设置 ---------- */
function renderTools() {
  const host = $("#toolpick-body");
  host.replaceChildren();
  const task = state.task ? D.TASK_BY_ID[state.task] : null;
  const sorted = [...D.TOOLS].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  for (const t of sorted) {
    const on = (state.tools ?? []).includes(t.id);
    const bonus = task?.bonus?.[t.id] ?? 0;
    const chip = el("button", {
      class: "chip", type: "button", "aria-pressed": on ? "true" : "false",
      onclick: () => {
        const s = new Set(state.tools ?? []);
        s.has(t.id) ? s.delete(t.id) : s.add(t.id);
        state.tools = [...s];
        rerender();
      },
    }, [
      el("span", { text: t.icon }),
      el("span", { text: t.name }),
      el("span", { class: "score", text: `${t.score ?? 0}${bonus ? ` +${bonus}` : ""}` }),
    ]);
    host.append(chip);
  }
  // 任务选择
  const sel = $("#sel-task");
  sel.replaceChildren(el("option", { value: "", text: "（无任务）" }),
    ...D.TASKS.map(t => el("option", { value: t.id, text: t.name, ...(state.task === t.id ? { selected: true } : {}) })));
  $("#num-prog").value = state.taskProg ?? 0;
  // BUFF
  const buff = $("#sel-buff");
  buff.replaceChildren(el("option", { value: "", text: "（无）" }),
    ...D.BUFFS.map(b => el("option", {
      value: b.id, text: b.name,
      ...((state.buffs ?? []).includes(b.id) ? { selected: true } : {}),
    })));
  // 天数
  $("#num-last").value = state.lastDay;
  $("#num-days").value = state.days;
  $("#sum-tools").textContent = E.toolsLabel(state);
}

/* ---------- 弹窗：录一格 ---------- */
let popRoomId = null;
function openPop(i) {
  popRoomId = i;
  const dlg = $("#pop");
  const r = state.rooms[i];
  $("#pop-title").textContent = `${i} 号房${i === D.IX_ROOM ? "（审讯室）" : ""}`;
  // 兽种
  const sp = $("#pop-species");
  sp.replaceChildren(
    el("button", { class: "chip", type: "button", onclick: () => setRoom(i, null), "aria-pressed": !r?.code ? "true" : "false" }, "空 / 未开"),
    ...D.SPECIES_LIST.map(k => el("button", {
      class: "chip", type: "button", "data-code": k,
      onclick: () => setRoom(i, { code: k, tier: r?.tier ?? 1 }),
    }, [`${D.SPECIES[k].icon} ${D.SPECIES[k].name}`])),
  );
  // 阶位
  const tp = $("#pop-tier");
  tp.replaceChildren(...D.TIERS.slice(0, 5).map(t => el("button", {
    class: "chip", type: "button", "data-tier": t.tier,
    onclick: () => setRoom(i, { code: r?.code ?? "rat", tier: t.tier }),
  }, [el("span", { class: "sw", style: `background:${t.hex}` }), `${t.tier} ${t.name}`])));
  // 其他开关
  $("#chk-locked").checked = !!r?.locked;
  $("#chk-event").checked = !!r?.event;
  $("#chk-cur").checked = i === state.cur;
  syncPopPressed(i);
  dlg.showModal();
}
function syncPopPressed(i) {
  const r = state.rooms[i];
  $$("#pop-species .chip").forEach(b => {
    const k = b.dataset.code;
    b.setAttribute("aria-pressed", (k ? r?.code === k : !r?.code) ? "true" : "false");
  });
  $$("#pop-tier .chip").forEach(b => {
    b.setAttribute("aria-pressed", r?.tier === Number(b.dataset.tier) ? "true" : "false");
  });
}
function setRoom(i, beast) {
  const prev = state.rooms[i];
  if (beast === null) {
    state.rooms[i] = { ...prev, code: null, tier: null };
  } else {
    // 选兽种或阶位 → 该房自动视为"已开"（记录时顺手维护拓扑）
    state.rooms[i] = { ...prev, code: beast.code, tier: beast.tier, locked: false };
  }
  syncPopPressed(i);
  rerender();
  // 弹窗重开（rerender 会让底层 DOM 更新，弹窗需重新同步）
  if ($("#pop").open) { renderBoard(); syncPopPressed(i); $("#chk-locked").checked = !!state.rooms[i].locked; }
}

$("#pop-form")?.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const i = popRoomId;
  state.rooms[i] = {
    ...state.rooms[i],
    locked: $("#chk-locked").checked,
    event: $("#chk-event").checked,
    empty: false,
  };
  if ($("#chk-cur").checked) state.cur = i;
  $("#pop").close();
  rerender();
});
$("#pop-close")?.addEventListener("click", () => $("#pop").close());
$("#pop-clear")?.addEventListener("click", () => {
  const i = popRoomId;
  state.rooms[i] = { code: null, tier: null, locked: i !== D.IX_ROOM, empty: false, event: !!state.rooms[i]?.event };
  $("#pop").close();
  rerender();
});

/* ---------- 示例局面 ---------- */
function exampleState() {
  const s = E.createState({ days: 16, lastDay: 20, rainbow: 3, cur: 10, swapped: false, opts: [12, 7, 8], tools: ["coin", "chains"], task: "open10", taskProg: 15 });
  s.rooms[1] = { code: null, tier: null, locked: false, empty: true, event: false };   // 审讯室（空）
  s.rooms[2] = { code: "wolf", tier: 3, locked: false, empty: false, event: false };
  s.rooms[3] = { code: "rat", tier: 4, locked: false, empty: false, event: false };
  s.rooms[4] = { code: "lion", tier: 2, locked: false, empty: false, event: false };
  s.rooms[6] = { code: "wolf", tier: 4, locked: false, empty: false, event: false };
  s.rooms[7] = { code: null, tier: null, locked: true, empty: false, event: true };    // 事件房
  s.rooms[8] = { code: null, tier: null, locked: true, empty: false, event: false };
  s.rooms[9] = { code: "elephant", tier: 2, locked: false, empty: false, event: false };
  s.rooms[10] = { code: "elephant", tier: 4, locked: false, empty: false, event: false }; // 当前所在：金象
  s.rooms[11] = { code: "lion", tier: 3, locked: false, empty: false, event: false };
  s.rooms[12] = { code: null, tier: null, locked: true, empty: false, event: false };
  s.rooms[14] = { code: "rat", tier: 5, locked: false, empty: false, event: false };
  s.rooms[15] = { code: "wolf", tier: 5, locked: false, empty: false, event: false };
  s.rooms[16] = { code: null, tier: null, locked: true, empty: false, event: false };
  return s;
}

/* ---------- 一键 ---------- */
function renderAll() {
  renderStats();
  renderOpts();
  renderBoard();
  renderAdv();
  renderTools();
  const t = E.recommendTreasure(state);
  $("#treasure-hint").textContent = `建议拿：${D.TREASURES.find(x => x.id === t.id)?.name ?? t.id} —— ${t.reason}`;
}

/* ---------- 顶栏事件 ---------- */
$("#btn-example")?.addEventListener("click", () => { state = exampleState(); rerender(); toast("已加载示例局面"); });
$("#btn-reset")?.addEventListener("click", () => {
  if (!confirm("清空整个沙盘？此操作不可撤销。")) return;
  state = E.createState();
  rerender();
  toast("已重置");
});
$("#btn-export")?.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `talos-第${state.days}天.json` });
  a.click();
  URL.revokeObjectURL(a.href);
});
$("#btn-import")?.addEventListener("click", () => $("#file-import").click());
$("#file-import")?.addEventListener("change", async (ev) => {
  const f = ev.target.files?.[0];
  if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    if (!obj.rooms) throw new Error("格式不对");
    state = obj;
    rerender();
    toast("已导入");
  } catch (e) { toast(`导入失败：${e.message}`); }
  ev.target.value = "";
});
$("#btn-theme")?.addEventListener("click", () => {
  const m = store.cycleTheme();
  toast(`主题：${{ auto: "跟随系统", light: "浅色", dark: "深色" }[m]}`);
});
$("#sel-task")?.addEventListener("change", (ev) => { state.task = ev.target.value || null; rerender(); });
$("#num-prog")?.addEventListener("change", (ev) => { state.taskProg = Number(ev.target.value) || 0; rerender(); });
$("#sel-buff")?.addEventListener("change", (ev) => { state.buffs = ev.target.value ? [ev.target.value] : []; rerender(); });
$("#num-last")?.addEventListener("change", (ev) => {
  const v = Math.max(1, Math.min(30, Number(ev.target.value) || D.DAYS_DEFAULT));
  state.lastDay = v;
  state.days = Math.min(state.days, v);
  rerender();
});
$("#num-days")?.addEventListener("change", (ev) => {
  const v = Math.max(1, Math.min(state.lastDay, Number(ev.target.value) || 1));
  state.days = v;
  rerender();
});
$("#btn-weapon-clear")?.addEventListener("click", () => { state.tools = []; state.buffs = []; rerender(); });

/* ---------- 键盘：数字键选房 ---------- */
document.addEventListener("keydown", (ev) => {
  if (ev.target.matches("input, textarea, select")) return;
  if ($("#pop").open) return;
  if (/^[1-9]$/.test(ev.key) || ev.key === "0") {
    const i = ev.key === "0" ? 10 : Number(ev.key);
    openPop(i);
  }
});

/* ---------- 轻提示 ---------- */
let toastTimer = null;
function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------- 启动 ---------- */
renderAll();
