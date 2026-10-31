# 一键发布：跑全部检查 → 提交 → 推送
# 用法：在 PowerShell 里 cd 到 talos-site 后执行  .\ship.ps1 "提交说明"
#       不写说明就用默认的。
# 说明：任何一步检查失败都会中止，不会把坏代码推上去。

param([string]$Message = "chore: 更新站点")

Set-Location $PSScriptRoot

function Step($n, $title, [scriptblock]$run) {
  Write-Host "`n[$n] $title" -ForegroundColor Cyan
  & $run
  if ($LASTEXITCODE -ne 0) {
    Write-Host "`n✗ $title 失败，已中止。" -ForegroundColor Red
    exit 1
  }
}

Step "1/8" "语法与模块自检" { node tools/check.mjs }
Step "2/8" "页面与资源自检" { node tools/site-check.mjs }
Step "3/8" "工具逻辑验证" { node tools/logic-verify.mjs }
Step "4/8" "路由联动测试" { node tools/router-test.mjs assets/js/core/router.js }
Step "5/8" "界面冒烟测试（六个模块）" {
  foreach ($t in @('dashboard', 'timestamp', 'base64', 'json', 'qrcode', 'password')) {
    node tools/ui-smoke.mjs "assets/js/tools/$t.js"
    if ($LASTEXITCODE -ne 0) { break }
  }
}
Step "6/8" "二维码编解码验证" {
  node tools/qr-verify.mjs
  if ($LASTEXITCODE -eq 0) { node tools/qr-rs-check.mjs }
  if ($LASTEXITCODE -eq 0) { node tools/qr-robust.mjs }
}

Write-Host "`n[7/8] 提交" -ForegroundColor Cyan
git add -A
git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Host "没有改动可提交（或提交失败），继续推送。" -ForegroundColor Yellow }

Write-Host "`n[8/8] 推送" -ForegroundColor Cyan
git push
if ($LASTEXITCODE -ne 0) { Write-Host "推送失败，看上面对话。" -ForegroundColor Red; exit 1 }

Write-Host "`n✓ 已推送。Actions：https://github.com/jideyykaixin/talos/actions" -ForegroundColor Green
Write-Host "  站点：https://jideyykaixin.github.io/talos/" -ForegroundColor Green
