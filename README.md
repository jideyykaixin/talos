# DEVKIT

个人仪表盘 + 纯前端开发者工具箱。**所有计算都在浏览器里完成，数据不出本机**，没有后端、没有账号、没有统计。

线上地址：<https://jideyykaixin.github.io/talos/>

## 栏目

左侧导航分两组，切换无刷新：

### 面板（默认首页）

| 模块 | 说明 |
| --- | --- |
| 时钟 | 当前时间、日期、星期，按时段问候；切到后台暂停走秒以省电 |
| 待办事项 | 添加 / 勾选 / 删除，未完成在前，存 `localStorage` |
| 便签 | 随手记，停止输入 400ms 后自动保存，离开页面时兜底落盘 |
| 倒计时 | 设置目标日期，显示还剩几天；跨零点自动翻页 |
| 快捷链接 | 8 个常用网站入口 |

### 工具箱

| 工具 | 说明 |
| --- | --- |
| 时间戳转换 | Unix 时间戳 ↔ 日期互转，支持秒/毫秒，同时给出本地时间、UTC、星期与相对时间 |
| Base64 | UTF-8 安全的编码解码，可切 URL-safe、可每 76 字符换行，自动判断输入方向 |
| JSON 格式化 | 格式化 / 压缩 / 键名排序 / 非 ASCII 转义，语法错误定位到行列 |
| 二维码 | 自研编码器，版本 1–10，纠错 L/M/Q/H，可调颜色与留白，导出 SVG / PNG |
| 密码生成器 | 长度 4–128，可选字符类别，排除易混淆字符，基于 `crypto.getRandomValues` |

## 结构

```
index.html                    页面骨架（左侧导航 + 右侧内容）
404.html                      找不到页面时的兜底
assets/css/app.css            设计令牌与组件样式（原生 CSS，不走 PostCSS）
assets/js/app.js              入口
assets/js/core/dom.js         el() / $ / debounce / copyText / toast
assets/js/core/theme.js       深浅色主题，跟随系统
assets/js/core/storage.js     localStorage 读写（带容错）
assets/js/core/registry.js    栏目与工具注册表 —— 改结构改这里
assets/js/core/router.js      hash 路由，无刷新切换
assets/js/dashboard/config.js ★ 仪表盘的文字、链接、初始倒计时都在这里
assets/js/dashboard/*.js      仪表盘五个模块
assets/js/tools/*.js          各工具模块
tools/*.mjs                   自检与测试脚本（不参与页面运行）
```

## 改文字和链接

打开 `assets/js/dashboard/config.js`，全部集中在这一个文件里：

- `SITE.name` —— 想显示自己的名字就填上，留空则按时段自动问候
- `SITE.sub` —— 副标题
- `LINKS` —— 8 个快捷入口，每项 `{ name, url, icon, desc }`；数量不限，网格自适应；只允许 `http/https`
- `COUNTDOWN_SEED` —— 倒计时初始名称与日期（`YYYY-MM-DD`）
- `NOTE_SEED` —— 便签的初始示例文字
- `TEXT` —— 卡片标题、占位符等文案

## 加一个新工具

两步：

1. 在 `assets/js/tools/` 新建模块，导出默认对象：

   ```js
   export default {
     id: 'foo',
     name: '我的工具',
     icon: '★',
     desc: '一句话说明。',
     mount(container) {
       // 往 container 里挂 DOM
       // 返回一个清理函数，或 { destroy() }，可选
       return () => {};
     },
   };
   ```

2. 在 `assets/js/core/registry.js` 里 import 它，加进对应栏目的 `items`。

导航、路由、标题都会自动跟上。想把某个工具换个栏目，也只需在 `SECTIONS` 里挪位置。

## 本地预览

```powershell
cd D:\54422\Documents\deepseek-harness\default-workspace\talos-site
python -m http.server 8000
```

然后打开 <http://localhost:8000/>。

> 必须用本地服务器打开，不能双击 `index.html`：页面用的是 ES 模块，`file://` 协议下浏览器会拒绝加载。

## 检查与发布

```powershell
npm test                # 跑全部检查（语法、资源、逻辑、路由、二维码、界面冒烟）
.\ship.ps1 "提交说明"    # 检查 → 提交 → 推送
```

`ship.ps1` 任何一项检查失败都会中止，不会把坏代码推上去。推送后 GitHub Actions 会自动构建并发布，大约一分钟后可在线上看到。

## 技术说明

- Tailwind 走 CDN（`cdn.tailwindcss.com`），不参与构建，因此页面里不能用 `@apply` / `theme()`；自定义样式一律写在 `app.css` 里。
- 二维码纠错用 GF(256) 上的 Reed–Solomon，`tools/qr-verify.mjs` 会反向解码验证生成的矩阵确实能读回原文。
- 主题偏好存在 `localStorage['devkit.theme']`，没手动切换过就跟着系统走。
- 仪表盘数据存在 `localStorage['devkit.dash.*']`，清空浏览器数据即全部清除。
- 倒计时按「本地零点对齐后相减」计算，避免同一天不同时刻显示不同天数。
