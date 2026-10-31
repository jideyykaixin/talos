# 推送脚本：在已登录 GitHub 的 PowerShell 里运行
$git = "D:\A_APP\C_AI\Git\Git\cmd\git.exe"
Set-Location "D:\54422\Documents\deepseek-harness\default-workspace\talos-site"

Write-Host "`n当前状态：" -ForegroundColor Cyan
& $git status -sb

Write-Host "`n开始推送……" -ForegroundColor Cyan
& $git push origin main
$code = $LASTEXITCODE

Write-Host ""
if ($code -eq 0) {
    Write-Host "✓ 推送成功。" -ForegroundColor Green
    Write-Host "  去 Actions 看构建：https://github.com/jideyykaixin/talos/actions" -ForegroundColor Green
    Write-Host "  约 1 分钟后访问：https://jideyykaixin.github.io/talos/" -ForegroundColor Green
} else {
    Write-Host "✗ 推送失败，退出码 $code" -ForegroundColor Red
}
