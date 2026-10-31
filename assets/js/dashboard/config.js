/* 仪表盘配置 —— 想改文字、改链接，改这个文件就够了
 *
 * 所有可自定义的内容都集中在这里，业务逻辑在 modules/ 里，一般不用动。
 */

/* ── 站点标题 ───────────────────────────────────────────────
 * name 留空则按时段自动问候（早安/上午好/下午好/晚上好），
 * 想固定显示自己的话就填上，例如 name: '小明的面板'。
 */
export const SITE = {
  name: '',
  sub: '这里是你的个人面板 · 所有数据只保存在本机浏览器',
};

/* ── 快捷链接（8 个）─────────────────────────────────────
 * name : 卡片上显示的名字
 * url  : 跳转地址
 * icon : 一个字符或 emoji，显示在大号图标位
 * desc : 鼠标悬停时的提示
 * 想换成自己的：直接改 url 和 name，增删条目也可以（布局是自适应的）。
 */
export const LINKS = [
  { name: 'GitHub',    url: 'https://github.com',                 icon: '⌥', desc: '代码托管' },
  { name: 'MDN',       url: 'https://developer.mozilla.org',      icon: '📖', desc: 'Web 文档' },
  { name: 'DeepSeek',  url: 'https://chat.deepseek.com',          icon: '✦', desc: 'AI 助手' },
  { name: '知乎',      url: 'https://www.zhihu.com',              icon: '知', desc: '问答社区' },
  { name: 'B 站',      url: 'https://www.bilibili.com',           icon: '▶', desc: '视频' },
  { name: '邮件',      url: 'https://mail.qq.com',                icon: '✉', desc: '邮箱' },
  { name: '网盘',      url: 'https://pan.baidu.com',              icon: '☁', desc: '云端存储' },
  { name: '翻译',      url: 'https://translate.google.com',       icon: '文', desc: '在线翻译' },
];

/* ── 倒计时初始值（用户没改过时显示这些）───────────────
 * date 用 YYYY-MM-DD，name 是显示的名字。
 * 用户点「编辑」改过之后，以 localStorage 里的为准。
 */
export const COUNTDOWN_SEED = {
  name: '春节',
  date: '2027-02-06',
};

/* ── 便签初始内容 ───────────────────────────────────────── */
export const NOTE_SEED = `随手记：

· 待办随时加，勾掉即完成
· 倒计时点「编辑」可以改目标日
· 快捷链接在 config.js 里改
`;

/* ── 其它文案 ───────────────────────────────────────────── */
export const TEXT = {
  todoTitle: '待办事项',
  todoPlaceholder: '添加一条待办，回车确认…',
  todoEmpty: '还没有待办，先加一条吧',
  noteTitle: '便签',
  noteSaved: '已自动保存',
  notePlaceholder: '在这里随手记点什么…（自动保存）',
  countdownTitle: '倒计时',
  linksTitle: '快捷链接',
};
