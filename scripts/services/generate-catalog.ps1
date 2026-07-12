#Requires -Version 5.1
# 扫描宿主机 git 镜像，生成 services/catalog.yaml
param(
    [string]$ScanRoot = $env:SYMPHONY_CATALOG_SCAN_ROOT,
    [string]$Output = $env:SYMPHONY_CATALOG_OUTPUT
)

$ErrorActionPreference = "Stop"

function Invoke-GitQuiet {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    $result = & git @GitArgs 2>$null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    return @{ Output = $result; ExitCode = $code }
}

if (-not $ScanRoot) {
    Write-Error "请设置 SYMPHONY_CATALOG_SCAN_ROOT 或使用 -ScanRoot"
}

$ScanRoot = (Resolve-Path $ScanRoot).Path

if (-not $Output) {
    $repoRoot = $env:SYMPHONY_REPO_ROOT
    if ($repoRoot) {
        $Output = Join-Path $repoRoot "services\catalog.yaml"
    } else {
        $parent = Split-Path $ScanRoot -Parent
        $Output = Join-Path $parent "services\catalog.yaml"
    }
}

$outDir = Split-Path $Output -Parent
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}

$generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$driveLetter = ""
if ($ScanRoot -match '^([A-Za-z]):') {
    $driveLetter = $Matches[1].ToUpper()
}

$lines = New-Object System.Collections.Generic.List[string]
[void]$lines.Add("# 机器生成 — 勿手工编辑；重新运行 generate-catalog.ps1 覆盖")
[void]$lines.Add("generated_at: `"$generatedAt`"")
[void]$lines.Add("scan_root: `"$ScanRoot`"")
[void]$lines.Add("repos:")

$warnings = 0

Get-ChildItem $ScanRoot -Directory | ForEach-Object {
    $gitDir = Join-Path $_.FullName ".git"
    if (-not (Test-Path $gitDir)) { return }

    $repoKey = $_.Name
    $hostPath = $_.FullName

    Push-Location $_.FullName
    try {
        $remote = Invoke-GitQuiet remote get-url origin
        if ($remote.ExitCode -ne 0 -or -not $remote.Output) {
            Write-Warning "跳过 ${repoKey}: 无 origin remote"
            $script:warnings++
            return
        }
        $gitUrl = "$($remote.Output)".Trim()

        $defaultBranch = "main"
        $originHead = Invoke-GitQuiet symbolic-ref --short refs/remotes/origin/HEAD
        if ($originHead.ExitCode -eq 0 -and $originHead.Output) {
            $defaultBranch = ("$($originHead.Output)").Trim() -replace '^origin/', ''
        } else {
            $master = Invoke-GitQuiet rev-parse --verify origin/master
            if ($master.ExitCode -eq 0) { $defaultBranch = "master" }
        }

        if ($driveLetter) {
            $mcpProject = "${driveLetter}-project-${repoKey}"
        } else {
            $mcpProject = "F-project-${repoKey}"
        }

        [void]$lines.Add("  ${repoKey}:")
        [void]$lines.Add("    git_url: `"$gitUrl`"")
        [void]$lines.Add("    host_path: `"$hostPath`"")
        [void]$lines.Add("    mcp_project: `"$mcpProject`"")
        [void]$lines.Add("    default_branch: `"$defaultBranch`"")
    } finally {
        Pop-Location
    }
}

$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($Output, ($lines -join "`n") + "`n", $utf8NoBom)
Write-Host "[generate-catalog] 已写入 $Output (warnings=$warnings)"
