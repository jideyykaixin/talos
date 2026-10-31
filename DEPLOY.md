# 部署到 GitHub Pages

**你只需要做 4 步。** 全程不需要把你的密码或 Token 发给任何人（包括我）。

---

## 准备：装 Git

你的机器上现在没有 `git`。任选一种：

| 方式 | 命令 |
|---|---|
| winget（Win10/11） | `winget install --id Git.Git -e` |
| 官网 | 下载 <https://git-scm.com/download/win> 一路 Next |
| Scoop | `scoop install git` |

装完**新开一个终端**，跑 `git --version` 能看到版本号就 OK。然后配一次身份：

```powershell
git config --global user.name  "你的 GitHub 用户名"
git config --global user.email "你的邮箱"
```

---

## 第 1 步：在 GitHub 建空仓库

1. 打开 <https://github.com/new>
2. **Repository name**：建议 `talos`（名字随意，会出现在网址里）
3. 可见性：**Public**（Pages 免费版只支持公开仓库；私有仓库要 Pro）
4. **不要**勾 "Add a README file"，保持空仓库
5. 点 **Create repository**

---

## 第 2 步：把本地站点推上去

在 PowerShell 里进到站点目录，然后：

```powershell
cd "D:\54422\Documents\deepseek-harness\default-workspace\talos-site"

git init -b main
git add -A
git commit -m "feat: 塔罗斯监狱沙盘指挥台 站点骨架"
git remote add origin https://github.com/<你的用户名>/talos.git
git push -u origin main
```

> 第一次 `push` 会弹浏览器让你登录 GitHub 授权（Git Credential Manager），
> **Token 由你自己在本地生成并在弹窗里粘贴，不会经过我。**

---

## 第 3 步：打开 Pages

1. 仓库页 → **Settings** → 左侧 **Pages**
2. **Source** 选 **GitHub Actions**（不要选 Deploy from a branch）
3. 回到仓库页 → **Actions** 标签，能看到 "Deploy to GitHub Pages" 正在跑
4. 等 1～2 分钟，绿色对勾出现后，网址就是：

```
https://<你的用户名>.github.io/talos/
```

**注意末尾的斜杠**：`/talos/` 才是正确入口。所有内部链接都是相对路径，所以部署在子路径下也不会 404。

---

## 第 4 步（可选）：绑自己的域名

如果你买了域名（如 `example.com`）：

1. 仓库根目录新建文件 `CNAME`，内容只写一行：`talos.example.com`
2. 在域名商处加 DNS 记录：
   - 子域名 → `CNAME` 指向 `<你的用户名>.github.io`
   - 根域名 → 4 条 `A` 记录指向 GitHub 的 IP（见 GitHub 文档）
3. 回仓库 Settings → Pages → **Custom domain** 填上并勾 **Enforce HTTPS**
4. 等证书签发（几分钟到几小时）

> 国内绑域名需要 ICP 备案，不然 80/443 会被拦截。先用 `github.io` 的地址最省事。

---

## 以后每一次改动的流程

```powershell
cd "D:\54422\Documents\deepseek-harness\default-workspace\talos-site"
node --test test/          # 先跑测试
node tools/check.mjs       # 再跑自检（无外链 / 无绝对路径 / 无死链）
git add -A
git commit -m "改了啥"
git push
```

push 完 Actions 自动重新部署，一两分钟生效。

> **CI 会拦截**：如果测试或自检失败，workflow 会在 `test` 阶段失败，**不会部署**。
> 这是故意的 —— 保证线上永远是绿的。

---

## 本地预览

直接双击 `index.html` 就能看门户页。但工具页用了 ES Module，**必须经 HTTP**（`file://` 会被 CORS 拦）。任选一种起本地服务：

```powershell
# 方式 A：python（如果装了）
python -m http.server 8000

# 方式 B：node（你一定有）
npx --yes serve . -l 8000
```

然后浏览器打开 <http://localhost:8000/>。

---

## 常见问题

**Q: 页面 404**
检查是不是访问了 `/talos` 而少了末尾斜杠，或者 Pages 还没部署完（Actions 是否绿）。

**Q: 工具页白屏，控制台报 CORS / module 错误**
你是用 `file://` 直接打开的工具页。用上面的本地服务器，或部署后访问线上地址。

**Q: 改了 `data.js` 但页面没变化**
A-5 规则：给引用处加 `?v=N` 的 N 加一。或者 Ctrl+F5 硬刷新。

**Q: 换电脑/清缓存后进度没了**
用户数据只在 `localStorage`。用工具页的「导出 JSON」备份，「导入」恢复。

**Q: 想改成私有仓库**
GitHub Pages 免费版不支持私有仓库发布。要么保持 Public，要么升 GitHub Pro。

---

## 交付清单（我都做完了）

| 文件 | 作用 |
|---|---|
| `index.html` | 门户页：工具卡片墙 + 关于 + 隐私 |
| `tools/talos.html` | 塔罗斯监狱沙盘指挥台 |
| `assets/css/base.css` | 设计令牌、深浅色、布局、表格、页脚 |
| `assets/css/tool.css` | 棋盘、建议区、弹窗等工具页专用样式 |
| `assets/js/data.js` | **唯一数据源**：31 件刑具、4 物种、6 阶位、16 事件、4 任务、判据阈值 |
| `assets/js/engine.js` | **纯函数引擎**：canEat / eatNewTier / eatStartDay / analyze / applyEat / applyMove / recommendTreasure / chainPath |
| `assets/js/store.js` | localStorage 封装 + 主题三态 |
| `assets/js/ui.js` | DOM 渲染、弹窗录入、键盘快捷键、导出导入 |
| `test/engine.test.mjs` | **34 项单测**，全部对应 `docs/RULES.md` 的硬规则 |
| `tools/check.mjs` | 静态自检：无外链、无绝对路径、无死链 |
| `.github/workflows/pages.yml` | 测试 → 自检 → 部署 Pages |
| `docs/RULES.md` | 硬规则全文（本文件的上游） |
| `404.html` / `.nojekyll` | 兜底页 / 关闭 Jekyll |
