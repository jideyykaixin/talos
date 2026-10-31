# DEVKIT

纯前端开发者工具箱。**所有计算都在浏览器里完成，数据不出本机**，没有后端、没有账号、没有统计。

线上地址：<https://jideyykaixin.github.io/talos/>

## 工具

| 工具 | 说明 |
| --- | --- |
| 时间戳转换 | Unix 时间戳 ↔ 日期互转，支持秒/毫秒，同时给出本地时间、UTC、星期与相对时间 |
| Base64 | UTF-8 安全的编码解码，可切 URL-safe、可每 76 字符换行，自动判断输入方向 |
| JSON 格式化 | 格式化 / 压缩 / 键名排序 / 非 ASCII 转义，语法错误定位到行列 |
| 二维码 | 自研编码器，版本 1–10，纠错 L/M/Q/H，可调颜色与留白，导出 SVG / PNG |
| 密码生成器 | 长度 4–128，可选字符类别，排除易混淆字符，基于 `crypto.getRandomValues` |

## 结构

```
index.html              页面骨架（左侧导航 + 右侧内容）
404.html                找不到页面时的兜底
assets/css/app.css      设计令牌与组件样式（原生 CSS，不走 PostCSS）
assets/js/app.js        入口
assets/js/core/dom.js   el() / $ / debounce / copyText / toast
assets/js/core/theme.js 深浅色主题，跟随系统
assets/js/core/registry.js  工具注册表 —— 加工具改这里
assets/js/core/router.js    hash 路由，无刷新切换
assets/js/tools/*.js    各工具模块
tools/*.mjs             自检与测试脚本（不参与页面运行）
```

## 加一个新工具

两步：

1. 在 `assets/js/tools/` 新建模块，导出默认对象：

   ```js
   export default {
     id: 'foo',
     name: '我的工具',
     icon: '★',
     desc: '一句话说明。',
     mount(root) {
       // 往 root 里挂 DOM
       // 返回一个清理函数（解绑监听、停定时器），可选
       return () => {};
     },
   };
   ```

2. 在 `assets/js/core/registry.js` 里 import 它并加进 `TOOLS` 数组。

导航、路由、标题都会自动跟上。

## 本地预览

```powershell
cd D:\54422\Documents\deepseek-harness\default-workspace\talos-site
python -m http.server 8000
```

然后打开 <http://localhost:8000/>。

> 必须用本地服务器打开，不能双击 `index.html`：页面用的是 ES 模块，`file://` 协议下浏览器会拒绝加载。

## 检查与发布

```powershell
npm test          # 跑全部检查（语法、资源、逻辑、路由、二维码）
.\ship.ps1 "提交说明"   # 检查 → 提交 → 推送
```

`ship.ps1` 任何一项检查失败都会中止，不会把坏代码推上去。推送后 GitHub Actions 会自动构建并发布，大约一分钟后可在线上看到。

## 技术说明

- Tailwind 走 CDN（`cdn.tailwindcss.com`），不参与构建，因此页面里不能用 `@apply` / `theme()`；自定义样式一律写在 `app.css` 里。
- 二维码纠错用 GF(256) 上的 Reed–Solomon，`tools/qr-verify.mjs` 会反向解码验证生成的矩阵确实能读回原文。
- 主题偏好存在 `localStorage['devkit.theme']`，没手动切换过就跟着系统走。
