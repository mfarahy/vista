<#!
.SYNOPSIS
  Run all Vista services locally (infra + Node services) on Windows.

.DESCRIPTION
  Starts required infrastructure via Docker Compose (PostgreSQL, Redis, NATS,
  optionally MinIO) and then launches every Node/Python service with `npm run dev`
  (or `vite` for prototypes) - each as a hidden background job by default
  (no windows). Jobs are tied to this script: exiting the script (Ctrl+C)
  stops all services automatically. Use -Visible for separate windows or
  -Foreground to stream logs in this console.

  Core services (always started unless filtered with -Services):
    - postgres  :5432  (pgvector/pg16, via docker compose)
    - redis     :6379  (via docker compose)
    - nats      :4222 / :8222 monitor (via docker compose)
    - expose-service :4000  (Express/Mastra API)
    - job-processor  :4100  (NATS consumer + health server)
    - frontend       :3000  (Next.js)

  Optional (behind flags):
    - minio     :9000 / :9001  (-WithStorage)
    - 3d prototype  :5173      (-WithPrototypes)
    - 360 prototype :5174      (-WithPrototypes)

  The script also runs Prisma generation / db push / seed for expose-service
  unless -NoSeed / -SkipDbSetup is passed.

.EXAMPLE
  # Full local stack - infra + all core services (new window per service)
  ./scripts/run-local.ps1

.EXAMPLE
  # Infra only (DB/cache/queue) - useful when you run services manually
  ./scripts/run-local.ps1 -InfraOnly

.EXAMPLE
  # Skip Docker infra (already running) and only start Node services
  ./scripts/run-local.ps1 -NoInfra

.EXAMPLE
  # Only frontend + expose-service
  ./scripts/run-local.ps1 -Services frontend,expose-service

.EXAMPLE
  # Include MinIO (S3-compatible storage, profile `storage`)
  ./scripts/run-local.ps1 -WithStorage

.EXAMPLE
  # Include 3D + 360 vite prototypes on 5173/5174
  ./scripts/run-local.ps1 -WithPrototypes

.EXAMPLE
  # Stop infra containers (also stops hidden jobs if script is still running)
  ./scripts/run-local.ps1 -Stop

.EXAMPLE
  # Stream logs in this console (CI-like) - still tied to script lifetime
  ./scripts/run-local.ps1 -Foreground

.EXAMPLE
  # Old behavior: separate visible windows (not tied to script lifetime)
  ./scripts/run-local.ps1 -Visible

.NOTES
  Prereqs: Docker Desktop, Node.js 20+, npm.
  Ports must be free (3000, 4000, 4100, 4222, 5432, 6379).
  Stop everything:  ./scripts/run-local.ps1 -Stop
  Logs: each service window keeps its own log; infra logs via `docker compose logs -f`.
