# 一键发布：跑测试 → 跑自检 → 提交 → 推送
# 用法：在 PowerShell 里  cd 到 talos-site 后执行  .\ship.ps1 "提交说明"
#       不写说明就用默认的。

param([string]$Message = "chore: 更新站点")

Set-Location $PSScriptRoot

Write-Host "`n[1/4] 引擎单测" -ForegroundColor Cyan
node test/engine.test.mjs
if ($LASTEXITCODE -ne 0) { Write-Host "测试失败，已中止。" -ForegroundColor Red; exit 1 }

Write-Host "`n[2/4] 静态自检" -ForegroundColor Cyan
node tools/check.mjs
if ($LASTEXITCODE -ne 0) { Write-Host "自检失败，已中止。" -ForegroundColor Red; exit 1 }

Write-Host "`n[3/4] 提交" -ForegroundColor Cyan
git add -A
git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Host "没有改动可提交（或提交失败）。" -ForegroundColor Yellow }

Write-Host "`n[4/4] 推送" -ForegroundColor Cyan
git push
if ($LASTEXITCODE -ne 0) { Write-Host "推送失败，看上面对话。" -ForegroundColor Red; exit 1 }

Write-Host "`n✓ 已推送。去 Actions 看结果：https://github.com/jideyykaixin/talos/actions" -ForegroundColor Green
