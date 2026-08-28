<#!
.SYNOPSIS
  Build and test all Vista services locally on Windows.

.DESCRIPTION
  Runs install, typecheck/lint, build and test for every service in the repo.
  Each service is built/tested sequentially (failures are collected and
  summarized at the end unless -FailFast is used).

  Services and what is executed:
    - frontend        : npm run typecheck (tsc --noEmit), lint, build (next build), test
    - expose-service  : prisma generate, build (tsc), lint, typecheck, test
    - job-processor   : prisma generate, build (prisma generate && tsc), lint, test
    - 3d              : build (tsc -b && vite build), test (vitest run) - only with -WithPrototypes
    - 360             : build (vite build) - only with -WithPrototypes (no tests)

  By default prototypes (3d, 360) are skipped. Use -WithPrototypes to include them.
  All npm installs are done automatically unless -SkipInstall is passed.

.EXAMPLE
  # Build + test everything (core services)
  ./scripts/build-and-test.ps1

.EXAMPLE
  # Only build, no tests
  ./scripts/build-and-test.ps1 -SkipTest

.EXAMPLE
  # Only test, no build
  ./scripts/build-and-test.ps1 -SkipBuild

.EXAMPLE
  # Filter to a subset
  ./scripts/build-and-test.ps1 -Services frontend,expose-service

.EXAMPLE
  # CI-like: fail fast, include prototypes, skip lint
  ./scripts/build-and-test.ps1 -FailFast -WithPrototypes -SkipLint

.EXAMPLE
  # Full CI with typecheck + lint + build + test
  ./scripts/build-and-test.ps1 -WithPrototypes

.EXAMPLE
  # Wrapper at repo root does the same thing
  ./build-and-test.ps1 -SkipBuild -Services job-processor

.NOTES
  Prereqs: Node.js 20+, npm. Optional for integration tests: Postgres+NATS running
  for job/expose-service (unit tests run without infra).
  Exit code is 0 if all selected steps passed, 1 otherwise.
#>
[CmdletBinding()]
param(
  [string[]]$Services,
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$SkipTest,
  [switch]$SkipLint,
  [switch]$SkipTypecheck,
  [switch]$WithPrototypes,
  [switch]$FailFast,
  [switch]$CI,
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# -- Ensure UTF-8 so native tools (npm, prisma, tsc, vitest) that emit UTF-8 don't mojibake on OEM code pages (e.g. prisma info symbol) --
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::InputEncoding  = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
  & "$env:SystemRoot\System32\chcp.com" 65001 | Out-Null
} catch {}

# -- Help -----------------------------------------------------------------
if ($Help) {
  $raw = Get-Content -LiteralPath $PSCommandPath -Raw
  $header = if ($raw -match '(?s)<#!(.*?)#>') { $Matches[1] } else { $raw.Substring(0, [Math]::Min(3000, $raw.Length)) }
  Write-Host $header.Trim()
  Write-Host ""
  Write-Host "Parameters:" -ForegroundColor White
  Write-Host "  -Services <name[]>  Filter: frontend, expose-service, job-processor, 3d, 360"
  Write-Host "  -SkipInstall        Skip npm ci/install"
  Write-Host "  -SkipBuild          Skip build step"
  Write-Host "  -SkipTest           Skip test step"
  Write-Host "  -SkipLint           Skip lint step"
  Write-Host "  -SkipTypecheck      Skip typecheck step"
  Write-Host "  -WithPrototypes     Include 3d and 360 prototypes"
  Write-Host "  -FailFast           Stop on first failure"
  Write-Host "  -CI                 Alias for FailFast + no interactive prompts"
  exit 0
}
if ($CI) { $FailFast = $true }

# -- Resolve repo root ----------------------------------------------------
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $RepoRoot

# -- Helpers --------------------------------------------------------------
function Write-Info($msg) { Write-Host "[info] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[ ok ] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[warn] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[ err] $msg" -ForegroundColor Red }
function Write-Step($msg) { Write-Host "`n== $msg ==" -ForegroundColor White }

function Test-Command($name) {
  $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Invoke-Step($workDir, $label, $command) {
  $start = Get-Date
  Write-Info "$label : $command"
  Push-Location -LiteralPath $workDir
  try {
    if ($command -match '^(npx |npm |tsc |vite |next |eslint |vitest )') {
      $exec = $command
    } else {
      $exec = "npm $command"
    }
    $exitCode = 0
    $oldPref = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    # Use cmd /c to preserve quoting and avoid extra PowerShell nesting
    & cmd /c $exec 2>&1 | ForEach-Object { Write-Host "$_" }
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = $oldPref
    $duration = [math]::Round(((Get-Date) - $start).TotalSeconds, 1)
    if ($exitCode -eq 0) {
      Write-Ok "$label passed in ${duration}s"
      return @{ ok = $true; duration = $duration; exitCode = 0 }
    } else {
      Write-Err "$label FAILED (exit $exitCode) after ${duration}s"
      return @{ ok = $false; duration = $duration; exitCode = $exitCode }
    }
  } finally { Pop-Location }
}

function Invoke-NpmScript($workDir, $scriptName, $fallbackCommand) {
  $pkgPath = Join-Path $workDir 'package.json'
  if (-not (Test-Path -LiteralPath $pkgPath)) { return @{ ok = $true; skipped = $true; reason = 'no package.json' } }
  $pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
  $hasScript = $null -ne $pkg.scripts.PSObject.Properties[$scriptName]
  if (-not $hasScript) {
    if ($fallbackCommand) {
      return Invoke-Step $workDir $scriptName $fallbackCommand
    }
    Write-Warn "No script '$scriptName' in $workDir - skipping"
    return @{ ok = $true; skipped = $true; reason = 'no script' }
  }
  return Invoke-Step $workDir $scriptName "run $scriptName"
}

function Ensure-EnvFile($serviceDir) {
  $envFile = Join-Path $serviceDir '.env'
  $example = Join-Path $serviceDir '.env.example'
  if (-not (Test-Path -LiteralPath $envFile) -and (Test-Path -LiteralPath $example)) {
    Copy-Item -LiteralPath $example -Destination $envFile -Force
    Write-Info "Created $envFile from .env.example"
  }
}

function Invoke-NpmInstallIfNeeded($dir) {
  if ($SkipInstall) { return @{ ok = $true; skipped = $true } }
  $pkg = Join-Path $dir 'package.json'
  if (-not (Test-Path -LiteralPath $pkg)) { return @{ ok = $true; skipped = $true } }
  $marker = Join-Path $dir 'node_modules'
  $need = -not (Test-Path -LiteralPath $marker)
  if (-not $need) {
    $lock = Join-Path $dir 'package-lock.json'
    if (Test-Path -LiteralPath $lock) {
      $lockTime = (Get-Item -LiteralPath $lock).LastWriteTimeUtc
      $markerTime = (Get-Item -LiteralPath $marker).LastWriteTimeUtc
      if ($lockTime -gt $markerTime) { $need = $true }
    } else {
      # no lock file - ensure install if pkg newer than marker
      $pkgTime = (Get-Item -LiteralPath $pkg).LastWriteTimeUtc
      $markerTime = (Get-Item -LiteralPath $marker).LastWriteTimeUtc
      if ($pkgTime -gt $markerTime) { $need = $true }
    }
  }
  if ($need) {
    Write-Info "Installing dependencies in $dir ..."
    Push-Location -LiteralPath $dir
    try {
      $oldPref = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
      & npm install --no-audit --no-fund --prefer-offline 2>&1 | ForEach-Object { Write-Host "$_" }
      $code = $LASTEXITCODE
      $ErrorActionPreference = $oldPref
      if ($code -ne 0) { return @{ ok = $false; exitCode = $code } }
    } finally { Pop-Location }
  } else {
    Write-Info "Dependencies up to date in $dir - skipping install"
  }
  return @{ ok = $true }
}

# -- Prereqs --------------------------------------------------------------
if (-not (Test-Command 'node')) { Write-Err "Node.js not found. Install Node 20+."; exit 1 }
if (-not (Test-Command 'npm'))  { Write-Err "npm not found. Reinstall Node.js."; exit 1 }
$nodeVer = (& node --version) -replace '^v',''
$major = [int]($nodeVer.Split('.')[0])
if ($major -lt 18) { Write-Warn "Node $nodeVer detected - Vista recommends Node 20+." }
Write-Ok "node $nodeVer / npm $((& npm --version))"

# -- Service catalog ------------------------------------------------------
$AllServices = @(
  @{
    Name = 'expose-service'
    Dir = 'expose-service'
    Group = 'core'
    HasPrisma = $true
    Typecheck = 'npx tsc --noEmit'
    Lint = 'lint'
    Build = 'build'
    Test = 'test'
  }
  @{
    Name = 'job-processor'
    Dir = 'job-processor'
    Group = 'core'
    HasPrisma = $true
    Typecheck = $null  # covered by build (prisma generate && tsc)
    Lint = 'lint'
    Build = 'build'
    Test = 'test'
  }
  @{
    Name = 'frontend'
    Dir = 'frontend'
    Group = 'core'
    HasPrisma = $false
    Typecheck = 'typecheck'
    Lint = 'lint'
    Build = 'build'
    Test = 'test'
  }
  @{
    Name = '3d'
    Dir = '3d'
    Group = 'prototype'
    HasPrisma = $false
    Typecheck = $null  # tsc -b is part of build
    Lint = $null
    Build = 'build'
    Test = 'test'
  }
  @{
    Name = '360'
    Dir = '360'
    Group = 'prototype'
    HasPrisma = $false
    Typecheck = $null
    Lint = $null
    Build = 'build'
    Test = $null  # no tests
  }
)

$aliasMap = @{
  'expose'='expose-service'; 'api'='expose-service'; 'backend'='expose-service'
  'job'='job-processor'; 'processor'='job-processor'; 'jobs'='job-processor'
  'front'='frontend'; 'next'='frontend'; 'web'='frontend'
  '3d-prototype'='3d'; 'floorplan'='3d'
  '360-prototype'='360'; 'pano'='360'
}

if ($Services -and $Services.Count -gt 0) {
  $normalized = $Services | ForEach-Object {
    $k = $_.ToLowerInvariant().Trim(); if ($aliasMap.ContainsKey($k)) { $aliasMap[$k] } else { $k }
  }
  $filtered = $AllServices | Where-Object { $normalized -contains $_.Name.ToLowerInvariant() }
  if (-not $filtered -or $filtered.Count -eq 0) {
    Write-Err "No services match filter: $($Services -join ', '). Valid: frontend, expose-service, job-processor, 3d, 360"
    exit 1
  }
  $AllServices = $filtered
} else {
  if (-not $WithPrototypes) {
    $AllServices = $AllServices | Where-Object { $_.Group -ne 'prototype' }
  }
}

# Only keep services whose directory actually exists
$AllServices = $AllServices | Where-Object { Test-Path -LiteralPath (Join-Path $RepoRoot $_.Dir) }
if ($AllServices.Count -eq 0) {
  Write-Err "No service directories found for selected filter."
  exit 1
}

# -- Banner ---------------------------------------------------------------
Write-Host ""
Write-Host "  Vista - build and test" -ForegroundColor White
Write-Host "  Repo: $RepoRoot" -ForegroundColor DarkGray
Write-Host "  Services: $($AllServices.Name -join ', ')$(if($WithPrototypes){' (+prototypes)'}else{''})" -ForegroundColor DarkGray
$steps = @()
if (-not $SkipTypecheck) { $steps += 'typecheck' }
if (-not $SkipLint)      { $steps += 'lint' }
if (-not $SkipBuild)     { $steps += 'build' }
if (-not $SkipTest)      { $steps += 'test' }
if ($steps.Count -eq 0) { $steps += '(install only)' }
Write-Host "  Steps: $($steps -join ' -> ')" -ForegroundColor DarkGray
if ($FailFast) { Write-Host "  Mode: fail-fast" -ForegroundColor DarkGray }
Write-Host ""

# -- Results accumulator --------------------------------------------------
$results = @()
$overallOk = $true

function Record-Result($service, $step, $res) {
  $okVal = $res['ok']; $skippedVal = $res['skipped']; $durVal = $res['duration']; $exitVal = $res['exitCode']
  $entry = [PSCustomObject]@{
    Service = $service
    Step    = $step
    Ok      = $okVal -eq $true
    Skipped = $skippedVal -eq $true
    Duration = if ($null -ne $durVal) { $durVal } else { 0 }
    ExitCode = if ($null -ne $exitVal) { $exitVal } else { 0 }
  }
  $script:results += $entry
  if (-not $entry.Ok -and -not $entry.Skipped) { $script:overallOk = $false }
  return $entry.Ok -or $entry.Skipped
}

# -- Per-service pipeline -------------------------------------------------
foreach ($svc in $AllServices) {
  $dir = Join-Path $RepoRoot $svc.Dir
  Write-Step "$($svc.Name) ($($svc.Dir))"

  Ensure-EnvFile $dir

  # Clean stale Next.js cache for frontend (stale .next/types can reference deleted routes and break tsc --noEmit)
  if ($svc.Name -eq 'frontend') {
    $nextDir = Join-Path $dir '.next'
    if (Test-Path -LiteralPath $nextDir) {
      Write-Info "Cleaning stale $nextDir (fixes stale Next.js types referencing deleted routes) ..."
      try { Remove-Item -LiteralPath $nextDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}
    }
  }

  # Install
  $r = Invoke-NpmInstallIfNeeded $dir
  if (-not (Record-Result $svc.Name 'install' $r)) {
    Write-Err "$($svc.Name): install failed - skipping remaining steps for this service"
    if ($FailFast) { break }
    continue
  }

  # Prisma generate (must run before typecheck/build for services with Prisma)
  if ($svc.HasPrisma) {
    Write-Info "prisma generate for $($svc.Name) ..."
    Push-Location -LiteralPath $dir
    try {
      $oldPref = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
      & npx prisma generate 2>&1 | ForEach-Object { Write-Host "$_" }
      $prismaExit = $LASTEXITCODE
      $ErrorActionPreference = $oldPref
      if ($prismaExit -ne 0) {
        $prismaRes = @{ ok = $false; exitCode = $prismaExit }
        Record-Result $svc.Name 'prisma:generate' $prismaRes | Out-Null
        Write-Err "$($svc.Name): prisma generate failed"
        if ($FailFast) { break }
        continue
      } else {
        Record-Result $svc.Name 'prisma:generate' @{ ok = $true; duration = 0 } | Out-Null
      }
    } finally { Pop-Location }
  }

  # Typecheck
  if (-not $SkipTypecheck -and $svc.Typecheck) {
    $r = Invoke-NpmScript $dir $svc.Typecheck $svc.Typecheck
    if (-not (Record-Result $svc.Name 'typecheck' $r)) { if ($FailFast) { break } }
    if (-not $r['ok'] -and -not $r['skipped'] -and $FailFast) { break }
  } elseif ($SkipTypecheck) {
    Write-Info "Skipping typecheck (-SkipTypecheck)"
  }

  # Lint
  if (-not $SkipLint -and $svc.Lint) {
    $r = Invoke-NpmScript $dir $svc.Lint $null
    if (-not (Record-Result $svc.Name 'lint' $r)) { if ($FailFast) { break } }
    if (-not $r['ok'] -and -not $r['skipped'] -and $FailFast) { break }
  } elseif ($SkipLint) {
    Write-Info "Skipping lint (-SkipLint)"
  } elseif (-not $svc.Lint) {
    Write-Info "No lint script for $($svc.Name) - skipping"
  }

  # Build
  if (-not $SkipBuild -and $svc.Build) {
    $r = Invoke-NpmScript $dir $svc.Build $null
    $ok = Record-Result $svc.Name 'build' $r
    if (-not $ok) {
      Write-Err "$($svc.Name): build failed"
      if ($FailFast) { break }
      # still try tests? usually no - skip to next service
      continue
    }
  } elseif ($SkipBuild) {
    Write-Info "Skipping build (-SkipBuild)"
  }

  # Test
  if (-not $SkipTest -and $svc.Test) {
    $r = Invoke-NpmScript $dir $svc.Test $null
    $ok = Record-Result $svc.Name 'test' $r
    if (-not $ok -and $FailFast) { break }
  } elseif ($SkipTest) {
    Write-Info "Skipping test (-SkipTest)"
  } elseif (-not $svc.Test) {
    Write-Info "No test script for $($svc.Name) - skipping"
    Record-Result $svc.Name 'test' @{ ok = $true; skipped = $true } | Out-Null
  }
}

# -- Summary --------------------------------------------------------------
Write-Host ""
Write-Host "==================================================================" -ForegroundColor DarkGray
Write-Host "  Summary" -ForegroundColor White
Write-Host "==================================================================" -ForegroundColor DarkGray

if (@($results).Count -eq 0) {
  Write-Warn "No steps were executed."
} else {
  $colSvc = ($results | ForEach-Object { $_.Service.Length } | Measure-Object -Maximum).Maximum
  $colSvc = [Math]::Max($colSvc, 7)
  $colStep = ($results | ForEach-Object { $_.Step.Length } | Measure-Object -Maximum).Maximum
  $colStep = [Math]::Max($colStep, 4)

  $fmt = "  {0,-$colSvc}  {1,-$colStep}  {2,-7}  {3,6}s"
  Write-Host ($fmt -f 'Service','Step','Result','Time') -ForegroundColor DarkGray
  Write-Host ("  " + ("-" * ($colSvc + $colStep + 24))) -ForegroundColor DarkGray
  foreach ($r in $results) {
    $status = if ($r.Skipped) { 'SKIP' } elseif ($r.Ok) { 'PASS' } else { 'FAIL' }
    $color = if ($r.Skipped) { 'DarkGray' } elseif ($r.Ok) { 'Green' } else { 'Red' }
    $line = $fmt -f $r.Service, $r.Step, $status, $r.Duration
    Write-Host $line -ForegroundColor $color
  }

  $passed = @($results | Where-Object { $_.Ok }).Count
  $failed = @($results | Where-Object { -not $_.Ok -and -not $_.Skipped }).Count
  $skipped = @($results | Where-Object { $_.Skipped }).Count
  Write-Host ""
  Write-Host ("  {0} passed, {1} failed, {2} skipped - {3} steps total" -f $passed, $failed, $skipped, @($results).Count) -ForegroundColor $(if($failed -gt 0){'Red'}else{'Green'})

  if ($failed -gt 0) {
    Write-Host ""
    Write-Err "Failures:"
    $results | Where-Object { -not $_.Ok -and -not $_.Skipped } | ForEach-Object {
      Write-Host ("    - {0} [{1}] exit {2}" -f $_.Service, $_.Step, $_.ExitCode) -ForegroundColor Red
    }
  }
}

Write-Host ""
if ($overallOk) {
  Write-Ok "All selected steps passed."
  exit 0
} else {
  Write-Err "Some steps failed. See summary above."
  exit 1
}