#>
[CmdletBinding()]
param(
  [switch]$InfraOnly,
  [switch]$NoInfra,
  [switch]$SkipInstall,
  [switch]$SkipDbSetup,
  [switch]$NoSeed,
  [switch]$WithStorage,
  [switch]$WithPrototypes,
  [switch]$Foreground,
  [switch]$Visible,
  [switch]$Stop,
  [string[]]$Services,
  [switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# -- Ensure UTF-8 so native tools (npm, prisma, tsc) that emit UTF-8 don't mojibake on OEM code pages (e.g. prisma info symbol) --
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::InputEncoding  = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
  # Set process code page to UTF-8 for native commands (chcp is process-local)
  & "$env:SystemRoot\System32\chcp.com" 65001 | Out-Null
} catch {}

# -- Help -----------------------------------------------------------------
if ($Help) {
  $raw = Get-Content -LiteralPath $PSCommandPath -Raw
  $header = if ($raw -match '(?s)<#!(.*?)#>') { $Matches[1] } else { $raw.Substring(0, [Math]::Min(3000, $raw.Length)) }
  Write-Host $header.Trim()
  Write-Host ""
  Write-Host "Parameters:" -ForegroundColor White
  Write-Host "  -Services <name[]>  Filter: expose-service, job-processor, frontend, 3d, 360"
  Write-Host "  -InfraOnly          Only start Docker infra (postgres, redis, nats)"
  Write-Host "  -NoInfra            Skip Docker infra, only start Node services"
  Write-Host "  -WithStorage        Include MinIO (S3, profile storage) on :9000/:9001"
  Write-Host "  -WithPrototypes     Include 3d (:5173) + 360 (:5174) vite prototypes"
  Write-Host "  -Foreground         Stream logs in this console (hidden jobs, lifecycle-tied)"
  Write-Host "  -Visible            Open each service in its own visible window (legacy, not lifecycle-tied)"
  Write-Host "  -SkipInstall        Skip npm install"
  Write-Host "  -SkipDbSetup        Skip prisma generate/push/seed"
  Write-Host "  -NoSeed             Skip db:seed only"
  Write-Host "  -Stop               Stop infra (docker compose down) and optionally kill node processes"
  exit 0
}

# -- Resolve repo root ----------------------------------------------------
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $RepoRoot

# -- Helpers --------------------------------------------------------------
function Write-Info($msg) { Write-Host "[info] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[ ok ] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[warn] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[ err] $msg" -ForegroundColor Red }

function Test-Command($name) {
  $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Test-PortFree($port) {
  try {
    $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
    $l.Start(); $l.Stop(); return $true
  } catch { return $false }
}

function Wait-Tcp($hostName, $port, $timeoutSec = 60) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $c = [System.Net.Sockets.TcpClient]::new()
      $ar = $c.BeginConnect($hostName, $port, $null, $null)
      if ($ar.AsyncWaitHandle.WaitOne(500) -and $c.Connected) { $c.Close(); return $true }
      $c.Close()
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Wait-Http($url, $timeoutSec = 60) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
    } catch {
      if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -lt 500) { return $true }
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Ensure-EnvFile($serviceDir, $exampleName = '.env.example') {
  $envFile = Join-Path $serviceDir '.env'
  $example = Join-Path $serviceDir $exampleName
  if (-not (Test-Path -LiteralPath $envFile) -and (Test-Path -LiteralPath $example)) {
    Copy-Item -LiteralPath $example -Destination $envFile -Force
    Write-Info "Created $envFile from $exampleName"
  }
}

function Invoke-NpmInstallIfNeeded($dir) {
  if ($SkipInstall) { return }
  $marker = Join-Path $dir 'node_modules'
  $pkg = Join-Path $dir 'package.json'
  if (-not (Test-Path -LiteralPath $pkg)) { return }
  # install if node_modules missing or package-lock newer than node_modules
  $need = -not (Test-Path -LiteralPath $marker)
  if (-not $need) {
    $lock = Join-Path $dir 'package-lock.json'
    if (Test-Path -LiteralPath $lock) {
      $lockTime = (Get-Item -LiteralPath $lock).LastWriteTimeUtc
      $markerTime = (Get-Item -LiteralPath $marker).LastWriteTimeUtc
      if ($lockTime -gt $markerTime) { $need = $true }
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
      if ($code -ne 0) { throw "npm install failed in $dir (exit $code)" }
    } finally { Pop-Location }
  }
}

function New-ServiceWindow($title, $workDir, $command) {
  # Legacy visible window - only used with -Visible
  $escapedDir = $workDir -replace "'", "''"
  $psArgs = "-NoExit -Command `"Set-Location -LiteralPath '$escapedDir'; Write-Host '[$title] $command' -ForegroundColor Cyan; $command`""
  $pwsh = if (Test-Command 'pwsh') { 'pwsh' } else { 'powershell' }
  $proc = Start-Process -FilePath $pwsh -ArgumentList $psArgs -WindowStyle Normal -PassThru
  Write-Info "Launched $title (PID $($proc.Id)) in new window - $workDir"
  return $proc
}

function Start-BackgroundJob($name, $workDir, $command) {
  $job = Start-Job -Name "vista-$name" -ArgumentList $workDir, $command -ScriptBlock {
    param($d, $c)
    Set-Location -LiteralPath $d
    # Ensure child npm inherits UTF-8
    $oldPref = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    Invoke-Expression $c
    $ErrorActionPreference = $oldPref
  }
  Write-Info ("Started hidden job {0} (Id {1}) - {2}" -f $name, $job.Id, $workDir)
  return $job
}

# Kept for backwards compat - alias to Start-BackgroundJob
function Start-ForegroundJob($name, $workDir, $command) { return Start-BackgroundJob $name $workDir $command }

function Stop-AllJobs {
  param([array]$Jobs)
  if (-not $Jobs -or $Jobs.Count -eq 0) { return }
  Write-Warn "Stopping $($Jobs.Count) service(s)..."
  foreach ($j in $Jobs) {
    try { Stop-Job -Job $j -ErrorAction SilentlyContinue } catch {}
    try { Remove-Job -Job $j -Force -ErrorAction SilentlyContinue } catch {}
  }
  # Kill orphaned node processes spawned by the jobs (tsx watch / next dev / vite)
  # They are children of the job's pwsh process which is now gone, but node may linger.
  try {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -match 'tsx watch|next dev|vite' } |
      ForEach-Object {
        Write-Warn "Killing orphaned node PID $($_.ProcessId)"
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
      }
  } catch {}
  Write-Ok "All hidden services stopped."
}

# -- Service catalog ------------------------------------------------------
# Each entry: Name, Dir (relative), Command, Port, HealthUrl, Group
$AllServices = @(
  @{ Name='expose-service'; Dir='expose-service'; Command='npm run dev'; Port=4000; HealthUrl='http://localhost:4000/health'; Group='core' }
  @{ Name='job-processor';  Dir='job-processor';  Command='npm run dev'; Port=4100; HealthUrl='http://localhost:4100/health'; Group='core' }
  @{ Name='frontend';       Dir='frontend';       Command='npm run dev'; Port=3000; HealthUrl='http://localhost:3000';      Group='core' }
  @{ Name='3d';             Dir='3d';             Command='npm run dev -- --port 5173 --host 0.0.0.0'; Port=5173; HealthUrl='http://localhost:5173'; Group='prototype' }
  @{ Name='360';            Dir='360';            Command='npm run dev -- --port 5174 --host 0.0.0.0'; Port=5174; HealthUrl='http://localhost:5174'; Group='prototype' }
)

# Filter by -Services if provided (case-insensitive, aliases allowed)
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
  $AllServices = $AllServices | Where-Object { $normalized -contains $_.Name.ToLowerInvariant() }
  if (-not $AllServices -or $AllServices.Count -eq 0) {
    Write-Err "No services match filter: $($Services -join ', '). Valid: expose-service, job-processor, frontend, 3d, 360"
    exit 1
  }
} else {
  # Exclude prototypes unless -WithPrototypes
  if (-not $WithPrototypes) {
    $AllServices = $AllServices | Where-Object { $_.Group -ne 'prototype' }
  }
}

# -- Stop mode ------------------------------------------------------------
if ($Stop) {
  Write-Info "Stopping Vista local stack ..."
  if (Test-Command 'docker') {
    Push-Location -LiteralPath $RepoRoot
    try {
      $oldPref = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
      & docker compose down 2>&1 | ForEach-Object { Write-Host "$_" }
      $ErrorActionPreference = $oldPref
      Write-Ok "Docker Compose infra stopped (volumes kept). Use 'docker compose down -v' to wipe DB."
    } finally { Pop-Location }
  } else {
    Write-Warn "docker not found - skipping compose down"
  }
  # Optionally kill node processes that look like Vista services
  $kill = Read-Host "Kill remaining Node dev servers (npm run dev / next / vite) ? [y/N]"
  if ($kill -match '^(y|yes)$') {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -match 'tsx watch|next dev|vite' } |
      ForEach-Object {
        Write-Warn "Killing node PID $($_.ProcessId): $($_.CommandLine.Substring(0,[Math]::Min(120,$_.CommandLine.Length)))"
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
      }
    Write-Ok "Done."
  }
  exit 0
}

# -- Banner ---------------------------------------------------------------
Write-Host ""
Write-Host "  Vista - local dev runner" -ForegroundColor White
Write-Host "  Repo: $RepoRoot" -ForegroundColor DarkGray
$infraLabel = if ($NoInfra) { 'SKIPPED' } elseif ($WithStorage) { 'docker compose (postgres, redis, nats, minio)' } else { 'docker compose (postgres, redis, nats)' }
Write-Host "  Infra: $infraLabel" -ForegroundColor DarkGray
$svcLabel = ($AllServices.Name -join ', ') + $(if ($WithPrototypes) { ' (+prototypes)' } else { '' })
Write-Host "  Services: $svcLabel" -ForegroundColor DarkGray
$modeLabel = if ($InfraOnly) { 'infra-only' } elseif ($Foreground) { 'foreground (streaming, lifecycle-tied)' } elseif ($Visible) { 'visible windows (legacy)' } else { 'hidden jobs (lifecycle-tied, no windows)' }
Write-Host "  Mode: $modeLabel" -ForegroundColor DarkGray
Write-Host ""

# -- Prereq checks --------------------------------------------------------
if (-not $NoInfra -and -not (Test-Command 'docker')) {
  Write-Err "Docker not found. Install Docker Desktop or run with -NoInfra if infra is already running."
  exit 1
}
if (-not (Test-Command 'node')) {
  Write-Err "Node.js not found. Install Node 20+ (https://nodejs.org)."
  exit 1
}
if (-not (Test-Command 'npm')) {
  Write-Err "npm not found. Reinstall Node.js."
  exit 1
}
$nodeVer = (& node --version) -replace '^v',''
$major = [int]($nodeVer.Split('.')[0])
if ($major -lt 18) { Write-Warn "Node $nodeVer detected - Vista recommends Node 20+. Continuing anyway." }
Write-Ok "node $nodeVer / npm $((& npm --version))"

# -- Port preflight -------------------------------------------------------
$infraPorts = @(5432, 6379, 4222, 8222)
if ($WithStorage) { $infraPorts += @(9000, 9001) }
$servicePorts = $AllServices | ForEach-Object { $_.Port }
$portsToCheck = @()
if (-not $NoInfra) { $portsToCheck += $infraPorts }
if (-not $InfraOnly) { $portsToCheck += $servicePorts }
$busy = @()
foreach ($p in ($portsToCheck | Sort-Object -Unique)) {
  if (-not (Test-PortFree $p)) { $busy += $p }
}
if ($busy.Count -gt 0) {
  Write-Warn "Ports already in use: $($busy -join ', '). Services on those ports may fail to start."
  Write-Warn "Free them or run with -Services to skip that service."
  # non-fatal - continue
}

# -- 1) Infra via Docker Compose ------------------------------------------
if (-not $NoInfra) {
  Write-Host ""
  Write-Info "Starting infrastructure (Docker Compose) ..."

  $composeServices = @('postgres','redis','nats')
  if ($WithStorage) { $composeServices += 'minio' }
  # Note: job-processor image is also in compose but for local dev we run it via `npm run dev`
  # so we intentionally do NOT start the compose job-processor service here (avoids port 4100 clash).

  $composeArgs = @('compose','up','-d') + $composeServices
  if ($WithStorage) { $composeArgs = @('compose','--profile','storage','up','-d') + $composeServices }

  Write-Info "docker $($composeArgs -join ' ')"
  Push-Location -LiteralPath $RepoRoot
  try {
    $oldPref = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & docker @composeArgs 2>&1 | ForEach-Object { Write-Host "$_" }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $oldPref
    if ($code -ne 0) { throw "docker compose up failed (exit $code)" }
  } finally { Pop-Location }

  Write-Info "Waiting for infra to become healthy ..."
  $ok = $true
  if (-not (Wait-Tcp '127.0.0.1' 5432 90)) { Write-Warn "Postgres :5432 not reachable after 90s"; $ok = $false } else { Write-Ok "postgres :5432 ready" }
  if (-not (Wait-Tcp '127.0.0.1' 6379 60)) { Write-Warn "Redis :6379 not reachable after 60s"; $ok = $false } else { Write-Ok "redis :6379 ready" }
  if (-not (Wait-Tcp '127.0.0.1' 4222 60)) { Write-Warn "NATS :4222 not reachable after 60s"; $ok = $false } else { Write-Ok "nats :4222 ready" }
  if ($WithStorage) {
    if (-not (Wait-Tcp '127.0.0.1' 9000 60)) { Write-Warn "MinIO :9000 not reachable after 60s"; $ok = $false } else { Write-Ok "minio :9000 ready" }
  }
  # Also wait for NATS monitor
  Wait-Tcp '127.0.0.1' 8222 30 | Out-Null

  if (-not $ok) {
    Write-Warn "Some infra services did not become ready. Check 'docker compose ps' and 'docker compose logs'."
  } else {
    Write-Ok "Infrastructure ready"
  }

  if ($InfraOnly) {
    Write-Host ""
    Write-Ok "Infra-only mode - not starting Node services."
    Write-Host "  View logs: docker compose logs -f"
    Write-Host "  Stop:      ./scripts/run-local.ps1 -Stop   or   docker compose down"
    Write-Host ""
    # Still run DB setup so next `npm run dev` works immediately
  }
} else {
  Write-Warn "Skipping Docker infra (-NoInfra). Assuming postgres/redis/nats already running."
}

# -- 2) DB setup (Prisma) -------------------------------------------------
if (-not $SkipDbSetup -and -not $NoInfra) {
  # Only run DB setup if expose-service exists and postgres is reachable
  $canReachDb = Wait-Tcp '127.0.0.1' 5432 5
  if ($canReachDb -and (Test-Path -LiteralPath (Join-Path $RepoRoot 'expose-service\package.json'))) {
    Write-Host ""
    Write-Info "Setting up database (Prisma generate / push) ..."
    # Ensure env files exist so DATABASE_URL resolves
    Ensure-EnvFile (Join-Path $RepoRoot 'expose-service')
    Ensure-EnvFile (Join-Path $RepoRoot 'job-processor')

    Push-Location -LiteralPath (Join-Path $RepoRoot 'expose-service')
    try {
      $oldPref = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
      Write-Info "expose-service: npx prisma generate"
      & npx prisma generate 2>&1 | ForEach-Object { Write-Host "$_" }
      if ($LASTEXITCODE -ne 0) { Write-Warn "prisma generate failed (exit $LASTEXITCODE) - continuing" }

      Write-Info "expose-service: npx prisma db push"
      & npx prisma db push --accept-data-loss 2>&1 | ForEach-Object { Write-Host "$_" }
      if ($LASTEXITCODE -ne 0) { Write-Warn "prisma db push failed (exit $LASTEXITCODE) - is Postgres running?" }

      if (-not $NoSeed) {
        Write-Info "expose-service: npm run db:seed"
        & npm run db:seed 2>&1 | ForEach-Object { Write-Host "$_" }
        if ($LASTEXITCODE -ne 0) { Write-Warn "db:seed failed (exit $LASTEXITCODE) - may already be seeded or DB unreachable" }
      } else {
        Write-Info "Skipping db:seed (-NoSeed)"
      }
      $ErrorActionPreference = $oldPref
    } finally { Pop-Location }

    # job-processor also needs prisma generate (shares schema via expose-service)
    if (Test-Path -LiteralPath (Join-Path $RepoRoot 'job-processor\package.json')) {
      Push-Location -LiteralPath (Join-Path $RepoRoot 'job-processor')
      try {
        $oldPref = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        Write-Info "job-processor: npx prisma generate"
        & npx prisma generate 2>&1 | ForEach-Object { Write-Host "$_" }
        $ErrorActionPreference = $oldPref
      } finally { Pop-Location }
    }
  } else {
    Write-Warn "Skipping DB setup - postgres not reachable or expose-service missing"
  }
} elseif ($SkipDbSetup) {
  Write-Info "Skipping DB setup (-SkipDbSetup)"
}

if ($InfraOnly) { exit 0 }

# -- 3) Ensure env files + install deps -----------------------------------
Write-Host ""
Write-Info "Preparing services ..."

$serviceDirs = @('frontend','expose-service','job-processor','3d','360') |
  Where-Object { Test-Path -LiteralPath (Join-Path $RepoRoot $_) }

foreach ($d in $serviceDirs) {
  Ensure-EnvFile (Join-Path $RepoRoot $d)
}
# Also ensure infra env (optional)
if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot '.env')) -and (Test-Path -LiteralPath (Join-Path $RepoRoot '.env.example'))) {
  Copy-Item -LiteralPath (Join-Path $RepoRoot '.env.example') -Destination (Join-Path $RepoRoot '.env') -Force
  Write-Info "Created .env from .env.example at repo root"
}

foreach ($svc in $AllServices) {
  $dir = Join-Path $RepoRoot $svc.Dir
  if (Test-Path -LiteralPath $dir) { Invoke-NpmInstallIfNeeded $dir }
}

# Playwright browsers needed for PDF export (expose-service) - best-effort
if ($AllServices.Name -contains 'expose-service') {
  $needsPw = $true
  try {
    $oldPref = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    $pwCheck = & npx --yes playwright --version 2>&1
    $ErrorActionPreference = $oldPref
    if ($LASTEXITCODE -eq 0) {
      # Only install chromium if not already present (npx playwright install is idempotent, but slow)
      # Do a quick check: if chromium not installed, the pdf:smoke hint will prompt; we skip auto-install to keep startup fast.
      Write-Info "Playwright available ($pwCheck). If PDF export fails, run: npx playwright install chromium"
    }
  } catch { Write-Warn "Playwright check failed - PDF export may need 'npx playwright install chromium' in expose-service" }
}

# -- 4) Launch services ---------------------------------------------------
Write-Host ""
Write-Info "Launching services ..."



$started = @()

if ($Foreground) {
  # Foreground mode: hidden jobs + log streaming, lifecycle-tied
  $jobs = @()
  foreach ($svc in $AllServices) {
    $dir = Join-Path $RepoRoot $svc.Dir
    if (-not (Test-Path -LiteralPath $dir)) { Write-Warn "Skipping $($svc.Name) - dir not found: $dir"; continue }
    if (-not (Test-PortFree $svc.Port)) { Write-Warn "Port $($svc.Port) busy - $($svc.Name) may fail to start" }
    $jobs += Start-BackgroundJob $svc.Name $dir $svc.Command
    Start-Sleep -Milliseconds 400
  }

  Write-Host ""
  Write-Ok "All services started as hidden jobs (streaming). They will stop when this script exits (Ctrl+C)."
  Write-Host "  Services:" -ForegroundColor White
  foreach ($svc in $AllServices) {
    Write-Host ("    {0,-16} http://localhost:{1,-5}  ({2})" -f $svc.Name, $svc.Port, $svc.Dir) -ForegroundColor Gray
  }
  Write-Host ""

  # Health probe
  Write-Info "Probing health endpoints (10s grace for builds) ..."
  Start-Sleep -Seconds 8
  foreach ($svc in $AllServices) {
    if (-not $svc.HealthUrl) { continue }
    $ok = Wait-Http $svc.HealthUrl 12
    if ($ok) { Write-Ok "$($svc.Name) responsive at $($svc.HealthUrl)" }
    else     { Write-Warn "$($svc.Name) not yet responsive at $($svc.HealthUrl) - may still be building" }
  }
  Write-Host ""
  Write-Host "  Streaming logs - press Ctrl+C to stop all services." -ForegroundColor White
  Write-Host "  Infra logs: docker compose logs -f" -ForegroundColor DarkGray
  Write-Host ""

  # Stream logs until interrupted - cleanup on exit
  try {
    while ($true) {
      foreach ($j in $jobs) {
        $out = Receive-Job -Job $j -Keep -ErrorAction SilentlyContinue
        if ($out) { $out | ForEach-Object { Write-Host "[$($j.Name)] $_" } }
      }
      $failed = $jobs | Where-Object { $_.State -eq 'Failed' }
      if ($failed) { $failed | ForEach-Object { Write-Warn "Job $($_.Name) failed. Check: Receive-Job -Id $($_.Id)" } }
      $running = @($jobs | Where-Object { $_.State -eq 'Running' }).Count
      if ($running -eq 0 -and $jobs.Count -gt 0) { Write-Err "All jobs exited - stopping."; break }
      Start-Sleep -Seconds 1
    }
  } finally {
    Stop-AllJobs $jobs
    Write-Host "  Infra still running. Stop with: ./scripts/run-local.ps1 -Stop" -ForegroundColor DarkGray
  }

} elseif ($Visible) {
  # Legacy visible windows - not lifecycle-tied
  $started = @()
  foreach ($svc in $AllServices) {
    $dir = Join-Path $RepoRoot $svc.Dir
    if (-not (Test-Path -LiteralPath $dir)) { Write-Warn "Skipping $($svc.Name) - dir not found: $dir"; continue }
    if (-not (Test-PortFree $svc.Port)) {
      Write-Warn "Port $($svc.Port) busy - $($svc.Name) may fail to start (already running?)"
    }
    $proc = New-ServiceWindow $svc.Name $dir $svc.Command
    $started += @{ Name=$svc.Name; Proc=$proc; Dir=$dir; Port=$svc.Port; HealthUrl=$svc.HealthUrl }
    Start-Sleep -Milliseconds 400
  }

  Write-Host ""
  Write-Ok "All services launched in separate visible windows (NOT lifecycle-tied)."
  Write-Host ""
  Write-Host "  Services:" -ForegroundColor White
  foreach ($s in $started) {
    Write-Host ("    {0,-16} http://localhost:{1,-5}  ({2})" -f $s.Name, $s.Port, $s.Dir) -ForegroundColor Gray
  }
  Write-Host ""
  Write-Host "  Health checks (after ~10-20s for Next.js/Prisma):" -ForegroundColor White
  Write-Host "    expose-service  http://localhost:4000/health" -ForegroundColor Gray
  Write-Host "    frontend        http://localhost:3000" -ForegroundColor Gray
  Write-Host "    job-processor   http://localhost:4100/health" -ForegroundColor Gray
  if ($WithStorage) { Write-Host "    minio console   http://localhost:9001  (minioadmin/minioadmin)" -ForegroundColor Gray }
  Write-Host ""
  Write-Host "  Infra logs:  docker compose logs -f" -ForegroundColor Gray
  Write-Host "  Stop infra:  ./scripts/run-local.ps1 -Stop" -ForegroundColor Gray
  Write-Host "  Stop windows: close each PowerShell window or: Get-Process node | Stop-Process" -ForegroundColor Gray
  Write-Host ""

  Write-Info "Probing health endpoints (10s grace for builds) ..."
  Start-Sleep -Seconds 8
  foreach ($s in $started) {
    if (-not $s.HealthUrl) { continue }
    $ok = Wait-Http $s.HealthUrl 12
    if ($ok) { Write-Ok "$($s.Name) responsive at $($s.HealthUrl)" }
    else     { Write-Warn "$($s.Name) not yet responsive at $($s.HealthUrl) - may still be building" }
  }
  Write-Host ""
  Write-Ok "Done. Open http://localhost:3000 to verify the app. Windows will stay open after this script exits."

} else {
  # Default: hidden jobs, lifecycle-tied, no windows, no streaming
  $jobs = @()
  foreach ($svc in $AllServices) {
    $dir = Join-Path $RepoRoot $svc.Dir
    if (-not (Test-Path -LiteralPath $dir)) { Write-Warn "Skipping $($svc.Name) - dir not found: $dir"; continue }
    if (-not (Test-PortFree $svc.Port)) { Write-Warn "Port $($svc.Port) busy - $($svc.Name) may fail to start" }
    $jobs += Start-BackgroundJob $svc.Name $dir $svc.Command
    Start-Sleep -Milliseconds 400
  }

  Write-Host ""
  Write-Ok "All services started as hidden background jobs (no windows)."
  Write-Host "  They will STOP automatically when this script exits (Ctrl+C)." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  Services:" -ForegroundColor White
  foreach ($svc in $AllServices) {
    Write-Host ("    {0,-16} http://localhost:{1,-5}  ({2})" -f $svc.Name, $svc.Port, $svc.Dir) -ForegroundColor Gray
  }
  Write-Host ""
  Write-Host "  Health checks (after ~10-20s for Next.js/Prisma):" -ForegroundColor White
  Write-Host "    expose-service  http://localhost:4000/health" -ForegroundColor Gray
  Write-Host "    frontend        http://localhost:3000" -ForegroundColor Gray
  Write-Host "    job-processor   http://localhost:4100/health" -ForegroundColor Gray
  if ($WithStorage) { Write-Host "    minio console   http://localhost:9001  (minioadmin/minioadmin)" -ForegroundColor Gray }
  Write-Host ""
  Write-Host "  Logs:      streaming below (all services). Also: Get-Job | Receive-Job -Keep" -ForegroundColor DarkGray
  Write-Host "  Infra logs: docker compose logs -f" -ForegroundColor DarkGray
  Write-Host ""

  # Health probe
  Write-Info "Probing health endpoints (10s grace for builds) ..."
  Start-Sleep -Seconds 8
  foreach ($svc in $AllServices) {
    if (-not $svc.HealthUrl) { continue }
    $ok = Wait-Http $svc.HealthUrl 12
    if ($ok) { Write-Ok "$($svc.Name) responsive at $($svc.HealthUrl)" }
    else     { Write-Warn "$($svc.Name) not yet responsive at $($svc.HealthUrl) - may still be building" }
  }
  Write-Host ""
  Write-Ok "All services healthy (or building). Open http://localhost:3000"
  Write-Host "  Logs streaming live - press Ctrl+C to stop all services and exit." -ForegroundColor Yellow
  Write-Host ""

  # Block and stream logs until interrupted - cleanup guarantees stop on exit
  try {
    while ($true) {
      foreach ($j in $jobs) {
        $out = Receive-Job -Job $j -Keep -ErrorAction SilentlyContinue
        if ($out) { $out | ForEach-Object { $line = "$_".Trim(); if ($line) { Write-Host "[$($j.Name)] $line" } } }
      }
      $failed = $jobs | Where-Object { $_.State -eq 'Failed' }
      if ($failed) { $failed | ForEach-Object { Write-Warn "Job $($_.Name) failed. Check: Receive-Job -Id $($_.Id)" } }
      $running = @($jobs | Where-Object { $_.State -eq 'Running' }).Count
      if ($running -eq 0 -and $jobs.Count -gt 0) { Write-Err "All jobs exited unexpectedly."; break }
      Start-Sleep -Seconds 1
    }
  } finally {
    Stop-AllJobs $jobs
    Write-Host "  Infra still running. Stop with: ./scripts/run-local.ps1 -Stop" -ForegroundColor DarkGray
  }
}



