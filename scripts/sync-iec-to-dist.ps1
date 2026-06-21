# scripts/sync-iec-to-dist.ps1
# ============================================================================
# 同步 iec_symbols_svg/ 到 dist/ (Vercel 部署)
#
# 用法:
#   .\scripts\sync-iec-to-dist.ps1           # 同步
#   .\scripts\sync-iec-to-dist.ps1 -Verify   # 只验证不同步
#
# 为什么需要:
#   - vercel.json outputDirectory="dist" 让 Vercel 只把 dist/ 当静态资源
#   - iec_symbols_svg/ 在 repo root,Vercel 默认不会自动打包到 function bundle
#   - 即使加了 functions.api.includeFiles="iec_symbols_svg/**",
#     双保险: dist/ 副本供静态资源访问, function bundle 副本供 API 调用
#
# 跑这个脚本的场景:
#   1. 修了 iec_symbols_svg/ 里的 SVG (新增/重矢量化/调样式)
#   2. CI/CD 在 commit 前自动跑
#   3. 部署前手动跑 (推荐)
# ============================================================================

param(
    [switch]$Verify = $false,
    [string]$SrcDir = "iec_symbols_svg",
    [string]$DstDir = "dist\iec_symbols_svg"
)

$ErrorActionPreference = "Stop"

# Resolve repo root from script location (scripts/ -> repo root)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
Set-Location $repoRoot

$srcFull = Join-Path $repoRoot $SrcDir
$dstFull = Join-Path $repoRoot $DstDir

if (-not (Test-Path $srcFull)) {
    Write-Host "[FAIL] Source not found: $srcFull" -ForegroundColor Red
    exit 1
}

$srcCount = (Get-ChildItem -Path $srcFull -Filter "iec_*.svg" | Measure-Object).Count
$srcSize = (Get-ChildItem -Path $srcFull -Filter "iec_*.svg" -Recurse | Measure-Object -Property Length -Sum).Sum / 1024

if ($Verify) {
    if (-not (Test-Path $dstFull)) {
        Write-Host "[FAIL] Destination missing: $dstFull" -ForegroundColor Red
        Write-Host "       Run without -Verify to sync." -ForegroundColor Yellow
        exit 1
    }
    $dstCount = (Get-ChildItem -Path $dstFull -Filter "iec_*.svg" | Measure-Object).Count
    $dstSize = (Get-ChildItem -Path $dstFull -Filter "iec_*.svg" -Recurse | Measure-Object -Property Length -Sum).Sum / 1024

    if ($srcCount -ne $dstCount) {
        Write-Host "[DRIFT] count mismatch: src=$srcCount dst=$dstCount" -ForegroundColor Red
        exit 2
    }
    Write-Host ("[OK] {0} files, src={1:N1}KB dst={2:N1}KB" -f $srcCount, $srcSize, $dstSize) -ForegroundColor Green
    exit 0
}

# Sync: copy src -> dst (force overwrite)
Copy-Item -Path "$srcFull\*" -Destination $dstFull -Recurse -Force
$dstCount = (Get-ChildItem -Path $dstFull -Filter "iec_*.svg" | Measure-Object).Count
$dstSize = (Get-ChildItem -Path $dstFull -Filter "iec_*.svg" -Recurse | Measure-Object -Property Length -Sum).Sum / 1024

Write-Host ("[SYNCED] {0} -> {1} files, {2:N1}KB" -f $srcCount, $dstCount, $dstSize) -ForegroundColor Green
Write-Host "Source: $srcFull"
Write-Host "Dest  : $dstFull"