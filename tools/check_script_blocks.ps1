# tools/check_script_blocks.ps1
# Extract every <script> block from an HTML file (skip <script src="..."> with no inline body),
# write to a temp dir as .js, and run `node --check` on each.
# Reports which line of the original HTML each block lives at, so failures are easy to localize.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$HtmlPath
)

$src = Get-Content -Path $HtmlPath -Raw -Encoding UTF8
$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ("scriptblocks_" + [System.Guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $tmpDir | Out-Null

# Match <script>...</script> blocks (handles multiline)
$pattern = '(?s)<script(?:\s[^>]*)?>(.*?)</script>'
$matches_found = [regex]::Matches($src, $pattern)

$idx = 0
$fail = 0
foreach ($m in $matches_found) {
    $idx += 1
    $body = $m.Groups[1].Value
    if ([string]::IsNullOrWhiteSpace($body)) { continue }   # external <script src="...">
    # Locate line number of the opening tag in the source
    $offset = $m.Index
    $lineNum = ($src.Substring(0, $offset) -split "`n").Count
    $jsPath = Join-Path $tmpDir ("block_{0:D3}.js" -f $idx)
    [System.IO.File]::WriteAllText($jsPath, $body, [System.Text.Encoding]::UTF8)
    $err = & node --check $jsPath 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host ("OK    {0}  block{1:D3}  (line ~{2}  {3} bytes)" -f $HtmlPath, $idx, $lineNum, $body.Length)
    } else {
        Write-Host ("FAIL  {0}  block{1:D3}  (line ~{2})" -f $HtmlPath, $idx, $lineNum) -ForegroundColor Red
        Write-Host $err
        $fail += 1
    }
}

Remove-Item -Recurse -Force $tmpDir
Write-Host ""
Write-Host ("Summary: {0} blocks checked, {1} failed" -f $idx, $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }