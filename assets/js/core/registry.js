/* 工具注册表
 *
 * 新增一个工具只需两步：
 *   1. 在 assets/js/tools/ 建一个模块，导出默认对象 { id, name, icon, desc, mount(container) }
 *   2. 在下面 TOOLS 数组里 import 并加进去
 * 导航、路由、标题、无刷新切换都会自动生效。
 */

import timestamp from '../tools/timestamp.js';
import base64    from '../tools/base64.js';
import json      from '../tools/json.js';
import qrcode    from '../tools/qrcode.js';
import password  from '../tools/password.js';

export const TOOLS = [
  timestamp,
  base64,
  json,
  qrcode,
  password,
];

export const TOOL_MAP = new Map(TOOLS.map(t => [t.id, t]));

export const DEFAULT_ID = TOOLS[0].id;
