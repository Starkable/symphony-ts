#Requires -Version 5.1
# Materialize business repos from scope.json + catalog.yaml into repos/<repo_key>/
param(
    [string]$CatalogFile = $env:SYMPHONY_CATALOG_FILE
)

$ErrorActionPreference = "Stop"
$Workspace = Get-Location
$ChangesDir = Join-Path $Workspace "openspec\changes"

function Write-MaterializeLog([string]$Message) {
    Write-Host "[materialize-repos] $Message"
}

function Read-JsonFile([string]$Path) {
    # PS 5.1: Get-Content -Encoding UTF8 对含中文的 scope.json 易解析失败，用 ReadAllText
    $text = [System.IO.File]::ReadAllText($Path)
    return $text | ConvertFrom-Json
}

function Write-JsonFile([string]$Path, [object]$Object) {
    $json = $Object | ConvertTo-Json -Depth 10
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $json + "`n", $utf8NoBom)
}

if (-not (Test-Path $ChangesDir)) {
    Write-MaterializeLog "skip: no openspec/changes"
    exit 0
}

if (-not $CatalogFile) {
    $repoRoot = $env:SYMPHONY_REPO_ROOT
    if ($repoRoot) {
        $CatalogFile = Join-Path $repoRoot "services\catalog.yaml"
    }
    else {
        $scriptRepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
        $CatalogFile = Join-Path $scriptRepoRoot "services\catalog.yaml"
    }
}

if (-not (Test-Path $CatalogFile)) {
    Write-Error "catalog not found: $CatalogFile"
}

function Get-CatalogEntry {
    param(
        [string]$RepoKey,
        [string]$CatalogPath
    )

    $lines = Get-Content $CatalogPath
    $inBlock = $false
    $gitUrl = $null
    $branch = $null

    foreach ($line in $lines) {
        if ($line -match "^  ${RepoKey}:") {
            $inBlock = $true
            continue
        }
        if ($inBlock -and $line -match '^  \S') {
            break
        }
        if (-not $inBlock) {
            continue
        }
        if ($line -match 'git_url:') {
            $gitUrl = ($line -split 'git_url:\s*', 2)[1].Trim().Trim([char]34)
        }
        if ($line -match 'default_branch:') {
            $branch = ($line -split 'default_branch:\s*', 2)[1].Trim().Trim([char]34)
        }
    }

    if (-not $gitUrl) {
        return $null
    }
    if (-not $branch) {
        $branch = "main"
    }

    return @{
        git_url = $gitUrl
        default_branch = $branch
    }
}

Get-ChildItem $ChangesDir -Directory | ForEach-Object {
    $changeDir = $_.FullName
    $changeRef = $_.Name
    $scopeFile = Join-Path $changeDir "scope.json"
    $reviewFile = Join-Path $changeDir "proposal_review.md"
    $tasksFile = Join-Path $changeDir "tasks.md"

    if (-not (Test-Path $scopeFile)) { return }
    if (-not (Test-Path $reviewFile)) { return }
    if (Test-Path $tasksFile) { return }

    $reviewContent = Get-Content $reviewFile -Raw
    if ($reviewContent -notmatch 'status:\s*pass') {
        Write-MaterializeLog "skip change ${changeRef}: proposal_review not pass"
        return
    }

    $scope = Read-JsonFile $scopeFile
    if ($scope.materialized -eq $true) {
        Write-MaterializeLog "skip change ${changeRef}: already materialized"
        return
    }

    Write-MaterializeLog "materialize change $changeRef"

    foreach ($entry in $scope.affected_repos) {
        if ($entry.confidence -eq "low") { continue }

        $repoKey = $entry.repo_key
        $target = Join-Path $Workspace "repos\$repoKey"
        if (Test-Path (Join-Path $target ".git")) {
            Write-MaterializeLog "skip clone repos/${repoKey}: already exists"
            continue
        }

        $cat = Get-CatalogEntry -RepoKey $repoKey -CatalogPath $CatalogFile
        if (-not $cat -or -not $cat.git_url) {
            Write-Error "catalog missing repo_key: $repoKey"
        }

        $reposRoot = Join-Path $Workspace "repos"
        New-Item -ItemType Directory -Force -Path $reposRoot | Out-Null
        Write-MaterializeLog "clone $repoKey branch=$($cat.default_branch)"
        git clone --depth 1 --branch $cat.default_branch $cat.git_url $target
    }

    $scope.materialized = $true
    $scope.materialized_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    Write-JsonFile $scopeFile $scope
    Write-MaterializeLog "done change $changeRef"
}

exit 0
