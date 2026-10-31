/* 工具注册表
 *
 * ── 站点结构 ──────────────────────────────────────────────
 *  导航分成若干「分区」（SECTIONS），每个分区下挂若干条目。
 *  条目可以是独立的工具模块，也可以只是一个链接卡片墙。
 *
 *  ── 新增一个工具（三步）────────────────────────────────────
 *   1. 在 assets/js/tools/ 建一个模块，导出默认对象：
 *        { id, name, icon, desc, mount(container) }
 *      mount() 往 container 里挂 DOM，可返回清理函数。
 *   2. 在下面 import 它。
 *   3. 把它加进某个分区的 items 数组。
 *  导航、路由、标题、无刷新切换都会自动生效。
 *
 *  ── 想把工具挪进别的栏目 ──────────────────────────────────
 *  只需要在 SECTIONS 里把它移到目标分区的 items 中，其它代码不用动。
 */

// ── 面板（独立页面，非工具模块）──────────────────────────
import dashboard from '../tools/dashboard.js';

// ── 工具（工具箱栏目）────────────────────────────────────
import timestamp from '../tools/timestamp.js';
import base64    from '../tools/base64.js';
import json      from '../tools/json.js';
import qrcode    from '../tools/qrcode.js';
import password  from '../tools/password.js';

/* 英文 id 显示名对照表 —— 路由里用它生成「仪表盘 · DEVKIT」这样的标题 */
export const APP_NAME = 'DEVKIT';

export const SECTIONS = [
  {
    id: 'panel',
    label: '面板',
    items: [dashboard],
  },
  {
    id: 'toolbox',
    label: '工具箱',
    items: [timestamp, base64, json, qrcode, password],
  },
];

/* 拍平成一维列表，路由和查找都基于它 */
export const TOOLS = SECTIONS.flatMap(s => s.items);

export const TOOL_MAP = new Map(TOOLS.map(t => [t.id, t]));

/* 条目 → 所属分区，用来在导航里高亮分区 */
export const SECTION_OF = new Map(
  SECTIONS.flatMap(s => s.items.map(t => [t.id, s.id]))
);

export const DEFAULT_ID = dashboard.id;
